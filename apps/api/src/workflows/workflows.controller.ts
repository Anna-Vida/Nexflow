import { HttpCode, HttpStatus } from '@nestjs/common';

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard.js';
import {
  executeWorkflowSchema,
  saveWorkflowSchema,
} from './workflow.schemas.js';
import {
  WorkflowsService,
} from './workflows.service.js';

const workflowIdSchema = z.string().uuid();

function parseUuid(value: string) {
  const parsed = workflowIdSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('Invalid workflow ID.');
  return parsed.data;
}

// Every dashboard route is owner-scoped: the session decides which workflows,
// executions, and webhook tokens the caller may observe.
@Controller('workflows')
@UseGuards(AuthGuard)
export class WorkflowsController {
  constructor(
    private readonly workflowsService:
      WorkflowsService,
  ) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.workflowsService.list(request.user.id);
  }

  @Get('executions/recent')
  recentExecutions(@Req() request: AuthenticatedRequest) {
    return this.workflowsService.recentExecutions(request.user.id);
  }

  @Get('executions/:executionId')
  executionDetails(@Req() request: AuthenticatedRequest, @Param('executionId') executionId: string) {
    return this.workflowsService.executionDetails(parseUuid(executionId), request.user.id);
  }

  @Post('executions/:executionId/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  retry(@Req() request: AuthenticatedRequest, @Param('executionId') executionId: string) {
    return this.workflowsService.retryExecution(parseUuid(executionId), request.user.id);
  }

  @Get(':workflowId')
  getById(@Req() request: AuthenticatedRequest, @Param('workflowId') workflowId: string) {
    return this.workflowsService.getById(parseUuid(workflowId), request.user.id);
  }

  @Post('save')
  save(
    @Req()
    request: AuthenticatedRequest,

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
      .save(parsed.data, request.user.id);
  }

  @Post('execute')
  execute(
    @Req()
    request: AuthenticatedRequest,

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
      .execute(parsed.data, request.user.id);
  }

  @Get(':workflowId/executions')
  history(
    @Req()
    request: AuthenticatedRequest,

    @Param('workflowId')
    workflowId: string,
  ) {
    return this.workflowsService
      .history(parseUuid(workflowId), request.user.id);
  }
}
