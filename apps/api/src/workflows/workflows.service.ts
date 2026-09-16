import {
  Injectable,
} from '@nestjs/common';
import type {
  ExecuteWorkflowDto,
} from './workflow.schemas.js';
import {
  executeWorkflow,
} from './workflow.engine.js';
import {
  ExecutionsGateway,
} from './executions.gateway.js';

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly executionsGateway:
      ExecutionsGateway,
  ) {}

  async execute(
    request: ExecuteWorkflowDto,
  ) {
    const result =
      await executeWorkflow(
        request,

        (event) => {
          this.executionsGateway.emitEvent(
            request.executionId,
            event,
          );
        },
      );

    this.executionsGateway.emitComplete(
      request.executionId,
      result,
    );

    return result;
  }
}
