import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, EmptyState, Notice, PageHeader, ProgressBar, Spinner } from '../components/ui.jsx'
import { readGoals, saveGoals } from '../data/repo.js'
import { useTraining } from '../data/trainingContext.js'
import { GOAL_TYPES, evaluateGoal, suggestGoals } from '../training/goals.js'
import { specToParams } from '../training/practiceSpec.js'

function actionLink(a) {
  if (!a) return null
  if (a.type === 'lesson') return { to: `/learn/${a.lessonId}`, label: 'Open lesson' }
  if (a.type === 'practice') return { to: `/practice?${specToParams(a.spec)}`, label: a.label ?? 'Start drill' }
  if (a.type === 'route') return { to: a.to, label: 'Open' }
  return null
}

function Goals() {
  const { sessions, progress } = useTraining()
  const [goals, setGoals] = useState(readGoals)
  const update = (next) => { setGoals(next); saveGoals(next) }
  const suggestions = useMemo(() => suggestGoals({ sessions, passedLessons: progress.passedCount }).filter((s) => !goals.some((g) => g.type === s.type && !evaluateGoal(g, { sessions, passedLessons: progress.passedCount }).done)), [sessions, progress.passedCount, goals])

  return (
    <section aria-labelledby="goals-h" className="mt-10">
      <h2 id="goals-h" className="text-lg font-semibold text-white">Goals</h2>
      <p className="mb-4 mt-1 text-sm text-zinc-400">Each goal is checked against your recorded sessions – progress is never estimated.</p>
      {goals.length === 0 ? <EmptyState title="No goals yet">Pick one below to give your practice a measurable target.</EmptyState> : (
        <ul className="space-y-3">
          {goals.map((g, i) => {
            const ev = evaluateGoal(g, { sessions, passedLessons: progress.passedCount })
            const def = GOAL_TYPES[g.type]
            return (
              <li key={`${g.type}-${i}`}>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-white">{def.desc(g)}</p>
                    <div className="flex items-center gap-2">
                      {ev.done ? <Badge tone="good">Achieved</Badge> : ev.needsData ? <Badge>Needs more data</Badge> : <Badge tone="info">{Math.round(ev.pct)}%</Badge>}
                      <Button variant="ghost" size="sm" onClick={() => update(goals.filter((_, j) => j !== i))} aria-label="Remove goal">Remove</Button>
                    </div>
                  </div>
                  <div className="mt-3"><ProgressBar value={ev.pct} label="Goal progress" tone={ev.done ? 'brand' : 'info'} /></div>
                  <p className="mt-2 text-xs text-zinc-500">{ev.current == null ? 'No qualifying sessions yet.' : `Currently ${Math.round(ev.current * 10) / 10} ${def.unit} of ${g.target}.`}</p>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
      {suggestions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {suggestions.map((s) => <Button key={s.type} variant="secondary" size="sm" onClick={() => update([...goals, s])}>+ {GOAL_TYPES[s.type].desc(s)}</Button>)}
        </div>
      )}
    </section>
  )
}

export default function Improve() {
  const { rec, loading, sessions } = useTraining()
  if (loading) return <div className="mx-auto max-w-4xl px-6 py-10"><Spinner /></div>
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <PageHeader title="Improve" subtitle="Personalised recommendations, ranked by how strongly your data supports them, and goals to track real progress." />

      <h2 className="mb-3 text-lg font-semibold text-white">Recommended for you</h2>
      <ol className="space-y-3">
        {rec.recs.map((r, i) => {
          const link = actionLink(r.action)
          return (
            <li key={r.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">#{i + 1}</p>
                    <h3 className="font-medium text-white">{r.title}</h3>
                    <p className="mt-1 text-sm text-zinc-400">{r.reason}</p>
                    {r.evidence?.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-zinc-500">{r.evidence.map((e) => <li key={e}>{e}</li>)}</ul>}
                    {r.trend && (
                      <p className="mt-2 text-sm">
                        <Badge tone={r.trend.status === 'improving' ? 'good' : r.trend.status === 'worsening' ? 'warn' : 'neutral'}>{r.trend.status}</Badge>
                        <span className="ml-2 text-zinc-500">error rate {Math.round(r.trend.older * 100)}% → {Math.round(r.trend.recent * 100)}% (older vs recent runs)</span>
                      </p>
                    )}
                  </div>
                  {link && <Button to={link.to} size="sm">{link.label}</Button>}
                </div>
              </Card>
            </li>
          )
        })}
      </ol>

      {sessions.length > 0 && !rec.weak?.enoughData && (
        <Notice className="mt-4" title="Weakness detection is still warming up">Per-key, finger and letter-pair analysis needs about 150 recorded key presses. Until then recommendations rely on overall accuracy, rhythm and eye data.</Notice>
      )}

      <Goals />

      <details className="mt-10 rounded-xl border border-zinc-800 p-4 text-sm text-zinc-400">
        <summary className="cursor-pointer font-medium text-zinc-200">How recommendations are made</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>A key is flagged only if its error rate – after allowing for small samples – is clearly above <em>your own</em> average, with at least 10 presses.</li>
          <li>Slow keys and letter pairs are compared with your own median timing, so a slow typist is not flagged for being slow overall.</li>
          <li>Finger statistics group errors by the finger that <em>should</em> press each key. Browsers cannot see which finger was used.</li>
          <li>Trends compare the older half of your recent runs with the newer half and are hidden when either side has too little data.</li>
          <li>Eye-tracking advice uses only runs where the camera reliably tracked you.</li>
          <li>Practice material is generated deterministically from these numbers (<Link className="underline" to="/practice">Practice</Link>).</li>
        </ul>
      </details>
    </div>
  )
}
