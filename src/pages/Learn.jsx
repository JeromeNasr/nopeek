import { useCallback, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Keyboard, { FingerLegend } from '../components/Keyboard.jsx'
import SessionRunner from '../components/SessionRunner.jsx'
import { Badge, Button, Card, EmptyState, PageHeader, ProgressBar, Spinner } from '../components/ui.jsx'
import { cx } from '../lib/cx.js'
import { useTraining } from '../data/trainingContext.js'
import { generateLessonWords } from '../training/generator.js'
import { LESSON_BY_ID, STAGES, lessonsOfStage } from '../training/lessons.js'
import { FINGERS, FINGER_ORDER, FINGER_OF_CODE, profileFingerOfCode } from '../training/keyboard.js'

export default function Learn() {
  const { progress, loading, profile } = useTraining()
  if (loading) return <div className="mx-auto max-w-5xl px-6 py-10"><Spinner label="Loading your progress…" /></div>
  const pct = Math.round((progress.passedCount / progress.total) * 100)
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <PageHeader title="Learn" subtitle="A structured path from your first home-row keys to real-world typing. You advance by hitting measured accuracy and speed targets, not by finishing lessons.">
        {progress.nextLessonId && <Button to={`/learn/${progress.nextLessonId}`}>Continue: lesson {progress.nextLessonId}</Button>}
      </PageHeader>

      <Card className="mb-8">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-300">{progress.passedCount} of {progress.total} lessons passed</span>
          <span className="tabular-nums text-zinc-500">{pct}%</span>
        </div>
        <div className="mt-2"><ProgressBar value={progress.passedCount} max={progress.total} label="Curriculum progress" /></div>
        {!profile.setupComplete && (
          <p className="mt-3 text-sm text-zinc-400">Typing on a non-US or non-QWERTY keyboard? <Link className="text-emerald-400 underline" to="/setup">Set your layout</Link> so lessons use the right keys.</p>
        )}
      </Card>

      <Link to="/learn/fingers" className="card card-hover mb-8 flex items-center justify-between p-5">
        <div>
          <p className="font-medium text-white">Finger map &amp; hand position</p>
          <p className="mt-1 text-sm text-zinc-400">Which finger owns every key, where to rest your hands, and finger-specific drills.</p>
        </div>
        <span aria-hidden="true" className="text-zinc-500">→</span>
      </Link>

      <div className="space-y-8">
        {STAGES.map((stage) => {
          const lessons = lessonsOfStage(stage.id)
          const done = lessons.filter((l) => progress.byLesson[l.id]?.passed).length
          return (
            <section key={stage.id} aria-labelledby={`stage-${stage.id}`}>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 id={`stage-${stage.id}`} className="text-lg font-semibold text-white">Stage {stage.id} · {stage.title}</h2>
                <span className="text-xs text-zinc-500">{done}/{lessons.length}</span>
              </div>
              <p className="mb-3 text-sm text-zinc-500">{stage.blurb}</p>
              <ul className="stagger grid gap-2 sm:grid-cols-2">
                {lessons.map((l) => {
                  const p = progress.byLesson[l.id]
                  const isNext = progress.nextLessonId === l.id
                  return (
                    <li key={l.id}>
                      <Link
                        to={`/learn/${l.id}`}
                        className={cx('card-hover flex h-full items-start justify-between gap-3 rounded-xl border p-4',
                          isNext ? 'border-emerald-500/50 bg-emerald-500/[0.06]' : 'border-white/[0.07] bg-white/[0.02]', !p.unlocked && 'opacity-60')}
                      >
                        <div>
                          <p className="text-sm font-medium text-zinc-100"><span className="text-zinc-500">{l.id}</span> {l.title}</p>
                          <p className="mt-1 text-xs text-zinc-500">{l.summary}</p>
                          <p className="mt-2 text-xs text-zinc-600">Target {l.pass.minAccuracy}% · {l.pass.minWpm} WPM{p.attempts ? ` · best ${Math.round(p.bestWpm)} WPM / ${Math.round(p.bestAccuracy)}%` : ''}</p>
                        </div>
                        <div className="shrink-0">
                          {p.passed ? <Badge tone="good">Passed</Badge> : isNext ? <Badge tone="info">Next</Badge> : !p.unlocked ? <Badge>Test out</Badge> : <Badge>Open</Badge>}
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function LessonActions({ check, nextId }) {
  return (
    <>
      {check?.passed && nextId && <Button variant="secondary" to={`/learn/${nextId}`}>Next lesson ({nextId})</Button>}
      <Button variant="ghost" to="/learn">All lessons</Button>
    </>
  )
}

export function LessonPage() {
  const { id } = useParams()
  return <LessonInner key={id} id={id} />
}

function LessonInner({ id }) {
  const lesson = LESSON_BY_ID[id]
  const { profile, progress } = useTraining()
  const [started, setStarted] = useState(false)

  const prior = progress.byLesson[id]?.attempts ?? 0
  const makeRun = useCallback(
    (attempt) => {
      if (!lesson) return { words: ['x'] }
      const seed = `${prior}:${attempt}`
      const words = generateLessonWords(lesson, { layout: profile.layout, seed })
      if (lesson.timeLimit) {
        return { words, timeLimitMs: lesson.timeLimit * 1000, supplier: (n) => generateLessonWords(lesson, { layout: profile.layout, seed: `${seed}:${Math.random()}`, count: n }) }
      }
      return { words }
    },
    [lesson, profile.layout, prior],
  )

  if (!lesson) {
    return <div className="mx-auto max-w-3xl px-6 py-16"><EmptyState title="Lesson not found" action={<Button to="/learn">Back to Learn</Button>} /></div>
  }
  const nextId = LESSON_BY_ID[Object.keys(LESSON_BY_ID)[Object.keys(LESSON_BY_ID).indexOf(id) + 1]]?.id
  const p = progress.byLesson[id]

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-zinc-500"><Link className="hover:text-zinc-300" to="/learn">Learn</Link> / Lesson {lesson.id}</nav>
      {!started ? (
        <>
          <PageHeader title={`${lesson.id} · ${lesson.title}`} subtitle={lesson.summary} />
          <Card className="mb-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">How to do it</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-zinc-300">{lesson.teach.map((t) => <li key={t}>{t}</li>)}</ul>
          </Card>
          {lesson.showKeyboard && (
            <Card className="mb-6">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">Keys in this lesson</h2>
              <Keyboard profile={profile} highlight={lesson.keys} target={lesson.focus} />
              <p className="mt-3 text-xs text-zinc-500">Bright keys are practised here; the glowing ones are new. Colour and the L5…R5 badge show which finger owns each key.</p>
            </Card>
          )}
          <Card className="mb-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">To pass</h2>
            <ul className="mt-2 text-sm text-zinc-300">
              <li>Accuracy at least <strong>{lesson.pass.minAccuracy}%</strong></li>
              <li>Speed at least <strong>{lesson.pass.minWpm} WPM</strong></li>
              {lesson.pass.minConsistency != null && <li>Consistency at least <strong>{lesson.pass.minConsistency}</strong></li>}
              {lesson.pass.minKeyConsistency != null && <li>Rhythm score at least <strong>{lesson.pass.minKeyConsistency}</strong></li>}
              {lesson.pass.maxBackspaceRate != null && <li>Corrections under <strong>{Math.round(lesson.pass.maxBackspaceRate * 100)}%</strong> of keystrokes</li>}
            </ul>
            {p?.attempts > 0 && <p className="mt-2 text-xs text-zinc-500">{p.attempts} previous attempt{p.attempts === 1 ? '' : 's'} · best {Math.round(p.bestWpm)} WPM at {Math.round(p.bestAccuracy)}%</p>}
          </Card>
          <Button onClick={() => setStarted(true)} autoFocus>Start lesson</Button>
        </>
      ) : (
        <SessionRunner
          makeRun={makeRun}
          lesson={lesson}
          showKeyboard={lesson.showKeyboard}
          guideMode={lesson.showKeyboard ? (lesson.stage <= 1 ? 'always' : 'smart') : 'off'}
          meta={{ mode: 'lesson', modeKey: `lesson-${lesson.id}`, lessonId: lesson.id, title: `Lesson ${lesson.id}` }}
          Actions={LessonActions}
          actionsProps={{ nextId }}
        />
      )}
    </div>
  )
}

export function FingerGuide() {
  const { profile } = useTraining()
  const [focus, setFocus] = useState(null)
  const byFinger = useMemo(() => {
    const m = Object.fromEntries(FINGER_ORDER.map((f) => [f, []]))
    for (const code of Object.keys(FINGER_OF_CODE)) {
      const f = profileFingerOfCode(profile, code)
      if (f && m[f]) m[f].push(code)
    }
    return m
  }, [profile])

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-zinc-500"><Link className="hover:text-zinc-300" to="/learn">Learn</Link> / Finger map</nav>
      <PageHeader title="Finger map" subtitle="Each finger owns a column of keys and returns to its home key after every press. Select a finger to see its keys." />
      <Card className="mb-6">
        <FingerLegend focusFinger={focus} onFocus={setFocus} />
        <div className="mt-5"><Keyboard profile={profile} focusFinger={focus} /></div>
        <p className="mt-4 text-xs text-zinc-500">Layout: {profile.layout}, {profile.physical.toUpperCase()}, {profile.formFactor}. Change these in <Link className="underline" to="/setup">Setup</Link>. The map follows the standard touch-typing assignment plus any per-key overrides you set.</p>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="font-medium text-white">Hand position</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-300">
            <li>Left fingers rest on <strong>A S D F</strong>, right fingers on <strong>J K L ;</strong> (the bumps on F and J guide your index fingers).</li>
            <li>Thumbs hover over the space bar; either thumb works.</li>
            <li>Wrists neutral and floating. Keep elbows near 90° and shoulders loose.</li>
            <li>After every reach, return the finger to its home key.</li>
            <li>Capitals: hold Shift with the pinky on the <em>opposite</em> hand.</li>
          </ul>
        </Card>
        <Card>
          <h2 className="font-medium text-white">Common placement mistakes</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-300">
            <li>Using the middle finger for keys the index should cover (T, Y, G, H, B, N).</li>
            <li>Avoiding the pinkies, then reaching across with a stronger finger.</li>
            <li>Drifting off the home row so keys feel "in the wrong place".</li>
            <li>Typing numbers with one finger instead of moving the whole hand.</li>
          </ul>
          <p className="mt-3 rounded-md bg-zinc-800/60 p-3 text-xs text-zinc-400">A browser only learns <em>which key</em> was pressed, never <em>which finger</em> pressed it. TouchType therefore reports errors on "keys assigned to a finger", and rhythm patterns that suggest a placement problem – not a detected finger.</p>
        </Card>
      </div>
      <h2 className="mb-3 mt-8 text-lg font-semibold text-white">Finger drills</h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {FINGER_ORDER.filter((f) => byFinger[f].length > 1).map((f) => (
          <li key={f}>
            <Link to={`/practice?kind=finger&codes=${byFinger[f].join(',')}&label=${encodeURIComponent(FINGERS[f].label)}`} className="card card-hover block p-3" style={{ animation: 'none' }}>
              <p className="text-sm font-medium text-white">{FINGERS[f].label}</p>
              <p className="mt-1 text-xs text-zinc-500">{byFinger[f].length} keys</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
