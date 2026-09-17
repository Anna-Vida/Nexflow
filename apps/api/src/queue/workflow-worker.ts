import { Worker } from 'bullmq';
import type { WorkflowsService } from '../workflows/workflows.service.js';
import { redisConnection, WORKFLOW_QUEUE, type WorkflowJobData } from './workflow-queue.js';

export function createWorkflowWorker(workflows: WorkflowsService) {
  const worker = new Worker<WorkflowJobData>(WORKFLOW_QUEUE, async (job) => {
    const result = await workflows.processQueuedExecution(job.data.executionId, {
      startNodeId: job.data.startNodeId,
    });
    if (!result.success) throw new Error(result.message);
    return result;
  }, {
    connection: redisConnection(true),
    concurrency: 4,
    maxStalledCount: 0,
  });
  worker.on('completed', (job) => console.log(`[worker] completed ${job.id}`));
  worker.on('failed', (job, error) => {
    console.error(`[worker] failed ${job?.id ?? 'unknown'}`, error.message);
  });
  worker.on('error', (error) => console.error('[worker] Redis/worker error', error));
  return worker;
}
