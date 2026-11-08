import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import CameraThumb from './components/CameraThumb.jsx'
import EyeStatus from './components/EyeStatus.jsx'
import { ErrorBoundary, Spinner } from './components/ui.jsx'
import { TrainingProvider } from './data/TrainingContext.jsx'
import { useAuth } from './data/useAuth.js'
import Home from './pages/Home.jsx'

// Everything except the landing page is split out so first load stays small.
const Learn = lazy(() => import('./pages/Learn.jsx'))
const LessonPage = lazy(() => import('./pages/Learn.jsx').then((m) => ({ default: m.LessonPage })))
const FingerGuide = lazy(() => import('./pages/Learn.jsx').then((m) => ({ default: m.FingerGuide })))
const Practice = lazy(() => import('./pages/Practice.jsx'))
const Test = lazy(() => import('./pages/Test.jsx'))
const Analyze = lazy(() => import('./pages/Analyze.jsx'))
const Improve = lazy(() => import('./pages/Improve.jsx'))
const Setup = lazy(() => import('./pages/Setup.jsx'))
const Login = lazy(() => import('./pages/Login.jsx'))

const navLinks = [
  { to: '/learn', label: 'Learn' },
  { to: '/practice', label: 'Practice' },
  { to: '/test', label: 'Test' },
  { to: '/analyze', label: 'Analyze' },
  { to: '/improve', label: 'Improve' },
]

const linkCls = ({ isActive }) =>
  ['rounded-md px-3 py-2 text-sm font-medium transition', isActive ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'].join(' ')

function Navbar() {
  const { user } = useAuth()
  return (
    <header className="border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-sm">
      <nav aria-label="Main" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <NavLink to="/" className="text-lg font-bold tracking-tight text-white transition hover:text-emerald-400">NoPeek</NavLink>
        <ul className="order-3 flex w-full items-center gap-1 overflow-x-auto sm:order-none sm:w-auto">
          {navLinks.map(({ to, label }) => <li key={to}><NavLink to={to} className={linkCls}>{label}</NavLink></li>)}
        </ul>
        <div className="flex items-center gap-1">
          <EyeStatus compact className="mr-2" />
          <NavLink to="/setup" className={linkCls}>Setup</NavLink>
          <NavLink to="/login" className={linkCls}>{user ? 'Account' : 'Sign in'}</NavLink>
        </div>
      </nav>
    </header>
  )
}

function Shell() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <a href="#main" className="skip-link">Skip to content</a>
      <Navbar />
      <main id="main" className="flex-1">
        <ErrorBoundary key={pathname}>
          <Suspense fallback={<div className="mx-auto max-w-5xl px-6 py-10"><Spinner /></div>}>
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
          </Suspense>
        </ErrorBoundary>
      </main>
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
