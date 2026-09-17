import type {
  WorkflowNode,
} from './workflowTypes'

import type {
  Edge,
} from '@xyflow/react'

export type RemoteExecutionStatus =
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped'

export type RemoteExecutionEvent = {
  nodeId: string
  status: RemoteExecutionStatus
  message: string
  timestamp: string
}

export type RemoteExecutionResult = {
  success: boolean
  message: string

  context: Record<
    string,
    unknown
  >

  events:
    RemoteExecutionEvent[]

  durationMs: number
}

export type SaveWorkflowResult = {
  workflowId: string
  version: number
  updatedAt: string
}

export async function saveWorkflowRemote(
  workflowId: string | undefined,
  name: string,
  nodes: WorkflowNode[],
  edges: Edge[],
): Promise<SaveWorkflowResult> {
  let response: Response
  try {
    response = await fetch('/api/workflows/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflowId, name, nodes, edges }),
    })
  } catch {
    throw new Error('NexFlow API is unavailable.')
  }

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(typeof data?.message === 'string' ? data.message : 'Could not save workflow.')
  }

  return data as SaveWorkflowResult
}

export async function executeWorkflowRemote(
  executionId: string,
  workflowId: string | undefined,
  nodes: WorkflowNode[],
  edges: Edge[],
  input: Record<string, unknown>,
): Promise<RemoteExecutionResult> {
  let response: Response
  try {
    response = await fetch(
      '/api/workflows/execute',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',
        },

        body: JSON.stringify({
          executionId,
          workflowId,
          nodes,
          edges,
          input,
        }),
      },
    )
  } catch {
    throw new Error('NexFlow API is unavailable. Start the NestJS server and try again.')
  }

  const data =
    (await response.json().catch(() => null)) as
      | RemoteExecutionResult
      | {
          message?: string
        }
      | null

  if (!response.ok) {
    throw new Error(
      data && 'message' in data &&
        typeof data.message ===
          'string'
        ? data.message
        : 'NexFlow API is unavailable or returned an error.',
    )
  }

  if (!data || !('events' in data)) {
    throw new Error('NexFlow API returned an invalid response.')
  }

  return data
}

export type DashboardExecution = {
  id: string
  status: string
  durationMs: number | null
  message?: string | null
  startedAt: string
  completedAt: string | null
  workflow: { id: string; name: string } | null
}

export type DashboardWorkflow = {
  id: string
  name: string
  currentVersion: number
  createdAt: string
  updatedAt: string
  executionCount: number
  latestExecution: {
    id: string
    status: string
    durationMs: number | null
    startedAt: string
    completedAt: string | null
  } | null
}

export type RemoteWorkflow = {
  workflowId: string
  name: string
  version: number
  updatedAt: string
  nodes: WorkflowNode[]
  edges: Edge[]
}

async function getRemote<T>(url: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(url)
  } catch {
    throw new Error('NexFlow API is unavailable.')
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(typeof data?.message === 'string' ? data.message : 'NexFlow API returned an error.')
  }
  return data as T
}

export function listWorkflowsRemote() {
  return getRemote<DashboardWorkflow[]>('/api/workflows')
}

export function getRecentExecutionsRemote() {
  return getRemote<DashboardExecution[]>('/api/workflows/executions/recent')
}

export function getWorkflowRemote(workflowId: string) {
  return getRemote<RemoteWorkflow>(`/api/workflows/${workflowId}`)
}
