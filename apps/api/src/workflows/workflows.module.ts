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

@Module({
  controllers: [
    WorkflowsController,
  ],

  providers: [
    WorkflowsService,
    ExecutionsGateway,
  ],
})
export class WorkflowsModule {}
