import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import CameraThumb from './components/CameraThumb.jsx'
import EyeStatus from './components/EyeStatus.jsx'
import { ErrorBoundary, Spinner } from './components/ui.jsx'
import { TrainingProvider } from './data/TrainingContext.jsx'
import { useAuth } from './data/useAuth.js'
import './lib/prefs.js'
import Home from './pages/Home.jsx'

// Everything except the landing page is split out so first load stays small.
const pages = {
  learn: () => import('./pages/Learn.jsx'),
  practice: () => import('./pages/Practice.jsx'),
  test: () => import('./pages/Test.jsx'),
  analyze: () => import('./pages/Analyze.jsx'),
  improve: () => import('./pages/Improve.jsx'),
  setup: () => import('./pages/Setup.jsx'),
  login: () => import('./pages/Login.jsx'),
}
const Learn = lazy(pages.learn)
const LessonPage = lazy(() => pages.learn().then((m) => ({ default: m.LessonPage })))
const FingerGuide = lazy(() => pages.learn().then((m) => ({ default: m.FingerGuide })))
const Practice = lazy(pages.practice)
const Test = lazy(pages.test)
const Analyze = lazy(pages.analyze)
const Improve = lazy(pages.improve)
const Setup = lazy(pages.setup)
const Login = lazy(pages.login)

const navLinks = [
  { to: '/learn', label: 'Learn', key: 'learn' },
  { to: '/practice', label: 'Practice', key: 'practice' },
  { to: '/test', label: 'Test', key: 'test' },
  { to: '/analyze', label: 'Analyze', key: 'analyze' },
  { to: '/improve', label: 'Improve', key: 'improve' },
]

const linkCls = ({ isActive }) =>
  ['btn relative rounded-lg px-3 py-1.5 text-sm font-medium', isActive ? 'bg-white/[0.08] text-white' : 'text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100'].join(' ')

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" className="h-7 w-7" aria-hidden="true">
        <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--accent)" /><stop offset="1" stopColor="var(--accent-2)" /></linearGradient></defs>
        <rect width="64" height="64" rx="16" fill="rgb(255 255 255 / 0.06)" />
        <path d="M16 20h32M32 20v26" stroke="url(#lg)" strokeWidth="7" strokeLinecap="round" fill="none" />
        <rect x="42" y="38" width="6" height="9" rx="3" fill="url(#lg)" />
      </svg>
      <span className="text-[1.05rem] font-semibold tracking-tight text-white">Touch<span className="gradient-text">Type</span></span>
    </span>
  )
}

function Navbar() {
  const { user } = useAuth()
  return (
    <header className="chrome sticky top-0 z-40 border-b border-white/[0.06] bg-zinc-950/70 backdrop-blur-xl">
      <nav aria-label="Main" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <NavLink to="/" aria-label="TouchType home" className="btn rounded-lg"><Logo /></NavLink>
        <ul className="order-3 flex w-full items-center gap-0.5 overflow-x-auto sm:order-none sm:w-auto">
          {navLinks.map(({ to, label, key }) => (
            <li key={to}><NavLink to={to} className={linkCls} onMouseEnter={pages[key]} onFocus={pages[key]}>{label}</NavLink></li>
          ))}
        </ul>
        <div className="flex items-center gap-0.5">
          <EyeStatus compact className="mr-2" />
          <NavLink to="/setup" className={linkCls} onMouseEnter={pages.setup}>Setup</NavLink>
          <NavLink to="/login" className={linkCls} onMouseEnter={pages.login}>{user ? 'Account' : 'Sign in'}</NavLink>
        </div>
      </nav>
    </header>
  )
}

function Shell() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  // warm the most likely next pages once the browser is idle
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((f) => setTimeout(f, 1500))
    const id = idle(() => { pages.test(); pages.learn() })
    return () => (window.cancelIdleCallback ?? clearTimeout)(id)
  }, [])
  return (
    <div className="flex min-h-screen flex-col text-zinc-100">
      <a href="#main" className="skip-link">Skip to content</a>
      <Navbar />
      <main id="main" className="flex-1">
        <ErrorBoundary key={pathname}>
          <Suspense fallback={<div className="mx-auto max-w-5xl px-6 py-10"><Spinner /></div>}>
            <div key={pathname} className="page-enter">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/learn" element={<Learn />} />
                <Route path="/learn/fingers" element={<FingerGuide />} />
                <Route path="/learn/:id" element={<LessonPage />} />
                <Route path="/practice" element={<Practice />} />
                <Route path="/test" element={<Test />} />
                <Route path="/analyze" element={<Analyze />} />
                <Route path="/improve" element={<Improve />} />
                <Route path="/setup" element={<Setup />} />
                <Route path="/login" element={<Login />} />
                {/* routes from earlier versions */}
                <Route path="/type" element={<Navigate to="/test" replace />} />
                <Route path="/dashboard" element={<Navigate to="/analyze" replace />} />
                <Route path="/calibrate" element={<Navigate to="/setup" replace />} />
                <Route path="*" element={<div className="mx-auto max-w-xl px-6 py-24 text-center"><h1 className="text-2xl font-semibold text-white">Page not found</h1></div>} />
              </Routes>
            </div>
          </Suspense>
        </ErrorBoundary>
      </main>
      <footer className="chrome border-t border-white/[0.05] px-6 py-6 text-center text-xs text-zinc-600">
        TouchType · your camera never leaves this device · <NavLink to="/setup" className="underline hover:text-zinc-400">privacy &amp; settings</NavLink>
      </footer>
      {['/test', '/practice'].includes(pathname) || pathname.startsWith('/learn/') ? <CameraThumb /> : null}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <TrainingProvider>
        <Shell />
      </TrainingProvider>
    </BrowserRouter>
  )
}
