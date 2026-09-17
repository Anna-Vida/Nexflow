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

await test('public webhook HTTP and persistence contract', { timeout: 180000 }, async (t) => {
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
      assert.equal(execution.attemptCount, success ? 1 : 3);
      assert.equal(execution.maxAttempts, 3);
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
      assert.deepEqual(job.data, { executionId: id });
      assert.equal(job.opts.attempts, 3);
      assert.equal(job.opts.backoff?.type ?? job.opts.backoff, 'exponential');
      await startWorker();
      await waitForExecution(id, ['RUNNING']);
      await http.post(`/api/workflows/executions/${id}/retry`).expect(409);
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
    await t.test('always-failing workflow performs exactly 3 attempts and keeps every event', async () => {
      const response = await http.post(endpoint).send({}).expect(202);
      const id = response.body.executionId;
      executionIds.push(id);
      const statuses = new Set();
      const deadline = Date.now() + 40000;
      let execution;
      while (Date.now() < deadline) {
        execution = await prisma.execution.findUniqueOrThrow({ where: { id }, include: { events: true } });
        if (execution.status !== 'QUEUED') statuses.add(execution.status);
        if (execution.status === 'RETRYING') {
          assert.equal(execution.completedAt, null);
          assert.ok(execution.lastError);
          await http.post(`/api/workflows/executions/${id}/retry`).expect(409);
        }
        if (execution.status === 'FAILED') break;
        await sleep(250);
      }
      assert.equal(execution.status, 'FAILED');
      for (const expected of ['RUNNING', 'RETRYING', 'FAILED']) {
        assert.ok(statuses.has(expected), `Expected to observe ${expected}; saw ${[...statuses].join(',')}`);
      }
      assert.equal(execution.attemptCount, 3);
      assert.equal(execution.maxAttempts, 3);
      assert.match(execution.lastError, /Input field "amount" does not exist/);
      assert.ok(execution.completedAt);
      assert.deepEqual([...new Set(execution.events.map((event) => event.attempt))].sort((a, b) => a - b), [1, 2, 3]);
      for (const attempt of [1, 2, 3]) {
        const attemptEvents = execution.events.filter((event) => event.attempt === attempt);
        assert.ok(attemptEvents.some((event) => event.nodeId === 'post'));
        assert.ok(attemptEvents.some((event) => event.nodeId === 'condition' && event.status === 'failed'));
      }
      const job = await queue.getJob(id);
      assert.equal(job.attemptsMade, 3);
    });

    await t.test('manual retry creates a new linked execution and rejects invalid sources', async () => {
      await stopWorker();
      const queued = await http.post(endpoint).send({ amount: 15000 }).expect(202);
      executionIds.push(queued.body.executionId);
      await http.post(`/api/workflows/executions/${queued.body.executionId}/retry`).expect(409);
      await startWorker();
      const success = await waitForExecution(queued.body.executionId, ['SUCCESS']);
      assert.equal(success.attemptCount, 1);
      await http.post(`/api/workflows/executions/${queued.body.executionId}/retry`).expect(409);

      const failed = await prisma.execution.findFirstOrThrow({ where: { status: 'FAILED', id: { in: executionIds } } });
      const before = await prisma.execution.findUniqueOrThrow({ where: { id: failed.id } });
      const response = await http.post(`/api/workflows/executions/${failed.id}/retry`).expect(202);
      assert.equal(response.body.retriedFromId, failed.id);
      assert.equal(response.body.status, 'QUEUED');
      assert.notEqual(response.body.executionId, failed.id);
      executionIds.push(response.body.executionId);
      const after = await prisma.execution.findUniqueOrThrow({ where: { id: failed.id } });
      assert.deepEqual(after, before);
      const retried = await waitForExecution(response.body.executionId, ['FAILED']);
      assert.equal(retried.retriedFromId, failed.id);
      assert.equal(retried.status, 'FAILED');
      assert.equal(retried.attemptCount, 3);
      assert.equal(retried.maxAttempts, 3);
      assert.deepEqual(retried.nodes, before.nodes);
      assert.deepEqual(retried.edges, before.edges);
      assert.deepEqual(retried.input, before.input);
      assert.equal(retried.startNodeId, before.startNodeId);
      assert.deepEqual(await prisma.execution.findUniqueOrThrow({ where: { id: failed.id } }), before);
      await http.post('/api/workflows/executions/00000000-0000-4000-8000-000000000000/retry').expect(404);
    });

    await t.test('editor Run remains synchronous with one attempt and no Redis job', async () => {
      const id = randomUUID();
      executionIds.push(id);
      const response = await http.post('/api/workflows/execute').send({
        executionId: id, workflowId: workflow.id, nodes, edges, input: {},
      }).expect(201);
      assert.equal(response.body.success, false);
      const execution = await prisma.execution.findUniqueOrThrow({ where: { id }, include: { events: true } });
      assert.equal(execution.status, 'FAILED');
      assert.equal(execution.attemptCount, 1);
      assert.equal(execution.maxAttempts, 1);
      assert.ok(execution.completedAt);
      assert.deepEqual([...new Set(execution.events.map((event) => event.attempt))], [1]);
      assert.equal(await queue.getJob(id), undefined);
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
