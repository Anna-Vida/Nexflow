import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { ScheduleService } from '../src/schedules/schedule.service.js';
import { WorkflowsService } from '../src/workflows/workflows.service.js';
import { IdempotentHttpService } from '../src/workflows/idempotent-http.service.js';
import type { WorkflowQueueService } from '../src/queue/workflow-queue.service.js';
import type { ExecutionsGateway } from '../src/workflows/executions.gateway.js';
import type { SaveWorkflowDto } from '../src/workflows/workflow.schemas.js';

import { createTestOwner, removeTestOwner } from '../src/test-support/test-owner.js';

describe('persistent schedules with PostgreSQL', () => {
  const prisma = new PrismaService();
  const registered = new Set<string>();
  const operations: string[] = [];
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const queue = {
    enqueue,
    enqueueScheduledExecution: enqueue,
    listScheduleJobs: vi.fn(async () => [...registered].map((key) => ({ key }))),
    removeScheduleJob: vi.fn(async (key: string) => { operations.push(`remove:${key}`); registered.delete(key); }),
    upsertScheduleJob: vi.fn(async (row: { id: string; generation: number }) => {
      const key = `nexflow-schedule-${row.id}-${row.generation}`;
      operations.push(`upsert:${key}`);
      registered.add(key);
    }),
  } as unknown as WorkflowQueueService;
  const schedules = new ScheduleService(prisma, queue);
  const workflows = new WorkflowsService(queue, {} as ExecutionsGateway, prisma, new IdempotentHttpService(prisma), schedules);
  let workflowId: string | undefined;
  let ownerId: string;

  const scheduleNode = (config: { mode: 'interval' | 'cron'; timezone: string; enabled: boolean; intervalMinutes?: number; cron?: string }) => ({
    id: 'schedule-1',
    data: {
      kind: 'schedule' as const, title: 'Schedule', subtitle: '', category: 'TRIGGER', icon: 'clock',
      config: config.mode === 'interval'
        ? { mode: 'interval' as const, intervalMinutes: config.intervalMinutes ?? 60, timezone: config.timezone, enabled: config.enabled }
        : { mode: 'cron' as const, cron: config.cron ?? '0 9 * * 1-5', timezone: config.timezone, enabled: config.enabled },
    },
  });
  const delayNode = {
    id: 'delay-1',
    data: {
      kind: 'delay' as const, title: 'Delay', subtitle: '', category: 'ACTION', icon: 'clock',
      config: { duration: 0.001, unit: 'seconds' as const },
    },
  };
  const request = (config: Parameters<typeof scheduleNode>[0], id?: string): SaveWorkflowDto => ({
    workflowId: id, name: 'Schedule integration',
    nodes: [scheduleNode(config), delayNode],
    edges: [{ id: 'schedule-delay', source: 'schedule-1', target: 'delay-1' }],
  });

  beforeAll(async () => {
    await prisma.$connect();
    ownerId = (await createTestOwner(prisma, 'schedule')).id;
  });
  afterAll(async () => {
    if (workflowId) {
      await prisma.execution.deleteMany({ where: { workflowId } });
      await prisma.workflow.delete({ where: { id: workflowId } });
    }
    await removeTestOwner(prisma, ownerId);
    await prisma.$disconnect();
  });

  it('saves a root schedule and creates one normal execution per scheduler job ID', async () => {
    const saved = await workflows.save(request({ mode: 'interval', intervalMinutes: 60, timezone: 'Asia/Manila', enabled: true }), ownerId);
    workflowId = saved.workflowId;
    const schedule = await prisma.scheduleDefinition.findUniqueOrThrow({
      where: { workflowId_nodeId: { workflowId, nodeId: 'schedule-1' } },
    });
    expect(schedule.mode).toBe('interval');
    expect(schedule.intervalMinutes).toBe(60);
    expect(schedule.timezone).toBe('Asia/Manila');
    expect(schedule.generation).toBe(1);
    expect(registered).toContain(`nexflow-schedule-${schedule.id}-1`);

    const first = await schedules.fire(schedule.id, 1, 'test-schedule-tick-1');
    const second = await schedules.fire(schedule.id, 1, 'test-schedule-tick-1');
    expect(first).toEqual(second);
    expect(first.skipped).toBe(false);
    const fires = await prisma.scheduledFire.findMany({ where: { scheduleId: schedule.id } });
    expect(fires).toHaveLength(1);
    const execution = await prisma.execution.findUniqueOrThrow({ where: { id: first.executionId } });
    expect(execution.status).toBe('QUEUED');
    expect(execution.startNodeId).toBe('schedule-1');
    expect(execution.workflowId).toBe(workflowId);
    expect(execution.maxAttempts).toBe(3);
    expect((execution.input as { _schedule: { scheduleId: string } })._schedule.scheduleId).toBe(schedule.id);
    const result = await workflows.processQueuedExecution(execution.id, { attempt: 1, maxAttempts: 3 });
    expect(result.success).toBe(true);
    expect((await prisma.execution.findUniqueOrThrow({ where: { id: execution.id } })).status).toBe('SUCCESS');
  });

  it('keeps registration stable on restart, then removes old generation before editing', async () => {
    const original = await prisma.scheduleDefinition.findUniqueOrThrow({
      where: { workflowId_nodeId: { workflowId: workflowId!, nodeId: 'schedule-1' } },
    });
    await schedules.syncAll();
    expect(registered.size).toBe(1);
    operations.length = 0;
    await workflows.save(request({ mode: 'cron', cron: '0 9 * * 1-5', timezone: 'Asia/Manila', enabled: true }, workflowId), ownerId);
    const edited = await prisma.scheduleDefinition.findUniqueOrThrow({ where: { id: original.id } });
    expect(edited.generation).toBe(2);
    expect(operations[0]).toBe(`remove:nexflow-schedule-${original.id}-1`);
    expect(operations[1]).toBe(`upsert:nexflow-schedule-${original.id}-2`);
    expect(await schedules.fire(original.id, 1, 'stale-tick')).toEqual({ skipped: true });
    const updatedFire = await schedules.fire(original.id, 2, 'test-schedule-tick-2');
    expect(updatedFire.skipped).toBe(false);
    const updatedExecution = await prisma.execution.findUniqueOrThrow({ where: { id: updatedFire.executionId } });
    const updatedNodes = updatedExecution.nodes as Array<{ data: { kind: string; config: { mode?: string } } }>;
    expect(updatedNodes.find((node) => node.data.kind === 'schedule')?.data.config.mode).toBe('cron');
    await workflows.save(request({ mode: 'cron', cron: '0 9 * * 1-5', timezone: 'Asia/Manila', enabled: false }, workflowId), ownerId);
    expect(registered.size).toBe(0);
    expect(await schedules.fire(original.id, 2, 'disabled-tick')).toEqual({ skipped: true });
  });

  it('rejects a schedule with an incoming edge', async () => {
    const invalid = request({ mode: 'interval', intervalMinutes: 1, timezone: 'Asia/Manila', enabled: true }, workflowId);
    invalid.edges.push({ id: 'bad', source: 'delay-1', target: 'schedule-1' });
    await expect(workflows.save(invalid, ownerId)).rejects.toThrow('root node');
  });

  it('rejects an invalid cron expression before changing the saved version', async () => {
    const before = await prisma.workflow.findUniqueOrThrow({ where: { id: workflowId! } });
    await expect(workflows.save(request({ mode: 'cron', cron: 'bad cron', timezone: 'Asia/Manila', enabled: true }, workflowId), ownerId))
      .rejects.toThrow('invalid cron expression');
    const after = await prisma.workflow.findUniqueOrThrow({ where: { id: workflowId! } });
    expect(after.currentVersion).toBe(before.currentVersion);
  });
});
