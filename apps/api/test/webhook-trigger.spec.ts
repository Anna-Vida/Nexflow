import { describe, expect, it } from 'vitest';
import { executeWorkflow } from '../src/workflows/workflow.engine.js';
import { executeWorkflowSchema } from '../src/workflows/workflow.schemas.js';

const webhook = (id: string, path: string) => ({
  id,
  data: {
    kind: 'webhook' as const,
    title: 'Webhook', subtitle: '', category: 'TRIGGER', icon: '↗',
    config: { method: 'POST' as const, path },
  },
});

describe('webhook start-node execution', () => {
  it('runs only the selected root and descendants while manual execution runs all roots', async () => {
    const request = executeWorkflowSchema.parse({
      executionId: '00000000-0000-4000-8000-000000000002',
      input: { amount: 15000 },
      nodes: [
        webhook('trigger-a', '/a'),
        webhook('trigger-b', '/b'),
        {
          id: 'condition',
          data: {
            kind: 'condition', title: 'Condition', subtitle: '', category: 'LOGIC', icon: '◇',
            config: { field: 'amount', operator: 'greaterThan', value: '10000' },
          },
        },
      ],
      edges: [
        { id: 'a-condition', source: 'trigger-a', target: 'condition' },
        { id: 'b-condition', source: 'trigger-b', target: 'condition' },
      ],
    });

    const scoped = await executeWorkflow(request, undefined, { startNodeId: 'trigger-a' });
    expect(scoped.success).toBe(true);
    expect(scoped.events.filter((event) => event.status === 'success').map((event) => event.nodeId))
      .toEqual(['trigger-a', 'condition']);
    expect(scoped.events.some((event) => event.nodeId === 'trigger-b')).toBe(false);

    const manual = await executeWorkflow(request);
    expect(manual.success).toBe(true);
    expect(manual.events.filter((event) => event.status === 'success').map((event) => event.nodeId))
      .toEqual(['trigger-a', 'trigger-b', 'condition']);
  });

  it('rejects a selected webhook with an incoming edge', async () => {
    const request = executeWorkflowSchema.parse({
      executionId: '00000000-0000-4000-8000-000000000003',
      input: {},
      nodes: [webhook('root', '/root'), webhook('target', '/target')],
      edges: [{ id: 'edge', source: 'root', target: 'target' }],
    });
    const result = await executeWorkflow(request, undefined, { startNodeId: 'target' });
    expect(result.success).toBe(false);
    expect(result.message).toBe('Webhook trigger must be a root node.');
    expect(result.events).toEqual([]);
  });
});
