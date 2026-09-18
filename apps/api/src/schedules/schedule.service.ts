import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { CronExpressionParser } from 'cron-parser';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import { WorkflowQueueService } from '../queue/workflow-queue.service.js';
import { WORKFLOW_MAX_ATTEMPTS } from '../queue/workflow-queue.js';
import { workflowNodeSchema, workflowEdgeSchema, type SaveWorkflowDto } from '../workflows/workflow.schemas.js';
import { z } from 'zod';

const storedGraph = z.object({
  nodes: z.array(workflowNodeSchema),
  edges: z.array(workflowEdgeSchema),
});

type ScheduleNode = Extract<SaveWorkflowDto['nodes'][number]['data'], { kind: 'schedule' }>;

@Injectable()
export class ScheduleService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ScheduleService.name);
  private timer?: ReturnType<typeof setInterval>;
  private syncing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: WorkflowQueueService,
  ) {}

  async onApplicationBootstrap() {
    await this.syncAll().catch((error: unknown) => this.logger.error('Schedule startup sync failed', error));
    this.timer = setInterval(() => {
      void this.syncAll().catch((error: unknown) => this.logger.error('Schedule sync failed', error));
    }, 30_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private validate(node: SaveWorkflowDto['nodes'][number], edges: SaveWorkflowDto['edges']) {
    if (node.data.kind !== 'schedule') return;
    if (edges.some((edge) => edge.target === node.id)) {
      throw new BadRequestException('Schedule trigger must be a root node.');
    }
    if (node.data.config.mode === 'cron') {
      try {
        CronExpressionParser.parse(node.data.config.cron, { tz: node.data.config.timezone }).next();
      } catch {
        throw new BadRequestException(`Schedule ${node.id} has an invalid cron expression.`);
      }
    }
  }

  async saveDefinitions(tx: Prisma.TransactionClient, workflowId: string, request: SaveWorkflowDto) {
    const nodes = request.nodes.filter((node) => node.data.kind === 'schedule');
    for (const node of nodes) this.validate(node, request.edges);
    const existing = await tx.scheduleDefinition.findMany({ where: { workflowId } });
    const byNode = new Map(existing.map((row) => [row.nodeId, row]));
    const present = new Set<string>();
    for (const node of nodes) {
      const config = (node.data as ScheduleNode).config;
      const desired = {
        mode: config.mode,
        cron: config.mode === 'cron' ? config.cron : null,
        intervalMinutes: config.mode === 'interval' ? config.intervalMinutes : null,
        timezone: config.timezone,
        enabled: config.enabled,
      };
      present.add(node.id);
      const old = byNode.get(node.id);
      if (!old) {
        await tx.scheduleDefinition.create({ data: { workflowId, nodeId: node.id, ...desired } });
      } else if (Object.entries(desired).some(([key, value]) => old[key as keyof typeof desired] !== value)) {
        await tx.scheduleDefinition.update({
          where: { id: old.id }, data: { ...desired, generation: { increment: 1 } },
        });
      }
    }
    for (const old of existing) {
      if (!present.has(old.nodeId) && old.enabled) {
        await tx.scheduleDefinition.update({
          where: { id: old.id }, data: { enabled: false, generation: { increment: 1 } },
        });
      }
    }
  }

  async syncAll() {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const definitions = await this.prisma.scheduleDefinition.findMany();
      const desired = new Map(definitions.filter((row) => row.enabled).map((row) => [
        `nexflow-schedule-${row.id}-${row.generation}`, row,
      ]));
      const registered = await this.queue.listScheduleJobs();
      const registeredKeys = new Set(registered.map((job) => job.key));
      for (const job of registered) {
        if (job.key.startsWith('nexflow-schedule-') && !desired.has(job.key)) {
          await this.queue.removeScheduleJob(job.key);
        }
      }
      // Old definitions are removed before their replacements are registered.
      for (const [key, definition] of desired) {
        if (registeredKeys.has(key)) continue;
        const startDate = definition.mode === 'cron'
          ? new Date(CronExpressionParser.parse(definition.cron!, { tz: definition.timezone }).next().getTime() - 1)
          : new Date(Math.floor(Date.now() / (definition.intervalMinutes! * 60_000)) * (definition.intervalMinutes! * 60_000) + definition.intervalMinutes! * 60_000);
        await this.queue.upsertScheduleJob({
          id: definition.id, generation: definition.generation,
          mode: definition.mode as 'interval' | 'cron',
          cron: definition.cron, timezone: definition.timezone,
          intervalMinutes: definition.intervalMinutes,
          startDate,
        });
      }
      await this.deliverPending();
    } finally {
      this.syncing = false;
    }
  }

  private async deliverPending() {
    const pending = await this.prisma.scheduledFire.findMany({
      where: { execution: { status: 'QUEUED' } },
      select: { executionId: true }, take: 100,
    });
    for (const fire of pending) await this.queue.enqueueScheduledExecution(fire.executionId);
  }

  async fire(scheduleId: string, generation: number, bullJobId: string) {
    let fire = await this.prisma.scheduledFire.findUnique({ where: { bullJobId } });
    if (!fire) {
      try {
        fire = await this.prisma.$transaction(async (tx) => {
          const schedule = await tx.scheduleDefinition.findUnique({
            where: { id: scheduleId }, include: { workflow: true },
          });
          if (!schedule?.enabled || schedule.generation !== generation) return null;
          const version = await tx.workflowVersion.findUniqueOrThrow({
            where: { workflowId_version: { workflowId: schedule.workflowId, version: schedule.workflow.currentVersion } },
          });
          const graph = storedGraph.parse({ nodes: version.nodes, edges: version.edges });
          const node = graph.nodes.find((candidate) => candidate.id === schedule.nodeId);
          if (node?.data.kind !== 'schedule' || graph.edges.some((edge) => edge.target === node.id)) return null;
          const executionId = randomUUID();
          await tx.execution.create({
            data: {
              id: executionId, ownerId: schedule.workflow.ownerId,
              workflowId: schedule.workflowId, status: 'QUEUED',
              nodes: JSON.parse(JSON.stringify(graph.nodes)), edges: JSON.parse(JSON.stringify(graph.edges)),
              input: { _schedule: { firedAt: new Date().toISOString(), scheduleId } },
              startNodeId: node.id, attemptCount: 0, maxAttempts: WORKFLOW_MAX_ATTEMPTS,
            },
          });
          return tx.scheduledFire.create({ data: { scheduleId, bullJobId, executionId } });
        });
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2002') throw error;
        fire = await this.prisma.scheduledFire.findUniqueOrThrow({ where: { bullJobId } });
      }
    }
    if (!fire) return { skipped: true };
    const execution = await this.prisma.execution.findUniqueOrThrow({ where: { id: fire.executionId } });
    if (execution.status === 'QUEUED') await this.queue.enqueueScheduledExecution(execution.id);
    return { executionId: execution.id, skipped: false };
  }
}
