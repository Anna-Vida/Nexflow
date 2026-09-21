import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, ArrowsClockwise, ChartLineUp, CheckCircle, Clock, Cube, FlowArrow, Gauge, Lightning, MagnifyingGlass, Plus, SignOut, SquaresFour, WarningCircle, X } from '@phosphor-icons/react'
import DashboardMap, { stateStatuses, type RunState } from './DashboardMap'
import type { DashboardExecution, DashboardWorkflow } from '../workflow/workflowApi'

function shortDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}
function statusLabel(status: string) { return status.toLowerCase().replaceAll('_', ' ') }
function duration(value: number | null) { return value === null ? '—' : value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s` }

export default function DashboardContent({ workflows, executions, loading, error, createWorkflow, signOut, openExecution }: {
  workflows: DashboardWorkflow[]; executions: DashboardExecution[]; loading: boolean; error: string | null;
  createWorkflow: () => void; signOut: () => Promise<void>; openExecution: (id: string) => Promise<void>;
}) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [range, setRange] = useState(30)
  const [state, setState] = useState<RunState>('all')
  const [showAllWorkflows, setShowAllWorkflows] = useState(false)
  const rangeRuns = useMemo(() => {
    const start = new Date()
    if (range === 1) start.setHours(0, 0, 0, 0)
    else start.setTime(start.getTime() - range * 86400000)
    return executions.filter(run => new Date(run.startedAt) >= start)
  }, [executions, range])
  const counts = useMemo(() => Object.fromEntries(Object.entries(stateStatuses).map(([key, statuses]) =>
    [key, rangeRuns.filter(run => statuses.includes(run.status)).length])) as Record<Exclude<RunState, 'all'>, number>, [rangeRuns])
  const completed = rangeRuns.filter(run => ['SUCCESS', 'FAILED', 'RECOVERY_REQUIRED'].includes(run.status)).length
  const successRate = completed ? `${Math.round(counts.succeeded / completed * 100)}%` : '—'
  const attention = rangeRuns.filter(run => stateStatuses.attention.includes(run.status))
  const matchingWorkflows = workflows.filter(workflow => workflow.name.toLowerCase().includes(query.trim().toLowerCase()))
  const visibleWorkflows = showAllWorkflows ? matchingWorkflows : matchingWorkflows.slice(0, 4)
  const visibleRuns = rangeRuns.filter(run => (state === 'all' || stateStatuses[state].includes(run.status)) &&
    (run.workflow?.name ?? 'Unsaved workflow').toLowerCase().includes(query.trim().toLowerCase()))
  const selectState = useCallback((value: RunState) => {
    setState(previous => previous === value ? 'all' : value)
  }, [])
  const inMotion = counts.running + counts.retrying + counts.queued

  return <>
    <a className="dashboard-skip" href="#dashboard-main">Skip to dashboard</a>
    <aside className="dashboard-rail" aria-label="Workspace navigation">
      <Link to="/" className="rail-brand" aria-label="NexFlow home"><Cube size={29} weight="duotone" /></Link>
      <nav>
        <a href="#dashboard-main" className="rail-link active" aria-label="Overview" title="Overview"><SquaresFour size={21} weight="duotone" /></a>
        <a href="#my-workflows" className="rail-link" aria-label="My workflows" title="My workflows"><FlowArrow size={21} /></a>
        <a href="#recent-executions" className="rail-link" aria-label="Recent executions" title="Recent executions"><Clock size={21} /></a>
        <a href="#needs-attention" className="rail-link" aria-label="Needs attention" title="Needs attention"><WarningCircle size={21} />{attention.length > 0 && <span className="rail-count">{attention.length}</span>}</a>
      </nav>
      <button className="rail-link rail-signout" onClick={() => void signOut()} aria-label="Sign out" title="Sign out"><SignOut size={21} /></button>
    </aside>

    <div className="dashboard-shell">
      <header className="dashboard-nav">
        <Link to="/" className="dashboard-brand">Nex<span>Flow</span><span className="dashboard-nav-label">WORKSPACE</span></Link>
        <Link to="/" className="dashboard-back-link"><ArrowLeft size={14} /> Back to website</Link>
        <label className="dashboard-search"><MagnifyingGlass size={18} /><input type="search" placeholder="Search workflows…" aria-label="Search workflows and executions" value={query} onChange={event => setQuery(event.target.value)} />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={15} /></button>}</label>
        <div className="dashboard-range" aria-label="Execution time range">{[{ days: 1, label: 'Today' }, { days: 7, label: '7 days' }, { days: 30, label: '30 days' }].map(option => <button key={option.days} aria-pressed={range === option.days} className={range === option.days ? 'active' : ''} onClick={() => setRange(option.days)}>{option.label}</button>)}</div>
        <span className={`dashboard-live ${error ? 'offline' : ''}`}><ArrowsClockwise size={14} />{error ? 'Updates paused' : loading ? 'Connecting' : 'Auto-refresh on'}</span>
      </header>

      <main className="dashboard-main" id="dashboard-main">
        <section className="dashboard-hero">
          <div><span className="dashboard-eyebrow">YOUR WORK, IN FLOW</span><h1>Automation center<span>.</span></h1><p>A little less busywork. A lot more possibility.</p></div>
          <button className="dashboard-primary" onClick={createWorkflow}><Plus size={18} weight="bold" />Create workflow<ArrowUpRight size={17} /></button>
        </section>
        {error && <div className="dashboard-error" role="alert"><WarningCircle size={20} /><div><strong>Could not refresh your workspace</strong><p>{error} Retrying automatically.</p></div></div>}

        <section className="dashboard-metrics" aria-label="Workspace summary">
          {[
            { label: 'Saved workflows', value: workflows.length, note: 'Ready for your next idea', Icon: FlowArrow, theme: 'violet' },
            { label: 'Success rate', value: successRate, note: `${completed} finished runs in this period`, Icon: ChartLineUp, theme: 'green' },
            { label: 'In progress', value: inMotion, note: 'Queued, running & retrying', Icon: Lightning, theme: 'violet' },
            { label: 'Needs attention', value: attention.length, note: 'Failed or awaiting recovery', Icon: WarningCircle, theme: 'amber' },
          ].map(metric => <article className={`metric-card ${metric.theme}`} key={metric.label}><div className="metric-heading"><span className="metric-icon"><metric.Icon size={20} weight="duotone" /></span><span>{metric.label}</span></div><div className="metric-value">{loading ? '—' : metric.value}</div><span className="metric-note">{metric.note}</span></article>)}
        </section>

        <section className="dashboard-map-panel" aria-labelledby="map-title">
          <div className="dashboard-panel-heading"><div><h2 id="map-title"><FlowArrow size={20} />The flow of your work</h2><p>Execution states · select a card to filter recent activity</p></div><span className="panel-meta">{loading ? 'Loading runs' : `${rangeRuns.length} runs in this period`}</span></div>
          <DashboardMap counts={counts} selected={state} onSelect={selectState} loading={loading} />
          <div className="dashboard-map-footer"><span><Gauge size={15} />Based on your latest 10 runs · {range === 1 ? 'today' : `past ${range} days`}</span><a href="#recent-executions">Explore activity<ArrowDown size={14} /></a></div>
        </section>

        <div className="dashboard-bottom-grid">
          <section className="dashboard-panel workflows-panel" id="my-workflows">
            <div className="dashboard-panel-heading"><h2>My workflows <span className="heading-count">{matchingWorkflows.length}</span></h2><button className="dashboard-icon-button" onClick={createWorkflow} title="New workflow" aria-label="New workflow"><Plus size={18} /></button></div>
            <div className="workflow-list">
              {loading ? <div className="dashboard-empty">Loading your workflows…</div> : !matchingWorkflows.length ? <div className="dashboard-empty"><FlowArrow size={32} weight="duotone" /><strong>{query ? 'No matching workflows' : 'Big ideas start small'}</strong><p>{query ? 'Try a different workflow name.' : 'Connect your first steps and let NexFlow do the rest.'}</p><button className="dashboard-text-button" onClick={query ? () => setQuery('') : createWorkflow}>{query ? 'Clear search' : 'Build your first workflow'}<ArrowRight size={16} /></button></div> : visibleWorkflows.map(workflow => <button className="workflow-card" key={workflow.id} onClick={() => navigate(`/workspace/${workflow.id}`)}><span className="workflow-card-icon"><FlowArrow size={20} weight="duotone" /></span><span className="workflow-card-content"><strong>{workflow.name}</strong><span>{workflow.executionCount} runs <span aria-hidden="true">·</span> Version {workflow.currentVersion}</span><span className={`status-badge ${workflow.latestExecution?.status.toLowerCase() ?? 'never'}`}>{workflow.latestExecution ? statusLabel(workflow.latestExecution.status) : 'Ready to run'}</span></span><ArrowUpRight className="workflow-open" size={17} /></button>)}
            </div>
            {matchingWorkflows.length > 4 && <button className="panel-footer-button" onClick={() => setShowAllWorkflows(!showAllWorkflows)}>{showAllWorkflows ? 'Show fewer workflows' : `View all ${matchingWorkflows.length} workflows`}<ArrowRight size={15} /></button>}
          </section>

          <section className="dashboard-panel activity-panel" id="recent-executions">
            <div className="dashboard-panel-heading"><h2>Recent activity</h2><span className="panel-meta">{visibleRuns.length} runs</span></div>
            {state !== 'all' && <div className="activity-filter">Showing {state === 'attention' ? 'needs attention' : state} <button onClick={() => setState('all')} aria-label="Clear status filter"><X size={14} /></button></div>}
            <div className="execution-table"><table><thead><tr><th>Workflow</th><th>Status</th><th>Duration</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>{visibleRuns.map(run => <tr key={run.id}><td><button className="execution-workflow" onClick={() => void openExecution(run.id)}>{run.workflow?.name ?? 'Unsaved workflow'}</button><time dateTime={run.startedAt}>{shortDate(run.startedAt)}</time></td><td><span className={`status-badge ${run.status.toLowerCase()}`}>{statusLabel(run.status)}</span></td><td className="duration-cell">{duration(run.durationMs)}</td><td><button className="dashboard-icon-button" onClick={() => void openExecution(run.id)} aria-label={`View execution for ${run.workflow?.name ?? 'unsaved workflow'}`}><ArrowUpRight size={17} /></button></td></tr>)}</tbody></table></div>
            {!visibleRuns.length && <div className="dashboard-empty"><Clock size={29} weight="duotone" /><strong>{loading ? 'Loading activity…' : 'A fresh stretch of possibility'}</strong><p>{loading ? 'Fetching your recent runs.' : state !== 'all' || query ? 'No recent runs match these filters.' : 'Runs in this period will appear here.'}</p>{(state !== 'all' || query) && <button className="dashboard-text-button" onClick={() => { setState('all'); setQuery('') }}>Clear filters<ArrowRight size={15} /></button>}</div>}
          </section>

          <section className="dashboard-panel attention-panel" id="needs-attention">
            <div className="dashboard-panel-heading"><h2>Needs attention</h2><WarningCircle size={19} /></div>
            {loading ? <div className="dashboard-empty">Checking recent runs…</div> : attention.length ? <div className="attention-list">{attention.map(run => <button key={run.id} className="attention-item" onClick={() => void openExecution(run.id)}><span className={`attention-icon ${run.status.toLowerCase()}`}><WarningCircle size={19} weight="duotone" /></span><span><strong>{run.workflow?.name ?? 'Unsaved workflow'}</strong><span>{run.status === 'RECOVERY_REQUIRED' ? 'Review the outcome before running again.' : 'This run failed. Open it to inspect or retry.'}</span><span className="attention-action">Review execution<ArrowUpRight size={13} /></span></span></button>)}</div> : <div className="attention-clear"><CheckCircle size={40} weight="duotone" /><strong>Room to focus.</strong><p>No failed runs or recovery requests in this period.</p><span className="status-badge success">All clear</span></div>}
            <div className="dashboard-tip"><Lightning size={19} weight="duotone" /><p><strong>Make room for what matters.</strong>Start with one repetitive task. Your next workflow can take it from there.</p></div>
          </section>
        </div>
        <footer className="dashboard-footer"><span>NexFlow <span aria-hidden="true">/</span> Your automation workspace</span><span>Build once. Keep moving.</span></footer>
      </main>
    </div>
  </>
}
