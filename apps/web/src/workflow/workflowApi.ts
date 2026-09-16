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

export async function executeWorkflowRemote(
  executionId: string,
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
