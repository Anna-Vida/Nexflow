import {
  useEffect,
  useState,
} from 'react'
import {
  Link,
  useNavigate,
} from 'react-router'
import {
  getExecutionRemote,
  retryExecutionRemote,
  getRecentExecutionsRemote,
  listWorkflowsRemote,
  type ExecutionDetail,
  type DashboardExecution,
  type DashboardWorkflow,
} from '../workflow/workflowApi'
import './DashboardPage.css'

const STORAGE_KEY =
  'nexflow:workflow:draft'

function formatDate(
  value: string,
) {
  return new Intl.DateTimeFormat(
    'en-PH',
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    },
  ).format(
    new Date(value),
  )
}

function formatDuration(
  duration: number | null,
) {
  if (duration === null) {
    return '—'
  }

  if (duration < 1000) {
    return `${duration} ms`
  }

  return `${(
    duration / 1000
  ).toFixed(1)} s`
}

function DashboardPage() {
  const navigate =
    useNavigate()

  const [
    workflows,
    setWorkflows,
  ] = useState<
    DashboardWorkflow[]
  >([])

  const [
    executions,
    setExecutions,
  ] = useState<
    DashboardExecution[]
  >([])

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null)

  const [selectedExecution, setSelectedExecution] = useState<ExecutionDetail | null>(null)
  const [executionLoading, setExecutionLoading] = useState(false)
  const [retryPending, setRetryPending] = useState(false)
  const [executionError, setExecutionError] = useState<string | null>(null)

  const retryExecution = async () => {
    if (!selectedExecution || retryPending) return
    setRetryPending(true)
    setExecutionError(null)
    try {
      const result = await retryExecutionRemote(selectedExecution.id)
      await openExecution(result.executionId)
    } catch (retryError) {
      setExecutionError(retryError instanceof Error ? retryError.message : 'Could not retry execution.')
    } finally {
      setRetryPending(false)
    }
  }

  const selectedId = selectedExecution?.id
  const selectedStatus = selectedExecution?.status
  useEffect(() => {
    if (!selectedId || !['QUEUED', 'RUNNING', 'RETRYING', 'RECOVERING'].includes(selectedStatus ?? '')) return
    let active = true
    const timer = setInterval(() => {
      void getExecutionRemote(selectedId).then((detail) => {
        if (active) setSelectedExecution(detail)
      }).catch((loadError: unknown) => {
        if (active) setExecutionError(loadError instanceof Error ? loadError.message : 'Could not refresh execution.')
      })
    }, 500)
    return () => { active = false; clearInterval(timer) }
  }, [selectedId, selectedStatus])

  const openExecution = async (executionId: string) => {
    setExecutionLoading(true)
    setExecutionError(null)
    setSelectedExecution(null)
    try {
      setSelectedExecution(await getExecutionRemote(executionId))
    } catch (loadError) {
      setExecutionError(loadError instanceof Error ? loadError.message : 'Could not load execution.')
    } finally {
      setExecutionLoading(false)
    }
  }

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const [
          workflowData,
          executionData,
        ] =
          await Promise.all([
            listWorkflowsRemote(),
            getRecentExecutionsRemote(),
          ])

        if (!active) {
          return
        }

        setWorkflows(
          workflowData,
        )

        setExecutions(
          executionData,
        )
      } catch (
        loadError
      ) {
        if (!active) {
          return
        }

        setError(
          loadError instanceof
            Error
            ? loadError.message
            : 'Could not load dashboard.',
        )
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()
    const timer = setInterval(() => { void load() }, 2000)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  const createWorkflow = () => {
    localStorage.removeItem(
      STORAGE_KEY,
    )

    navigate('/workspace')
  }

  return (
    <div className="dashboard">
      <header className="dashboard-nav">
        <Link
          to="/"
          className="dashboard-brand"
        >
          <span className="dashboard-logo">
            <span />
            <span />
          </span>

          NexFlow
        </Link>

        <span className="dashboard-nav-label">
          Dashboard
        </span>

        <button
          className="dashboard-create-top"
          onClick={
            createWorkflow
          }
        >
          + New workflow
        </button>
      </header>

      <main className="dashboard-main">
        <section className="dashboard-hero">
          <div>
            <span className="dashboard-eyebrow">
              WORKSPACE
            </span>

            <h1>
              Good to see you.
            </h1>

            <p>
              Build, monitor, and
              debug your NexFlow
              automations.
            </p>
          </div>

          <button
            className="dashboard-primary"
            onClick={
              createWorkflow
            }
          >
            Create workflow
            <span>→</span>
          </button>
        </section>

        {error && (
          <div className="dashboard-error">
            <strong>
              Could not load NexFlow
            </strong>

            <span>
              {error}
            </span>
          </div>
        )}

        <section className="dashboard-section">
          <div className="dashboard-section-header">
            <div>
              <h2>
                My workflows
              </h2>

              <span>
                {workflows.length}{' '}
                saved
              </span>
            </div>

            <button
              onClick={
                createWorkflow
              }
            >
              New workflow +
            </button>
          </div>

          {loading ? (
            <div className="dashboard-empty">
              Loading workflows...
            </div>
          ) : workflows.length ===
            0 ? (
            <div className="dashboard-empty">
              <strong>
                No workflows yet
              </strong>

              <p>
                Create your first
                workflow and it will
                appear here.
              </p>

              <button
                onClick={
                  createWorkflow
                }
              >
                Create workflow
              </button>
            </div>
          ) : (
            <div className="workflow-grid">
              {workflows.map(
                (workflow) => (
                  <button
                    key={
                      workflow.id
                    }
                    className="workflow-card"
                    onClick={() =>
                      navigate(
                        `/workspace/${workflow.id}`,
                      )
                    }
                  >
                    <div className="workflow-card-top">
                      <span className="workflow-card-icon">
                        ⌁
                      </span>

                      <span className="workflow-version">
                        v
                        {
                          workflow.currentVersion
                        }
                      </span>
                    </div>

                    <strong>
                      {
                        workflow.name
                      }
                    </strong>

                    <p>
                      Updated{' '}
                      {formatDate(
                        workflow.updatedAt,
                      )}
                    </p>

                    <div className="workflow-card-bottom">
                      <span>
                        {
                          workflow.executionCount
                        }{' '}
                        run
                        {workflow.executionCount ===
                        1
                          ? ''
                          : 's'}
                      </span>

                      {workflow.latestExecution ? (
                        <span
                          className={`status-badge ${workflow.latestExecution.status.toLowerCase()}`}
                        >
                          {
                            workflow.latestExecution.status
                          }
                        </span>
                      ) : (
                        <span className="status-badge never">
                          Never run
                        </span>
                      )}
                    </div>
                  </button>
                ),
              )}
            </div>
          )}
        </section>

        <section className="dashboard-section executions-section">
          <div className="dashboard-section-header">
            <div>
              <h2>
                Recent executions
              </h2>

              <span>
                Latest workflow
                activity
              </span>
            </div>
          </div>

          <div className="execution-table">
            <div className="execution-row execution-heading">
              <span>
                Workflow
              </span>

              <span>
                Status
              </span>

              <span>
                Duration
              </span>

              <span>
                Started
              </span>

              <span>Details</span>
            </div>

            {!loading &&
              executions.length ===
                0 && (
                <div className="execution-empty">
                  No executions
                  recorded yet.
                </div>
              )}

            {executions.map(
              (execution) => (
                <div
                  className="execution-row"
                  key={
                    execution.id
                  }
                >
                  <button
                    className="execution-workflow"
                    disabled={
                      !execution.workflow
                    }
                    onClick={() => {
                      if (
                        execution.workflow
                      ) {
                        navigate(
                          `/workspace/${execution.workflow.id}`,
                        )
                      }
                    }}
                  >
                    {execution
                      .workflow
                      ?.name ??
                      'Unsaved workflow'}
                  </button>

                  <span
                    className={`status-badge ${execution.status.toLowerCase()}`}
                  >
                    {
                      execution.status
                    }
                  </span>

                  <span>
                    {formatDuration(
                      execution.durationMs,
                    )}
                  </span>

                  <span>
                    {formatDate(
                      execution.startedAt,
                    )}
                  </span>

                  <button
                    className="execution-details-button"
                    onClick={() => void openExecution(execution.id)}
                  >
                    View →
                  </button>
                </div>
              ),
            )}
          </div>
        </section>
      </main>
      {(
        selectedExecution ||
        executionLoading ||
        executionError
      ) && (
        <div
          className="execution-overlay"
          onClick={() => {
            setSelectedExecution(null)
            setExecutionError(null)
          }}
        >
          <aside
            className="execution-drawer"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="execution-drawer-header">
              <div>
                <span>
                  EXECUTION
                </span>

                <strong>
                  {selectedExecution
                    ?.workflow?.name ??
                    'Workflow run'}
                </strong>
              </div>

              <button
                onClick={() => {
                  setSelectedExecution(
                    null,
                  )

                  setExecutionError(
                    null,
                  )
                }}
              >
                ×
              </button>
            </div>

            {executionLoading && (
              <div className="execution-drawer-state">
                Loading execution...
              </div>
            )}

            {executionError && (
              <div className="execution-drawer-state error">
                {executionError}
              </div>
            )}

            {selectedExecution && (
              <div className="execution-drawer-body">
                <div className="execution-summary">
                  <div>
                    <span>
                      Status
                    </span>

                    <strong
                      className={`status-badge ${selectedExecution.status.toLowerCase()}`}
                    >
                      {
                        selectedExecution.status
                      }
                    </strong>
                  </div>

                  <div>
                    <span>
                      Duration
                    </span>

                    <strong>
                      {formatDuration(
                        selectedExecution.durationMs,
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Attempt
                    </span>

                    <strong>
                      {
                        `${selectedExecution.attemptCount} / ${selectedExecution.maxAttempts}`
                      }
                    </strong>
                  </div>

                  <div>
                    <span>
                      Started
                    </span>

                    <strong>
                      {formatDate(
                        selectedExecution.startedAt,
                      )}
                    </strong>
                  </div>
                </div>

                {selectedExecution.lastError && (
                  <section className="execution-detail-section">
                    <h3>
                      Last error
                    </h3>

                    <p>
                      {
                        selectedExecution.lastError
                      }
                    </p>
                  </section>
                )}

                {selectedExecution.retriedFromId && (
                  <section className="execution-detail-section">
                    <h3>
                      Retried from
                    </h3>

                    <button
                      className="retry-lineage"
                      type="button"
                      onClick={() => void openExecution(selectedExecution.retriedFromId as string)}
                    >
                      {selectedExecution.retriedFromId}
                    </button>
                  </section>
                )}

                {selectedExecution.status === 'FAILED' && (
                  <button
                    className="retry-button"
                    type="button"
                    disabled={retryPending}
                    onClick={() => void retryExecution()}
                  >
                    {retryPending ? 'Retrying…' : 'Retry execution'}
                  </button>
                )}

                {selectedExecution.message && (
                  <section className="execution-detail-section">
                    <h3>
                      Result
                    </h3>

                    <p>
                      {
                        selectedExecution.message
                      }
                    </p>
                  </section>
                )}

                <section className="execution-detail-section">
                  <h3>
                    Node events
                  </h3>

                  <div className="event-timeline">
                    {[...new Set(selectedExecution.events.map((event) => event.attempt))].sort((a, b) => a - b).map((attempt) => (
                      <div className="attempt-group" key={`attempt-${attempt}`}>
                        <h4>
                          {`Attempt ${attempt}`}
                        </h4>

                        {selectedExecution.events
                          .filter((event) => event.attempt === attempt)
                          .map(
                            (event) => (
                              <div
                                className="event-item"
                                key={event.id}
                              >
                                <span
                                  className={`event-dot ${event.status.toLowerCase()}`}
                                />

                                <div>
                                  <div className="event-item-top">
                                    <strong>
                                      {
                                        event.nodeId
                                      }
                                    </strong>

                                    <span>
                                      {
                                        event.status
                                      }
                                    </span>
                                  </div>

                                  <p>
                                    {
                                      event.message
                                    }
                                  </p>

                                  <small>
                                    {formatDate(
                                      event.timestamp,
                                    )}
                                  </small>
                                </div>
                              </div>
                            ),
                          )}
                      </div>
                    ))}
                  </div>
                </section>

                <section className="execution-detail-section">
                  <h3>
                    Input
                  </h3>

                  <pre>
                    {JSON.stringify(
                      selectedExecution.input,
                      null,
                      2,
                    )}
                  </pre>
                </section>

                {selectedExecution.context && (
                  <section className="execution-detail-section">
                    <h3>
                      Final context
                    </h3>

                    <pre>
                      {JSON.stringify(
                        selectedExecution.context,
                        null,
                        2,
                      )}
                    </pre>
                  </section>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

export default DashboardPage
