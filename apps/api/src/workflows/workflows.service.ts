import { Injectable } from '@nestjs/common';
import type { ExecuteWorkflowDto } from './workflow.schemas.js';
import { executeWorkflow } from './workflow.engine.js';

@Injectable()
export class WorkflowsService {
  execute(request: ExecuteWorkflowDto) {
    return executeWorkflow(request);
  }
}
