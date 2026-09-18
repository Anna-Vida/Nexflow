import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { ExecuteWorkflowDto } from './workflow.schemas.js';
import { executeHttpRequest } from './http-executor.js';

type HttpNode = Extract<ExecuteWorkflowDto['nodes'][number]['data'], { kind: 'http' }>;
type HttpResult = Awaited<ReturnType<typeof executeHttpRequest>>;
type Transport = typeof executeHttpRequest;

export class UncertainExternalOutcomeError extends Error {
  constructor(nodeId: string) {
    super(`HTTP action ${nodeId} has an uncertain external outcome and requires reconciliation.`);
    this.name = 'UncertainExternalOutcomeError';
  }
}

@Injectable()
export class IdempotentHttpService {
  transport: Transport = executeHttpRequest;

  constructor(private readonly prisma: PrismaService) {}

  async execute(args: {
    executionId: string;
    nodeId: string;
    workflowAttempt: number;
    config: HttpNode['config'];
    context: Record<string, unknown>;
  }): Promise<HttpResult> {
    const { executionId, nodeId, workflowAttempt, config, context } = args;
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ config, context }))
      .digest('hex');

    const action = await this.prisma.httpAction.upsert({
      where: { executionId_nodeId: { executionId, nodeId } },
      update: {},
      create: {
        executionId, nodeId, requestFingerprint: fingerprint,
        idempotencyKey: randomUUID(), status: 'PENDING',
      },
    });
    if (action.requestFingerprint !== fingerprint) {
      throw new Error(`HTTP action ${nodeId} changed after its idempotency key was assigned.`);
    }
    if (action.status === 'SUCCEEDED') {
      if (action.response === null) throw new Error(`HTTP action ${nodeId} has no saved response.`);
      return { response: action.response as HttpResult['response'], message: 'Reused persisted HTTP result' };
    }
    if (action.status !== 'PENDING') {
      await this.prisma.httpAction.updateMany({
        where: { id: action.id, status: 'IN_FLIGHT' },
        data: { status: 'UNKNOWN_EXTERNAL_OUTCOME' },
      });
      throw new UncertainExternalOutcomeError(nodeId);
    }

    const claimed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.httpAction.updateMany({
        where: { id: action.id, status: 'PENDING' },
        data: { status: 'IN_FLIGHT' },
      });
      if (updated.count !== 1) return false;
      await tx.httpActionAttempt.create({
        data: { actionId: action.id, number: workflowAttempt, status: 'SENT' },
      });
      return true;
    });
    if (!claimed) throw new UncertainExternalOutcomeError(nodeId);

    try {
      // The low-level executor must make one outbound attempt here. Repeating
      // inside that executor would bypass the durable attempt record.
      const result = await this.transport(nodeId, { ...config, retries: 0 }, context, action.idempotencyKey);
      await this.prisma.$transaction(async (tx) => {
        await tx.httpAction.update({
          where: { id: action.id },
          data: {
            status: 'SUCCEEDED', response: result.response as Prisma.InputJsonValue,
            message: result.message, completedAt: new Date(),
          },
        });
        await tx.httpActionAttempt.update({
          where: { actionId_number: { actionId: action.id, number: workflowAttempt } },
          data: { status: 'SUCCEEDED', completedAt: new Date() },
        });
      });
      return result;
    } catch (error) {
      // A timeout, HTTP error, or lost DB commit can all follow a remote side
      // effect. Retain the key and stop until a human/provider reconciles it.
      await this.prisma.$transaction(async (tx) => {
        await tx.httpAction.updateMany({
          where: { id: action.id, status: 'IN_FLIGHT' },
          data: { status: 'UNKNOWN_EXTERNAL_OUTCOME', lastError: error instanceof Error ? error.message : String(error) },
        });
        await tx.httpActionAttempt.updateMany({
          where: { actionId: action.id, number: workflowAttempt, status: 'SENT' },
          data: { status: 'UNKNOWN_EXTERNAL_OUTCOME', completedAt: new Date(), error: error instanceof Error ? error.message : String(error) },
        });
      });
      throw new UncertainExternalOutcomeError(nodeId);
    }
  }
}
