// Only the real-process contract test launches this entrypoint. Production
// worker.ts continues to use the SSRF-protected HTTP transport.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { IdempotentHttpService } from '../workflows/idempotent-http.service.js';
import { WorkflowsService } from '../workflows/workflows.service.js';
import { ExecutionRecoveryService } from '../recovery/execution-recovery.service.js';
import { createWorkflowWorker } from '../queue/workflow-worker.js';

if (process.env.NODE_ENV !== 'test') throw new Error('Test worker requires NODE_ENV=test.');
const target = new URL(process.env.NEXFLOW_TEST_HTTP_URL ?? '');
if (target.hostname !== '127.0.0.1') throw new Error('Test HTTP target must use 127.0.0.1.');

const app = await NestFactory.createApplicationContext(AppModule);
const http = app.get(IdempotentHttpService);
http.transport = async (_nodeId, config, _context, key) => {
  const response = await fetch(target, {
    method: config.method,
    headers: { 'Idempotency-Key': key! },
    body: config.method === 'GET' ? undefined : config.body,
  });
  return {
    response: {
      status: response.status, statusText: response.statusText,
      url: target.toString(), body: await response.json(), attempts: 1,
    },
    message: `${config.method} completed`,
  };
};
const recovery = app.get(ExecutionRecoveryService);
const worker = createWorkflowWorker(app.get(WorkflowsService));
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  recovery.stop();
  await worker.close();
  await app.close();
  process.disconnect?.();
}
process.once('SIGINT', () => { void close(); });
process.once('SIGTERM', () => { void close(); });
process.once('message', (message) => { if (message === 'shutdown') void close(); });
await worker.waitUntilReady();
await recovery.scanOnce();
recovery.start();
process.send?.('ready');
