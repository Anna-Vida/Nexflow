import type { ExecuteWorkflowDto } from './workflow.schemas.js';

type WorkflowNode = ExecuteWorkflowDto['nodes'][number];
type WorkflowEdge = ExecuteWorkflowDto['edges'][number];

type WorkflowContext = Record<string, unknown>;

export type ExecutionStatus =
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped';

export type ExecutionEvent = {
  nodeId: string;
  status: ExecutionStatus;
  message: string;
  timestamp: string;
};

export type WorkflowExecutionResult = {
  success: boolean;
  message: string;
  context: WorkflowContext;
  events: ExecutionEvent[];
  durationMs: number;
};

type NodeExecutionResult = {
  context: WorkflowContext;
  branch?: 'true' | 'false';
  message: string;
};

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Unknown workflow execution error.';
}

function validateGraph(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
) {
  if (nodes.length === 0) {
    throw new Error(
      'The workflow does not contain any nodes.',
    );
  }

  const nodeIds = new Set(
    nodes.map((node) => node.id),
  );

  if (nodeIds.size !== nodes.length) {
    throw new Error(
      'Workflow contains duplicate node IDs.',
    );
  }

  for (const edge of edges) {
    if (
      !nodeIds.has(edge.source) ||
      !nodeIds.has(edge.target)
    ) {
      throw new Error(
        'Workflow contains a broken connection.',
      );
    }
  }

  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    inDegree.set(
      edge.target,
      (inDegree.get(edge.target) ?? 0) + 1,
    );
  }

  const queue = nodes
    .filter(
      (node) =>
        (inDegree.get(node.id) ?? 0) === 0,
    )
    .map((node) => node.id);

  let visited = 0;

  while (queue.length > 0) {
    const nodeId = queue.shift();

    if (!nodeId) {
      continue;
    }

    visited += 1;

    for (const edge of edges.filter(
      (candidate) =>
        candidate.source === nodeId,
    )) {
      const degree =
        (inDegree.get(edge.target) ?? 0) - 1;

      inDegree.set(edge.target, degree);

      if (degree === 0) {
        queue.push(edge.target);
      }
    }
  }

  if (visited !== nodes.length) {
    throw new Error(
      'Workflow contains a cycle.',
    );
  }
}

function evaluateCondition(
  node: WorkflowNode,
  context: WorkflowContext,
) {
  if (node.data.kind !== 'condition') {
    throw new Error(
      'Expected a condition node.',
    );
  }

  const { field, operator, value } =
    node.data.config;

  if (!(field in context)) {
    throw new Error(
      `Input field "${field}" does not exist.`,
    );
  }

  const actual = context[field];

  switch (operator) {
    case 'equals':
      return String(actual) === value;

    case 'notEquals':
      return String(actual) !== value;

    case 'greaterThan': {
      const left = Number(actual);
      const right = Number(value);

      if (
        !Number.isFinite(left) ||
        !Number.isFinite(right)
      ) {
        throw new Error(
          `Condition "${field}" requires numeric values.`,
        );
      }

      return left > right;
    }

    case 'lessThan': {
      const left = Number(actual);
      const right = Number(value);

      if (
        !Number.isFinite(left) ||
        !Number.isFinite(right)
      ) {
        throw new Error(
          `Condition "${field}" requires numeric values.`,
        );
      }

      return left < right;
    }

    case 'contains':
      return String(actual).includes(value);
  }
}

async function executeNode(
  node: WorkflowNode,
  context: WorkflowContext,
): Promise<NodeExecutionResult> {
  const { data } = node;

  if (data.kind === 'webhook') {
    await sleep(150);

    return {
      context: {
        ...context,

        webhook: {
          method: data.config.method,
          path: data.config.path,
        },
      },

      message:
        `${data.config.method} ${data.config.path} received`,
    };
  }

  if (data.kind === 'condition') {
    await sleep(150);

    const result =
      evaluateCondition(node, context);

    return {
      context,
      branch: result ? 'true' : 'false',
      message:
        `${data.config.field} ${data.config.operator} ` +
        `${data.config.value} → ${result}`,
    };
  }

  if (data.kind === 'delay') {
    const multiplier =
      data.config.unit === 'minutes'
        ? 60_000
        : 1_000;

    const requested =
      data.config.duration * multiplier;

    // Development safety cap.
    const duration = Math.min(
      requested,
      5_000,
    );

    await sleep(duration);

    return {
      context,

      message:
        requested > duration
          ? `${data.config.duration} ${data.config.unit} simulated; capped at 5 seconds`
          : `Waited ${data.config.duration} ${data.config.unit}`,
    };
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(data.config.url);
  } catch {
    throw new Error(
      `Invalid HTTP URL: ${data.config.url}`,
    );
  }

  JSON.parse(
    data.config.headers || '{}',
  );

  if (
    data.config.method !== 'GET' &&
    data.config.body.trim()
  ) {
    JSON.parse(data.config.body);
  }

  await sleep(250);

  const responseKey =
    `${node.id}.response`;

  return {
    context: {
      ...context,

      [responseKey]: {
        status: 200,
        simulated: true,
        method: data.config.method,
        url: parsedUrl.toString(),
      },
    },

    message:
      `${data.config.method} ${parsedUrl.toString()} → 200 simulated`,
  };
}

