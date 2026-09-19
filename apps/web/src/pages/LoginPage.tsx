import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { getSessionUser, logInRemote, signUpRemote } from '../workflow/authApi'
import './LoginPage.css'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.38Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.39l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.05v2.59A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.4 13.94A6 6 0 0 1 6.08 12c0-.67.12-1.33.32-1.94V7.47H3.05A10 10 0 0 0 2 12c0 1.61.38 3.13 1.05 4.53l3.35-2.59Z" />
      <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.95 5.47l3.35 2.59C7.19 7.7 9.4 5.94 12 5.94Z" />
    </svg>
  )
}

function oauthMessage(value: string | null) {
  if (!value) return null
  if (value === 'access_denied') return 'OAuth sign-in was cancelled.'
  if (value === 'invalid_state') return 'The sign-in request expired. Please try again.'
  if (value === 'google_not_configured') return 'Google sign-in is not configured yet.'
  return 'OAuth sign-in could not be completed. Please try again.'
}

function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(oauthMessage(searchParams.get('oauth')))

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

  function startGoogleOAuth() {
    setError(null)
    window.location.assign('/api/auth/oauth/google')
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

            <div className="auth-oauth-grid">
              <button
                type="button"
                className="auth-oauth-button"
                onClick={startGoogleOAuth}
              >
                <span className="auth-provider-icon auth-google-icon">
                  <GoogleIcon />
                </span>
                Continue with Google
              </button>
            </div>

            <div className="auth-divider">
              <span />
              <small>OR CONTINUE WITH EMAIL</small>
              <span />
            </div>

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
              <span>•</span>
              <span>OAuth 2.0</span>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

export default LoginPage
