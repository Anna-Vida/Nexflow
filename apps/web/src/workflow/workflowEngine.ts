import type { Edge } from '@xyflow/react'
import type {
  NodeRuntimeState,
  WorkflowNode,
  WorkflowNodeData,
} from './workflowTypes'

type WorkflowContext = Record<string, unknown>

type ExecutionUpdate = {
  nodeId: string
  runtime: NodeRuntimeState
}

type ExecuteWorkflowOptions = {
  nodes: WorkflowNode[]
  edges: Edge[]
  input: WorkflowContext
  onUpdate: (update: ExecutionUpdate) => void
}

export type WorkflowRunResult = {
  success: boolean
  message: string
  context: WorkflowContext
}

type NodeExecutionResult = {
  context: WorkflowContext
  branch?: 'true' | 'false'
  message: string
}

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds)
  })

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Unknown workflow execution error.'
}

function validateGraph(nodes: WorkflowNode[], edges: Edge[]) {
  if (nodes.length === 0) {
    throw new Error('The workflow does not contain any nodes.')
  }

  const nodeIds = new Set(nodes.map((node) => node.id))

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      throw new Error('The workflow contains a broken connection.')
    }
  }

  const inDegree = new Map<string, number>()

  for (const node of nodes) {
    inDegree.set(node.id, 0)
  }

  for (const edge of edges) {
    inDegree.set(
      edge.target,
      (inDegree.get(edge.target) ?? 0) + 1,
    )
  }

  const queue = nodes
    .filter((node) => (inDegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id)

  let visited = 0

  while (queue.length > 0) {
    const nodeId = queue.shift()

    if (!nodeId) {
      continue
    }

    visited += 1

    for (const edge of edges.filter(
      (candidate) => candidate.source === nodeId,
    )) {
      const nextDegree =
        (inDegree.get(edge.target) ?? 0) - 1

      inDegree.set(edge.target, nextDegree)

      if (nextDegree === 0) {
        queue.push(edge.target)
      }
    }
  }

  if (visited !== nodes.length) {
    throw new Error(
      'Workflow contains a cycle. NexFlow workflows must currently be acyclic.',
    )
  }
}

function compareCondition(
  data: Extract<WorkflowNodeData, { kind: 'condition' }>,
  context: WorkflowContext,
) {
  const { field, operator, value } = data.config

  if (!(field in context)) {
    throw new Error(
      `Input field "${field}" does not exist.`,
    )
  }

  const actual = context[field]

  switch (operator) {
    case 'equals':
      return String(actual) === value

    case 'notEquals':
      return String(actual) !== value

    case 'greaterThan': {
      const left = Number(actual)
      const right = Number(value)

      if (!Number.isFinite(left) || !Number.isFinite(right)) {
        throw new Error(
          `Condition "${field}" requires numeric values.`,
        )
      }

      return left > right
    }

    case 'lessThan': {
      const left = Number(actual)
      const right = Number(value)

      if (!Number.isFinite(left) || !Number.isFinite(right)) {
        throw new Error(
          `Condition "${field}" requires numeric values.`,
        )
      }

      return left < right
    }

    case 'contains':
      return String(actual).includes(value)
  }
}

function conditionDescription(
  data: Extract<WorkflowNodeData, { kind: 'condition' }>,
  result: boolean,
) {
  const symbols = {
    equals: '=',
    notEquals: '≠',
    greaterThan: '>',
    lessThan: '<',
    contains: 'contains',
  }

  return `${data.config.field} ${symbols[data.config.operator]} ${data.config.value} → ${result}`
}

async function executeNode(
  node: WorkflowNode,
  context: WorkflowContext,
): Promise<NodeExecutionResult> {
  const data = node.data

  if (data.kind === 'webhook') {
    await sleep(350)

    return {
      context: {
        ...context,
        webhook: {
          method: data.config.method,
          path: data.config.path,
        },
      },

      message: `${data.config.method} ${data.config.path} received`,
    }
  }

  if (data.kind === 'condition') {
    await sleep(300)

    const result = compareCondition(data, context)

    return {
      context,
      branch: result ? 'true' : 'false',
      message: conditionDescription(data, result),
    }
  }

  if (data.kind === 'delay') {
    const multiplier =
      data.config.unit === 'minutes'
        ? 60_000
        : 1_000

    const requestedDuration =
      data.config.duration * multiplier

    // Browser demo protection.
    // Real workers will use the requested duration later.
    const demoDuration = Math.min(
      requestedDuration,
      5_000,
    )

    await sleep(demoDuration)

    const capped =
      demoDuration !== requestedDuration

    return {
      context,

      message: capped
        ? `${data.config.duration} ${data.config.unit} simulated (demo capped at 5s)`
        : `Waited ${data.config.duration} ${data.config.unit}`,
    }
  }

  JSON.parse(data.config.headers || '{}')

  if (
    data.config.method !== 'GET' &&
    data.config.body.trim()
  ) {
    JSON.parse(data.config.body)
  }

  await sleep(650)

  const responseKey = `${node.id}.response`

  return {
    context: {
      ...context,

      [responseKey]: {
        status: 200,
        simulated: true,
        method: data.config.method,
        url: data.config.url,
      },
    },

    message: `${data.config.method} ${data.config.url} → 200 (simulated)`,
  }
}

