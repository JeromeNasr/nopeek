import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import ThemeProvider from './context/ThemeProvider'
import useEyeTracking from './hooks/useEyeTracking'
import useStreak from './hooks/useStreak'
import useTheme from './hooks/useTheme'
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

function navLinkClass({ isActive }) {
  return [
    'block rounded-md px-3 py-2 text-sm font-medium transition',
    isActive
      ? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-white'
      : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200',
  ].join(' ')
}

function StreakCounter() {
  const { streak, authenticated } = useStreak()

  if (!authenticated) return null

  return (
    <span
      title={`${streak} consecutive ${streak === 1 ? 'day' : 'days'} of typing`}
      className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400"
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2c.4 3.2-1.2 4.8-2.6 6.2C8 9.6 6.8 10.9 6.8 13a5.2 5.2 0 1 0 10.4 0c0-2.6-1.4-4.3-2.6-5.7-.4 1-1 1.7-1.8 2.1.6-2.7-.2-5.4-2.8-7.4Z" />
      </svg>
      <span className="tabular-nums">{streak}</span>
      <span className="sr-only">day streak</span>
      <span aria-hidden="true">d</span>
    </span>
  )
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="rounded-md border border-zinc-300 p-2 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
    >
      {isDark ? (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
        </svg>
      ) : (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
        </svg>
      )}
    </button>
  )
}

function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="border-b border-zinc-200 bg-white/90 backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-950/90">
      <nav className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <NavLink
          to="/"
          className="text-lg font-bold tracking-tight text-zinc-900 transition hover:text-emerald-600 dark:text-white dark:hover:text-emerald-400"
        >
          NoPeek
        </NavLink>

        <ul className="hidden items-center gap-1 md:flex">
          {navLinks.map(({ to, label, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} className={navLinkClass}>
                {label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <StreakCounter />
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-expanded={menuOpen}
            aria-label="Toggle navigation menu"
            className="rounded-md border border-zinc-300 p-2 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 md:hidden dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d={menuOpen ? 'M6 18 18 6M6 6l12 12' : 'M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5'}
              />
            </svg>
          </button>
        </div>
      </nav>

      {menuOpen && (
        <ul className="space-y-1 border-t border-zinc-200 px-4 py-3 md:hidden dark:border-zinc-800/80">
          {navLinks.map(({ to, label, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} className={navLinkClass} onClick={() => setMenuOpen(false)}>
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
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
      className="fixed bottom-4 right-4 z-50 h-20 w-28 -scale-x-100 rounded-lg border border-zinc-300 bg-zinc-100 object-cover shadow-lg shadow-black/20 sm:h-28 sm:w-36 dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-black/40"
    />
  )
}

function AppContent() {
  const location = useLocation()
  const isTypingRoute = location.pathname === '/type'

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <Navbar />
      <main className="flex flex-1 flex-col">
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
    <ThemeProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ThemeProvider>
  )
}
