import { ServiceUnavailableException } from '@nestjs/common';
import { WorkflowQueueService } from '../queue/workflow-queue.service.js';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  MethodNotAllowedException,
  NotFoundException,
} from '@nestjs/common';
import {
  randomUUID,
} from 'node:crypto';
import { z } from 'zod';
import {
  PrismaService,
} from '../database/prisma.service.js';
import {
  executeWorkflowSchema,
  workflowEdgeSchema,
  workflowNodeSchema,
} from './workflow.schemas.js';
import {
  WorkflowsService,
} from './workflows.service.js';

const tokenSchema =
  z.string().uuid();

const storedDefinitionSchema =
  z.object({
    nodes:
      z.array(
        workflowNodeSchema,
      ),

    edges:
      z.array(
        workflowEdgeSchema,
      ),
  });

type TriggerRequest = {
  token: string;
  method: string;
  path: string;
  body: unknown;

  query:
    Record<string, unknown>;
};

function isPlainObject(
  value: unknown,
): value is Record<
  string,
  unknown
> {
  return (
    typeof value ===
      'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function createInput(
  request: TriggerRequest,
) {
  let body:
    Record<
      string,
      unknown
    > = {};

  if (
    request.method ===
    'POST'
  ) {
    if (
      request.body !==
        undefined &&
      request.body !== null
    ) {
      if (
        !isPlainObject(
          request.body,
        )
      ) {
        throw new BadRequestException(
          'Webhook JSON body must be an object.',
        );
      }

      body =
        request.body;
    }
  }

  return {
    ...request.query,
    ...body,

    _request: {
      method:
        request.method,

      path:
        request.path,

      receivedAt:
        new Date()
          .toISOString(),
    },
  };
}

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma:
      PrismaService,

    private readonly workflows:
      WorkflowsService,

    private readonly queue: WorkflowQueueService,
  ) {}

  async trigger(
    request: TriggerRequest,
  ) {
    const parsedToken =
      tokenSchema.safeParse(
        request.token,
      );

    if (!parsedToken.success) {
      throw new NotFoundException(
        'Webhook not found.',
      );
    }

    const workflow =
      await this.prisma
        .workflow
        .findUnique({
          where: {
            webhookToken:
              parsedToken.data,
          },
        });

    if (!workflow) {
      throw new NotFoundException(
        'Webhook not found.',
      );
    }

    const version =
      await this.prisma
        .workflowVersion
        .findUnique({
          where: {
            workflowId_version: {
              workflowId:
                workflow.id,

              version:
                workflow.currentVersion,
            },
          },
        });

    if (!version) {
      throw new NotFoundException(
        'Workflow version not found.',
      );
    }

    const definition =
      storedDefinitionSchema
        .safeParse({
          nodes:
            version.nodes,

          edges:
            version.edges,
        });

    if (!definition.success) {
      throw new InternalServerErrorException(
        'Stored workflow definition is invalid.',
      );
    }

    const method =
      request.method
        .toUpperCase();

    const pathMatches =
      definition.data.nodes
        .filter(
          (node) =>
            node.data.kind ===
              'webhook' &&
            node.data.config
              .path ===
              request.path,
        );

    if (
      pathMatches.length === 0
    ) {
      throw new NotFoundException(
        'Webhook path not found.',
      );
    }

    const exactMatches =
      pathMatches.filter(
        (node) =>
          node.data.kind ===
            'webhook' &&
          node.data.config
            .method ===
            method,
      );

    if (
      exactMatches.length === 0
    ) {
      throw new MethodNotAllowedException(
        'Webhook method does not match the configured trigger.',
      );
    }

    if (
      exactMatches.length > 1
    ) {
      throw new ConflictException(
        'Multiple webhook nodes use the same method and path.',
      );
    }

    const trigger =
      exactMatches[0];

    if (
      definition.data.edges.some(
        (edge) =>
          edge.target ===
          trigger.id,
      )
    ) {
      throw new BadRequestException(
        'Webhook trigger must not have incoming connections.',
      );
    }

    const executionId =
      randomUUID();

    const executionRequest =
      executeWorkflowSchema
        .safeParse({
          executionId,

          workflowId:
            workflow.id,

          nodes:
            definition.data.nodes,

          edges:
            definition.data.edges,

          input:
            createInput({
              ...request,
              method,
            }),
        });

    if (
      !executionRequest.success
    ) {
      throw new InternalServerErrorException(
        'Could not prepare webhook execution.',
      );
    }

    await this.workflows.createQueuedExecution(executionRequest.data, workflow.ownerId, trigger.id);
    try {
      await this.queue.enqueue({ executionId });
    } catch {
      await this.workflows.failQueuedExecution(
        executionId,
        'Could not enqueue workflow execution.',
      ).catch(() => undefined);
      throw new ServiceUnavailableException('Workflow execution queue is unavailable.');
    }

    return {
      executionId,

      workflowId:
        workflow.id,

      workflowName:
        workflow.name,

      status: 'QUEUED',
    };
  }
}
