import { describe, expect, it } from 'vitest';
import { executeWorkflow, type ExecutionEvent } from '../src/workflows/workflow.engine.js';
import { executeWorkflowSchema } from '../src/workflows/workflow.schemas.js';

describe('workflow context streaming', () => {
  it('emits independent context snapshots after success and failure', async () => {
    const request = executeWorkflowSchema.parse({
      executionId: '00000000-0000-4000-8000-000000000001',
      input: { amount: 7500 },
      nodes: [
        {
          id: 'webhook-1',
          data: {
            kind: 'webhook', title: 'Webhook', subtitle: '', category: 'TRIGGER', icon: '↗',
            config: { method: 'POST', path: '/purchase' },
          },
        },
        {
          id: 'condition-1',
          data: {
            kind: 'condition', title: 'Condition', subtitle: '', category: 'LOGIC', icon: '◇',
            config: { field: 'missing', operator: 'equals', value: 'yes' },
          },
        },
      ],
      edges: [{ id: 'edge-1', source: 'webhook-1', target: 'condition-1' }],
    });
    const streamed: ExecutionEvent[] = [];
    const result = await executeWorkflow(request, (event) => streamed.push(event));

    expect(result.success).toBe(false);
    expect(streamed.find((event) => event.nodeId === 'webhook-1' && event.status === 'success')?.context)
      .toMatchObject({ amount: 7500, webhook: { path: '/purchase' } });
    expect(streamed.find((event) => event.nodeId === 'condition-1' && event.status === 'failed')?.context)
      .toMatchObject({ amount: 7500, webhook: { path: '/purchase' } });
    (result.context.webhook as { path: string }).path = '/changed';
    expect(streamed.find((event) => event.nodeId === 'webhook-1' && event.status === 'success')?.context?.webhook)
      .toMatchObject({ path: '/purchase' });
  });
});
