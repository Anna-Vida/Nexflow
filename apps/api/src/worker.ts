import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { createWorkflowWorker } from './queue/workflow-worker.js';
import { WorkflowsService } from './workflows/workflows.service.js';
import { ExecutionRecoveryService } from './recovery/execution-recovery.service.js';
import { ScheduleService } from './schedules/schedule.service.js';
import { validateProductionEnv } from './config/production-env.js';

validateProductionEnv();
const app = await NestFactory.createApplicationContext(AppModule);
const worker = createWorkflowWorker(app.get(WorkflowsService), app.get(ScheduleService));
const recovery = app.get(ExecutionRecoveryService);
let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  recovery.stop();
  await worker.close();
  await app.close();
  process.disconnect?.();
}

process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
// Allows a parent process (including the contract test) to stop gracefully on Windows.
process.once('message', (message) => {
  if (message === 'shutdown') void shutdown();
});
await worker.waitUntilReady();
await recovery.scanOnce();
recovery.start();
console.log('NexFlow BullMQ worker ready.');
process.send?.('ready');
