import { fork } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { Queue } from 'bullmq';
import { redisConnection, WORKFLOW_QUEUE } from '../dist/queue/workflow-queue.js';

import 'dotenv/config';
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { AppModule } from '../dist/app.module.js';
import { PrismaService } from '../dist/database/prisma.service.js';

const webhook = (id, method, path) => ({
  id,
  data: {
    kind: 'webhook', title: 'Webhook', subtitle: '', category: 'TRIGGER', icon: '↗',
    config: { method, path },
  },
});

await test('public webhook HTTP and persistence contract', { timeout: 90000 }, async (t) => {
  // Use a dedicated Redis DB; never clear the development queue.
  const redisUrl = new URL(process.env.TEST_REDIS_URL ?? process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
  if (!process.env.TEST_REDIS_URL) redisUrl.pathname = '/15';
  process.env.REDIS_URL = redisUrl.toString();
  const queue = new Queue(WORKFLOW_QUEUE, { connection: redisConnection(true) });
  queue.on('error', () => {});
  let worker;
  const executionIds = [];
  async function startWorker() {
    worker = fork(new URL('../dist/worker.js', import.meta.url), [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Worker readiness timed out')), 15000);
      worker.once('message', (message) => { clearTimeout(timer); if (message === 'ready') { resolve(); } else { reject(new Error('Unexpected worker message')); } });
      worker.once('error', (error) => { clearTimeout(timer); reject(error); });
      worker.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Worker exited: ${code}`)); });
    });
    assert.notEqual(worker.pid, process.pid);
  }
  async function stopWorker() {
    if (!worker || worker.exitCode !== null) return;
    const child = worker;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error('Worker shutdown timed out')); }, 15000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      child.send('shutdown');
    });
    worker = undefined;
  }
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  const prisma = app.get(PrismaService);
  let workflow;
  try {
    await app.init();
    await queue.waitUntilReady();
    await sleep(200);
    const nodes = [
      webhook('post', 'POST', '/purchase/approval'),
      webhook('get', 'GET', '/purchase/approval'),
      webhook('unrelated', 'POST', '/other'),
      { id: 'delay', data: { kind: 'delay', title: 'Delay', subtitle: '', category: 'UTILITY', icon: '◷', config: { duration: 3, unit: 'seconds' } } },
      {
        id: 'condition',
        data: {
          kind: 'condition', title: 'Condition', subtitle: '', category: 'LOGIC', icon: '◇',
          config: { field: 'amount', operator: 'greaterThan', value: '10000' },
        },
      },
    ];
    const edges = [
      { id: 'post-delay', source: 'post', target: 'delay' },
      { id: 'get-delay', source: 'get', target: 'delay' },
      { id: 'delay-condition', source: 'delay', target: 'condition' },
    ];
    workflow = await prisma.workflow.create({
      data: {
        name: `Webhook contract test ${randomUUID()}`,
        currentVersion: 1,
        versions: { create: { version: 1, nodes, edges } },
      },
    });
    const endpoint = `/api/hooks/${workflow.webhookToken}/purchase/approval`;
    const http = request(app.getHttpServer());

    async function waitForExecution(executionId, statuses) {
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        const execution = await prisma.execution.findUniqueOrThrow({
          where: { id: executionId }, include: { events: true },
        });
        if (statuses.includes(execution.status)) return execution;
        await sleep(50);
      }
      throw new Error(`Execution ${executionId} did not reach ${statuses.join('/')}`);
    }

    async function checkExecution(response, method, amount, success = true) {
      assert.equal(response.body.status, 'QUEUED');
      assert.equal(response.body.workflowId, workflow.id);
      assert.match(response.body.executionId, /^[0-9a-f-]{36}$/);
      executionIds.push(response.body.executionId);
      const execution = await waitForExecution(response.body.executionId, ['SUCCESS', 'FAILED']);
      assert.equal(execution.status, success ? 'SUCCESS' : 'FAILED');
      assert.equal(execution.input.amount, amount);
      assert.equal(execution.context.amount, amount);
      assert.equal(execution.context._request.method, method);
      assert.equal(execution.context._request.path, '/purchase/approval');
      assert.ok(execution.completedAt);
      assert.ok(execution.events.length > 0);
      assert.deepEqual(
        [...new Set(execution.events.map((event) => event.nodeId))].sort((a, b) => a.localeCompare(b)),
        ['condition', 'delay', method.toLowerCase()].sort((a, b) => a.localeCompare(b)),
      );
      assert.ok(execution.events.some((event) => event.nodeId === 'condition' && event.status === (success ? 'success' : 'failed')));
      const history = await http.get(`/api/workflows/${workflow.id}/executions`).expect(200);
      assert.ok(history.body.some((entry) => entry.id === execution.id && entry.status === execution.status));
    }

    await t.test('POST body becomes input; nested path executes only reachable nodes and persists results', async () => {
      const started = Date.now();
      const response = await http.post(endpoint).send({ amount: 15000, method: 'GET' }).expect(202);
      assert.ok(Date.now() - started < 2500, 'HTTP must not wait for the 3-second delay');
      const id = response.body.executionId;
      executionIds.push(id);
      assert.equal((await waitForExecution(id, ['QUEUED'])).status, 'QUEUED');
      await sleep(500);
      assert.equal((await prisma.execution.findUniqueOrThrow({ where: { id } })).status, 'QUEUED');
      const job = await queue.getJob(id);
      assert.deepEqual(job.data, { executionId: id, startNodeId: 'post' });
      assert.equal(job.opts.attempts, 1);
      await startWorker();
      await waitForExecution(id, ['RUNNING']);
      await checkExecution(response, 'POST', 15000);
    });
    await t.test('real GET query becomes workflow input', async () => {
      await stopWorker();
      const response = await http.get(endpoint).query({ amount: 15000 }).expect(202);
      executionIds.push(response.body.executionId);
      await sleep(300);
      assert.equal((await waitForExecution(response.body.executionId, ['QUEUED'])).status, 'QUEUED');
      await startWorker();
      await checkExecution(response, 'GET', '15000');
    });
    await t.test('wrong token returns 404', async () => {
      await http.post(`/api/hooks/${randomUUID()}/purchase/approval`).send({}).expect(404);
      await http.post('/api/hooks/invalid/purchase/approval').send({}).expect(404);
    });
    await t.test('wrong path returns 404', async () => {
      await http.post(`/api/hooks/${workflow.webhookToken}/missing`).send({}).expect(404);
    });
    await t.test('correct path with wrong HTTP method returns 405', async () => {
      await http.put(endpoint).send({ amount: 15000 }).expect(405);
    });
    await t.test('failed workflow persists events and result', async () => {
      const started = Date.now();
      const response = await http.post(endpoint).send({}).expect(202);
      assert.ok(Date.now() - started < 2500);
      const pending = await prisma.execution.findUniqueOrThrow({ where: { id: response.body.executionId } });
      assert.equal(pending.completedAt, null);
      await checkExecution(response, 'POST', undefined, false);
    });
    await t.test('webhook with an incoming edge returns 400 without creating an execution', async () => {
      const before = await prisma.execution.count({ where: { workflowId: workflow.id } });
      await prisma.workflowVersion.update({
        where: { workflowId_version: { workflowId: workflow.id, version: 1 } },
        data: { edges: [...edges, { id: 'incoming', source: 'unrelated', target: 'post' }] },
      });
      await http.post(endpoint).send({ amount: 15000 }).expect(400);
      assert.equal(await prisma.execution.count({ where: { workflowId: workflow.id } }), before);
    });
  } finally {
    await stopWorker();
    for (const id of new Set(executionIds)) {
      const job = await queue.getJob(id);
      if (job) await job.remove();
    }
    await queue.close();
    if (workflow) {
      await prisma.execution.deleteMany({ where: { workflowId: workflow.id } });
      await prisma.workflow.delete({ where: { id: workflow.id } });
    }
    await app.close();
  }
});
