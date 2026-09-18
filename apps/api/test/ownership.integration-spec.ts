import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Socket } from 'socket.io';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthModule } from '../src/auth/auth.module.js';
import { PrismaModule } from '../src/database/prisma.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { WorkflowQueueService } from '../src/queue/workflow-queue.service.js';
import { ExecutionsGateway } from '../src/workflows/executions.gateway.js';
import { WorkflowsModule } from '../src/workflows/workflows.module.js';

// The queue is stubbed so ownership can be verified without Redis; every public
// webhook tick still has to create an owned execution before it is enqueued.
const queueStub = {
  enqueue: vi.fn().mockResolvedValue(undefined),
  enqueueScheduledExecution: vi.fn().mockResolvedValue(undefined),
  enqueueRecovery: vi.fn().mockResolvedValue(undefined),
  listScheduleJobs: vi.fn().mockResolvedValue([]),
  removeScheduleJob: vi.fn().mockResolvedValue(undefined),
  upsertScheduleJob: vi.fn().mockResolvedValue(undefined),
};

const nodes = [
  {
    id: 'hook', data: {
      kind: 'webhook', title: 'Webhook', subtitle: '', category: 'TRIGGER', icon: 'hook',
      config: { method: 'POST', path: '/owned' },
    },
  },
  {
    id: 'delay', data: {
      kind: 'delay', title: 'Delay', subtitle: '', category: 'ACTION', icon: 'clock',
      config: { duration: 0.001, unit: 'seconds' },
    },
  },
];
const edges = [{ id: 'hook-delay', source: 'hook', target: 'delay' }];