export async function executeWorkflow(
  request: ExecuteWorkflowDto,
): Promise<WorkflowExecutionResult> {
  const startedAt = Date.now();

  const { nodes, edges, input } =
    request;

  const context: WorkflowContext = {
    ...input,
  };

  const events: ExecutionEvent[] = [];

  const emit = (
    nodeId: string,
    status: ExecutionStatus,
    message: string,
  ) => {
    events.push({
      nodeId,
      status,
      message,
      timestamp: new Date().toISOString(),
    });
  };

  try {
    validateGraph(nodes, edges);
  } catch (error) {
    return {
      success: false,
      message: getErrorMessage(error),
      context,
      events,
      durationMs:
        Date.now() - startedAt,
    };
  }

  const nodeById = new Map(
    nodes.map((node) => [
      node.id,
      node,
    ]),
  );

  const incoming =
    new Map<string, WorkflowEdge[]>();

  const outgoing =
    new Map<string, WorkflowEdge[]>();

  for (const node of nodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  }

  for (const edge of edges) {
    incoming.get(edge.target)?.push(edge);
    outgoing.get(edge.source)?.push(edge);
  }

  const edgeActivation =
    new Map<string, boolean>();

  const processed =
    new Set<string>();

  const queued =
    new Set<string>();

  const queue: string[] = [];

  const enqueueIfReady = (
    nodeId: string,
  ) => {
    if (
      processed.has(nodeId) ||
      queued.has(nodeId)
    ) {
      return;
    }

    const incomingEdges =
      incoming.get(nodeId) ?? [];

    const ready = incomingEdges.every((edge) =>
      edgeActivation.has(edge.id),
    );

    if (!ready) {
      return;
    }

    queue.push(nodeId);
    queued.add(nodeId);
  };

  for (const node of nodes) {
    if (
      (incoming.get(node.id) ?? [])
        .length === 0
    ) {
      enqueueIfReady(node.id);
    }
  }

  while (queue.length > 0) {
    const nodeId = queue.shift();

    if (!nodeId) {
      continue;
    }

    queued.delete(nodeId);

    const node =
      nodeById.get(nodeId);

    if (!node) {
      continue;
    }

    const incomingEdges =
      incoming.get(nodeId) ?? [];

    const shouldRun =
      incomingEdges.length === 0 ||
      incomingEdges.some(
        (edge) =>
          edgeActivation.get(edge.id) === true,
      );

    if (!shouldRun) {
      processed.add(nodeId);

      emit(
        nodeId,
        'skipped',
        'Branch was not selected.',
      );

      for (
        const edge of
        outgoing.get(nodeId) ?? []
      ) {
        edgeActivation.set(
          edge.id,
          false,
        );

        enqueueIfReady(
          edge.target,
        );
      }

      continue;
    }

    emit(
      nodeId,
      'running',
      'Executing...',
    );

    try {
      const result =
        await executeNode(
          node,
          context,
        );

      Object.assign(
        context,
        result.context,
      );

      processed.add(nodeId);

      emit(
        nodeId,
        'success',
        result.message,
      );

      for (
        const edge of
        outgoing.get(nodeId) ?? []
      ) {
        let active = true;

        if (
          node.data.kind ===
            'condition' &&
          result.branch
        ) {
          const branch =
            edge.sourceHandle ??
            'true';

          active =
            branch ===
            result.branch;
        }

        edgeActivation.set(
          edge.id,
          active,
        );

        enqueueIfReady(
          edge.target,
        );
      }
    } catch (error) {
      const message =
        getErrorMessage(error);

      processed.add(nodeId);

      emit(
        nodeId,
        'failed',
        message,
      );

      for (const remaining of nodes) {
        if (
          !processed.has(
            remaining.id,
          )
        ) {
          emit(
            remaining.id,
            'skipped',
            'Workflow stopped after an error.',
          );
        }
      }

      return {
        success: false,
        message:
          `Workflow failed: ${message}`,
        context,
        events,
        durationMs:
          Date.now() -
          startedAt,
      };
    }
  }

  return {
    success: true,
    message:
      'Workflow completed successfully.',
    context,
    events,
    durationMs:
      Date.now() - startedAt,
  };
}
