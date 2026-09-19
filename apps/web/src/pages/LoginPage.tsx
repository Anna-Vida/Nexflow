import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { getSessionUser, logInRemote, signUpRemote } from '../workflow/authApi'
import './LoginPage.css'

function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void getSessionUser()
      .then((user) => {
        if (active && user) navigate('/dashboard', { replace: true })
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [navigate])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)

    try {
      if (mode === 'signup') await signUpRemote(email.trim(), password, name.trim())
      else await logInRemote(email.trim(), password)

      navigate('/dashboard', { replace: true })
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Could not sign in.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth-shell">
        <aside className="auth-showcase">
          <Link to="/" className="auth-back-link">
            <span>←</span>
            Back to NexFlow
          </Link>

          <div className="auth-showcase-copy">
            <div className="auth-kicker">
              <span />
              VISUAL AUTOMATION PLATFORM
            </div>

            <h1>
              Build the flow.
              <span>Run the system.</span>
            </h1>

            <p>
              Design workflows visually, execute them through a real backend,
              and monitor every run from one reliable workspace.
            </p>

            <div className="auth-proof-list">
              <div>
                <i>01</i>
                <span>
                  <strong>Real workflow execution</strong>
                  <small>Webhooks, schedules, retries, and background jobs</small>
                </span>
              </div>

              <div>
                <i>02</i>
                <span>
                  <strong>Crash-safe runtime</strong>
                  <small>Leases, heartbeats, idempotency, and reconciliation</small>
                </span>
              </div>

              <div>
                <i>03</i>
                <span>
                  <strong>Private by account</strong>
                  <small>Session auth and per-user workflow ownership</small>
                </span>
              </div>
            </div>
          </div>

          <div className="auth-visual" aria-hidden="true">
            <div className="auth-visual-grid" />
            <div className="auth-visual-orbit auth-visual-orbit-one" />
            <div className="auth-visual-orbit auth-visual-orbit-two" />

            <div className="auth-visual-core">
              <span>NF</span>
            </div>

            <div className="auth-visual-node auth-visual-node-one">
              <i>↗</i>
              <span>
                <small>TRIGGER</small>
                <strong>Webhook</strong>
              </span>
            </div>

            <div className="auth-visual-node auth-visual-node-two">
              <i>◇</i>
              <span>
                <small>LOGIC</small>
                <strong>Condition</strong>
              </span>
            </div>

            <div className="auth-visual-node auth-visual-node-three">
              <i>⚡</i>
              <span>
                <small>ACTION</small>
                <strong>HTTP request</strong>
              </span>
            </div>

            <div className="auth-visual-line auth-visual-line-one" />
            <div className="auth-visual-line auth-visual-line-two" />
            <div className="auth-visual-line auth-visual-line-three" />

            <div className="auth-status-card">
              <span className="auth-status-dot" />
              <div>
                <small>WORKER STATUS</small>
                <strong>Healthy · ready</strong>
              </div>
            </div>
          </div>
        </aside>

        <main className="auth-main">
          <section className="auth-card">
            <div className="auth-card-head">
              <div className="auth-mini-brand">
                <span className="auth-mini-mark">
                  <i />
                  <i />
                </span>
                <span>NexFlow</span>
              </div>

              <span className="auth-security-note">Secure session</span>
            </div>

            <span className="auth-eyebrow">
              {mode === 'signin' ? 'WELCOME BACK' : 'CREATE YOUR ACCOUNT'}
            </span>

            <h2>
              {mode === 'signin' ? 'Sign in to your workspace' : 'Start building with NexFlow'}
            </h2>

            <p className="auth-subtitle">
              {mode === 'signin'
                ? 'Continue where you left off and access your workflows, executions, and schedules.'
                : 'Create your account to save workflows, monitor executions, and manage automation securely.'}
            </p>

            <div className="auth-tabs">
              <button
                type="button"
                className={mode === 'signin' ? 'auth-tab active' : 'auth-tab'}
                onClick={() => {
                  setMode('signin')
                  setError(null)
                }}
              >
                Sign in
              </button>

              <button
                type="button"
                className={mode === 'signup' ? 'auth-tab active' : 'auth-tab'}
                onClick={() => {
                  setMode('signup')
                  setError(null)
                }}
              >
                Create account
              </button>
            </div>

            <form className="auth-form" onSubmit={submit}>
              {mode === 'signup' && (
                <div className="auth-field">
                  <label htmlFor="auth-name">Name</label>
                  <div className="auth-input-wrap">
                    <span>◎</span>
                    <input
                      id="auth-name"
                      type="text"
                      autoComplete="name"
                      required
                      placeholder="Anna Vida"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="auth-field">
                <label htmlFor="auth-email">Email</label>
                <div className="auth-input-wrap">
                  <span>✉</span>
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
              </div>

              <div className="auth-field">
                <label htmlFor="auth-password">Password</label>
                <div className="auth-input-wrap">
                  <span>⌁</span>
                  <input
                    id="auth-password"
                    type="password"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    required
                    minLength={12}
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                <small>Use at least 12 characters.</small>
              </div>

              {error && (
                <div className="auth-error" role="alert">
                  {error}
                </div>
              )}

              <button className="auth-submit" type="submit" disabled={pending}>
                {pending
                  ? 'Please wait…'
                  : mode === 'signin'
                    ? 'Sign in to NexFlow'
                    : 'Create NexFlow account'}
                {!pending && <span>→</span>}
              </button>
            </form>

            <div className="auth-card-footer">
              <span>HttpOnly session cookie</span>
              <span>•</span>
              <span>scrypt password hashing</span>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

export default LoginPage
