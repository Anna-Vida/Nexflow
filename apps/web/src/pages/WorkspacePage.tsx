import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import NodeConfigPanel from '../components/NodeConfigPanel'
import ExecutionDataPanel from '../components/ExecutionDataPanel'
import { executionSocket } from '../workflow/executionSocket'
import { executeWorkflowRemote, getWorkflowRemote, saveWorkflowRemote } from '../workflow/workflowApi'
import type {
  NodeKind,
  NodeRuntimeState,
  WorkflowDocument,
  WorkflowNode,
  WorkflowNodeData,
} from '../workflow/workflowTypes'
import './WorkspacePage.css'

function WorkflowNodeCard({
  data,
  selected,
}: NodeProps<WorkflowNode>) {
  return (
    <div
      className={[
        'builder-node',
        selected ? 'selected' : '',
        data.runtime ? `status-${data.runtime.status}` : '',
      ].filter(Boolean).join(' ')}
      title={data.runtime?.message}
    >
      {data.hasInput !== false && (
        <Handle
          type="target"
          position={Position.Left}
          className="builder-handle"
        />
      )}

      <div className="builder-node-icon">{data.icon}</div>

      <div className="builder-node-content">
        <span>{data.category}</span>
        <strong>{data.title}</strong>
        <small>{data.subtitle}</small>
      </div>

      {data.hasOutput !== false && (data.kind === 'condition' ? (
        <>
          <Handle id="true" type="source" position={Position.Right} className="builder-handle condition-handle condition-true" />
          <Handle id="false" type="source" position={Position.Right} className="builder-handle condition-handle condition-false" />
          <span className="branch-label branch-true">T</span>
          <span className="branch-label branch-false">F</span>
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className="builder-handle"
        />
      ))}

      {data.runtime && data.runtime.status !== 'idle' && (
        <span className={`runtime-indicator ${data.runtime.status}`}>
          {data.runtime.status === 'running' ? '●' : data.runtime.status === 'success' ? '✓' : data.runtime.status === 'failed' ? '!' : data.runtime.status === 'skipped' ? '–' : '○'}
        </span>
      )}
    </div>
  )
}

const nodeTypes = {
  workflow: WorkflowNodeCard,
}

const initialNodes: WorkflowNode[] = [
  {
    id: 'webhook-1',
    type: 'workflow',
    position: { x: 80, y: 180 },
    data: {
      kind: 'webhook',
      title: 'Webhook',
      subtitle: 'POST /webhook',
      category: 'TRIGGER',
      icon: '↗',
      hasInput: false,
      config: {
        method: 'POST',
        path: '/webhook',
      },
    },
  },
  {
    id: 'condition-1',
    type: 'workflow',
    position: { x: 390, y: 180 },
    data: {
      kind: 'condition',
      title: 'Condition',
      subtitle: 'amount > 10000',
      category: 'LOGIC',
      icon: '◇',
      config: {
        field: 'amount',
        operator: 'greaterThan',
        value: '10000',
      },
    },
  },
  {
    id: 'http-1',
    type: 'workflow',
    position: { x: 700, y: 180 },
    data: {
      kind: 'http',
      title: 'HTTP Request',
      subtitle: 'POST https://api.example.com/notify',
      category: 'ACTION',
      icon: '{ }',
      hasOutput: false,
      config: {
        method: 'POST',
        url: 'https://api.example.com/notify',
        headers: '{\n  "Content-Type": "application/json"\n}',
        body: '{\n  "status": "approved"\n}',
        timeout: 5000,
        retries: 0,
        retryDelayMs: 500,
      },
    },
  },
]

const initialEdges: Edge[] = [
  {
    id: 'webhook-condition',
    source: 'webhook-1',
    target: 'condition-1',
    animated: true,
    markerEnd: {
      type: MarkerType.ArrowClosed,
    },
  },
  {
    id: 'condition-http',
    source: 'condition-1',
    sourceHandle: 'true',
    target: 'http-1',
    animated: true,
    markerEnd: {
      type: MarkerType.ArrowClosed,
    },
  },
]

