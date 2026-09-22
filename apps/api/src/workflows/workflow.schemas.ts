import { z } from 'zod';

const commonShape = {
  title: z.string(),
  subtitle: z.string(),
  category: z.string(),
  icon: z.string(),
  hasInput: z.boolean().optional(),
  hasOutput: z.boolean().optional(),
};

const webhookDataSchema = z
  .object({
    ...commonShape,
    kind: z.literal('webhook'),
    config: z.object({
      method: z.enum(['GET', 'POST']),
      path: z.string().min(1).max(160).regex(
        /^\/[A-Za-z0-9/_-]*$/,
        'Webhook path contains unsupported characters.',
      ),
    }),
  })
  .passthrough();

const timezoneSchema = z.string().min(1).max(100).refine((value) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, 'Invalid IANA timezone.');

const scheduleDataSchema = z.object({
  ...commonShape,
  kind: z.literal('schedule'),
  config: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('interval'), intervalMinutes: z.number().int().min(1).max(525_600), timezone: timezoneSchema, enabled: z.boolean().default(true) }),
    z.object({ mode: z.literal('cron'), cron: z.string().trim().min(1).max(120), timezone: timezoneSchema, enabled: z.boolean().default(true) }),
  ]),
}).passthrough();

const conditionDataSchema = z
  .object({
    ...commonShape,
    kind: z.literal('condition'),
    config: z.object({
      field: z.string(),
      operator: z.enum([
        'equals',
        'notEquals',
        'greaterThan',
        'lessThan',
        'contains',
      ]),
      value: z.string(),
    }),
  })
  .passthrough();

const httpDataSchema = z
  .object({
    ...commonShape,
    kind: z.literal('http'),
    config: z.object({
      method: z.enum([
        'GET',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
      ]),
      url: z.string().min(1).max(2048),
      headers: z.string().max(16_384),
      body: z.string().max(65_536),
      timeout: z.number().int().min(100).max(30_000),
      retries: z.number().int().min(0).max(3).default(0),
      retryDelayMs: z.number().int().min(100).max(5000).default(500),
    }),
  })
  .passthrough();

const delayDataSchema = z
  .object({
    ...commonShape,
    kind: z.literal('delay'),
    config: z.object({
      duration: z.number().positive(),
      unit: z.enum(['seconds', 'minutes']),
    }),
  })
  .passthrough();

const mapDataSchema = z.object({
  ...commonShape,
  kind: z.literal('map'),
  config: z.object({ assignments: z.string().max(16_384) }),
}).passthrough();

const noteDataSchema = z.object({
  ...commonShape,
  kind: z.literal('note'),
  config: z.object({ text: z.string().max(4_096) }),
}).passthrough();

export const workflowNodeSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().optional(),

    position: z
      .object({
        x: z.number(),
        y: z.number(),
      })
      .optional(),

    data: z.discriminatedUnion('kind', [
      webhookDataSchema,
      scheduleDataSchema,
      conditionDataSchema,
      httpDataSchema,
      delayDataSchema,
      mapDataSchema,
      noteDataSchema,
    ]),
  })
  .passthrough();

export const workflowEdgeSchema = z
  .object({
    id: z.string().min(1),
    source: z.string().min(1),
    target: z.string().min(1),
    sourceHandle: z.string().nullable().optional(),
    targetHandle: z.string().nullable().optional(),
  })
  .passthrough();

export const executeWorkflowSchema = z.object({
  executionId: z.string().uuid(),
  workflowId: z.string().uuid().optional(),
  nodes: z.array(workflowNodeSchema),
  edges: z.array(workflowEdgeSchema),

  input: z
    .record(z.string(), z.unknown())
    .default({}),
});

export type ExecuteWorkflowDto =
  z.infer<typeof executeWorkflowSchema>;

export const saveWorkflowSchema = z.object({
  workflowId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  nodes: z.array(workflowNodeSchema),
  edges: z.array(workflowEdgeSchema),
});

export type SaveWorkflowDto = z.infer<typeof saveWorkflowSchema>;
