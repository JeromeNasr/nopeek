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
  { to: '/', label: 'Type', key: 'test' },
  { to: '/learn', label: 'Learn', key: 'learn' },
  { to: '/practice', label: 'Practice', key: 'practice' },
  { to: '/analyze', label: 'Progress', key: 'analyze' },
  { to: '/improve', label: 'Coach', key: 'improve' },
]

const pillCls = ({ isActive }) =>
  ['btn rounded-full px-3.5 py-1.5 text-sm', isActive ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-100'].join(' ')

export function Logo() {
  return (
    <span className="font-serif text-[1.35rem] font-semibold leading-none tracking-tight text-white">
      touchtype<span className="text-emerald-400">.</span>
    </span>
  )
}

function Icon({ d }) {
  return <svg viewBox="0 0 24 24" className="h-[1.15rem] w-[1.15rem]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
}

function Navbar() {
  const { user } = useAuth()
  const iconCls = ({ isActive }) => ['btn flex h-9 w-9 items-center justify-center rounded-full', isActive ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-100'].join(' ')
  return (
    <header className="chrome">
      <nav aria-label="Main" className="mx-auto grid max-w-5xl grid-cols-[1fr_auto_1fr] items-center gap-y-3 px-6 py-5 max-sm:grid-cols-[1fr_auto]">
        <NavLink to="/" aria-label="TouchType home" className="justify-self-start rounded-md"><Logo /></NavLink>
        <ul className="flex items-center gap-0.5 rounded-full bg-zinc-900 p-1 max-sm:order-3 max-sm:col-span-2 max-sm:w-full max-sm:justify-between">
          {navLinks.map(({ to, label, key }) => (
            <li key={to}><NavLink to={to} end={to === '/'} className={pillCls} onMouseEnter={pages[key]} onFocus={pages[key]}>{label}</NavLink></li>
          ))}
        </ul>
        <div className="flex items-center justify-self-end">
          <EyeStatus compact className="mr-2" />
          <NavLink to="/setup" className={iconCls} onMouseEnter={pages.setup} aria-label="Settings" title="Settings">
            <Icon d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-2.5a7.7 7.7 0 0 0 0-1l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.7 7.7 0 0 0 0 1l-2 1.6 2 3.4 2.4-1c.5.4 1.1.7 1.7 1l.4 2.5h4l.4-2.5c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.4-2-1.6Z" />
          </NavLink>
          <NavLink to="/login" className={iconCls} onMouseEnter={pages.login} aria-label={user ? 'Account' : 'Sign in'} title={user ? 'Account' : 'Sign in'}>
            <Icon d="M20 21a8 8 0 1 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
          </NavLink>
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
        <span>Your camera never leaves this device.</span>
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
