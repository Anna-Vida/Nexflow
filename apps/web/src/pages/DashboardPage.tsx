import {
  useEffect,
  useState,
} from 'react'
import {
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
import { logOutRemote } from '../workflow/authApi'
import DashboardContent from '../components/DashboardContent'
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
  const [signOutError, setSignOutError] = useState<string | null>(null)

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

        setError(null)
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

  async function signOut() {
    setSignOutError(null)
    try {
      await logOutRemote()
      navigate('/login', { replace: true })
    } catch (logoutError) {
      setSignOutError(logoutError instanceof Error ? logoutError.message : 'Could not sign out.')
    }
  }

  const createWorkflow = () => {
    localStorage.removeItem(
      STORAGE_KEY,
    )

    navigate('/workspace')
  }

  return (
    <div className="dashboard">
      {signOutError && <div className="dashboard-logout-error" role="alert">{signOutError}</div>}
      <DashboardContent workflows={workflows} executions={executions} loading={loading} error={error}
        createWorkflow={createWorkflow} signOut={signOut} openExecution={openExecution} />
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
