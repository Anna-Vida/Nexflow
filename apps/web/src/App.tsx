import { Route, Routes } from 'react-router'
import LandingPage from './pages/LandingPage'
import WorkspacePage from './pages/WorkspacePage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/workspace" element={<WorkspacePage />} />
    </Routes>
  )
}

export default App
