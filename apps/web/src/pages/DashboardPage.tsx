import {
  useEffect,
  useState,
} from 'react'
import {
  Link,
  useNavigate,
} from 'react-router'
import {
  getRecentExecutionsRemote,
  listWorkflowsRemote,
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

    return () => {
      active = false
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
                </div>
              ),
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

export default DashboardPage
