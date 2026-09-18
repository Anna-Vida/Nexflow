import { UnrecoverableError, Worker } from 'bullmq';
import type { WorkflowsService } from '../workflows/workflows.service.js';
import type { ScheduleService } from '../schedules/schedule.service.js';
import { redisConnection, WORKFLOW_QUEUE, type WorkflowJobData } from './workflow-queue.js';

export function createWorkflowWorker(workflows: WorkflowsService, schedules?: ScheduleService) {
  const worker = new Worker<WorkflowJobData>(WORKFLOW_QUEUE, async (job) => {
    if (job.data.mode === 'schedule') {
      if (!schedules || !job.id) throw new Error('Schedule processor is unavailable.');
      return schedules.fire(job.data.scheduleId, job.data.generation, job.id);
    }
    const result = job.data.mode === 'recovery'
      ? await workflows.processRecoveredExecution(job.data.executionId, job.data.recoveryCount!)
      : await workflows.processQueuedExecution(job.data.executionId, {
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts ?? 1,
      });
    if (result.uncertainExternalOutcome) throw new UnrecoverableError(result.message);
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
