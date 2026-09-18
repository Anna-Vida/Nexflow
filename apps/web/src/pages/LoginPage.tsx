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
      <header className="auth-nav">
        <Link to="/" className="auth-brand">
          <span className="auth-logo">
            <span />
            <span />
          </span>
          NexFlow
        </Link>
      </header>

      <main className="auth-main">
        <section className="auth-card">
          <span className="auth-eyebrow">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </span>

          <h1>
            {mode === 'signin' ? 'Sign in to NexFlow' : 'Start building workflows'}
          </h1>

          <p className="auth-subtitle">
            Workflows, executions, and webhook tokens belong to your account. Your session is kept in an
            HttpOnly cookie.
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
              <>
                <label htmlFor="auth-name">Name</label>
                <input
                  id="auth-name"
                  type="text"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </>
            )}

            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />

            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={12}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <small>At least 12 characters.</small>

            {error && (
              <div className="auth-error" role="alert">
                {error}
              </div>
            )}

            <button className="auth-submit" type="submit" disabled={pending}>
              {pending ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </section>
      </main>
    </div>
  )
}

export default LoginPage