describe('workflow ownership with PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let gateway: ExecutionsGateway;
  const userIds: string[] = [];
  const workflowIds: string[] = [];
  const executionIds: string[] = [];
  let anna: { id: string; cookie: string };
  let betty: { id: string; cookie: string };
  let workflowId: string;
  let webhookToken: string;
  let failedExecutionId: string;

  function fakeSocket(cookie?: string) {
    const join = vi.fn(async () => undefined);
    const disconnect = vi.fn();
    return {
      client: {
        handshake: { headers: cookie ? { cookie } : {} },
        data: {},
        join,
        disconnect,
      } as unknown as Socket,
      join,
      disconnect,
    };
  }

  async function signup(label: string) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: `${label}-${randomUUID()}@nexflow.test`, password: 'a-long-ownership-password', name: label })
      .expect(201);
    userIds.push(response.body.id);
    return { id: response.body.id as string, cookie: response.headers['set-cookie'][0].split(';')[0] };
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule, WorkflowsModule],
    }).overrideProvider(WorkflowQueueService).useValue(queueStub).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    gateway = app.get(ExecutionsGateway);

    anna = await signup('anna');
    betty = await signup('betty');

    const saved = await request(app.getHttpServer())
      .post('/api/workflows/save')
      .set('Cookie', anna.cookie)
      .send({ name: 'Anna owns this', nodes, edges })
      .expect(201);
    workflowId = saved.body.workflowId;
    workflowIds.push(workflowId);
    webhookToken = saved.body.webhookToken;

    failedExecutionId = randomUUID();
    executionIds.push(failedExecutionId);
    await prisma.execution.create({
      data: {
        id: failedExecutionId, ownerId: anna.id, workflowId, status: 'FAILED',
        nodes: nodes as object[], edges: edges as object[], input: {}, startNodeId: 'hook',
        attemptCount: 1, maxAttempts: 1, completedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    if (executionIds.length) await prisma.execution.deleteMany({ where: { id: { in: executionIds } } });
    if (workflowIds.length) await prisma.workflow.deleteMany({ where: { id: { in: workflowIds } } });
    // Adoption can hand pre-authentication rows to the first account, so a
    // test account may still be referenced when this suite finishes.
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => undefined);
    await app?.close();
  });

  it('hides another account workflow, history, save target, and execution detail', async () => {
    await request(app.getHttpServer()).get(`/api/workflows/${workflowId}`).set('Cookie', betty.cookie).expect(404);
    await request(app.getHttpServer()).get(`/api/workflows/${workflowId}/executions`).set('Cookie', betty.cookie).expect(404);
    await request(app.getHttpServer()).get(`/api/workflows/executions/${failedExecutionId}`).set('Cookie', betty.cookie).expect(404);
    await request(app.getHttpServer()).post('/api/workflows/save').set('Cookie', betty.cookie)
      .send({ workflowId, name: 'Betty overwrite', nodes, edges }).expect(404);
    await request(app.getHttpServer()).post(`/api/workflows/executions/${failedExecutionId}/retry`)
      .set('Cookie', betty.cookie).expect(404);

    const owner = await request(app.getHttpServer()).get(`/api/workflows/${workflowId}`).set('Cookie', anna.cookie).expect(200);
    expect(owner.body.webhookToken).toBe(webhookToken);
    const history = await request(app.getHttpServer()).get(`/api/workflows/${workflowId}/executions`)
      .set('Cookie', anna.cookie).expect(200);
    expect(history.body.map((row: { id: string }) => row.id)).toContain(failedExecutionId);

    const untouched = await prisma.workflow.findUniqueOrThrow({ where: { id: workflowId } });
    expect(untouched.name).toBe('Anna owns this');
    expect(untouched.currentVersion).toBe(1);
  });

  it('lists and reports only the signed-in account resources', async () => {
    const mine = await request(app.getHttpServer()).get('/api/workflows').set('Cookie', anna.cookie).expect(200);
    expect(mine.body.map((row: { id: string }) => row.id)).toContain(workflowId);
    const theirs = await request(app.getHttpServer()).get('/api/workflows').set('Cookie', betty.cookie).expect(200);
    expect(theirs.body).toEqual([]);
    const recent = await request(app.getHttpServer()).get('/api/workflows/executions/recent')
      .set('Cookie', betty.cookie).expect(200);
    expect(recent.body).toEqual([]);
  });

  it('keeps the public webhook token separate from dashboard access', async () => {
    const triggered = await request(app.getHttpServer())
      .post(`/api/hooks/${webhookToken}/owned`)
      .send({ amount: 10 })
      .expect(202);
    executionIds.push(triggered.body.executionId);
    const execution = await prisma.execution.findUniqueOrThrow({ where: { id: triggered.body.executionId } });
    expect(execution.ownerId).toBe(anna.id);
    expect(execution.workflowId).toBe(workflowId);
    expect(queueStub.enqueue).toHaveBeenCalledWith({ executionId: triggered.body.executionId });
    // The token triggers the workflow but never authenticates the dashboard.
    await request(app.getHttpServer()).get(`/api/workflows/${workflowId}`).expect(401);
  });

  it('rejects unauthenticated dashboard requests', async () => {
    for (const url of [
      '/api/workflows',
      '/api/workflows/executions/recent',
      `/api/workflows/${workflowId}`,
      `/api/workflows/${workflowId}/executions`,
      `/api/workflows/executions/${failedExecutionId}`,
    ]) {
      await request(app.getHttpServer()).get(url).expect(401);
    }
    await request(app.getHttpServer()).post('/api/workflows/save')
      .send({ name: 'Anonymous', nodes, edges }).expect(401);
    await request(app.getHttpServer()).post(`/api/workflows/executions/${failedExecutionId}/retry`).expect(401);
  });

  it('lets only the owner retry a failed execution', async () => {
    const retried = await request(app.getHttpServer())
      .post(`/api/workflows/executions/${failedExecutionId}/retry`)
      .set('Cookie', anna.cookie)
      .expect(202);
    executionIds.push(retried.body.executionId);
    const row = await prisma.execution.findUniqueOrThrow({ where: { id: retried.body.executionId } });
    expect(row.ownerId).toBe(anna.id);
    expect(row.retriedFromId).toBe(failedExecutionId);
  });

  it('keeps an owner schedule out of reach for another account', async () => {
    const scheduleNode = {
      id: 'schedule-1', data: {
        kind: 'schedule', title: 'Schedule', subtitle: '', category: 'TRIGGER', icon: 'clock',
        config: { mode: 'interval', intervalMinutes: 60, timezone: 'Asia/Manila', enabled: true },
      },
    };
    await request(app.getHttpServer()).post('/api/workflows/save').set('Cookie', anna.cookie)
      .send({ workflowId, name: 'Anna owns this', nodes: [...nodes, scheduleNode], edges })
      .expect(201);
    const before = await prisma.scheduleDefinition.findUniqueOrThrow({
      where: { workflowId_nodeId: { workflowId, nodeId: 'schedule-1' } },
    });

    await request(app.getHttpServer()).post('/api/workflows/save').set('Cookie', betty.cookie)
      .send({ workflowId, name: 'Betty schedule', nodes: [], edges: [] }).expect(404);

    const after = await prisma.scheduleDefinition.findUniqueOrThrow({ where: { id: before.id } });
    expect(after).toEqual(before);
  });

  it('authorizes live execution subscriptions by workflow owner', async () => {
    const annaSocket = fakeSocket(anna.cookie);
    await gateway.handleConnection(annaSocket.client);
    await expect(gateway.subscribe(annaSocket.client, { executionId: failedExecutionId }))
      .resolves.toEqual({ ok: true, executionId: failedExecutionId });
    expect(annaSocket.join).toHaveBeenCalledWith(`execution:${failedExecutionId}`);

    const bettySocket = fakeSocket(betty.cookie);
    await gateway.handleConnection(bettySocket.client);
    await expect(gateway.subscribe(bettySocket.client, { executionId: failedExecutionId }))
      .resolves.toEqual({ ok: false, message: 'Execution not found.' });
    expect(bettySocket.join).not.toHaveBeenCalled();

    const anonymous = fakeSocket();
    await gateway.handleConnection(anonymous.client);
    expect(anonymous.disconnect).toHaveBeenCalledWith(true);
    await expect(gateway.subscribe(anonymous.client, { executionId: failedExecutionId }))
      .resolves.toEqual({ ok: false, message: 'Sign in to watch executions.' });
    expect(anonymous.join).not.toHaveBeenCalled();
  });
});