const nodeTemplates: Record<NodeKind, WorkflowNodeData> = {
  webhook: {
    kind: 'webhook',
    title: 'Webhook',
    subtitle: 'POST /webhook',
    category: 'TRIGGER',
    icon: '↗',
    hasInput: false,
    config: {
      method: 'POST',
      path: '/webhook',
    },
  },

  condition: {
    kind: 'condition',
    title: 'Condition',
    subtitle: 'field = value',
    category: 'LOGIC',
    icon: '◇',
    config: {
      field: 'field',
      operator: 'equals',
      value: 'value',
    },
  },

  http: {
    kind: 'http',
    title: 'HTTP Request',
    subtitle: 'GET https://api.example.com',
    category: 'ACTION',
    icon: '{ }',
    config: {
      method: 'GET',
      url: 'https://api.example.com',
      headers: '{}',
      body: '{}',
      timeout: 5000,
      retries: 0,
      retryDelayMs: 500,
    },
  },

  delay: {
    kind: 'delay',
    title: 'Delay',
    subtitle: '5 seconds',
    category: 'UTILITY',
    icon: '◷',
    config: {
      duration: 5,
      unit: 'seconds',
    },
  },
}

const STORAGE_KEY = 'nexflow:workflow:draft'

const DEFAULT_TEST_INPUT = JSON.stringify({
  amount: 12500,
  total: 5000,
  message: 'Hello from NexFlow',
  status: 'pending',
  approved: true,
}, null, 2)

function testInputKey(workflowId?: string) {
  return `nexflow:test-input:${workflowId ?? 'draft'}`
}

function parseTestInput(value: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('Test input must be valid JSON.')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Test input must be a JSON object.')
  }
  return parsed as Record<string, unknown>
}

function inputVariables(value: string): Record<string, unknown> {
  try {
    return parseTestInput(value)
  } catch {
    return {}
  }
}

function loadSavedWorkflow(): WorkflowDocument | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)

    if (!stored) {
      return null
    }

    const parsed = JSON.parse(stored) as WorkflowDocument

    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.nodes) ||
      !Array.isArray(parsed.edges)
    ) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

function validateNode(data: WorkflowNodeData) {
  if (data.kind === 'webhook') {
    if (!data.config.path.startsWith('/')) {
      return 'Webhook paths must start with /.'
    }

    return null
  }

  if (data.kind === 'condition') {
    if (!data.config.field.trim() || !data.config.value.trim()) {
      return 'Condition field and value are required.'
    }

    return null
  }

  if (data.kind === 'http') {
    try {
      new URL(data.config.url)
    } catch {
      return 'HTTP Request requires a valid URL.'
    }

    if (!Number.isInteger(data.config.timeout) || data.config.timeout < 100 || data.config.timeout > 30000) {
      return 'HTTP timeout must be between 100 and 30000 ms.'
    }

    const retries = data.config.retries ?? 0
    if (!Number.isInteger(retries) || retries < 0 || retries > 3) {
      return 'HTTP retries must be between 0 and 3.'
    }

    const retryDelayMs = data.config.retryDelayMs ?? 500
    if (!Number.isInteger(retryDelayMs) || retryDelayMs < 100 || retryDelayMs > 5000) {
      return 'Retry delay must be between 100 and 5000 ms.'
    }

    return null
  }

  if (data.config.duration <= 0) {
    return 'Delay duration must be greater than zero.'
  }

  return null
}

