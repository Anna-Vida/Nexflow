import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { IdempotentHttpService, UncertainExternalOutcomeError } from '../src/workflows/idempotent-http.service.js';
import type { PrismaService } from '../src/database/prisma.service.js';

function memoryStore() {
  let action: any;
  let attempt: any;
  const db: any = {
    httpAction: {
      upsert: async ({ create }: any) => (action ??= { id: 'action', ...create, response: null }),
      updateMany: async ({ where, data }: any) => {
        if (!action || action.status !== where.status) return { count: 0 };
        Object.assign(action, data);
        return { count: 1 };
      },
      update: async ({ data }: any) => Object.assign(action, data),
    },
    httpActionAttempt: {
      create: async ({ data }: any) => (attempt = data),
      update: async ({ data }: any) => Object.assign(attempt, data),
      updateMany: async ({ data }: any) => Object.assign(attempt, data),
    },
    $transaction: async (fn: any) => fn(db),
  };
  return { db: db as PrismaService, action: () => action };
}

const config = {
  method: 'POST' as const, url: 'https://example.com/pay', headers: '{}',
  body: '{"amount":1}', timeout: 1000, retries: 0, retryDelayMs: 500,
};

describe('idempotent HTTP persistence', () => {
  const servers: Array<ReturnType<typeof createServer>> = [];
  afterEach(async () => {
    for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function localEndpoint() {
    let requests = 0;
    const server = createServer((_request, response) => {
      requests++;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ chargeId: 'one' }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test port');
    return { url: `http://127.0.0.1:${address.port}`, count: () => requests };
  }

  it('reuses a persisted success after a simulated workflow crash', async () => {
    const endpoint = await localEndpoint();
    const store = memoryStore();
    const service = new IdempotentHttpService(store.db);
    service.transport = async (_node, _config, _context, key) => {
      const response = await fetch(endpoint.url, { method: 'POST', headers: { 'Idempotency-Key': key! } });
      return { response: { status: response.status, statusText: response.statusText, url: endpoint.url, body: await response.json(), attempts: 1 }, message: 'sent' };
    };
    const first = await service.execute({ executionId: 'e', nodeId: 'http', workflowAttempt: 1, config, context: {} });
    expect(store.action().status).toBe('SUCCEEDED');
    const replay = await service.execute({ executionId: 'e', nodeId: 'http', workflowAttempt: 2, config, context: {} });
    expect(replay.response).toEqual(first.response);
    expect(endpoint.count()).toBe(1);
  });

  it('refuses a resend when the external response was not persisted', async () => {
    const endpoint = await localEndpoint();
    const store = memoryStore();
    const service = new IdempotentHttpService(store.db);
    service.transport = async () => {
      await fetch(endpoint.url, { method: 'POST' });
      throw new Error('simulated crash before commit');
    };
    const args = { executionId: 'e', nodeId: 'http', workflowAttempt: 1, config, context: {} };
    await expect(service.execute(args)).rejects.toBeInstanceOf(UncertainExternalOutcomeError);
    expect(store.action().status).toBe('UNKNOWN_EXTERNAL_OUTCOME');
    await expect(service.execute({ ...args, workflowAttempt: 2 })).rejects.toBeInstanceOf(UncertainExternalOutcomeError);
    expect(endpoint.count()).toBe(1);
  });
});
