import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { IdempotentHttpService } from '../src/workflows/idempotent-http.service.js';
import { WorkflowsService } from '../src/workflows/workflows.service.js';
import type { WorkflowQueueService } from '../src/queue/workflow-queue.service.js';
import type { ExecutionsGateway } from '../src/workflows/executions.gateway.js';
import type { ScheduleService } from '../src/schedules/schedule.service.js';
import type { ExecuteWorkflowDto } from '../src/workflows/workflow.schemas.js';
import { createTestOwner, removeTestOwner } from '../src/test-support/test-owner.js';

describe('HTTP idempotency with PostgreSQL', () => {
  const prisma = new PrismaService();
  const ids: string[] = [];
  let ownerId: string;
  let server: Server;
  let endpoint: string;
  let requests = 0;
  let receivedKeys: string[] = [];
  let http: IdempotentHttpService;
  let workflows: WorkflowsService;

  const config = {
    method: 'POST' as const,
    url: 'https://example.com/pay',
    headers: '{}',
    body: '{"amount":1}',
    timeout: 1000,
    retries: 0,
    retryDelayMs: 500,
  };

  const request = (executionId: string): ExecuteWorkflowDto => ({
    executionId,
    nodes: [{
      id: 'http-1',
      data: {
        kind: 'http', title: 'Payment', subtitle: '', category: 'ACTION', icon: '{}',
        config,
      },
    }],
    edges: [],
    input: {},
  });

  async function createExecution(executionId: string) {
    ids.push(executionId);
    await prisma.execution.create({
      data: {
        id: executionId, ownerId, status: 'QUEUED', attemptCount: 0, maxAttempts: 3,
        nodes: JSON.parse(JSON.stringify(request(executionId).nodes)), edges: [], input: {},
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    ownerId = (await createTestOwner(prisma, 'idempotency')).id;
    // The integration suite deliberately requires the idempotency migration.
    await prisma.httpAction.count();
    server = createServer((req, res) => {
      requests++;
      receivedKeys.push(String(req.headers['idempotency-key'] ?? ''));
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ paymentId: 'paid-once' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing local server port.');
    endpoint = `http://127.0.0.1:${address.port}`;

    http = new IdempotentHttpService(prisma);
    // The production transport blocks loopback by design. Inject a local
    // network transport here while retaining the real PostgreSQL orchestration.
    http.transport = async (_nodeId, _config, _context, key) => {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Idempotency-Key': key! } });
      return {
        response: {
          status: response.status, statusText: response.statusText,
          url: endpoint, body: await response.json(), attempts: 1,
        },
        message: 'POST completed',
      };
    };
    workflows = new WorkflowsService(
      {} as WorkflowQueueService,
      {} as ExecutionsGateway,
      prisma,
      http,
      {} as ScheduleService,
    );
  });

  afterAll(async () => {
    if (ids.length) await prisma.execution.deleteMany({ where: { id: { in: ids } } });
    await removeTestOwner(prisma, ownerId);
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  });

  it('reuses a committed HTTP result when the same execution runs again', async () => {
    const executionId = randomUUID();
    await createExecution(executionId);
    const first = await http.execute({
      executionId, nodeId: 'http-1', workflowAttempt: 1, config, context: {},
    });
    const saved = await prisma.httpAction.findUniqueOrThrow({
      where: { executionId_nodeId: { executionId, nodeId: 'http-1' } },
      include: { attempts: true },
    });
    expect(saved.status).toBe('SUCCEEDED');
    expect(saved.response).toEqual(first.response);
    expect(saved.attempts).toHaveLength(1);
    expect(saved.attempts[0].status).toBe('SUCCEEDED');
    expect(requests).toBe(1);

    // Simulates a worker crash after the node commit but before the workflow
    // completion commit, followed by the next automatic BullMQ attempt.
    await prisma.execution.update({
      where: { id: executionId }, data: { status: 'RETRYING', attemptCount: 1 },
    });
    const replay = await workflows.processQueuedExecution(executionId, { attempt: 2, maxAttempts: 3 });
    const after = await prisma.httpAction.findUniqueOrThrow({
      where: { executionId_nodeId: { executionId, nodeId: 'http-1' } },
      include: { attempts: true },
    });
    expect(replay.success).toBe(true);
    expect(replay.context['http-1.response']).toEqual(saved.response);
    expect(after.id).toBe(saved.id);
    expect(after.idempotencyKey).toBe(saved.idempotencyKey);
    expect(after.attempts).toHaveLength(1);
    expect(receivedKeys).toEqual([saved.idempotencyKey]);
    expect(requests).toBe(1);
    expect((await prisma.execution.findUniqueOrThrow({ where: { id: executionId } })).status).toBe('SUCCESS');
  });

  it('marks a persisted in-flight action recovery-required without another send', async () => {
    const executionId = randomUUID();
    await createExecution(executionId);
    const before = requests;
    const action = await prisma.httpAction.create({
      data: {
        executionId, nodeId: 'http-1', idempotencyKey: randomUUID(),
        requestFingerprint: createHash('sha256')
          .update(JSON.stringify({ config, context: {} })).digest('hex'),
        status: 'IN_FLIGHT',
        attempts: { create: { number: 1, status: 'SENT' } },
      },
    });
    const result = await workflows.processQueuedExecution(executionId, { attempt: 1, maxAttempts: 3 });
    expect(result.uncertainExternalOutcome).toBe(true);
    expect((await prisma.execution.findUniqueOrThrow({ where: { id: executionId } })).status).toBe('RECOVERY_REQUIRED');
    expect((await prisma.httpAction.findUniqueOrThrow({ where: { id: action.id } })).status).toBe('UNKNOWN_EXTERNAL_OUTCOME');
    expect(requests).toBe(before);
  });
});
