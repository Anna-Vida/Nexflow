import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import {
  executeWorkflowSchema,
  saveWorkflowSchema,
} from './workflow.schemas.js';
import {
  WorkflowsService,
} from './workflows.service.js';

@Controller('workflows')
export class WorkflowsController {
  constructor(
    private readonly workflowsService:
      WorkflowsService,
  ) {}

  @Post('save')
  save(
    @Body()
    body: unknown,
  ) {
    const parsed =
      saveWorkflowSchema
        .safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException({
        message:
          'Invalid workflow payload.',

        issues:
          parsed.error.issues,
      });
    }

    return this.workflowsService
      .save(parsed.data);
  }

  @Post('execute')
  execute(
    @Body()
    body: unknown,
  ) {
    const parsed =
      executeWorkflowSchema
        .safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException({
        message:
          'Invalid workflow payload.',

        issues:
          parsed.error.issues,
      });
    }

    return this.workflowsService
      .execute(parsed.data);
  }

  @Get(':workflowId/executions')
  history(
    @Param('workflowId')
    workflowId: string,
  ) {
    return this.workflowsService
      .history(workflowId);
  }
}
