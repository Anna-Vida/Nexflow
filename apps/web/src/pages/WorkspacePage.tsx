import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router'
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
import { executeWorkflow } from '../workflow/workflowEngine'
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

    if (data.config.timeout <= 0) {
      return 'HTTP timeout must be greater than zero.'
    }

    return null
  }

  if (data.config.duration <= 0) {
    return 'Delay duration must be greater than zero.'
  }

  return null
}

function WorkspacePage() {
  const savedWorkflow = useMemo(() => loadSavedWorkflow(), [])

  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>(
    savedWorkflow?.nodes ?? initialNodes,
  )

  const [edges, setEdges, onEdgesChange] = useEdgesState(
    savedWorkflow?.edges ?? initialEdges,
  )

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState(
    savedWorkflow ? 'Saved locally' : 'Unsaved',
  )
  const [runtimeStates, setRuntimeStates] = useState<Record<string, NodeRuntimeState>>({})
  const [isRunning, setIsRunning] = useState(false)
  const [runState, setRunState] = useState<'ready' | 'running' | 'success' | 'failed'>('ready')
  const [runMessage, setRunMessage] = useState('Ready to execute')

  const renderedNodes = useMemo(
    () => nodes.map((node) => ({
      ...node,
      data: { ...node.data, runtime: runtimeStates[node.id] },
    })),
    [nodes, runtimeStates],
  )

  const testInput = useMemo(() => ({
    amount: 12500,
    total: 5000,
    message: 'Hello from NexFlow',
    status: 'pending',
    approved: true,
  }), [])

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

  const saveWorkflow = () => {
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

    const workflow: WorkflowDocument = {
      version: 1,
      name: 'Untitled workflow',
      updatedAt: new Date().toISOString(),

      nodes: nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: node.data,
      })),

      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        animated: edge.animated,
        markerEnd: edge.markerEnd,
      })),
    }

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(workflow, null, 2),
    )

    setSaveStatus('Saved locally')
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

  const runWorkflow = async () => {
    if (isRunning) return

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

    try {
      const result = await executeWorkflow({
        nodes,
        edges,
        input: testInput,
        onUpdate: ({ nodeId, runtime }) => {
          setRuntimeStates((current) => ({ ...current, [nodeId]: runtime }))
        },
      })
      setRunState(result.success ? 'success' : 'failed')
      setRunMessage(result.message)
    } catch (error) {
      setRunState('failed')
      setRunMessage(error instanceof Error ? error.message : 'Workflow execution failed.')
    } finally {
      setIsRunning(false)
    }
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
            <strong>Untitled workflow</strong>
            <span>Draft</span>
          </div>
        </div>

        <div className="workspace-actions">
          <span className="saved-status">
            <span
              className={
                saveStatus === 'Saved locally'
                  ? 'saved-dot'
                  : 'unsaved-dot'
              }
            />

            {saveStatus}
          </span>

          <button
            className="workspace-secondary-button"
            onClick={saveWorkflow}
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

          <div className={`execution-banner ${runState}`} title={`Test input: ${JSON.stringify(testInput)}`}>
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
          onChange={updateNodeData}
          onClose={() => setSelectedNodeId(null)}
        />
      </div>
    </div>
  )
}

export default WorkspacePage
