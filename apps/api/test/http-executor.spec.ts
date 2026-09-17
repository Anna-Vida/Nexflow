import { describe, expect, it } from 'vitest';
import { executeHttpRequest, interpolateTemplate } from '../src/workflows/http-executor.js';
import { workflowNodeSchema } from '../src/workflows/workflow.schemas.js';

const config: Parameters<typeof executeHttpRequest>[1] = {
  method: 'GET',
  url: 'http://localhost',
  headers: '{}',
  body: '',
  timeout: 1000,
  retries: 0,
  retryDelayMs: 500,
};

describe('HTTP action safety and compatibility', () => {
  it.each([
    'http://localhost',
    'http://127.0.0.1',
    'http://2130706433',
    'http://169.254.169.254',
    'http://[::1]',
    'http://[::ffff:127.0.0.1]',
    'http://metadata.google.internal',
  ])('rejects internal target %s before connecting', async (url) => {
    await expect(executeHttpRequest('http-1', { ...config, url }, {}))
      .rejects.toThrow(/local|private|reserved|internal/);
  });

  it('interpolates input and a prior response by dotted path', () => {
    const context = {
      amount: 12500,
      message: 'Hello from NexFlow',
      'http-1.response': { status: 200 },
    };
    expect(interpolateTemplate(
      '{"amount":{{amount}},"message":"{{message}}","previous":{{http-1.response.status}}}',
      context,
    )).toBe('{"amount":12500,"message":"Hello from NexFlow","previous":200}');
    expect(() => interpolateTemplate('{{missing}}', context)).toThrow('does not exist');
  });

  it('adds retry defaults when parsing a previously saved HTTP node', () => {
    const node = workflowNodeSchema.parse({
      id: 'http-1',
      data: {
        kind: 'http', title: 'HTTP Request', subtitle: '', category: 'ACTION', icon: '{}',
        config: { method: 'GET', url: 'https://example.com', headers: '{}', body: '', timeout: 5000 },
      },
    });
    expect(node.data.config).toMatchObject({ retries: 0, retryDelayMs: 500 });
  });
});
