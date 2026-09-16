import type { Edge, Node } from '@xyflow/react'

export type NodeKind = 'webhook' | 'condition' | 'http' | 'delay'

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
