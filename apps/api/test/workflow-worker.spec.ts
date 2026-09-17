import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowsService } from '../src/workflows/workflows.service.js';
import { createWorkflowWorker } from '../src/queue/workflow-worker.js';

const captured = vi.hoisted(() => ({
  process: undefined as undefined | ((job: {
    data: { executionId: string }; attemptsMade: number; opts: { attempts?: number };
  }) => Promise<unknown>),
  options: {} as Record<string, unknown>,
}));

vi.mock('bullmq', () => ({
  Worker: class {
    constructor(_name: string, process: NonNullable<typeof captured.process>, options: Record<string, unknown>) {
      captured.process = process;
      captured.options = options;
    }
    on() { return this; }
  },
}));

describe('workflow worker retry delivery', () => {
  beforeEach(() => { captured.process = undefined; captured.options = {}; });

  it('throws failed results twice, then completes attempt three without enabling stalled recovery', async () => {
    const processQueuedExecution = vi.fn()
      .mockResolvedValueOnce({ success: false, message: 'Temporary failure' })
      .mockResolvedValueOnce({ success: false, message: 'Temporary failure' })
      .mockResolvedValueOnce({ success: true, message: 'Done' });
    createWorkflowWorker({ processQueuedExecution } as unknown as WorkflowsService);
    expect(captured.options.maxStalledCount).toBe(0);
    expect(captured.process).toBeDefined();
    const process = captured.process!;
    for (let attemptsMade = 0; attemptsMade < 2; attemptsMade++) {
      await expect(process({ data: { executionId: 'execution' }, attemptsMade, opts: { attempts: 3 } }))
        .rejects.toThrow('Temporary failure');
    }
    await expect(process({ data: { executionId: 'execution' }, attemptsMade: 2, opts: { attempts: 3 } }))
      .resolves.toEqual({ success: true, message: 'Done' });
    expect(processQueuedExecution.mock.calls).toEqual([1, 2, 3].map((attempt) => [
      'execution', { attempt, maxAttempts: 3 },
    ]));
  });

  it('passes unexpected service failures back to BullMQ', async () => {
    const processQueuedExecution = vi.fn().mockRejectedValue(new Error('Database unavailable'));
    createWorkflowWorker({ processQueuedExecution } as unknown as WorkflowsService);
    await expect(captured.process!({ data: { executionId: 'execution' }, attemptsMade: 0, opts: {} }))
      .rejects.toThrow('Database unavailable');
    expect(processQueuedExecution).toHaveBeenCalledWith('execution', { attempt: 1, maxAttempts: 1 });
  });
});
