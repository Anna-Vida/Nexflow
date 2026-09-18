import type {
  ConditionConfig,
  DelayConfig,
  HttpConfig,
  HttpMethod,
  ScheduleConfig,
  WebhookConfig,
  WorkflowNode,
  WorkflowNodeData,
} from '../workflow/workflowTypes'

type Props = {
  node: WorkflowNode | null
  webhookToken?: string
  onChange: (nodeId: string, data: WorkflowNodeData) => void
  onClose: () => void
}

const PUBLIC_API_URL = (import.meta.env.VITE_PUBLIC_API_URL as string | undefined)
  ?.replace(/\/$/, '') ?? 'http://127.0.0.1:3000'

function NodeConfigPanel({ node, webhookToken, onChange, onClose }: Props) {
  if (!node) {
    return (
      <aside className="config-panel config-panel-empty">
        <div className="empty-config-icon">◇</div>
        <strong>Select a node</strong>
        <p>
          Choose a workflow node to view and edit its configuration.
        </p>
      </aside>
    )
  }

  const data = node.data

  const renderFields = () => {
    if (data.kind === 'webhook') {
      const endpoint = webhookToken
        ? `${PUBLIC_API_URL}/api/hooks/${webhookToken}${data.config.path}`
        : null

      const update = (patch: Partial<WebhookConfig>) => {
        const config = {
          ...data.config,
          ...patch,
        }

        onChange(node.id, {
          ...data,
          config,
          subtitle: `${config.method} ${config.path}`,
        })
      }

      return (
        <>
          <label className="config-field">
            <span>Method</span>
            <select
              value={data.config.method}
              onChange={(event) =>
                update({
                  method: event.target.value as WebhookConfig['method'],
                })
              }
            >
              <option value="POST">POST</option>
              <option value="GET">GET</option>
            </select>
          </label>

          <label className="config-field">
            <span>Webhook path</span>
            <input
              value={data.config.path}
              onChange={(event) =>
                update({
                  path: event.target.value,
                })
              }
              placeholder="/webhook"
            />
          </label>

          {endpoint ? (
            <div className="config-info webhook-endpoint">
              <strong>Live webhook</strong>
              <code>{endpoint}</code>
              <button type="button" onClick={() => {
                void navigator.clipboard?.writeText(endpoint)
              }}>
                Copy endpoint
              </button>
              <small>Save after changing the method or path before testing.</small>
            </div>
          ) : (
            <div className="config-info">
              Save this workflow once to generate its webhook endpoint.
            </div>
          )}
        </>
      )
    }

    if (data.kind === 'schedule') {
      const update = (patch: Partial<ScheduleConfig>) => {
        const config = { ...data.config, ...patch }
        onChange(node.id, {
          ...data,
          config,
          subtitle: config.mode === 'cron'
            ? `${config.cron || 'Cron'} (${config.timezone})`
            : `Every ${config.intervalMinutes || 60} min (${config.timezone})`,
        })
      }

      return <>
        <label className="config-field">
          <span>Enabled</span>
          <input type="checkbox" checked={data.config.enabled} onChange={(event) => update({ enabled: event.target.checked })} />
        </label>
        <label className="config-field">
          <span>Schedule type</span>
          <select value={data.config.mode} onChange={(event) => update({
            mode: event.target.value as ScheduleConfig['mode'],
            cron: data.config.cron ?? '0 9 * * 1-5',
            intervalMinutes: data.config.intervalMinutes ?? 60,
          })}>
            <option value="interval">Interval</option>
            <option value="cron">Cron</option>
          </select>
        </label>
        {data.config.mode === 'interval' ? <label className="config-field">
          <span>Every (minutes)</span>
          <input type="number" min="1" max="525600" value={data.config.intervalMinutes ?? 60}
            onChange={(event) => update({ intervalMinutes: Number(event.target.value) })} />
        </label> : <label className="config-field">
          <span>Cron expression</span>
          <input value={data.config.cron ?? '0 9 * * 1-5'} placeholder="0 9 * * 1-5"
            onChange={(event) => update({ cron: event.target.value })} />
        </label>}
        <label className="config-field">
          <span>Timezone</span>
          <input value={data.config.timezone} placeholder="Asia/Manila"
            onChange={(event) => update({ timezone: event.target.value })} />
        </label>
        <div className="config-info">Save this workflow to activate or update its schedule.</div>
      </>
    }

    if (data.kind === 'condition') {
      const update = (patch: Partial<ConditionConfig>) => {
        const config = {
          ...data.config,
          ...patch,
        }

        const operatorLabels = {
          equals: '=',
          notEquals: '≠',
          greaterThan: '>',
          lessThan: '<',
          contains: 'contains',
        }

        onChange(node.id, {
          ...data,
          config,
          subtitle: `${config.field || 'field'} ${operatorLabels[config.operator]} ${config.value || 'value'}`,
        })
      }

      return (
        <>
          <label className="config-field">
            <span>Field</span>
            <input
              value={data.config.field}
              onChange={(event) =>
                update({
                  field: event.target.value,
                })
              }
              placeholder="amount"
            />
          </label>

          <label className="config-field">
            <span>Operator</span>
            <select
              value={data.config.operator}
              onChange={(event) =>
                update({
                  operator: event.target.value as ConditionConfig['operator'],
                })
              }
            >
              <option value="equals">Equals</option>
              <option value="notEquals">Does not equal</option>
              <option value="greaterThan">Greater than</option>
              <option value="lessThan">Less than</option>
              <option value="contains">Contains</option>
            </select>
          </label>

          <label className="config-field">
            <span>Value</span>
            <input
              value={data.config.value}
              onChange={(event) =>
                update({
                  value: event.target.value,
                })
              }
              placeholder="10000"
            />
          </label>
        </>
      )
    }

    if (data.kind === 'http') {
      const update = (patch: Partial<HttpConfig>) => {
        const config = {
          ...data.config,
          ...patch,
        }

        onChange(node.id, {
          ...data,
          config,
          subtitle: `${config.method} ${config.url || 'Configure URL'}`,
        })
      }

      return (
        <>
          <label className="config-field">
            <span>Method</span>

            <select
              value={data.config.method}
              onChange={(event) =>
                update({
                  method: event.target.value as HttpMethod,
                })
              }
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
          </label>

          <label className="config-field">
            <span>URL</span>
            <input
              value={data.config.url}
              onChange={(event) =>
                update({
                  url: event.target.value,
                })
              }
              placeholder="https://api.example.com"
            />
          </label>

          <label className="config-field">
            <span>Headers</span>
            <textarea
              rows={4}
              value={data.config.headers}
              onChange={(event) =>
                update({
                  headers: event.target.value,
                })
              }
              placeholder={'{\n  "Authorization": "Bearer {{token}}"\n}'}
            />
          </label>

          <label className="config-field">
            <span>Request body</span>
            <textarea
              rows={6}
              value={data.config.body}
              onChange={(event) =>
                update({
                  body: event.target.value,
                })
              }
              placeholder={'{\n  "message": "{{message}}"\n}'}
            />
          </label>

          <label className="config-field">
            <span>Timeout (ms)</span>
            <input
              type="number"
              min="100"
              max="30000"
              value={data.config.timeout}
              onChange={(event) =>
                update({
                  timeout: Number(event.target.value),
                })
              }
            />
          </label>

          <label className="config-field">
            <span>Retries</span>
            <input
              type="number"
              min="0"
              max="3"
              value={data.config.retries ?? 0}
              onChange={(event) => update({ retries: Number(event.target.value) })}
            />
          </label>

          <label className="config-field">
            <span>Retry delay (ms)</span>
            <input
              type="number"
              min="100"
              max="5000"
              value={data.config.retryDelayMs ?? 500}
              onChange={(event) => update({ retryDelayMs: Number(event.target.value) })}
            />
          </label>

          <div className="config-info">
            Use variables such as <code>{'{{amount}}'}</code>, <code>{'{{message}}'}</code>,
            or previous HTTP results like <code>{'{{http-1.response.status}}'}</code>.
            Retries apply only to GET, PUT, and DELETE requests.
          </div>
        </>
      )
    }

    const update = (patch: Partial<DelayConfig>) => {
      const config = {
        ...data.config,
        ...patch,
      }

      onChange(node.id, {
        ...data,
        config,
        subtitle: `${config.duration} ${config.unit}`,
      })
    }

    return (
      <>
        <label className="config-field">
          <span>Duration</span>
          <input
            type="number"
            min="1"
            value={data.config.duration}
            onChange={(event) =>
              update({
                duration: Number(event.target.value),
              })
            }
          />
        </label>

        <label className="config-field">
          <span>Unit</span>
          <select
            value={data.config.unit}
            onChange={(event) =>
              update({
                unit: event.target.value as DelayConfig['unit'],
              })
            }
          >
            <option value="seconds">Seconds</option>
            <option value="minutes">Minutes</option>
          </select>
        </label>
      </>
    )
  }

  return (
    <aside className="config-panel">
      <div className="config-header">
        <div>
          <span>{data.category}</span>
          <strong>{data.title}</strong>
        </div>

        <button
          type="button"
          className="config-close"
          onClick={onClose}
          aria-label="Close node configuration"
        >
          ×
        </button>
      </div>

      <div className="config-body">
        <div className="config-node-id">
          <span>NODE ID</span>
          <code>{node.id}</code>
        </div>

        {renderFields()}
      </div>
    </aside>
  )
}

export default NodeConfigPanel
