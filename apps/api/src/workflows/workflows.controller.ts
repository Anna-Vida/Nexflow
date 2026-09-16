import {
  BadRequestException,
  Body,
  Controller,
  Post,
} from '@nestjs/common';
import { executeWorkflowSchema } from './workflow.schemas.js';
import { WorkflowsService } from './workflows.service.js';

@Controller('workflows')
export class WorkflowsController {
  constructor(
    private readonly workflowsService: WorkflowsService,
  ) {}

  @Post('execute')
  execute(@Body() body: unknown) {
    const parsed =
      executeWorkflowSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException({
        message:
          'Invalid workflow payload.',
        issues:
          parsed.error.issues,
      });
    }

    return this.workflowsService.execute(
      parsed.data,
    );
  }
}
