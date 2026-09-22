import { describe, expect, it } from 'vitest';
import { executeWorkflow } from '../src/workflows/workflow.engine.js';
import { executeWorkflowSchema } from '../src/workflows/workflow.schemas.js';

describe('data mapping and notes', () => {
  it('adds mapped values to the execution context and lets conditions use them', async () => {
    const request = executeWorkflowSchema.parse({
      executionId: 'f7548652-40bf-4a1c-ad9a-940b14d27f09',
      input: { name: 'Anna' },
      nodes: [
        { id: 'map-1', data: { kind: 'map', title: 'Map Data', subtitle: '', category: 'LOGIC', icon: '≡', config: { assignments: '{"greeting":"Hi {{name}}","approved":true}' } } },
        { id: 'note-1', data: { kind: 'note', title: 'Note', subtitle: '', category: 'UTILITY', icon: '✎', config: { text: 'Explain this path' } } },
        { id: 'condition-1', data: { kind: 'condition', title: 'Condition', subtitle: '', category: 'LOGIC', icon: '◇', config: { field: 'greeting', operator: 'equals', value: 'Hi Anna' } } },
      ],
      edges: [
        { id: 'a', source: 'map-1', target: 'note-1' },
        { id: 'b', source: 'note-1', target: 'condition-1' },
      ],
    });

    const result = await executeWorkflow(request);
    expect(result.success).toBe(true);
    expect(result.context).toMatchObject({ greeting: 'Hi Anna', approved: true });
    expect(result.events.some((event) => event.nodeId === 'condition-1' && event.message.includes('true'))).toBe(true);
  });

  it('rejects malformed mapping before changing the context', async () => {
    const request = executeWorkflowSchema.parse({
      executionId: 'd51e547b-4851-4374-8386-1f4b610fd6a1',
      input: { name: 'Anna' },
      nodes: [{ id: 'map-1', data: { kind: 'map', title: 'Map Data', subtitle: '', category: 'LOGIC', icon: '≡', config: { assignments: '[]' } } }],
      edges: [],
    });
    const result = await executeWorkflow(request);
    expect(result.success).toBe(false);
    expect(result.context).toEqual({ name: 'Anna' });
  });
});
