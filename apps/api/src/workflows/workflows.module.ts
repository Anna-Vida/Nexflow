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

@Module({
  controllers: [
    WorkflowsController,
    WebhooksController,
  ],

  providers: [
    WorkflowsService,
    ExecutionsGateway,
    WebhooksService,
  ],
})
export class WorkflowsModule {}
