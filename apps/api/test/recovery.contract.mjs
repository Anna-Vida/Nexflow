import 'dotenv/config';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { test } from 'node:test';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { AppModule } from '../dist/app.module.js';
import { PrismaService } from '../dist/database/prisma.service.js';

const redisUrl = new URL(process.env.TEST_REDIS_URL ?? process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
if (!process.env.TEST_REDIS_URL) redisUrl.pathname = '/15';
process.env.REDIS_URL = redisUrl.toString();
const app = await NestFactory.create(AppModule, { logger: false });
app.setGlobalPrefix('api');
await app.init();
const prisma = app.get(PrismaService);

async function waitFor(predicate, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function startWorker(url) {
  const child = fork(new URL('../dist/test-support/recovery-worker.js', import.meta.url), [], {
    env: { ...process.env, NODE_ENV: 'test', NEXFLOW_TEST_HTTP_URL: url },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Worker readiness timed out.')), 20_000);
    child.once('message', (message) => {
      clearTimeout(timer);
      if (message === 'ready') resolve();
      else reject(new Error('Unexpected worker message.'));
    });
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Worker exited before ready: ${code}`)));
  });
  return child;
}

async function stopWorker(child, hard = false) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    child.once('exit', resolve);
    if (hard) child.kill('SIGKILL');
    else child.send('shutdown');
    setTimeout(() => child.kill('SIGKILL'), 10_000).unref();
  });
}

async function fakeServer(respond) {
  let count = 0;
  const keys = [];
  const server = createServer((req, res) => {
    count++;
    keys.push(req.headers['idempotency-key']);
    if (respond) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ paymentId: 'one' }));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server port.');
  return {
    url: `http://127.0.0.1:${address.port}`,
    count: () => count,
    keys,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function createWebhookWorkflow() {
  const nodes = [
    {
      id: 'hook', data: {
        kind: 'webhook', title: 'Webhook', subtitle: '', category: 'TRIGGER', icon: 'hook',
        config: { method: 'POST', path: '/crash/test' },
      },
    },
    {
      id: 'http-1', data: {
        kind: 'http', title: 'Payment', subtitle: '', category: 'ACTION', icon: 'http',
        config: {
          method: 'POST', url: 'https://example.com/pay', headers: '{}', body: '{"amount":1}',
          timeout: 30_000, retries: 0, retryDelayMs: 500,
        },
      },
    },
    {
      id: 'delay', data: {
        kind: 'delay', title: 'Wait', subtitle: '', category: 'ACTION', icon: 'clock',
        config: { duration: 15, unit: 'seconds' },
      },
    },
    {
      id: 'condition', data: {
        kind: 'condition', title: 'Check', subtitle: '', category: 'LOGIC', icon: 'check',
        config: { field: 'amount', operator: 'greaterThan', value: '0' },
      },
    },
  ];
  const edges = [
    { id: 'hook-http', source: 'hook', target: 'http-1' },
    { id: 'http-delay', source: 'http-1', target: 'delay' },
    { id: 'delay-condition', source: 'delay', target: 'condition' },
  ];
  return prisma.workflow.create({
    data: {
      name: `Recovery contract ${randomUUID()}`, currentVersion: 1,
      versions: { create: { version: 1, nodes, edges } },
    },
  });
}

async function trigger(workflow) {
  const response = await request(app.getHttpServer())
    .post(`/api/hooks/${workflow.webhookToken}/crash/test`)
    .send({ amount: 1 }).expect(202);
  return response.body.executionId;
}

try {
  await test('real worker crash after committed HTTP result reuses it on recovery', { timeout: 120_000 }, async () => {
    const server = await fakeServer(true);
    const workflow = await createWebhookWorkflow();
    let worker;
    let recoveredWorker;
    let id;
    try {
      worker = await startWorker(server.url);
      id = await trigger(workflow);
      await waitFor(async () => {
        const action = await prisma.httpAction.findUnique({ where: { executionId_nodeId: { executionId: id, nodeId: 'http-1' } } });
        const execution = await prisma.execution.findUniqueOrThrow({ where: { id } });
        return action?.status === 'SUCCEEDED' && execution.status === 'RUNNING';
      }, 'committed HTTP result while worker is running');
      assert.equal(server.count(), 1);
      await stopWorker(worker, true);
      worker = undefined;
      await sleep(31_000);
      recoveredWorker = await startWorker(server.url);
      const row = await waitFor(async () => {
        const value = await prisma.execution.findUniqueOrThrow({ where: { id } });
        return value.status === 'SUCCESS' ? value : null;
      }, 'recovered success', 40_000);
      assert.equal(server.count(), 1);
      assert.equal(row.recoveryCount, 1);
      assert.equal(row.workerLeaseId, null);
      assert.equal(row.workerHeartbeatAt, null);
      const action = await prisma.httpAction.findUniqueOrThrow({ where: { executionId_nodeId: { executionId: id, nodeId: 'http-1' } } });
      assert.equal(server.keys[0], action.idempotencyKey);
    } finally {
      await stopWorker(worker, true);
      await stopWorker(recoveredWorker);
      if (id) await prisma.execution.delete({ where: { id } });
      await prisma.workflow.delete({ where: { id: workflow.id } });
      await server.close();
    }
  });

  await test('real worker crash during HTTP send requires reconciliation without resend', { timeout: 120_000 }, async () => {
    const server = await fakeServer(false);
    const workflow = await createWebhookWorkflow();
    let worker;
    let recoveredWorker;
    let id;
    try {
      worker = await startWorker(server.url);
      id = await trigger(workflow);
      await waitFor(async () => {
        const action = await prisma.httpAction.findUnique({ where: { executionId_nodeId: { executionId: id, nodeId: 'http-1' } } });
        return server.count() === 1 && action?.status === 'IN_FLIGHT';
      }, 'in-flight external request');
      await stopWorker(worker, true);
      worker = undefined;
      await sleep(31_000);
      recoveredWorker = await startWorker(server.url);
      const row = await waitFor(async () => {
        const value = await prisma.execution.findUniqueOrThrow({ where: { id } });
        return value.status === 'RECOVERY_REQUIRED' ? value : null;
      }, 'manual reconciliation status', 30_000);
      assert.equal(server.count(), 1);
      assert.equal(row.recoveryCount, 0);
      assert.equal(row.workerLeaseId, null);
      assert.equal(row.workerHeartbeatAt, null);
    } finally {
      await stopWorker(worker, true);
      await stopWorker(recoveredWorker);
      if (id) await prisma.execution.delete({ where: { id } });
      await prisma.workflow.delete({ where: { id: workflow.id } });
      await server.close();
    }
  });
} finally {
  await app.close();
}
