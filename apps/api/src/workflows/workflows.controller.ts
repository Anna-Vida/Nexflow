import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import {
  executeWorkflowSchema,
  saveWorkflowSchema,
} from './workflow.schemas.js';
import {
  WorkflowsService,
} from './workflows.service.js';

const workflowIdSchema = z.string().uuid();

function parseWorkflowId(value: string) {
  const parsed = workflowIdSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('Invalid workflow ID.');
  return parsed.data;
}

@Controller('workflows')
export class WorkflowsController {
  constructor(
    private readonly workflowsService:
      WorkflowsService,
  ) {}

  @Get()
  list() {
    return this.workflowsService.list();
  }

  @Get('executions/recent')
  recentExecutions() {
    return this.workflowsService.recentExecutions();
  }

  @Get(':workflowId')
  getById(@Param('workflowId') workflowId: string) {
    return this.workflowsService.getById(parseWorkflowId(workflowId));
  }

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
      .history(parseWorkflowId(workflowId));
  }
}
