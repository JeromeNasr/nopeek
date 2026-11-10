import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, ProgressBar } from '../components/ui.jsx'
import { useTraining } from '../data/trainingContext.js'
import { buildDailyPlan } from '../training/dailyPlan.js'
import { summarizeHistory } from '../training/dashboard.js'
import { specToParams } from '../training/practiceSpec.js'
import { cx } from '../lib/cx.js'

const STEPS = [
  { to: '/learn', name: 'Learn', text: 'A six-stage path from the home row to real-world text. You advance by hitting accuracy and speed targets.' },
  { to: '/practice', name: 'Practice', text: 'Drills generated from your own mistakes, slow letter pairs and the keys you look down for.' },
  { to: '/test', name: 'Test', text: 'A fast, distraction-free test with a gliding caret, live stats and a ghost of your own pace.' },
  { to: '/analyze', name: 'Analyze', text: 'Problem keys, finger groups, rhythm and eye tracking — measured data only.' },
  { to: '/improve', name: 'Improve', text: 'Ranked recommendations with the evidence behind them, and goals checked against real runs.' },
]

const DEMO = 'trust your fingers and keep your eyes on the screen'

/** Decorative self-typing line for the hero. */
function HeroDemo() {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const id = setInterval(() => setN((v) => (v > DEMO.length + 14 ? 0 : v + 1)), 95)
    return () => clearInterval(id)
  }, [])
  const shown = Math.min(n, DEMO.length)
  return (
    <div aria-hidden="true" className="card mx-auto mt-12 max-w-2xl px-6 py-5 text-left font-mono text-lg sm:text-xl" style={{ '--i': 4 }}>
      <span className="text-zinc-100">{DEMO.slice(0, shown)}</span>
      <span className="inline-block h-[1.2em] w-[2.5px] translate-y-[0.2em] rounded bg-emerald-400 shadow-[0_0_12px_var(--accent)]" />
      <span className="text-zinc-600">{DEMO.slice(shown)}</span>
    </div>
  )
}

function actionTo(a) {
  if (a.type === 'lesson') return `/learn/${a.lessonId}`
  if (a.type === 'practice') return `/practice?${specToParams(a.spec)}`
  return a.to
}

function Today() {
  const { sessions, progress, rec, loading } = useTraining()
  const summary = useMemo(() => summarizeHistory(sessions), [sessions])
  const plan = useMemo(() => buildDailyPlan({ sessions, rec, progress }), [sessions, rec, progress])
  if (loading) return <div className="skeleton mx-auto mt-10 h-56 max-w-2xl" />
  if (sessions.length === 0) {
    return (
      <div className="mt-10 flex animate-fade-up flex-col items-center justify-center gap-3 sm:flex-row" style={{ animationDelay: '180ms' }}>
        <Button to="/learn/1.1" size="lg">Start lesson 1</Button>
        <Button to="/test" variant="secondary" size="lg">I can already type — test me</Button>
      </div>
    )
  }
  const nextStep = plan.steps.find((s) => !s.done)
  return (
    <Card className="mx-auto mt-10 max-w-2xl text-left" i={3}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-white">Today&apos;s plan</h2>
          <p className="text-sm text-zinc-500">About 5 minutes, built from your recent results.</p>
        </div>
        <div className="flex gap-2">
          {summary.streak > 0 && <Badge tone="good">{summary.streak}-day streak</Badge>}
          <Badge>{Math.round(summary.avgWpm)} WPM avg</Badge>
        </div>
      </div>
      <div className="mt-4"><ProgressBar value={plan.doneCount} max={plan.steps.length} label="Today's plan progress" /></div>
      <ol className="mt-4 space-y-2">
        {plan.steps.map((s, i) => (
          <li key={s.id}>
            <Link to={actionTo(s.action)} className={cx('btn flex items-center gap-3 rounded-xl border px-4 py-3', s.done ? 'border-emerald-500/20 bg-emerald-500/[0.05]' : s === nextStep ? 'border-white/15 bg-white/[0.05] hover:border-emerald-500/40' : 'border-white/[0.06] hover:border-white/15')}>
              <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold', s.done ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/[0.07] text-zinc-400')}>{s.done ? '✓' : i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className={cx('block truncate text-sm font-medium', s.done ? 'text-zinc-400 line-through decoration-zinc-600' : 'text-zinc-100')}>{s.title}</span>
                <span className="block truncate text-xs text-zinc-500">{s.detail}</span>
              </span>
              <span className="shrink-0 text-xs text-zinc-600">{s.minutes} min</span>
            </Link>
          </li>
        ))}
      </ol>
      {plan.doneCount === plan.steps.length && <p className="mt-4 text-sm text-emerald-300">Done for today. Anything more is a bonus.</p>}
    </Card>
  )
}

export default function Home() {
  return (
    <div>
      <section className="mx-auto max-w-4xl px-6 pb-16 pt-16 text-center sm:pt-24">
        <p className="mb-5 inline-flex animate-fade-up items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1 text-xs font-medium text-zinc-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_var(--accent)]" /> Touch typing, taught properly
        </p>
        <h1 className="mx-auto max-w-3xl animate-fade-up text-5xl font-semibold leading-[1.05] tracking-tight text-white sm:text-7xl" style={{ animationDelay: '60ms' }}>
          Type without <span className="gradient-text">looking down.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl animate-fade-up text-lg leading-relaxed text-zinc-400" style={{ animationDelay: '120ms' }}>
          TouchType teaches real finger technique, finds the exact keys you struggle with — and the ones you peek at — and turns them into short daily drills. Optional eye tracking runs entirely in your browser.
        </p>
        <Today />
        <HeroDemo />
      </section>

      <section className="border-t border-white/[0.05] px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-white sm:text-3xl">One loop that actually makes you better</h2>
          <ol className="stagger mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((s, i) => (
              <li key={s.to}>
                <Link to={s.to} className="card card-hover block h-full p-5" style={{ animation: 'none' }}>
                  <p className="gradient-text text-xs font-semibold">0{i + 1}</p>
                  <h3 className="mt-1 text-lg font-semibold text-white">{s.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{s.text}</p>
                </Link>
              </li>
            ))}
          </ol>

          <div className="stagger mt-12 grid gap-3 md:grid-cols-3">
            <div className="card p-5" style={{ animation: 'none' }}><h3 className="font-medium text-white">Knows what you peek at</h3><p className="mt-2 text-sm leading-relaxed text-zinc-400">Eye tracking is matched to your keystrokes, so you see which keys make your eyes drop — then drill exactly those.</p></div>
            <div className="card p-5" style={{ animation: 'none' }}><h3 className="font-medium text-white">Honest and private</h3><p className="mt-2 text-sm leading-relaxed text-zinc-400">Camera frames never leave your browser. When tracking can&apos;t tell where you&apos;re looking it says so, instead of guessing.</p></div>
            <div className="card p-5" style={{ animation: 'none' }}><h3 className="font-medium text-white">Fits your keyboard</h3><p className="mt-2 text-sm leading-relaxed text-zinc-400">QWERTY, Dvorak, Colemak, AZERTY, QWERTZ; ANSI or ISO; 60% to full-size. Lessons use the keys you really have.</p></div>
          </div>
        </div>
      </section>
    </div>
  )
}
