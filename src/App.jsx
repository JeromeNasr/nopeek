import { useEffect, useRef } from 'react'
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import useEyeTracking from './hooks/useEyeTracking'
import Calibration from './pages/Calibration'
import Dashboard from './pages/Dashboard'
import Home from './pages/Home'
import Login from './pages/Login'
import TypingTest from './pages/TypingTest'

const navLinks = [
  { to: '/', label: 'Home', end: true },
  { to: '/type', label: 'Type' },
  { to: '/calibrate', label: 'Calibrate' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/login', label: 'Login' },
]

function Navbar() {
  return (
    <header className="border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-sm">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <NavLink
          to="/"
          className="text-lg font-bold tracking-tight text-white transition hover:text-emerald-400"
        >
          NoPeek
        </NavLink>

        <ul className="flex items-center gap-1 sm:gap-2">
          {navLinks.map(({ to, label, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  [
                    'rounded-md px-3 py-2 text-sm font-medium transition',
                    isActive
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200',
                  ].join(' ')
                }
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}

function TypingTestRoute() {
  const { peekCount, eyeDiscipline, isLookingDown } = useEyeTracking()

  return (
    <TypingTest
      peeks={peekCount}
      eyeDiscipline={eyeDiscipline}
      isLookingDown={isLookingDown}
    />
  )
}

function WebcamPreview() {
  const videoRef = useRef(null)

  useEffect(() => {
    if (!window.webgazer) return

    let interval = null

    window.webgazer.showVideoPreview(false)

    function attachStream() {
      const webgazerVideo = document.getElementById('webgazerVideoFeed')
      if (webgazerVideo?.srcObject && videoRef.current) {
        videoRef.current.srcObject = webgazerVideo.srcObject
        return true
      }
      return false
    }

    Promise.resolve(window.webgazer.begin()).then(() => {
      if (!attachStream()) {
        interval = setInterval(() => {
          if (attachStream()) {
            clearInterval(interval)
            interval = null
          }
        }, 200)
      }
    })

    return () => {
      if (interval) clearInterval(interval)
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
    }
  }, [])

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      aria-label="Webcam preview"
      className="fixed bottom-4 right-4 z-50 h-28 w-36 -scale-x-100 rounded-lg border border-zinc-700 bg-zinc-900 object-cover shadow-lg shadow-black/40"
    />
  )
}

function AppContent() {
  const location = useLocation()
  const isTypingRoute = location.pathname === '/type'

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <Navbar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/type" element={<TypingTestRoute />} />
          <Route path="/calibrate" element={<Calibration />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </main>
      {isTypingRoute && <WebcamPreview />}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}
