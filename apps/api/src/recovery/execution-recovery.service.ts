import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { WorkflowQueueService } from '../queue/workflow-queue.service.js';

const STALE_AFTER_MS = 30_000;
const SCAN_INTERVAL_MS = 5_000;

@Injectable()
export class ExecutionRecoveryService {
  private readonly logger = new Logger(ExecutionRecoveryService.name);
  private timer?: ReturnType<typeof setInterval>;
  private scanning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: WorkflowQueueService,
  ) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.scanOnce().catch((error: unknown) => {
        this.logger.error('Recovery scan failed', error);
      });
    }, SCAN_INTERVAL_MS);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async scanOnce(staleBefore = new Date(Date.now() - STALE_AFTER_MS)) {
    if (this.scanning) return;
    this.scanning = true;
    try {
      const newlyQueued = new Set<string>();
      const stale = await this.prisma.execution.findMany({
        where: {
          status: 'RUNNING',
          workerLeaseId: { not: null },
          workerHeartbeatAt: { lt: staleBefore },
        },
        include: { httpActions: { select: { status: true } } },
        orderBy: { workerHeartbeatAt: 'asc' },
        take: 100,
      });

      for (const execution of stale) {
        const where = {
          id: execution.id, status: 'RUNNING',
          workerLeaseId: execution.workerLeaseId,
          workerHeartbeatAt: execution.workerHeartbeatAt,
        };
        const safe = execution.httpActions.every((action) =>
          action.status === 'PENDING' || action.status === 'SUCCEEDED');
        if (!safe) {
          const claimed = await this.prisma.execution.updateMany({
            where,
            data: {
              status: 'RECOVERY_REQUIRED',
              message: 'Worker disappeared while an external HTTP outcome was uncertain.',
              lastError: 'Manual reconciliation required.',
              workerLeaseId: null, workerHeartbeatAt: null,
              completedAt: new Date(),
            },
          });
          if (claimed.count === 1) this.logger.warn(`Execution ${execution.id} requires manual reconciliation.`);
          continue;
        }

        const claimed = await this.prisma.execution.updateMany({
          where,
          data: {
            status: 'RECOVERING',
            workerLeaseId: null, workerHeartbeatAt: null,
            recoveryCount: { increment: 1 },
            message: 'Recovering abandoned worker execution.',
          },
        });
        if (claimed.count === 1) {
          await this.queue.enqueueRecovery(execution.id, execution.recoveryCount + 1);
          newlyQueued.add(execution.id);
          this.logger.log(`Queued recovery for execution ${execution.id}.`);
        }
      }

      // An enqueue may have failed after the PostgreSQL claim. The stable job
      // ID makes a later scan safe to retry without changing recoveryCount.
      const pending = await this.prisma.execution.findMany({
        where: { status: 'RECOVERING' },
        select: { id: true, recoveryCount: true },
        take: 100,
      });
      for (const execution of pending) {
        if (newlyQueued.has(execution.id)) continue;
        await this.queue.enqueueRecovery(execution.id, execution.recoveryCount);
      }
    } finally {
      this.scanning = false;
    }
  }
}
