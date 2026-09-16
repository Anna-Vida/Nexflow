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
      path: z.string(),
    }),
  })
  .passthrough();

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
      url: z.string(),
      headers: z.string(),
      body: z.string(),
      timeout: z.number().positive(),
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

const workflowNodeSchema = z
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
      conditionDataSchema,
      httpDataSchema,
      delayDataSchema,
    ]),
  })
  .passthrough();

const workflowEdgeSchema = z
  .object({
    id: z.string().min(1),
    source: z.string().min(1),
    target: z.string().min(1),
    sourceHandle: z.string().nullable().optional(),
    targetHandle: z.string().nullable().optional(),
  })
  .passthrough();

export const executeWorkflowSchema = z.object({
  nodes: z.array(workflowNodeSchema),
  edges: z.array(workflowEdgeSchema),

  input: z
    .record(z.string(), z.unknown())
    .default({}),
});

export type ExecuteWorkflowDto =
  z.infer<typeof executeWorkflowSchema>;
