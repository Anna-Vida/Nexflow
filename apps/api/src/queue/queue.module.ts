import { Module } from '@nestjs/common';
import { WorkflowQueueService } from './workflow-queue.service.js';

@Module({
  providers: [WorkflowQueueService],
  exports: [WorkflowQueueService],
})
export class QueueModule {}
