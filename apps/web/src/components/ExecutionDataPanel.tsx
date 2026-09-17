import {
  useMemo,
  useState,
} from 'react'

type Props = {
  open: boolean
  inputText: string
  inputError: string | null

  variables: Record<
    string,
    unknown
  >

  isRunning: boolean

  onClose: () => void
  onInputChange: (
    value: string,
  ) => void

  onFormat: () => void
  onReset: () => void
}

type FlatVariable = {
  path: string
  value: unknown
}

function flattenValue(
  value: unknown,
  prefix: string,
  result: FlatVariable[],
) {
  if (
    typeof value === 'object' &&
    value !== null
  ) {
    const entries =
      Array.isArray(value)
        ? value.map(
            (item, index) =>
              [
                String(index),
                item,
              ] as const,
          )
        : Object.entries(value)

    if (
      entries.length === 0 &&
      prefix
    ) {
      result.push({
        path: prefix,
        value,
      })

      return
    }

    for (
      const [key, child]
      of entries
    ) {
      const childPath =
        prefix
          ? `${prefix}.${key}`
          : key

      flattenValue(
        child,
        childPath,
        result,
      )
    }

    return
  }

  if (prefix) {
    result.push({
      path: prefix,
      value,
    })
  }
}

function displayValue(
  value: unknown,
) {
  if (
    typeof value === 'string'
  ) {
    return value
  }

  return JSON.stringify(
    value,
  )
}

function ExecutionDataPanel({
  open,
  inputText,
  inputError,
  variables,
  isRunning,
  onClose,
  onInputChange,
  onFormat,
  onReset,
}: Props) {
  const [
    activeTab,
    setActiveTab,
  ] = useState<
    'input' | 'variables'
  >('input')

  const flattened =
    useMemo(() => {
      const result:
        FlatVariable[] = []

      flattenValue(
        variables,
        '',
        result,
      )

      return result
    }, [variables])

  if (!open) {
    return null
  }

  return (
    <div className="data-panel-overlay">
      <aside className="data-panel">
        <div className="data-panel-header">
          <div>
            <span>
              TEST EXECUTION
            </span>

            <strong>
              Workflow data
            </strong>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close test data"
          >
            ×
          </button>
        </div>

        <div className="data-panel-tabs">
          <button
            className={
              activeTab ===
              'input'
                ? 'active'
                : ''
            }
            onClick={() =>
              setActiveTab(
                'input',
              )
            }
          >
            Input
          </button>

          <button
            className={
              activeTab ===
              'variables'
                ? 'active'
                : ''
            }
            onClick={() =>
              setActiveTab(
                'variables',
              )
            }
          >
            Variables

            {isRunning && (
              <span className="data-live-dot" />
            )}
          </button>
        </div>

        {activeTab ===
        'input' ? (
          <div className="data-panel-body">
            <div className="data-panel-description">
              This JSON becomes
              the workflow input
              when you click Run.
            </div>

            <textarea
              className="test-input-editor"
              spellCheck={false}
              value={inputText}
              onChange={(
                event,
              ) =>
                onInputChange(
                  event.target
                    .value,
                )
              }
            />

            {inputError && (
              <div className="test-input-error">
                {inputError}
              </div>
            )}

            <div className="data-panel-actions">
              <button
                onClick={
                  onFormat
                }
              >
                Format JSON
              </button>

              <button
                onClick={
                  onReset
                }
              >
                Reset
              </button>
            </div>

            <div className="data-panel-tip">
              Variables from this
              object can be used
              as
              {' '}
              <code>
                {'{{amount}}'}
              </code>
              ,
              {' '}
              <code>
                {'{{message}}'}
              </code>
              ,
              and similar paths.
            </div>
          </div>
        ) : (
          <div className="data-panel-body">
            <div className="data-panel-description">
              Available workflow
              variables. Click a
              variable to copy its
              template.
            </div>

            {flattened.length ===
            0 ? (
              <div className="variables-empty">
                Run the workflow
                to inspect its
                runtime context.
              </div>
            ) : (
              <div className="variable-list">
                {flattened.map(
                  (variable) => (
                    <button
                      type="button"
                      className="variable-row"
                      key={
                        variable.path
                      }
                      onClick={() => {
                        void navigator
                          .clipboard
                          ?.writeText(
                            `{{${variable.path}}}`,
                          )
                      }}
                    >
                      <div>
                        <code>
                          {'{{'}
                          {
                            variable.path
                          }
                          {'}}'}
                        </code>

                        <span>
                          {
                            variable.path
                          }
                        </span>
                      </div>

                      <strong>
                        {displayValue(
                          variable.value,
                        )}
                      </strong>
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}

export default ExecutionDataPanel
