import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { redisConnection, WORKFLOW_QUEUE, WORKFLOW_MAX_ATTEMPTS, type WorkflowJobData } from './workflow-queue.js';

@Injectable()
export class WorkflowQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(WorkflowQueueService.name);
  private readonly queue = new Queue<WorkflowJobData>(WORKFLOW_QUEUE, {
    connection: redisConnection(false),
    skipWaitingForReady: true,
    defaultJobOptions: {
      attempts: WORKFLOW_MAX_ATTEMPTS,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  });

  constructor() {
    this.queue.on('error', (error: Error) => this.logger.error(error.message));
  }

  async enqueue(data: WorkflowJobData) {
    // This bounds the HTTP wait, not the Redis command itself. A late job can
    // only run if its execution is still QUEUED when the worker claims it.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.queue.add('execute-workflow', data, { jobId: data.executionId }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Redis is unavailable.')), 3000);
          timer.unref();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async enqueueRecovery(executionId: string, recoveryCount: number) {
    const jobId = `recovery-${executionId}-${recoveryCount}`;
    const existing = await this.queue.getJob(jobId);
    if (existing && await existing.getState() === 'failed') {
      await existing.remove();
    }
    return this.queue.add('recover-workflow', {
      executionId, mode: 'recovery', recoveryCount,
    }, {
      // BullMQ reserves ':' in custom IDs.
      jobId,
      attempts: 1,
    });
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
