import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import CameraThumb from './components/CameraThumb.jsx'
import EyeStatus from './components/EyeStatus.jsx'
import { ErrorBoundary, Spinner } from './components/ui.jsx'
import { TrainingProvider } from './data/TrainingContext.jsx'
import { useAuth } from './data/useAuth.js'
import './lib/prefs.js'
import Home from './pages/Test.jsx'

// Everything except the landing page is split out so first load stays small.
const pages = {
  learn: () => import('./pages/Learn.jsx'),
  practice: () => import('./pages/Practice.jsx'),
  test: () => Promise.resolve(),
  analyze: () => import('./pages/Analyze.jsx'),
  improve: () => import('./pages/Improve.jsx'),
  setup: () => import('./pages/Setup.jsx'),
  login: () => import('./pages/Login.jsx'),
}
const Learn = lazy(pages.learn)
const LessonPage = lazy(() => pages.learn().then((m) => ({ default: m.LessonPage })))
const FingerGuide = lazy(() => pages.learn().then((m) => ({ default: m.FingerGuide })))
const Practice = lazy(pages.practice)
const Analyze = lazy(pages.analyze)
const Improve = lazy(pages.improve)
const Setup = lazy(pages.setup)
const Login = lazy(pages.login)

const navLinks = [
  { to: '/', label: 'type', key: 'test' },
  { to: '/learn', label: 'learn', key: 'learn' },
  { to: '/practice', label: 'practice', key: 'practice' },
  { to: '/analyze', label: 'stats', key: 'analyze' },
  { to: '/improve', label: 'coach', key: 'improve' },
]

const linkCls = ({ isActive }) =>
  ['btn rounded-md px-2.5 py-1.5 text-sm', isActive ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-100'].join(' ')

export function Logo() {
  return (
    <span className="flex items-baseline font-mono text-[1.05rem] font-medium tracking-tight text-white">
      touchtype<span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] bg-emerald-400" aria-hidden="true" />
    </span>
  )
}

function Navbar() {
  const { user } = useAuth()
  return (
    <header className="chrome">
      <nav aria-label="Main" className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-5">
        <NavLink to="/" aria-label="TouchType home" className="rounded-md"><Logo /></NavLink>
        <ul className="order-3 -mx-2.5 flex w-full items-center gap-0.5 overflow-x-auto sm:order-none sm:mx-0 sm:w-auto sm:flex-1">
          {navLinks.map(({ to, label, key }) => (
            <li key={to}><NavLink to={to} end={to === '/'} className={linkCls} onMouseEnter={pages[key]} onFocus={pages[key]}>{label}</NavLink></li>
          ))}
        </ul>
        <div className="flex items-center gap-0.5">
          <EyeStatus compact className="mr-1.5" />
          <NavLink to="/setup" className={linkCls} onMouseEnter={pages.setup}>settings</NavLink>
          <NavLink to="/login" className={linkCls} onMouseEnter={pages.login}>{user ? 'account' : 'sign in'}</NavLink>
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
    const id = idle(() => { pages.learn(); pages.practice() })
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
                <Route path="/test" element={<Navigate to="/" replace />} />
                <Route path="/analyze" element={<Analyze />} />
                <Route path="/improve" element={<Improve />} />
                <Route path="/setup" element={<Setup />} />
                <Route path="/login" element={<Login />} />
                {/* routes from earlier versions */}
                <Route path="/type" element={<Navigate to="/" replace />} />
                <Route path="/dashboard" element={<Navigate to="/analyze" replace />} />
                <Route path="/calibrate" element={<Navigate to="/setup" replace />} />
                <Route path="*" element={<div className="mx-auto max-w-xl px-6 py-24 text-center"><h1 className="text-2xl font-semibold text-white">Page not found</h1></div>} />
              </Routes>
            </div>
          </Suspense>
        </ErrorBoundary>
      </main>
      <footer className="chrome mx-auto flex w-full max-w-5xl flex-wrap justify-between gap-2 px-6 py-6 text-xs text-zinc-600">
        <span>Camera video is processed on this device and never uploaded.</span>
        <span>Typing statistics by <a className="underline hover:text-zinc-400" href="https://github.com/monkeytypegame/monkeytype" target="_blank" rel="noreferrer">Monkeytype</a> (GPL-3.0) · <NavLink to="/setup" className="underline hover:text-zinc-400">settings</NavLink></span>
      </footer>
      {['/', '/practice'].includes(pathname) || pathname.startsWith('/learn/') ? <CameraThumb /> : null}
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
