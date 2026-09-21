import { useMemo } from 'react'
import { Background, Handle, Position, ReactFlow, type NodeProps, type Node, type Edge } from '@xyflow/react'
import { CheckCircle, Clock, Lightning, ArrowClockwise, WarningCircle } from '@phosphor-icons/react'

export type RunState = 'all' | 'queued' | 'running' | 'retrying' | 'succeeded' | 'attention'
export const stateStatuses: Record<Exclude<RunState, 'all'>, string[]> = {
  queued: ['QUEUED'], running: ['RUNNING'], retrying: ['RETRYING', 'RECOVERING'],
  succeeded: ['SUCCESS'], attention: ['FAILED', 'RECOVERY_REQUIRED'],
}
const stages = [
  { id: 'queued', label: 'In the queue', detail: 'Waiting to start', Icon: Clock, position: { x: 20, y: 95 } },
  { id: 'running', label: 'Running', detail: 'Work in motion', Icon: Lightning, position: { x: 255, y: 95 } },
  { id: 'succeeded', label: 'Completed', detail: 'Successfully finished', Icon: CheckCircle, position: { x: 520, y: 0 } },
  { id: 'retrying', label: 'Retry & recovery', detail: 'Another attempt', Icon: ArrowClockwise, position: { x: 520, y: 195 } },
  { id: 'attention', label: 'Needs attention', detail: 'Review these runs', Icon: WarningCircle, position: { x: 785, y: 95 } },
] as const
type StateNode = Node<{ stage: typeof stages[number]; count: number; selected: boolean; loading: boolean; onSelect: (state: RunState) => void }, 'state'>

function ExecutionStateNode({ data }: NodeProps<StateNode>) {
  const { stage, count, selected, loading, onSelect } = data
  return <>
    <Handle type="target" position={Position.Left} />
    <button className={`map-node ${stage.id}${selected ? ' selected' : ''}`} onClick={() => onSelect(stage.id)} aria-pressed={selected} aria-label={`${stage.label}: ${count} runs. Filter executions.`}>
      <span className="map-node-top"><stage.Icon size={22} weight="duotone" /><span className="map-node-label">{stage.id === 'running' && count > 0 ? 'IN PROGRESS' : 'EXECUTIONS'}</span></span>
      <span className="map-node-title">{stage.label}</span>
      <span className="map-node-bottom"><strong>{loading ? '—' : String(count).padStart(2, '0')}</strong><span>{stage.detail}</span></span>
    </button>
    <Handle type="source" position={Position.Right} />
  </>
}
const nodeTypes = { state: ExecutionStateNode }
const connections = [['queued', 'running'], ['running', 'succeeded'], ['running', 'retrying'], ['retrying', 'attention']]

export default function DashboardMap({ counts, selected, onSelect, loading }: {
  counts: Record<Exclude<RunState, 'all'>, number>; selected: RunState; onSelect: (state: RunState) => void; loading: boolean
}) {
  const nodes = useMemo<StateNode[]>(() => stages.map(stage => ({ id: stage.id, type: 'state', position: stage.position,
    data: { stage, count: counts[stage.id], selected: selected === stage.id, loading, onSelect },
  })), [counts, selected, onSelect, loading])
  const edges: Edge[] = connections.map(([source, target]) => ({ id: `${source}-${target}`, source, target, type: 'smoothstep',
    animated: !loading && counts[source as keyof typeof counts] > 0,
    style: { stroke: source === 'retrying' ? '#947392' : '#8c6bc6', strokeWidth: 1.4 },
  }))
  return <div className="dashboard-map" aria-label="Execution states overview">
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.08 }}
      nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} panOnDrag={false}
      zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false} preventScrolling={false}
      nodesFocusable={false} edgesFocusable={false} minZoom={0.15} maxZoom={1}>
      <Background color="#75608f" gap={20} size={0.65} />
    </ReactFlow>
  </div>
}
