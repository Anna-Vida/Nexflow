import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { ExecutionRecoveryService } from '../src/recovery/execution-recovery.service.js';
import { IdempotentHttpService } from '../src/workflows/idempotent-http.service.js';
import { WorkflowsService } from '../src/workflows/workflows.service.js';
import type { WorkflowQueueService } from '../src/queue/workflow-queue.service.js';
import type { ExecutionsGateway } from '../src/workflows/executions.gateway.js';

describe('stale worker reconciliation with PostgreSQL', () => {
  const prisma = new PrismaService();
  const ids: string[] = [];
  const enqueueRecovery = vi.fn().mockResolvedValue(undefined);
  const queue = { enqueueRecovery } as unknown as WorkflowQueueService;
  let recovery: ExecutionRecoveryService;

  const config = {
    method: 'POST' as const, url: 'https://example.com/pay', headers: '{}',
    body: '{"amount":1}', timeout: 1000, retries: 0, retryDelayMs: 500,
  };
  const httpNode = {
    id: 'http-1',
    data: { kind: 'http', title: 'Pay', subtitle: '', category: 'ACTION', icon: 'http', config },
  };

  beforeAll(async () => {
    await prisma.$connect();
    recovery = new ExecutionRecoveryService(prisma, queue);
  });
  afterAll(async () => {
    if (ids.length) await prisma.execution.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  async function createRunning(heartbeatAt: Date, nodes: unknown = []) {
    const id = randomUUID();
    ids.push(id);
    const lease = randomUUID();
    await prisma.execution.create({
      data: {
        id, status: 'RUNNING', nodes: nodes as object[], edges: [], input: {},
        attemptCount: 1, maxAttempts: 3,
        workerLeaseId: lease, workerHeartbeatAt: heartbeatAt,
      },
    });
    return { id, lease };
  }

  it('ignores a fresh heartbeat', async () => {
    enqueueRecovery.mockClear();
    const { id, lease } = await createRunning(new Date());
    await recovery.scanOnce();
    const row = await prisma.execution.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('RUNNING');
    expect(row.workerLeaseId).toBe(lease);
    expect(row.recoveryCount).toBe(0);
    expect(enqueueRecovery).not.toHaveBeenCalled();
  });

  it('recovers a stale execution and reuses its saved HTTP result', async () => {
    enqueueRecovery.mockClear();
    const { id } = await createRunning(new Date(Date.now() - 60_000), [httpNode]);
    const response = { status: 200, statusText: 'OK', url: config.url, body: { paymentId: 'one' }, attempts: 1 };
    await prisma.httpAction.create({
      data: {
        executionId: id, nodeId: 'http-1', idempotencyKey: randomUUID(),
        requestFingerprint: createHash('sha256').update(JSON.stringify({ config, context: {} })).digest('hex'),
        status: 'SUCCEEDED', response, message: 'POST completed', completedAt: new Date(),
        attempts: { create: { number: 1, status: 'SUCCEEDED', completedAt: new Date() } },
      },
    });
    await recovery.scanOnce();
    let row = await prisma.execution.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('RECOVERING');
    expect(row.recoveryCount).toBe(1);
    expect(row.workerLeaseId).toBeNull();
    expect(enqueueRecovery).toHaveBeenCalledWith(id, 1);
    expect(enqueueRecovery).toHaveBeenCalledTimes(1);

    const http = new IdempotentHttpService(prisma);
    http.transport = vi.fn().mockRejectedValue(new Error('HTTP must not be resent'));
    const workflows = new WorkflowsService(queue, {} as ExecutionsGateway, prisma, http);
    const result = await workflows.processRecoveredExecution(id, 1);
    expect(result.success).toBe(true);
    expect(result.context['http-1.response']).toEqual(response);
    expect(http.transport).not.toHaveBeenCalled();
    row = await prisma.execution.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('SUCCESS');
    expect(row.workerLeaseId).toBeNull();
    expect(row.workerHeartbeatAt).toBeNull();
    expect(row.recoveryCount).toBe(1);
    await expect(workflows.processRecoveredExecution(id, 1)).rejects.toThrow('cannot claim recovery');
  });

  it.each(['IN_FLIGHT', 'UNKNOWN_EXTERNAL_OUTCOME'])('requires manual reconciliation for %s', async (status) => {
    enqueueRecovery.mockClear();
    const { id } = await createRunning(new Date(Date.now() - 60_000));
    await prisma.httpAction.create({
      data: {
        executionId: id, nodeId: 'http-1', idempotencyKey: randomUUID(),
        requestFingerprint: 'test', status,
      },
    });
    await recovery.scanOnce();
    const row = await prisma.execution.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('RECOVERY_REQUIRED');
    expect(row.workerLeaseId).toBeNull();
    expect(row.workerHeartbeatAt).toBeNull();
    expect(row.recoveryCount).toBe(0);
    expect(enqueueRecovery).not.toHaveBeenCalled();
  });
});
