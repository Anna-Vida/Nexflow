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
import { AuthModule } from '../auth/auth.module.js';
import { SecurityModule } from '../security/security.module.js';

@Module({
  imports: [QueueModule, AuthModule, SecurityModule],
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
