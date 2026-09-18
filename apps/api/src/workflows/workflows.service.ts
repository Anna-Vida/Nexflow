import { randomUUID } from 'node:crypto';
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { WorkflowQueueService } from '../queue/workflow-queue.service.js';
import { WORKFLOW_MAX_ATTEMPTS } from '../queue/workflow-queue.js';
import { IdempotentHttpService } from './idempotent-http.service.js';

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
import {
  executeWorkflowSchema,
  type ExecuteWorkflowDto,
  type SaveWorkflowDto,
} from './workflow.schemas.js';
import {
  executeWorkflow,
  type WorkflowExecutionOptions,
  type WorkflowExecutionResult,
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
    private readonly queue: WorkflowQueueService,
    private readonly executionsGateway:
      ExecutionsGateway,

    private readonly prisma:
      PrismaService,
    private readonly idempotentHttp: IdempotentHttpService,
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
            webhookToken:
              workflow.webhookToken,

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
          webhookToken:
            workflow.webhookToken,

          version:
            workflow.currentVersion,

          updatedAt:
            workflow.updatedAt
              .toISOString(),
        };
      },
    );
  }

  private async ensureWorkflowExists(workflowId?: string) {
    if (!workflowId) return;
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId }, select: { id: true },
    });
    if (!workflow) throw new NotFoundException('Workflow not found.');
  }

  private async createExecutionRecord(request: ExecuteWorkflowDto, status: 'QUEUED' | 'RUNNING', startNodeId?: string) {
    return this.prisma.execution.create({
      data: {
        id: request.executionId,
        workflowId: request.workflowId ?? null,
        status,
        startNodeId,
        attemptCount: status === 'RUNNING' ? 1 : 0,
        maxAttempts: status === 'RUNNING' ? 1 : WORKFLOW_MAX_ATTEMPTS,
        nodes: toJson(request.nodes),
        edges: toJson(request.edges),
        input: toJson(request.input),
      },
    });
  }

  private async persistExecutionResult(executionId: string, result: WorkflowExecutionResult, attempt = 1, maxAttempts = 1, workerLeaseId?: string) {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.execution.updateMany({
        where: { id: executionId, status: 'RUNNING', ...(workerLeaseId ? { workerLeaseId } : {}) },
        data: {
          status: result.uncertainExternalOutcome ? 'RECOVERY_REQUIRED' : result.success ? 'SUCCESS' : attempt < maxAttempts ? 'RETRYING' : 'FAILED',
          lastError: result.success ? null : result.message,
          context: toJson(result.context),
          message: result.message,
          durationMs: result.durationMs,
          completedAt: result.uncertainExternalOutcome || result.success || attempt >= maxAttempts ? new Date() : null,
          workerLeaseId: null,
          workerHeartbeatAt: null,
        },
      });
      if (updated.count !== 1) throw new Error(`Execution ${executionId} lost its worker lease.`);
      await tx.executionEvent.createMany({
        data: result.events.map((event) => ({
          executionId,
          attempt,
          nodeId: event.nodeId,
          status: event.status,
          message: event.message,
          timestamp: new Date(event.timestamp),
        })),
      });
    });
  }

  async execute(request: ExecuteWorkflowDto, options?: WorkflowExecutionOptions) {
    await this.ensureWorkflowExists(request.workflowId);
    await this.createExecutionRecord(request, 'RUNNING');
    const result = await executeWorkflow(request, (event) => {
      this.executionsGateway.emitEvent(request.executionId, event);
    }, options);
    await this.persistExecutionResult(request.executionId, result);
    this.executionsGateway.emitComplete(request.executionId, result);
    return result;
  }

  async createQueuedExecution(request: ExecuteWorkflowDto, startNodeId?: string) {
    await this.ensureWorkflowExists(request.workflowId);
    return this.createExecutionRecord(request, 'QUEUED', startNodeId);
  }

  async failQueuedExecution(executionId: string, message: string, status: 'QUEUED' | 'RUNNING' = 'QUEUED') {
    await this.prisma.execution.updateMany({
      where: { id: executionId, status },
      data: { status: 'FAILED', message, lastError: message, completedAt: new Date() },
    });
  }

  async processQueuedExecution(executionId: string, { attempt, maxAttempts }: { attempt: number; maxAttempts: number }) {
    const execution = await this.prisma.execution.findUnique({ where: { id: executionId } });
    if (!execution) throw new Error(`Execution ${executionId} does not exist.`);
    if (!Number.isInteger(attempt) || attempt < 1 || attempt > maxAttempts || maxAttempts !== execution.maxAttempts) {
      throw new Error('Invalid execution attempt.');
    }
    const workerLeaseId = randomUUID();
    // Only the next delivery may claim this execution; stalled recovery stays off.
    const claimed = await this.prisma.execution.updateMany({
      where: { id: executionId, status: attempt === 1 ? 'QUEUED' : 'RETRYING', attemptCount: attempt - 1 },
      data: {
        status: 'RUNNING', attemptCount: attempt, maxAttempts,
        lastError: null, completedAt: null,
        workerLeaseId, workerHeartbeatAt: new Date(),
      },
    });
    if (claimed.count !== 1) throw new Error(`Execution ${executionId} cannot claim attempt ${attempt}.`);
    const heartbeat = setInterval(() => {
      void this.prisma.execution.updateMany({
        where: { id: executionId, status: 'RUNNING', workerLeaseId },
        data: { workerHeartbeatAt: new Date() },
      }).catch((error: unknown) => {
        console.error(`[worker] heartbeat failed for ${executionId}`, error);
      });
    }, 5000);
    heartbeat.unref();
    try {
      const parsed = executeWorkflowSchema.parse({
        executionId: execution.id,
        workflowId: execution.workflowId ?? undefined,
        nodes: execution.nodes,
        edges: execution.edges,
        input: execution.input,
      });
      const result = await executeWorkflow(parsed, undefined, {
        startNodeId: execution.startNodeId ?? undefined,
        executeHttp: async (node, context) => {
          if (node.data.kind !== 'http') throw new Error('Expected HTTP node.');
          const http = await this.idempotentHttp.execute({
            executionId, nodeId: node.id, workflowAttempt: attempt,
            config: node.data.config, context,
          });
          return {
            context: { ...context, [`${node.id}.response`]: http.response },
            message: http.message,
          };
        },
      });
      await this.persistExecutionResult(executionId, result, attempt, maxAttempts, workerLeaseId);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Worker execution failed.';
      await this.prisma.execution.updateMany({
        where: { id: executionId, status: 'RUNNING', attemptCount: attempt, workerLeaseId },
        data: {
          status: attempt < maxAttempts ? 'RETRYING' : 'FAILED',
          message, lastError: message,
          completedAt: attempt < maxAttempts ? null : new Date(),
          workerLeaseId: null, workerHeartbeatAt: null,
        },
      });
      throw error;
    } finally {
      clearInterval(heartbeat);
    }
  }

  async retryExecution(executionId: string) {
    const original = await this.prisma.execution.findUnique({ where: { id: executionId } });
    if (!original) throw new NotFoundException('Execution not found.');
    if (original.status !== 'FAILED') throw new ConflictException('Only failed executions can be retried.');
    const id = randomUUID();
    await this.prisma.execution.create({
      data: {
        id, workflowId: original.workflowId,
        nodes: toJson(original.nodes), edges: toJson(original.edges), input: toJson(original.input),
        startNodeId: original.startNodeId, status: 'QUEUED', attemptCount: 0,
        maxAttempts: WORKFLOW_MAX_ATTEMPTS, retriedFromId: original.id,
      },
    });
    try {
      await this.queue.enqueue({ executionId: id });
    } catch {
      await this.failQueuedExecution(id, 'Could not enqueue workflow execution.');
      throw new ServiceUnavailableException('Workflow execution queue is unavailable.');
    }
    return { executionId: id, retriedFromId: original.id, status: 'QUEUED' };
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
      webhookToken: workflow.webhookToken,
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

  async executionDetails(executionId: string) {
    const execution = await this.prisma.execution.findUnique({
      where: { id: executionId },
      include: {
        workflow: { select: { id: true, name: true } },
        events: { orderBy: { timestamp: 'asc' } },
      },
    });

    if (!execution) throw new NotFoundException('Execution not found.');
    return execution;
  }
}
