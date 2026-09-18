import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { IdempotentHttpService } from '../src/workflows/idempotent-http.service.js';
import { WorkflowsService } from '../src/workflows/workflows.service.js';
import type { WorkflowQueueService } from '../src/queue/workflow-queue.service.js';
import type { ExecutionsGateway } from '../src/workflows/executions.gateway.js';
import type { ScheduleService } from '../src/schedules/schedule.service.js';

describe('execution worker lease with PostgreSQL', () => {
  const prisma = new PrismaService();
  const ids: string[] = [];
  let workflows: WorkflowsService;

  beforeAll(async () => {
    await prisma.$connect();
    workflows = new WorkflowsService(
      {} as WorkflowQueueService,
      {} as ExecutionsGateway,
      prisma,
      new IdempotentHttpService(prisma),
      {} as ScheduleService,
    );
  });

  afterAll(async () => {
    if (ids.length) await prisma.execution.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  async function queued(nodes: unknown, edges: unknown, maxAttempts = 1) {
    const id = randomUUID();
    ids.push(id);
    await prisma.execution.create({
      data: {
        id, status: 'QUEUED', nodes: nodes as object[], edges: edges as object[],
        input: {}, attemptCount: 0, maxAttempts,
      },
    });
    return id;
  }

  it('claims, heartbeats, fences an old lease, and clears the lease on success', async () => {
    const delay = (id: string) => ({
      id,
      data: {
        kind: 'delay', title: 'Wait', subtitle: '', category: 'ACTION', icon: 'clock',
        config: { duration: 5, unit: 'seconds' },
      },
    });
    const id = await queued(
      [delay('one'), delay('two')],
      [{ id: 'one-two', source: 'one', target: 'two' }],
    );
    const running = workflows.processQueuedExecution(id, { attempt: 1, maxAttempts: 1 });
    let row = await prisma.execution.findUniqueOrThrow({ where: { id } });
    for (let i = 0; i < 30 && row.status !== 'RUNNING'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      row = await prisma.execution.findUniqueOrThrow({ where: { id } });
    }
    expect(row.status).toBe('RUNNING');
    expect(row.workerLeaseId).toBeTruthy();
    expect(row.workerHeartbeatAt).not.toBeNull();
    expect(row.recoveryCount).toBe(0);
    const firstHeartbeat = row.workerHeartbeatAt!;

    const staleWrite = await prisma.execution.updateMany({
      where: { id, status: 'RUNNING', workerLeaseId: randomUUID() },
      data: { workerHeartbeatAt: new Date(0) },
    });
    expect(staleWrite.count).toBe(0);
    expect((await prisma.execution.findUniqueOrThrow({ where: { id } })).workerHeartbeatAt).toEqual(firstHeartbeat);

    await new Promise((resolve) => setTimeout(resolve, 5700));
    row = await prisma.execution.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('RUNNING');
    expect(row.workerLeaseId).toBeTruthy();
    expect(row.workerHeartbeatAt!.getTime()).toBeGreaterThan(firstHeartbeat.getTime());

    expect((await running).success).toBe(true);
    row = await prisma.execution.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('SUCCESS');
    expect(row.workerLeaseId).toBeNull();
    expect(row.workerHeartbeatAt).toBeNull();
  });

  it('clears the lease after a final failed attempt', async () => {
    const id = await queued([], []);
    const result = await workflows.processQueuedExecution(id, { attempt: 1, maxAttempts: 1 });
    expect(result.success).toBe(false);
    const row = await prisma.execution.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('FAILED');
    expect(row.workerLeaseId).toBeNull();
    expect(row.workerHeartbeatAt).toBeNull();
  });
});
