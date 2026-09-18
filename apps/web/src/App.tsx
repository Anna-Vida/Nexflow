import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import DashboardPage from './pages/DashboardPage'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import WorkspacePage from './pages/WorkspacePage'
import { getSessionUser } from './workflow/authApi'

// The dashboard and workspace read owner-scoped resources, so the session is
// verified before either page mounts.
function RequireSession({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'signed-in' | 'signed-out'>('checking')

  useEffect(() => {
    let active = true
    void getSessionUser()
      .then((user) => {
        if (active) setState(user ? 'signed-in' : 'signed-out')
      })
      .catch(() => {
        if (active) setState('signed-out')
      })
    return () => {
      active = false
    }
  }, [])

  if (state === 'checking') {
    return <div className="session-gate">Checking your session…</div>
  }

  return state === 'signed-in' ? <>{children}</> : <Navigate to="/login" replace />
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<RequireSession><DashboardPage /></RequireSession>} />
      <Route path="/workspace" element={<RequireSession><WorkspacePage /></RequireSession>} />
      <Route path="/workspace/:workflowId" element={<RequireSession><WorkspacePage /></RequireSession>} />
    </Routes>
  )
}

export default App
