import type { Edge, Node } from '@xyflow/react'

export type NodeKind = 'webhook' | 'schedule' | 'condition' | 'http' | 'delay' | 'map' | 'note'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type WebhookConfig = {
  method: 'GET' | 'POST'
  path: string
}

export type ConditionConfig = {
  field: string
  operator: 'equals' | 'notEquals' | 'greaterThan' | 'lessThan' | 'contains'
  value: string
}

export type HttpConfig = {
  method: HttpMethod
  url: string
  headers: string
  body: string
  timeout: number
  retries?: number
  retryDelayMs?: number
}

export type ScheduleConfig = {
  mode: 'interval' | 'cron'
  cron?: string
  timezone: string
  intervalMinutes?: number
  enabled: boolean
}

export type DelayConfig = {
  duration: number
  unit: 'seconds' | 'minutes'
}

export type NodeExecutionStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped'

export type NodeRuntimeState = {
  status: NodeExecutionStatus
  message?: string
}

export type MapConfig = { assignments: string }
export type NoteConfig = { text: string }

type CommonNodeData = {
  title: string
  subtitle: string
  category: string
  icon: string
  hasInput?: boolean
  hasOutput?: boolean
  runtime?: NodeRuntimeState
} & Record<string, unknown>

export type WorkflowNodeData =
  | (CommonNodeData & {
      kind: 'schedule'
      config: ScheduleConfig
    })
  | (CommonNodeData & {
      kind: 'webhook'
      config: WebhookConfig
    })
  | (CommonNodeData & {
      kind: 'condition'
      config: ConditionConfig
    })
  | (CommonNodeData & {
      kind: 'http'
      config: HttpConfig
    })
  | (CommonNodeData & {
      kind: 'delay'
      config: DelayConfig
    })
  | (CommonNodeData & {
      kind: 'map'
      config: MapConfig
    })
  | (CommonNodeData & {
      kind: 'note'
      config: NoteConfig
    })

export type WorkflowNode = Node<WorkflowNodeData>

export type WorkflowDocument = {
  version: 1
  remoteId?: string
  revision?: number
  name: string
  updatedAt: string
  nodes: WorkflowNode[]
  edges: Edge[]
}
