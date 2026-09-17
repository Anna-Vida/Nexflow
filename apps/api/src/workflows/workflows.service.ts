import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Prisma,
} from '../generated/prisma/client.js';
import {
  PrismaService,
} from '../database/prisma.service.js';
import type {
  ExecuteWorkflowDto,
  SaveWorkflowDto,
} from './workflow.schemas.js';
import {
  executeWorkflow,
} from './workflow.engine.js';
import {
  ExecutionsGateway,
} from './executions.gateway.js';

function toJson(
  value: unknown,
): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value),
  ) as Prisma.InputJsonValue;
}

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly executionsGateway:
      ExecutionsGateway,

    private readonly prisma:
      PrismaService,
  ) {}

  async save(
    request: SaveWorkflowDto,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        if (!request.workflowId) {
          const workflow =
            await tx.workflow.create({
              data: {
                name: request.name,
                currentVersion: 1,
              },
            });

          await tx.workflowVersion.create({
            data: {
              workflowId:
                workflow.id,

              version: 1,

              nodes:
                toJson(
                  request.nodes,
                ),

              edges:
                toJson(
                  request.edges,
                ),
            },
          });

          return {
            workflowId:
              workflow.id,

            version: 1,

            updatedAt:
              workflow.updatedAt
                .toISOString(),
          };
        }

        const existing =
          await tx.workflow.findUnique({
            where: {
              id:
                request.workflowId,
            },
          });

        if (!existing) {
          throw new NotFoundException(
            'Workflow not found.',
          );
        }

        const workflow =
          await tx.workflow.update({
            where: {
              id:
                request.workflowId,
            },

            data: {
              name: request.name,

              currentVersion: {
                increment: 1,
              },
            },
          });

        await tx.workflowVersion.create({
          data: {
            workflowId:
              workflow.id,

            version:
              workflow.currentVersion,

            nodes:
              toJson(
                request.nodes,
              ),

            edges:
              toJson(
                request.edges,
              ),
          },
        });

        return {
          workflowId:
            workflow.id,

          version:
            workflow.currentVersion,

          updatedAt:
            workflow.updatedAt
              .toISOString(),
        };
      },
    );
  }

  async execute(
    request: ExecuteWorkflowDto,
  ) {
    if (request.workflowId) {
      const workflow =
        await this.prisma.workflow.findUnique({
          where: {
            id:
              request.workflowId,
          },

          select: {
            id: true,
          },
        });

      if (!workflow) {
        throw new NotFoundException(
          'Workflow not found.',
        );
      }
    }

    await this.prisma.execution.create({
      data: {
        id:
          request.executionId,

        workflowId:
          request.workflowId ??
          null,

        status:
          'RUNNING',

        nodes:
          toJson(
            request.nodes,
          ),

        edges:
          toJson(
            request.edges,
          ),

        input:
          toJson(
            request.input,
          ),
      },
    });

    const result =
      await executeWorkflow(
        request,

        (event) => {
          this.executionsGateway
            .emitEvent(
              request.executionId,
              event,
            );
        },
      );

    await this.prisma.$transaction([
      this.prisma.execution.update({
        where: {
          id:
            request.executionId,
        },

        data: {
          status:
            result.success
              ? 'SUCCESS'
              : 'FAILED',

          context:
            toJson(
              result.context,
            ),

          message:
            result.message,

          durationMs:
            result.durationMs,

          completedAt:
            new Date(),
        },
      }),

      this.prisma.executionEvent.createMany({
        data:
          result.events.map(
            (event) => ({
              executionId:
                request.executionId,

              nodeId:
                event.nodeId,

              status:
                event.status,

              message:
                event.message,

              timestamp:
                new Date(
                  event.timestamp,
                ),
            }),
          ),
      }),
    ]);

    this.executionsGateway
      .emitComplete(
        request.executionId,
        result,
      );

    return result;
  }

  async history(
    workflowId: string,
  ) {
    return this.prisma.execution.findMany({
      where: {
        workflowId,
      },

      orderBy: {
        startedAt:
          'desc',
      },

      take: 20,

      include: {
        events: {
          orderBy: {
            timestamp:
              'asc',
          },
        },
      },
    });
  }

  async list() {
    const workflows = await this.prisma.workflow.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        executions: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: {
            id: true, status: true, durationMs: true,
            startedAt: true, completedAt: true,
          },
        },
        _count: { select: { executions: true } },
      },
    });

    return workflows.map((workflow) => ({
      id: workflow.id,
      name: workflow.name,
      currentVersion: workflow.currentVersion,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      executionCount: workflow._count.executions,
      latestExecution: workflow.executions[0] ?? null,
    }));
  }

  async getById(workflowId: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
    });
    if (!workflow) throw new NotFoundException('Workflow not found.');

    const version = await this.prisma.workflowVersion.findUnique({
      where: {
        workflowId_version: { workflowId, version: workflow.currentVersion },
      },
    });
    if (!version) throw new NotFoundException('Workflow version not found.');

    return {
      workflowId: workflow.id,
      name: workflow.name,
      version: version.version,
      updatedAt: workflow.updatedAt,
      nodes: version.nodes,
      edges: version.edges,
    };
  }

  async recentExecutions() {
    return this.prisma.execution.findMany({
      orderBy: { startedAt: 'desc' },
      take: 10,
      select: {
        id: true, status: true, durationMs: true,
        message: true, startedAt: true, completedAt: true,
        workflow: { select: { id: true, name: true } },
      },
    });
  }
}
