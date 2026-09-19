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

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
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

const SLIDES = [
  {
    title: 'Automate Workflows,\nScale Reliably',
    subtitle: 'Webhooks, scheduled crons, and crash-resilient executions.',
  },
  {
    title: 'Build the Flow,\nRun the System',
    subtitle: 'Visual automation crafted for clarity, precision, and reliable execution.',
  },
  {
    title: 'Workspaces Built\nFor Real Systems',
    subtitle: 'Idempotent HTTP steps, crash leases, and live queue subscriptions.',
  },
]

function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<'signin' | 'signup'>('signup')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [agreeTerms, setAgreeTerms] = useState(true)
  const [activeSlide, setActiveSlide] = useState(0)
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

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % SLIDES.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    if (mode === 'signup' && !agreeTerms) {
      setError('Please agree to the Terms & Conditions to create an account.')
      return
    }

    setPending(true)
    setError(null)

    try {
      if (mode === 'signup') {
        const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()
        await signUpRemote(email.trim(), password, fullName)
      } else {
        await logInRemote(email.trim(), password)
      }

      navigate('/dashboard', { replace: true })
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Could not complete sign in.')
    } finally {
      setPending(false)
    }
  }

  function startGoogleOAuth() {
    setError(null)
    window.location.assign('/api/auth/oauth/google')
  }

  return (
    <div className="auth-preview-page">
      <div className="auth-glass-container">
        {/* Left Side: Showcase Visual Hero */}
        <aside className="auth-left-showcase">
          <div className="auth-hero-backdrop" />

          <div className="auth-showcase-header">
            <Link to="/" className="auth-logo-badge">
              <span className="auth-logo-mark">
                <i />
                <i />
              </span>
              <span className="auth-logo-text">NexFlow</span>
            </Link>

            <Link to="/" className="auth-back-btn">
              Back to website <span>→</span>
            </Link>
          </div>

          <div className="auth-showcase-bottom">
            <h2 className="auth-hero-title">
              {SLIDES[activeSlide].title}
            </h2>
            <p className="auth-hero-subtitle">
              {SLIDES[activeSlide].subtitle}
            </p>

            <div className="auth-hero-dots">
              {SLIDES.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  aria-label={`Slide ${index + 1}`}
                  className={`auth-dot ${index === activeSlide ? 'active' : ''}`}
                  onClick={() => setActiveSlide(index)}
                />
              ))}
            </div>
          </div>
        </aside>

        {/* Right Side: Interactive Form */}
        <main className="auth-right-panel">
          <div className="auth-form-card">
            <div className="auth-title-row">
              <h1>{mode === 'signup' ? 'Create an account' : 'Welcome back'}</h1>
              <p className="auth-switch-link">
                {mode === 'signup' ? (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      className="auth-link-button"
                      onClick={() => {
                        setMode('signin')
                        setError(null)
                      }}
                    >
                      Log in
                    </button>
                  </>
                ) : (
                  <>
                    Don&apos;t have an account?{' '}
                    <button
                      type="button"
                      className="auth-link-button"
                      onClick={() => {
                        setMode('signup')
                        setError(null)
                      }}
                    >
                      Sign up
                    </button>
                  </>
                )}
              </p>
            </div>

            <form className="auth-main-form" onSubmit={submit}>
              {mode === 'signup' && (
                <div className="auth-name-grid">
                  <div className="auth-input-group">
                    <input
                      id="auth-first-name"
                      type="text"
                      placeholder="First name"
                      autoComplete="given-name"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </div>
                  <div className="auth-input-group">
                    <input
                      id="auth-last-name"
                      type="text"
                      placeholder="Last name"
                      autoComplete="family-name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="auth-input-group">
                <input
                  id="auth-email"
                  type="email"
                  placeholder="Email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="auth-input-group auth-password-group">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                  minLength={mode === 'signup' ? 12 : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>

              {mode === 'signup' && (
                <label className="auth-checkbox-row">
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                  />
                  <span className="auth-custom-check" aria-hidden="true">
                    <svg viewBox="0 0 12 10" fill="none">
                      <path d="M1 5l3.5 3.5L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="auth-checkbox-label">
                    I agree to the <a href="#terms" onClick={(e) => e.preventDefault()}>Terms &amp; Conditions</a>
                  </span>
                </label>
              )}

              {error && (
                <div className="auth-status-banner error" role="alert">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="auth-primary-action-btn"
                disabled={pending}
              >
                {pending
                  ? 'Please wait…'
                  : mode === 'signup'
                    ? 'Create account'
                    : 'Sign in'}
              </button>
            </form>

            <div className="auth-separator-divider">
              <span className="auth-sep-line" />
              <span className="auth-sep-text">
                {mode === 'signup' ? 'Or register with' : 'Or sign in with'}
              </span>
              <span className="auth-sep-line" />
            </div>

            <div className="auth-social-row">
              <button
                type="button"
                className="auth-social-btn google"
                onClick={startGoogleOAuth}
              >
                <span className="auth-social-icon">
                  <GoogleIcon />
                </span>
                Google
              </button>

              <button
                type="button"
                className="auth-social-btn apple"
                onClick={() => {
                  setError('Apple Sign-In is coming soon. Please use Google or Email.')
                }}
              >
                <span className="auth-social-icon apple-icon">
                  <svg viewBox="0 0 170 170" fill="currentColor">
                    <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.66-7.85-11.9-14.42-6.19-9.55-10.9-20.2-14.12-31.96-3.23-11.75-4.84-22.99-4.84-33.7 0-14.12 3.63-26.04 10.9-35.76 7.27-9.72 16.5-14.72 27.7-15.01 4.78 0 10.37 1.34 16.78 4.02 6.4 2.68 10.3 4.12 11.68 4.34 2.01-.44 6.16-2.02 12.44-4.75 6.28-2.73 11.74-3.9 16.38-3.5 12.19.88 22.06 5.56 29.62 14.05-10.73 6.53-15.98 15.68-15.76 27.46.22 9.3 3.86 17.06 10.91 23.29 7.06 6.23 15.22 9.87 24.49 10.9-2.01 6.09-4.53 12.28-7.56 18.57zM119.22 33.7c0-7.38 2.62-14.28 7.86-20.7 5.24-6.42 11.85-10.75 19.82-13 1.08 7.38-.85 14.18-5.78 20.4-4.93 6.21-11.53 10.64-19.8 13.3-.33-.66-1.1-1.66-2.1-3.00z" />
                  </svg>
                </span>
                Apple
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default LoginPage
