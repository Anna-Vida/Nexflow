import 'dotenv/config';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { test } from 'node:test';
import { NestFactory } from '@nestjs/core';
import { Queue } from 'bullmq';
import { AppModule } from '../dist/app.module.js';
import { PrismaService } from '../dist/database/prisma.service.js';
import { WorkflowsService } from '../dist/workflows/workflows.service.js';
import { redisConnection, WORKFLOW_QUEUE } from '../dist/queue/workflow-queue.js';
import { createTestOwner } from '../dist/test-support/test-owner.js';

const redisUrl = new URL(process.env.TEST_REDIS_URL ?? process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
if (!process.env.TEST_REDIS_URL) redisUrl.pathname = '/14';
process.env.REDIS_URL = redisUrl.toString();

async function waitFor(predicate, label, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function startWorker() {
  const child = fork(new URL('../dist/worker.js', import.meta.url), [], {
    env: process.env, stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
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

async function stopWorker(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    child.once('exit', resolve);
    child.send('shutdown');
    setTimeout(() => child.kill('SIGKILL'), 10_000).unref();
  });
}

await test('PostgreSQL schedule survives API restart and BullMQ delivers one normal execution per tick', { timeout: 90_000 }, async () => {
  const queue = new Queue(WORKFLOW_QUEUE, { connection: redisConnection(true) });
  queue.on('error', () => {});
  let app;
  let worker;
  let workflowId;
  let scheduleId;
  let ownerId;
  try {
    app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const workflows = app.get(WorkflowsService);
    const prisma = app.get(PrismaService);
    const owner = await createTestOwner(prisma, 'schedule-contract');
    ownerId = owner.id;
    const nodes = [
      { id: 'schedule-1', data: {
        kind: 'schedule', title: 'Schedule', subtitle: '', category: 'TRIGGER', icon: 'clock',
        config: { mode: 'interval', intervalMinutes: 60, timezone: 'Asia/Manila', enabled: true },
      } },
      { id: 'delay-1', data: {
        kind: 'delay', title: 'Delay', subtitle: '', category: 'ACTION', icon: 'clock',
        config: { duration: 0.001, unit: 'seconds' },
      } },
    ];
    const edges = [{ id: 'schedule-delay', source: 'schedule-1', target: 'delay-1' }];
    const saved = await workflows.save({ name: 'Schedule contract', nodes, edges }, ownerId);
    workflowId = saved.workflowId;
    const schedule = await prisma.scheduleDefinition.findUniqueOrThrow({
      where: { workflowId_nodeId: { workflowId, nodeId: 'schedule-1' } },
    });
    scheduleId = schedule.id;
    const key = `nexflow-schedule-${scheduleId}-1`;
    const firstRegistration = (await queue.getJobSchedulers()).filter((job) => job.key === key);
    assert.equal(firstRegistration.length, 1);
    assert.ok(firstRegistration[0].next > Date.now(), 'First interval fire must be in the future.');
    await app.close();
    app = undefined;

    // Simulate lost Redis scheduler metadata. PostgreSQL remains authoritative.
    await queue.removeJobScheduler(key);
    assert.equal((await queue.getJobSchedulers()).filter((job) => job.key === key).length, 0);
    app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    assert.equal((await queue.getJobSchedulers()).filter((job) => job.key === key).length, 1);
    await app.get(WorkflowsService).save({ workflowId, name: 'Schedule contract', nodes, edges }, ownerId);
    assert.equal((await queue.getJobSchedulers()).filter((job) => job.key === key).length, 1);

    worker = await startWorker();
    await queue.add('fire-schedule', { mode: 'schedule', scheduleId, generation: 1 }, {
      jobId: `manual-schedule-${scheduleId}`, attempts: 1,
    });
    const fire = await waitFor(() => prisma.scheduledFire.findUnique({ where: { bullJobId: `manual-schedule-${scheduleId}` } }), 'scheduled fire');
    const execution = await waitFor(async () => {
      const row = await prisma.execution.findUniqueOrThrow({ where: { id: fire.executionId } });
      return row.status === 'SUCCESS' ? row : null;
    }, 'scheduled execution success');
    assert.equal(execution.workflowId, workflowId);
    assert.equal(execution.startNodeId, 'schedule-1');
    assert.equal(execution.attemptCount, 1);
    assert.ok((await workflows.history(workflowId, ownerId)).some((row) => row.id === execution.id));
    assert.equal((await prisma.scheduledFire.count({ where: { bullJobId: `manual-schedule-${scheduleId}` } })), 1);

    await app.get(WorkflowsService).save({
      workflowId, ownerId, name: 'Schedule contract', edges,
      nodes: [
        { ...nodes[0], data: { ...nodes[0].data, config: {
          mode: 'cron', cron: '0 9 * * 1-5', timezone: 'Asia/Manila', enabled: true,
        } } },
        nodes[1],
      ],
    });
    const cronJobs = (await queue.getJobSchedulers()).filter((job) => job.key.startsWith(`nexflow-schedule-${scheduleId}-`));
    assert.equal(cronJobs.length, 1);
    assert.equal(cronJobs[0].key, `nexflow-schedule-${scheduleId}-2`);
    assert.equal(cronJobs[0].pattern, '0 9 * * 1-5');
    assert.equal(cronJobs[0].tz, 'Asia/Manila');
    assert.ok(cronJobs[0].next > Date.now());

    await app.get(WorkflowsService).save({
      workflowId, ownerId, name: 'Schedule contract', edges,
      nodes: [
        { ...nodes[0], data: { ...nodes[0].data, config: {
          mode: 'cron', cron: '0 9 * * 1-5', timezone: 'Asia/Manila', enabled: false,
        } } },
        nodes[1],
      ],
    });
    assert.equal((await queue.getJobSchedulers()).filter((job) => job.key.startsWith(`nexflow-schedule-${scheduleId}-`)).length, 0);
  } finally {
    await stopWorker(worker);
    if (app) {
      const prisma = app.get(PrismaService);
      if (workflowId) {
        await prisma.execution.deleteMany({ where: { workflowId } });
        await prisma.workflow.delete({ where: { id: workflowId } });
      }
      if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } }).catch(() => undefined);
      await app.close();
    }
    await queue.close();
  }
});
