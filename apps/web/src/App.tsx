import { Route, Routes } from 'react-router'
import DashboardPage from './pages/DashboardPage'
import LandingPage from './pages/LandingPage'
import WorkspacePage from './pages/WorkspacePage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/workspace" element={<WorkspacePage />} />
      <Route path="/workspace/:workflowId" element={<WorkspacePage />} />
    </Routes>
  )
}

export default App
