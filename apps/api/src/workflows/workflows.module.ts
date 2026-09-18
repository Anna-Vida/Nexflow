import {
  Module,
} from '@nestjs/common';
import {
  ExecutionsGateway,
} from './executions.gateway.js';
import {
  WorkflowsController,
} from './workflows.controller.js';
import {
  WorkflowsService,
} from './workflows.service.js';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';
import { IdempotentHttpService } from './idempotent-http.service.js';
import { ExecutionRecoveryService } from '../recovery/execution-recovery.service.js';
import { ScheduleService } from '../schedules/schedule.service.js';

import { QueueModule } from '../queue/queue.module.js';

@Module({
  imports: [QueueModule],
  exports: [WorkflowsService],
  controllers: [
    WorkflowsController,
    WebhooksController,
  ],

  providers: [
    WorkflowsService,
    ExecutionsGateway,
    WebhooksService,
    IdempotentHttpService,
    ExecutionRecoveryService,
    ScheduleService,
  ],
})
export class WorkflowsModule {}
