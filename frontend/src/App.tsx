import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Analysis from './pages/Analysis'
import Footer from './components/Footer'

function App() {
  return (
    <Router
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <div className="min-h-screen flex flex-col">
        <div className="flex-1">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/analysis/:analysisId" element={<Analysis />} />
          </Routes>
        </div>
        <Footer />
      </div>
    </Router>
  )
}

export default App

