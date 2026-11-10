import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import SessionRunner from '../components/SessionRunner.jsx'
import { Badge, Button, Card, EmptyState, PageHeader, Spinner } from '../components/ui.jsx'
import { useTraining } from '../data/trainingContext.js'
import { generatePracticeWords } from '../training/generator.js'
import { FINGERS, FINGER_OF_CODE, FINGER_ORDER } from '../training/keyboard.js'
import { specFromParams, specToParams } from '../training/practiceSpec.js'

const GENERIC = [
  { kind: 'accuracy', title: 'Accuracy', desc: 'Common words, typed slowly and cleanly.' },
  { kind: 'speed', title: 'Speed', desc: 'The most frequent short words, at pace.' },
  { kind: 'rhythm', title: 'Rhythm', desc: 'Even-length words that encourage a steady beat.' },
  { kind: 'numbers', title: 'Numbers', desc: 'Digits mixed into text.' },
  { kind: 'punctuation', title: 'Punctuation', desc: 'Commas, stops, quotes and brackets.' },
  { kind: 'shift', title: 'Capitals', desc: 'Shift with the opposite pinky.' },
  { kind: 'visual', title: 'Eyes up', desc: 'Familiar words – the only challenge is keeping your eyes on the screen.' },
]

function Runner({ spec }) {
  const { profile } = useTraining()
  const [seed] = useState(() => Math.random().toString(36).slice(2))
  const navigate = useNavigate()
  const makeRun = useCallback(
    (attempt) => ({ words: generatePracticeWords(spec, { layout: profile.layout, seed: `${seed}:${attempt}`, count: 40 }) }),
    [spec, profile.layout, seed],
  )
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-emerald-400">Practice</p>
          <h1 className="text-xl font-semibold text-white">{spec.label ?? GENERIC.find((g) => g.kind === spec.kind)?.title ?? (spec.kind === 'keys' ? `Keys: ${spec.chars.join(' ').toUpperCase()}` : spec.kind === 'bigrams' ? `Pairs: ${spec.grams.join(', ')}` : 'Targeted drill')}</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/practice')}>← All drills</Button>
      </div>
      <SessionRunner
        makeRun={makeRun}
        meta={{ mode: 'practice', modeKey: `practice-${spec.kind}`, practiceKind: spec.kind, title: 'Practice results' }}
        showKeyboard={spec.kind === 'keys' || spec.kind === 'finger'}
        metronome={spec.kind === 'rhythm'}
      />
    </div>
  )
}

export default function Practice() {
  const [params, setParams] = useSearchParams()
  const { rec, loading, sessions } = useTraining()
  const [keysInput, setKeysInput] = useState('')
  const spec = useMemo(() => specFromParams(params), [params])

  if (spec) return <Runner key={params.toString()} spec={spec} />
  if (loading) return <div className="mx-auto max-w-5xl px-6 py-10"><Spinner /></div>

  const personalised = rec.recs.filter((r) => r.action?.type === 'practice')
  const start = (s) => setParams(specToParams(s))

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <PageHeader title="Practice" subtitle="Short drills built from your own mistakes, rhythm and eye data – generated deterministically from the numbers behind each recommendation." />

      <h2 className="mb-3 text-lg font-semibold text-white">For you</h2>
      {personalised.length === 0 ? (
        <EmptyState title={sessions.length ? 'No clear weakness found yet' : 'Nothing personalised yet'}>
          {sessions.length
            ? 'Your recent sessions do not show a weakness that is statistically supported. Keep practising and recommendations will appear when there is enough evidence.'
            : 'Complete a lesson or a test and TouchType will start finding patterns in your mistakes, rhythm and eye data.'}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {personalised.map((r) => (
            <li key={r.id}>
              <Card className="flex h-full flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium text-white">{r.title}</h3>
                  {r.trend?.status === 'improving' && <Badge tone="good">improving</Badge>}
                  {r.trend?.status === 'worsening' && <Badge tone="warn">worsening</Badge>}
                </div>
                <p className="mt-1 text-sm text-zinc-400">{r.reason}</p>
                {r.evidence?.length > 0 && <ul className="mt-2 space-y-0.5 text-xs text-zinc-500">{r.evidence.slice(0, 3).map((e) => <li key={e}>{e}</li>)}</ul>}
                <div className="mt-4 pt-1"><Button size="sm" onClick={() => start(r.action.spec)}>{r.action.label ?? 'Start drill'}</Button></div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-3 mt-10 text-lg font-semibold text-white">Focus drills</h2>
      <ul className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {GENERIC.map((g) => (
          <li key={g.kind}>
            <button type="button" onClick={() => start({ kind: g.kind })} className="card card-hover h-full w-full p-4 text-left" style={{ animation: 'none' }}>
              <p className="font-medium text-white">{g.title}</p>
              <p className="mt-1 text-sm text-zinc-500">{g.desc}</p>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Card>
          <h3 className="font-medium text-white">Choose keys</h3>
          <p className="mt-1 text-sm text-zinc-500">Type the letters you want to drill.</p>
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); const chars = [...new Set(keysInput.toLowerCase().replace(/[^a-z]/g, ''))]; if (chars.length) start({ kind: 'keys', chars }) }}>
            <input aria-label="Letters to practise" value={keysInput} onChange={(e) => setKeysInput(e.target.value)} placeholder="e.g. qzx" maxLength={12}
              className="w-full rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 font-mono text-sm outline-none focus:border-emerald-600" />
            <Button type="submit" size="sm" disabled={!/[a-z]/i.test(keysInput)}>Start</Button>
          </form>
        </Card>
        <Card>
          <h3 className="font-medium text-white">Finger drills</h3>
          <p className="mt-1 text-sm text-zinc-500">Words that lean on one finger's keys.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {FINGER_ORDER.filter((f) => f !== 'lt' && f !== 'rt').map((f) => (
              <Button key={f} variant="secondary" size="sm" onClick={() => start({ kind: 'finger', fingerCodes: Object.keys(FINGER_OF_CODE).filter((c) => FINGER_OF_CODE[c] === f), label: `${FINGERS[f].label} drill` })}>{FINGERS[f].short}</Button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