function WorkspacePage() {
  const { workflowId: routeWorkflowId } = useParams()
  const navigate = useNavigate()
  useEffect(() => {
    executionSocket.connect()
    return () => {
      executionSocket.disconnect()
    }
  }, [])

  const savedWorkflow = useMemo(
    () => routeWorkflowId ? null : loadSavedWorkflow(),
    [routeWorkflowId],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>(
    savedWorkflow?.nodes ?? initialNodes,
  )

  const [edges, setEdges, onEdgesChange] = useEdgesState(
    savedWorkflow?.edges ?? initialEdges,
  )

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState(
    savedWorkflow?.revision ? `Saved · v${savedWorkflow.revision}` : savedWorkflow ? 'Saved locally' : 'Unsaved',
  )
  const [workflowId, setWorkflowId] = useState<string | undefined>(routeWorkflowId ?? savedWorkflow?.remoteId)
  const [webhookToken, setWebhookToken] = useState<string | undefined>()
  const [workflowRevision, setWorkflowRevision] = useState(savedWorkflow?.revision ?? 0)
  const [workflowName, setWorkflowName] = useState(savedWorkflow?.name ?? 'Untitled workflow')
  const [isLoadingWorkflow, setIsLoadingWorkflow] = useState(Boolean(routeWorkflowId))
  const [workflowLoadError, setWorkflowLoadError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [runtimeStates, setRuntimeStates] = useState<Record<string, NodeRuntimeState>>({})
  const [isRunning, setIsRunning] = useState(false)
  const [runState, setRunState] = useState<'ready' | 'running' | 'success' | 'failed'>('ready')
  const [runMessage, setRunMessage] = useState('Ready to execute')
  const [dataPanelOpen, setDataPanelOpen] = useState(false)
  const [testInputScope, setTestInputScope] = useState(routeWorkflowId ?? savedWorkflow?.remoteId ?? 'draft')
  const [testInputText, setTestInputText] = useState(() =>
    localStorage.getItem(testInputKey(routeWorkflowId ?? savedWorkflow?.remoteId)) ?? DEFAULT_TEST_INPUT,
  )
  const [testInputError, setTestInputError] = useState<string | null>(null)
  const [variableContext, setVariableContext] = useState<Record<string, unknown>>(() => inputVariables(testInputText))

  useEffect(() => {
    localStorage.setItem(testInputKey(testInputScope === 'draft' ? undefined : testInputScope), testInputText)
  }, [testInputScope, testInputText])

  useEffect(() => {
    if (!routeWorkflowId || routeWorkflowId === testInputScope) return
    const nextText = localStorage.getItem(testInputKey(routeWorkflowId)) ?? DEFAULT_TEST_INPUT
    setTestInputScope(routeWorkflowId)
    setTestInputText(nextText)
    setTestInputError(null)
    setVariableContext(inputVariables(nextText))
  }, [routeWorkflowId, testInputScope])

  useEffect(() => {
    if (!routeWorkflowId) {
      setIsLoadingWorkflow(false)
      return
    }

    let active = true
    setIsLoadingWorkflow(true)
    setWorkflowLoadError(null)

    getWorkflowRemote(routeWorkflowId)
      .then((workflow) => {
        if (!active) return
        setNodes(workflow.nodes)
        setEdges(workflow.edges)
        setWorkflowId(workflow.workflowId)
        setWebhookToken(workflow.webhookToken)
        setWorkflowRevision(workflow.version)
        setWorkflowName(workflow.name)
        setSaveStatus(`Saved · v${workflow.version}`)

        const localDocument: WorkflowDocument = {
          version: 1,
          remoteId: workflow.workflowId,
          revision: workflow.version,
          name: workflow.name,
          updatedAt: workflow.updatedAt,
          nodes: workflow.nodes,
          edges: workflow.edges,
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(localDocument, null, 2))
      })
      .catch((loadError) => {
        if (!active) return
        setWorkflowLoadError(loadError instanceof Error ? loadError.message : 'Could not load workflow.')
      })
      .finally(() => {
        if (active) setIsLoadingWorkflow(false)
      })

    return () => { active = false }
  }, [routeWorkflowId, setEdges, setNodes])

  const renderedNodes = useMemo(
    () => nodes.map((node) => ({
      ...node,
      data: { ...node.data, runtime: runtimeStates[node.id] },
    })),
    [nodes, runtimeStates],
  )

  const selectedNode =
    nodes.find((node) => node.id === selectedNodeId) ?? null

  const markUnsaved = () => {
    setSaveStatus('Unsaved')
  }

  const handleNodesChange = useCallback(
    (changes: NodeChange<WorkflowNode>[]) => {
      onNodesChange(changes)
      if (changes.some((change) => change.type !== 'select' && change.type !== 'dimensions')) {
        markUnsaved()
      }
    },
    [onNodesChange],
  )

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes)
      if (changes.some((change) => change.type !== 'select')) {
        markUnsaved()
      }
    },
    [onEdgesChange],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((currentEdges) =>
        addEdge(
          {
            ...connection,
            animated: true,
            markerEnd: {
              type: MarkerType.ArrowClosed,
            },
          },
          currentEdges,
        ),
      )

      markUnsaved()
    },
    [setEdges],
  )

  const addNode = (kind: NodeKind) => {
    const template = nodeTemplates[kind]

    const newNode: WorkflowNode = {
      id: `${kind}-${crypto.randomUUID()}`,
      type: 'workflow',
      position: {
        x: 260 + Math.random() * 300,
        y: 150 + Math.random() * 250,
      },
      data: structuredClone(template),
    }

    setNodes((currentNodes) => [...currentNodes, newNode])
    setSelectedNodeId(newNode.id)
    markUnsaved()
  }

  const updateNodeData = (
    nodeId: string,
    data: WorkflowNodeData,
  ) => {
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data,
            }
          : node,
      ),
    )

    markUnsaved()
  }

  const saveWorkflow = async () => {
    if (isSaving) return

    const cleanName = workflowName.trim()
    if (!cleanName) {
      setSaveStatus('Workflow name is required')
      return
    }

    const invalidNodes = nodes
      .map((node) => ({
        node,
        error: validateNode(node.data),
      }))
      .filter((result) => result.error !== null)

    if (invalidNodes.length > 0) {
      setSaveStatus(
        `${invalidNodes.length} node${invalidNodes.length === 1 ? ' needs' : 's need'} attention`,
      )

      setSelectedNodeId(invalidNodes[0].node.id)
      return
    }

    setIsSaving(true)
    setSaveStatus('Saving...')

    try {
      const result = await saveWorkflowRemote(workflowId, cleanName, nodes, edges)
      setWorkflowId(result.workflowId)
      setWebhookToken(result.webhookToken)
      setTestInputScope(result.workflowId)
      setWorkflowRevision(result.version)
      setWorkflowName(cleanName)

      const workflow: WorkflowDocument = {
        version: 1,
        remoteId: result.workflowId,
        revision: result.version,
        name: cleanName,
        updatedAt: result.updatedAt,
        nodes,
        edges,
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(workflow, null, 2))
      setSaveStatus(`Saved · v${result.version}`)
      if (!routeWorkflowId) {
        navigate(`/workspace/${result.workflowId}`, { replace: true })
      }
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : 'Save failed')
    } finally {
      setIsSaving(false)
    }
  }

  const handleNodesDelete = (deletedNodes: WorkflowNode[]) => {
    if (
      deletedNodes.some(
        (node) => node.id === selectedNodeId,
      )
    ) {
      setSelectedNodeId(null)
    }

    markUnsaved()
  }

  const formatTestInput = () => {
    try {
      const parsed = parseTestInput(testInputText)
      setTestInputText(JSON.stringify(parsed, null, 2))
      setVariableContext(parsed)
      setTestInputError(null)
    } catch (error) {
      setTestInputError(error instanceof Error ? error.message : 'Invalid JSON.')
    }
  }

  const resetTestInput = () => {
    setTestInputText(DEFAULT_TEST_INPUT)
    setTestInputError(null)
    setVariableContext(inputVariables(DEFAULT_TEST_INPUT))
  }

  const runWorkflow = async () => {
    if (isRunning) return

    let testInput: Record<string, unknown>
    try {
      testInput = parseTestInput(testInputText)
      setTestInputError(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid test input.'
      setTestInputError(message)
      setRunState('failed')
      setRunMessage(message)
      setDataPanelOpen(true)
      return
    }

    setVariableContext(structuredClone(testInput))

    const invalidNodes = nodes
      .map((node) => ({ node, error: validateNode(node.data) }))
      .filter((result) => result.error !== null)

    if (invalidNodes.length > 0) {
      setSelectedNodeId(invalidNodes[0].node.id)
      setRunState('failed')
      setRunMessage(`${invalidNodes.length} node${invalidNodes.length === 1 ? ' needs' : 's need'} attention before running.`)
      return
    }

    const initialRuntime = Object.fromEntries(nodes.map((node) => [
      node.id,
      { status: 'queued', message: 'Waiting to execute.' } satisfies NodeRuntimeState,
    ]))

    setRuntimeStates(initialRuntime)
    setIsRunning(true)
    setRunState('running')
    setRunMessage('Workflow is executing...')

    const executionId = crypto.randomUUID()
    const handleExecutionEvent = (event: {
      executionId: string
      nodeId: string
      status: 'running' | 'success' | 'failed' | 'skipped'
      message: string
      context?: Record<string, unknown>
    }) => {
      if (event.executionId !== executionId) return
      setRuntimeStates((current) => ({
        ...current,
        [event.nodeId]: { status: event.status, message: event.message },
      }))
      if (event.context) setVariableContext(event.context)
    }

    executionSocket.on('execution:event', handleExecutionEvent)

    try {
      if (!executionSocket.connected) {
        executionSocket.connect()
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => {
            cleanup()
            reject(new Error('Could not connect to NexFlow execution stream.'))
          }, 3000)
          const cleanup = () => {
            window.clearTimeout(timer)
            executionSocket.off('connect', connected)
            executionSocket.off('connect_error', failed)
          }
          const connected = () => { cleanup(); resolve() }
          const failed = () => { cleanup(); reject(new Error('Could not connect to NexFlow execution stream.')) }
          executionSocket.once('connect', connected)
          executionSocket.once('connect_error', failed)
        })
      }

      await new Promise<void>((resolve, reject) => {
        executionSocket.timeout(3000).emit(
          'execution:subscribe',
          { executionId },
          (error: Error | null, response: { ok: boolean }) => {
            if (error || !response?.ok) {
              reject(new Error('Could not subscribe to execution stream.'))
              return
            }
            resolve()
          },
        )
      })

      const result = await executeWorkflowRemote(executionId, workflowId, nodes, edges, testInput)
      // Reconcile the final state if a socket event was missed during execution.
      setRuntimeStates(Object.fromEntries(result.events.map((event) => [
        event.nodeId,
        { status: event.status, message: event.message },
      ])))
      setVariableContext(result.context)
      setRunState(result.success ? 'success' : 'failed')
      setRunMessage(`${result.message} (${result.durationMs}ms)`)
    } catch (error) {
      setRuntimeStates({})
      setRunState('failed')
      setRunMessage(error instanceof Error ? error.message : 'Workflow execution failed.')
    } finally {
      executionSocket.off('execution:event', handleExecutionEvent)
      setIsRunning(false)
    }
  }

  if (isLoadingWorkflow) {
    return <div className="workspace-state"><div><span>⌁</span><strong>Loading workflow</strong><p>Fetching the latest version from PostgreSQL...</p></div></div>
  }

  if (workflowLoadError) {
    return <div className="workspace-state"><div><span>!</span><strong>Workflow unavailable</strong><p>{workflowLoadError}</p><Link to="/dashboard">Back to dashboard</Link></div></div>
  }

  return (
    <div className="workspace">
      <header className="workspace-header">
        <div className="workspace-header-left">
          <Link to="/" className="workspace-brand">
            <span className="workspace-logo">
              <span />
              <span />
            </span>

            NexFlow
          </Link>

          <div className="header-divider" />

          <div className="workflow-title">
            <input
              className="workflow-title-input"
              aria-label="Workflow name"
              value={workflowName}
              maxLength={120}
              disabled={isSaving || isRunning}
              onChange={(event) => {
                setWorkflowName(event.target.value)
                markUnsaved()
              }}
              onBlur={() => {
                const trimmed = workflowName.trim()
                setWorkflowName(trimmed || 'Untitled workflow')
              }}
            />
            <span>{workflowRevision > 0 ? `v${workflowRevision}` : 'Draft'}</span>
          </div>
        </div>

        <div className="workspace-actions">
          <span className="saved-status">
            <span
              className={
                saveStatus.startsWith('Saved')
                  ? 'saved-dot'
                  : 'unsaved-dot'
              }
            />

            {saveStatus}
          </span>

          <button
            className="workspace-secondary-button"
            onClick={() => setDataPanelOpen(true)}
          >
            {'{ }'} Test data
          </button>

          <button
            className="workspace-secondary-button"
            onClick={saveWorkflow}
            disabled={isSaving}
          >
            Save
          </button>

          <button
            className="run-button"
            onClick={runWorkflow}
            disabled={isRunning}
          >
            <span>{isRunning ? '●' : '▶'}</span>
            {isRunning ? 'Running...' : 'Run workflow'}
          </button>
        </div>
      </header>

      <div className="workspace-body">
        <aside className="node-sidebar">
          <div className="sidebar-heading">
            <strong>Nodes</strong>
            <span>Click to add</span>
          </div>

          <div className="node-category">
            <span className="category-label">TRIGGERS</span>

            <button onClick={() => addNode('webhook')}>
              <span className="palette-icon purple">↗</span>

              <div>
                <strong>Webhook</strong>
                <small>Receive HTTP requests</small>
              </div>
            </button>
          </div>

          <div className="node-category">
            <span className="category-label">LOGIC</span>

            <button onClick={() => addNode('condition')}>
              <span className="palette-icon blue">◇</span>

              <div>
                <strong>Condition</strong>
                <small>Create a branch</small>
              </div>
            </button>

            <button onClick={() => addNode('delay')}>
              <span className="palette-icon orange">◷</span>

              <div>
                <strong>Delay</strong>
                <small>Pause execution</small>
              </div>
            </button>
          </div>

          <div className="node-category">
            <span className="category-label">ACTIONS</span>

            <button onClick={() => addNode('http')}>
              <span className="palette-icon green">{'{ }'}</span>

              <div>
                <strong>HTTP Request</strong>
                <small>Call a REST API</small>
              </div>
            </button>
          </div>

          <div className="sidebar-tip">
            <span>⌘</span>

            <p>
              Drag nodes around the canvas and connect their handles to build
              your workflow.
            </p>
          </div>
        </aside>

        <main className="flow-area">
          <ReactFlow
            nodes={renderedNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            onNodesDelete={handleNodesDelete}
            deleteKeyCode={['Backspace', 'Delete']}
            fitView
            snapToGrid
            snapGrid={[20, 20]}
            minZoom={0.35}
            maxZoom={1.8}
            defaultEdgeOptions={{
              style: {
                stroke: '#6754b8',
                strokeWidth: 1.5,
              },
            }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={22}
              size={1}
              color="#32333a"
            />

            <Controls />

            <MiniMap
              pannable
              zoomable
              nodeColor="#6f56e8"
              maskColor="rgba(8, 9, 12, 0.78)"
            />
          </ReactFlow>

          <div className={`execution-banner ${runState}`} title={`Test input: ${testInputText}`}>
            <span className="execution-banner-dot" />
            <div>
              <strong>{runState === 'ready' ? 'Execution' : runState === 'running' ? 'Running workflow' : runState === 'success' ? 'Execution complete' : 'Execution failed'}</strong>
              <small>{runMessage}</small>
            </div>
          </div>

          <div className="canvas-help">
            <span>Scroll</span> zoom
            <i />
            <span>Drag</span> pan
            <i />
            <span>Delete</span> remove
          </div>
        </main>

        <NodeConfigPanel
          node={selectedNode}
          webhookToken={webhookToken}
          onChange={updateNodeData}
          onClose={() => setSelectedNodeId(null)}
        />
      </div>
      <ExecutionDataPanel
        open={dataPanelOpen}
        inputText={testInputText}
        inputError={testInputError}
        variables={variableContext}
        isRunning={isRunning}
        onClose={() => setDataPanelOpen(false)}
        onInputChange={(value) => {
          setTestInputText(value)
          setTestInputError(null)
          if (!isRunning) setVariableContext(inputVariables(value))
        }}
        onFormat={formatTestInput}
        onReset={resetTestInput}
      />
    </div>
  )
}

export default WorkspacePage
