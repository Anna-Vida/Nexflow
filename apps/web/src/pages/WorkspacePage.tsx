import { useCallback } from 'react'
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
  type Node,
  type NodeProps,
} from '@xyflow/react'
import './WorkspacePage.css'

type WorkflowNodeData = {
  title: string
  subtitle: string
  category: string
  icon: string
  hasInput?: boolean
  hasOutput?: boolean
} & Record<string, unknown>

type WorkflowNode = Node<WorkflowNodeData>

function WorkflowNodeCard({ data, selected }: NodeProps<WorkflowNode>) {
  return (
    <div className={`builder-node ${selected ? 'selected' : ''}`}>
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

      {data.hasOutput !== false && (
        <Handle
          type="source"
          position={Position.Right}
          className="builder-handle"
        />
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
      title: 'Webhook',
      subtitle: 'Waiting for request',
      category: 'TRIGGER',
      icon: '↗',
      hasInput: false,
    },
  },
  {
    id: 'condition-1',
    type: 'workflow',
    position: { x: 390, y: 180 },
    data: {
      title: 'Condition',
      subtitle: 'amount > 10,000',
      category: 'LOGIC',
      icon: '◇',
    },
  },
  {
    id: 'http-1',
    type: 'workflow',
    position: { x: 700, y: 180 },
    data: {
      title: 'HTTP Request',
      subtitle: 'POST /api/notify',
      category: 'ACTION',
      icon: '{ }',
      hasOutput: false,
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
    target: 'http-1',
    animated: true,
    markerEnd: {
      type: MarkerType.ArrowClosed,
    },
  },
]

const nodeTemplates = {
  webhook: {
    title: 'Webhook',
    subtitle: 'Incoming request',
    category: 'TRIGGER',
    icon: '↗',
  },
  condition: {
    title: 'Condition',
    subtitle: 'Configure expression',
    category: 'LOGIC',
    icon: '◇',
  },
  http: {
    title: 'HTTP Request',
    subtitle: 'Call an API',
    category: 'ACTION',
    icon: '{ }',
  },
  delay: {
    title: 'Delay',
    subtitle: 'Wait before continuing',
    category: 'UTILITY',
    icon: '◷',
  },
}

type NodeTemplate = keyof typeof nodeTemplates

function WorkspacePage() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

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
    },
    [setEdges],
  )

  const addNode = (type: NodeTemplate) => {
    const template = nodeTemplates[type]

    const newNode: WorkflowNode = {
      id: `${type}-${crypto.randomUUID()}`,
      type: 'workflow',
      position: {
        x: 260 + Math.random() * 300,
        y: 150 + Math.random() * 250,
      },
      data: template,
    }

    setNodes((currentNodes) => [...currentNodes, newNode])
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
            <span />
            Prototype
          </span>

          <button className="workspace-secondary-button">
            Save
          </button>

          <button className="run-button">
            <span>▶</span>
            Run workflow
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
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
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

          <div className="canvas-help">
            <span>Scroll</span> zoom
            <i />
            <span>Drag</span> pan
            <i />
            <span>Delete</span> remove
          </div>
        </main>
      </div>
    </div>
  )
}

export default WorkspacePage