export async function executeWorkflow({
  nodes,
  edges,
  input,
  onUpdate,
}: ExecuteWorkflowOptions): Promise<WorkflowRunResult> {
  const context: WorkflowContext = {
    ...input,
  }

  try {
    validateGraph(nodes, edges)
  } catch (error) {
    return {
      success: false,
      message: getErrorMessage(error),
      context,
    }
  }

  const nodeById = new Map(
    nodes.map((node) => [node.id, node]),
  )

  const incoming = new Map<string, Edge[]>()
  const outgoing = new Map<string, Edge[]>()

  for (const node of nodes) {
    incoming.set(node.id, [])
    outgoing.set(node.id, [])
  }

  for (const edge of edges) {
    incoming.get(edge.target)?.push(edge)
    outgoing.get(edge.source)?.push(edge)
  }

  const edgeActivation = new Map<string, boolean>()
  const processed = new Set<string>()
  const queued = new Set<string>()

  const queue: string[] = []

  const enqueueIfReady = (nodeId: string) => {
    if (
      processed.has(nodeId) ||
      queued.has(nodeId)
    ) {
      return
    }

    const incomingEdges =
      incoming.get(nodeId) ?? []

    const ready =
      incomingEdges.length === 0 ||
      incomingEdges.every((edge) =>
        edgeActivation.has(edge.id),
      )

    if (!ready) {
      return
    }

    queue.push(nodeId)
    queued.add(nodeId)
  }

  for (const node of nodes) {
    if ((incoming.get(node.id) ?? []).length === 0) {
      enqueueIfReady(node.id)
    }
  }

  if (queue.length === 0) {
    return {
      success: false,
      message: 'Workflow has no executable starting node.',
      context,
    }
  }

  while (queue.length > 0) {
    const nodeId = queue.shift()

    if (!nodeId) {
      continue
    }

    queued.delete(nodeId)

    const node = nodeById.get(nodeId)

    if (!node) {
      continue
    }

    const incomingEdges =
      incoming.get(nodeId) ?? []

    const shouldRun =
      incomingEdges.length === 0 ||
      incomingEdges.some(
        (edge) =>
          edgeActivation.get(edge.id) === true,
      )

    if (!shouldRun) {
      processed.add(node.id)

      onUpdate({
        nodeId: node.id,
        runtime: {
          status: 'skipped',
          message: 'Branch was not selected.',
        },
      })

      for (const edge of outgoing.get(node.id) ?? []) {
        edgeActivation.set(edge.id, false)
        enqueueIfReady(edge.target)
      }

      continue
    }

    onUpdate({
      nodeId: node.id,
      runtime: {
        status: 'running',
        message: 'Executing...',
      },
    })

    try {
      const result =
        await executeNode(node, context)

      Object.assign(context, result.context)

      processed.add(node.id)

      onUpdate({
        nodeId: node.id,
        runtime: {
          status: 'success',
          message: result.message,
        },
      })

      for (const edge of outgoing.get(node.id) ?? []) {
        let active = true

        if (
          node.data.kind === 'condition' &&
          result.branch
        ) {
          // Older saved workflows had no sourceHandle.
          // Treat those connections as TRUE for compatibility.
          const branch =
            edge.sourceHandle ?? 'true'

          active = branch === result.branch
        }

        edgeActivation.set(edge.id, active)
        enqueueIfReady(edge.target)
      }
    } catch (error) {
      const message = getErrorMessage(error)

      processed.add(node.id)

      onUpdate({
        nodeId: node.id,
        runtime: {
          status: 'failed',
          message,
        },
      })

      for (const remainingNode of nodes) {
        if (
          !processed.has(remainingNode.id) &&
          remainingNode.id !== node.id
        ) {
          onUpdate({
            nodeId: remainingNode.id,
            runtime: {
              status: 'skipped',
              message: 'Workflow stopped after an error.',
            },
          })
        }
      }

      return {
        success: false,
        message: `Workflow failed: ${message}`,
        context,
      }
    }
  }

  return {
    success: true,
    message: 'Workflow completed successfully.',
    context,
  }
}
