import { Link } from 'react-router-dom'
import { Badge, Button, Card } from '../components/ui.jsx'
import { useTraining } from '../data/trainingContext.js'
import { LESSON_BY_ID } from '../training/lessons.js'
import { summarizeHistory } from '../training/dashboard.js'
import { useMemo } from 'react'

const STEPS = [
  { to: '/learn', name: 'Learn', text: 'A six-stage path from the home row to real-world typing. You advance by hitting accuracy and speed targets.' },
  { to: '/practice', name: 'Practice', text: 'Drills generated from your own mistakes, slow letter pairs and rhythm – not the same list for everyone.' },
  { to: '/test', name: 'Test', text: 'A fast, distraction-free typing test with live WPM, accuracy and a smooth caret.' },
  { to: '/analyze', name: 'Analyze', text: 'Measured results only: problem keys, finger groups, rhythm and eye tracking, with unmeasured data kept separate.' },
  { to: '/improve', name: 'Improve', text: 'Ranked recommendations with the evidence behind them, plus goals checked against real sessions.' },
]

function Continue() {
  const { sessions, progress, rec, loading } = useTraining()
  const summary = useMemo(() => summarizeHistory(sessions), [sessions])
  if (loading) return null
  const next = progress.nextLessonId ? LESSON_BY_ID[progress.nextLessonId] : null
  const top = rec.recs.find((r) => r.action?.type === 'practice')
  if (sessions.length === 0) {
    return (
      <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button to="/learn/1.1" className="px-6 py-3">Start Lesson 1</Button>
        <Button to="/test" variant="secondary" className="px-6 py-3">I can already type – take a test</Button>
      </div>
    )
  }
  return (
    <Card className="mx-auto mt-10 max-w-2xl text-left">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium text-white">Welcome back</h2>
        <div className="flex gap-2">{summary.streak > 0 && <Badge tone="good">{summary.streak}-day streak</Badge>}<Badge>{Math.round(summary.avgWpm)} WPM avg</Badge></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        {next && <Button to={`/learn/${next.id}`}>Continue: {next.id} {next.title}</Button>}
        {top && <Button variant="secondary" to="/improve">Suggested: {top.title.split(':')[0]}</Button>}
        <Button variant="ghost" to="/analyze">View analytics</Button>
      </div>
    </Card>
  )
}

export default function Home() {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <section className="relative mx-auto max-w-4xl px-6 pb-16 pt-16 text-center sm:pt-24">
        <p className="mb-4 inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-emerald-400">Touch-typing trainer</p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-6xl">
          Learn to touch type.<br /><span className="text-emerald-400">Trust your fingers.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400">
          NoPeek teaches correct finger technique, finds the keys and transitions you actually struggle with, and — if you choose — uses your webcam, locally in your browser, to show how often your eyes leave the screen.
        </p>
        <Continue />
      </section>

      <section className="relative border-t border-zinc-800/80 bg-zinc-900/30 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-white">One loop: learn, practise, test, analyse, improve</h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((s, i) => (
              <li key={s.to}>
                <Link to={s.to} className="block h-full rounded-xl border border-zinc-800 bg-zinc-950/60 p-5 transition hover:border-zinc-600">
                  <p className="text-xs text-zinc-600">{i + 1}</p>
                  <h3 className="mt-1 text-lg font-semibold text-white">{s.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{s.text}</p>
                </Link>
              </li>
            ))}
          </ol>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            <Card><h3 className="font-medium text-white">Honest eye tracking</h3><p className="mt-2 text-sm text-zinc-400">Personal calibration separates looking at the screen, at the keyboard, away, or unknown. When the camera can&apos;t tell, we say so – unmeasured time is never counted as good.</p></Card>
            <Card><h3 className="font-medium text-white">Private by design</h3><p className="mt-2 text-sm text-zinc-400">Camera frames are processed in your browser and never uploaded. Only summary numbers are saved.</p></Card>
            <Card><h3 className="font-medium text-white">Fits your keyboard</h3><p className="mt-2 text-sm text-zinc-400">QWERTY, Dvorak, Colemak, AZERTY, QWERTZ; ANSI or ISO; 60% to full-size. Lessons use the keys you actually have.</p></Card>
          </div>
        </div>
      </section>
    </div>
  )
}
