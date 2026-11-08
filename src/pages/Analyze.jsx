import { Suspense, lazy, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, EmptyState, Notice, PageHeader, Spinner, Stat } from '../components/ui.jsx'
import { cx } from '../lib/cx.js'
import { describeEye } from '../eye/describe.js'
import { useTraining } from '../data/trainingContext.js'
import { useEye } from '../eye/useEye.js'
import { mean, median } from '../engine/stats.js'
import { narrative, summarizeHistory } from '../training/dashboard.js'
import { FINGERS, FINGER_ORDER, codeLabel } from '../training/keyboard.js'
import { LESSON_BY_ID } from '../training/lessons.js'

const ProgressChart = lazy(() => import('../components/ProgressChart.jsx'))

const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const fmtDateTime = (iso) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const fmtDuration = (s) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`)
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10)

const TRACK_BADGE = {
  measured: ['good', 'Measured'], partial: ['warn', 'Partial'], unavailable: ['warn', 'Unavailable'],
  disabled: ['neutral', 'Off'], uncalibrated: ['neutral', 'Not calibrated'], legacy: ['neutral', 'Not recorded'],
}

function Q({ title, tone, items, empty }) {
  return (
    <Card>
      <h3 className={cx('text-sm font-semibold uppercase tracking-wider', tone)}>{title}</h3>
      {items.length === 0 ? <p className="mt-3 text-sm text-zinc-500">{empty}</p> : (
        <ul className="mt-3 space-y-2.5">
          {items.map((i) => (
            <li key={i.text + i.evidence} className="text-sm">
              <p className="font-medium text-zinc-100">{i.text}</p>
              <p className="text-zinc-500">{i.evidence}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Table({ head, rows, empty }) {
  if (!rows.length) return <p className="text-sm text-zinc-500">{empty}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wider text-zinc-500"><tr>{head.map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-zinc-800/70">{rows.map((r, i) => <tr key={i} className="text-zinc-300">{r.map((c, j) => <td key={j} className="whitespace-nowrap py-2 pr-4 tabular-nums">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

export default function Analyze() {
  const t = useTraining()
  const eyeState = useEye()
  const [claiming, setClaiming] = useState(false)
  const [claimMsg, setClaimMsg] = useState(null)
  const { sessions, profile, rec, loading } = t

  const summary = useMemo(() => summarizeHistory(sessions), [sessions])
  const story = useMemo(() => narrative(summary, rec, profile), [summary, rec, profile])
  const layout = profile.layout

  const chartData = useMemo(() => sessions.slice(-60).map((s, i, arr) => ({
    label: fmtDate(s.created_at) + (arr.length > 20 ? '' : ` #${i + 1}`),
    wpm: r1(s.wpm), accuracy: r1(s.accuracy), consistency: r1(s.consistency),
  })), [sessions])
  const eyeData = useMemo(() => sessions.filter((s) => s.tracking?.status === 'measured' && s.tracking.discipline != null).slice(-60).map((s) => ({
    label: fmtDate(s.created_at), discipline: s.tracking.discipline, peeksPerMin: s.tracking.peeksPerMin,
  })), [sessions])

  const rhythm = useMemo(() => {
    const rs = sessions.slice(-15).map((s) => s.analysis?.rhythm).filter((r) => r?.enough)
    if (rs.length < 2) return null
    return {
      n: rs.length,
      medianMs: median(rs.map((r) => r.medianMs)),
      keyConsistency: mean(rs.map((r) => r.keyConsistency).filter((v) => v != null)),
      pauses: mean(rs.map((r) => r.longPauses ?? 0)),
      burstiness: mean(rs.map((r) => r.burstiness).filter((v) => v != null)),
    }
  }, [sessions])

  const lessonRows = useMemo(() => {
    const by = {}
    for (const s of sessions) if (s.lesson_id) (by[s.lesson_id] ??= []).push(s)
    return Object.entries(by).map(([id, list]) => {
      const first = list[0]
      const best = list.reduce((a, b) => (b.wpm > a.wpm ? b : a))
      return [`${id} ${LESSON_BY_ID[id]?.title ?? ''}`, list.length, `${Math.round(first.wpm)} → ${Math.round(best.wpm)}`, `${r1(first.accuracy)}% → ${r1(best.accuracy)}%`, list.some((s) => s.passed) ? <Badge key="p" tone="good">Passed</Badge> : <Badge key="n">In progress</Badge>]
    })
  }, [sessions])

  if (loading) return <div className="mx-auto max-w-6xl px-6 py-10"><Spinner label="Loading your sessions…" /></div>

  if (sessions.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        <PageHeader title="Analyze" subtitle="Measured performance, problem areas and eye-tracking results." />
        <EmptyState title="No sessions yet" action={<div className="flex justify-center gap-3"><Button to="/learn">Start Lesson 1</Button><Button variant="secondary" to="/test">Take a test</Button></div>}>
          Finish a lesson, drill or test and your results appear here. Nothing on this page is estimated – every figure comes from a session you typed.
        </EmptyState>
      </div>
    )
  }

  const w = rec.weak
  const e = summary.eye
  const eyeNow = describeEye(eyeState)
  const hasKeyData = w?.enoughData

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <PageHeader title="Analyze" subtitle="What you are doing well, what you are struggling with, what has improved, and what to practise next." />

      {t.cloudError && <Notice tone="warn" className="mb-4" title="Could not load your cloud history">{t.cloudError}. Showing sessions saved on this device.</Notice>}
      {t.signedIn && t.pendingLocal > 0 && (
        <Notice tone="info" className="mb-4" title={`${t.pendingLocal} session${t.pendingLocal === 1 ? '' : 's'} on this device aren't in your account`}>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span>They were recorded while you were signed out.</span>
            <Button size="sm" variant="secondary" disabled={claiming} onClick={async () => { setClaiming(true); const r = await t.claim(); setClaimMsg(`${r.uploaded} added${r.failed ? `, ${r.failed} failed` : ''}.`); setClaiming(false) }}>Add to my account</Button>
            {claimMsg && <span>{claimMsg}</span>}
          </div>
        </Notice>
      )}
      {!t.signedIn && <Notice tone="info" className="mb-4">You are not signed in, so history lives only on this device. <Link className="underline" to="/login">Sign in</Link> to keep it across devices.</Notice>}

      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Last WPM" value={Math.round(summary.currentWpm)} hint="most recent run" />
        <Stat label="Average WPM" value={Math.round(summary.avgWpm)} hint={`last ${Math.min(10, summary.sessions)} run${summary.sessions === 1 ? '' : 's'}`} />
        <Stat label="Best WPM" value={Math.round(summary.bestWpm)} />
        <Stat label="Accuracy" value={r1(summary.avgAccuracy)} unit="%" hint={`last ${Math.min(10, summary.sessions)} run${summary.sessions === 1 ? '' : 's'}`} tone={summary.avgAccuracy >= 96 ? 'good' : summary.avgAccuracy < 92 ? 'bad' : undefined} />
        <Stat label="Consistency" value={summary.avgConsistency == null ? null : Math.round(summary.avgConsistency)} unit="/100" hint="pace evenness" />
        <Stat label="Typing time" value={fmtDuration(summary.typingSeconds)} hint={`${summary.sessions} session${summary.sessions === 1 ? '' : 's'}`} />
        <Stat label="Practice streak" value={summary.streak} unit={summary.streak === 1 ? ' day' : ' days'} hint={`${summary.practiceDays} day${summary.practiceDays === 1 ? '' : 's'} practised`} />
        <Stat label="Visual discipline" value={e.avgDiscipline == null ? null : Math.round(e.avgDiscipline)} unit="%" hint={e.measuredSessions ? `${e.measuredSessions} tracked run${e.measuredSessions === 1 ? '' : 's'}` : 'no tracked runs yet'} />
      </section>

      <section aria-label="Summary" className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Q title="Doing well" tone="text-emerald-400" items={story.good} empty={story.insufficient ? 'Complete a few more runs to see patterns.' : 'Nothing stands out yet – keep going.'} />
        <Q title="Struggling with" tone="text-amber-400" items={story.bad} empty={story.insufficient ? 'Complete a few more runs to see patterns.' : 'No statistically supported weaknesses right now.'} />
        <Q title="Improved" tone="text-sky-400" items={story.improved} empty="Improvement is shown once you have enough runs to compare newer with older ones." />
        <Q title="Practise next" tone="text-violet-300" items={story.next} empty="Recommendations appear after a few sessions." />
      </section>
      <p className="mt-3 text-sm"><Link className="text-emerald-400 underline" to="/improve">See full recommendations and goals →</Link></p>

      <Card className="mt-8">
        <h2 className="text-lg font-semibold text-white">Progress over time</h2>
        <p className="mb-3 mt-1 text-sm text-zinc-400">Speed and accuracy for your last {chartData.length} session{chartData.length === 1 ? '' : 's'}.</p>
        <Suspense fallback={<Spinner />}>
          <ProgressChart data={chartData} lines={[{ key: 'wpm', name: 'WPM', color: '#34d399' }, { key: 'accuracy', name: 'Accuracy %', color: '#60a5fa', axis: 'right' }]} rightDomain={[70, 100]} />
        </Suspense>
        {summary.trend && <p className="mt-3 text-sm text-zinc-400">Newer half vs older half: speed {summary.trend.wpm >= 0 ? '+' : ''}{r1(summary.trend.wpm)} WPM, accuracy {summary.trend.accuracy >= 0 ? '+' : ''}{r1(summary.trend.accuracy)} points.</p>}
      </Card>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold text-white">Problem keys</h2>
          <p className="mb-3 mt-1 text-sm text-zinc-400">Keys with an error rate clearly above your own average.</p>
          {!hasKeyData ? <p className="text-sm text-zinc-500">Not enough data yet – needs about 150 key presses recorded with the current NoPeek version ({w?.totalPresses ?? 0} so far).</p> : (
            <Table head={['Key', 'Errors', 'Presses', 'Finger']} empty="No key stands out as a problem."
              rows={w.keys.slice(0, 8).map((k) => [codeLabel(layout, k.code), `${Math.round(k.rate * 100)}%`, k.n, FINGERS[k.finger]?.label ?? '—'])} />
          )}
          {hasKeyData && w.slowKeys.length > 0 && (
            <div className="mt-4"><h3 className="mb-2 text-sm font-medium text-zinc-300">Slowest keys</h3>
              <Table head={['Key', 'Avg gap', 'vs typical']} empty="" rows={w.slowKeys.slice(0, 5).map((k) => [codeLabel(layout, k.code), `${Math.round(k.meanMs)} ms`, `${k.ratio.toFixed(1)}×`])} /></div>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-white">Keys by finger assignment</h2>
          <p className="mb-3 mt-1 text-sm text-zinc-400">Error rate on the keys each finger owns. This shows which keys were missed, not which finger pressed them.</p>
          {!hasKeyData ? <p className="text-sm text-zinc-500">Not enough data yet.</p> : (
            <Table head={['Finger', 'Presses', 'Errors', 'Avg gap']} empty="" rows={FINGER_ORDER.filter((f) => w.fingerStats?.[f]?.n >= 20).map((f) => { const s = w.fingerStats[f]; return [FINGERS[f].label, s.n, `${Math.round((s.err / s.n) * 100)}%`, s.k ? `${Math.round(s.ms / s.k)} ms` : '—'] })} />
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-white">Difficult combinations</h2>
          <p className="mb-3 mt-1 text-sm text-zinc-400">Letter pairs that are slow or error-prone for you.</p>
          {!hasKeyData ? <p className="text-sm text-zinc-500">Not enough data yet.</p> : (
            <Table head={['Pair', 'Seen', 'Errors', 'Speed']} empty="No pair stands out."
              rows={w.bigrams.slice(0, 8).map((b) => [`${b.gram}${b.sameFinger ? ' · same finger' : ''}`, b.n, `${b.err}`, b.slowRatio ? `${b.slowRatio.toFixed(1)}× slower` : '—'])} />
          )}
          {hasKeyData && w.confusions.length > 0 && (
            <div className="mt-4"><h3 className="mb-2 text-sm font-medium text-zinc-300">Frequent mix-ups</h3>
              <Table head={['Intended', 'Pressed', 'Times', 'Type']} empty="" rows={w.confusions.slice(0, 5).map((c) => [codeLabel(layout, c.expected), codeLabel(layout, c.typed), c.n, c.adjacent ? 'neighbouring key' : 'distant key'])} /></div>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-white">Typing rhythm</h2>
          <p className="mb-3 mt-1 text-sm text-zinc-400">Time between key presses, from your recent sessions.</p>
          {!rhythm ? <p className="text-sm text-zinc-500">Needs at least two recorded sessions with this version.</p> : (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-zinc-500">Typical gap</dt><dd className="text-xl tabular-nums text-white">{Math.round(rhythm.medianMs)} ms</dd></div>
              <div><dt className="text-zinc-500">Rhythm score</dt><dd className="text-xl tabular-nums text-white">{Math.round(rhythm.keyConsistency)}/100</dd></div>
              <div><dt className="text-zinc-500">Long pauses / run</dt><dd className="text-xl tabular-nums text-white">{r1(rhythm.pauses)}</dd></div>
              <div><dt className="text-zinc-500">Burstiness</dt><dd className="text-xl tabular-nums text-white">{rhythm.burstiness == null ? '—' : `${r1(rhythm.burstiness)}×`}</dd></div>
            </dl>
          )}
        </Card>
      </div>

      <Card className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Eye tracking</h2>
            <p className="mt-1 text-sm text-zinc-400">Only runs where the camera reliably tracked you are scored. Unmeasured time is never counted as good discipline.</p>
          </div>
          <div className="text-right text-sm"><p className="text-zinc-300">{eyeNow.text}</p><Link to="/setup" className="text-xs text-emerald-400 underline">Calibration &amp; settings</Link></div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Discipline" value={e.avgDiscipline == null ? null : r1(e.avgDiscipline)} unit="%" hint="tracked time on screen" />
          <Stat label="Keyboard looks / min" value={e.avgPeeksPerMin == null ? null : r1(e.avgPeeksPerMin)} />
          <Stat label="Avg look length" value={e.avgPeekMs == null ? null : r1(e.avgPeekMs / 1000)} unit=" s" />
          <Stat label="Tracked coverage" value={e.avgCoverage == null ? null : Math.round(e.avgCoverage * 100)} unit="%" hint="share of run measured" />
          <Stat label="Calibration" value={e.lastCalibration ?? (eyeState.calibrated ? eyeState.profile.quality.level : '—')} hint="latest quality" />
        </dl>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {Object.entries(e.status).filter(([, n]) => n > 0).map(([k, n]) => { const [tone, label] = TRACK_BADGE[k] ?? ['neutral', 'Not recorded']; return <Badge key={k} tone={tone}>{label}: {n}</Badge> })}
        </div>
        {eyeData.length >= 2 ? (
          <div className="mt-4"><Suspense fallback={<Spinner />}><ProgressChart height={220} data={eyeData} lines={[{ key: 'discipline', name: 'Visual discipline %', color: '#fbbf24', axis: 'left' }]} /></Suspense></div>
        ) : <p className="mt-4 text-sm text-zinc-500">{e.measuredSessions === 0 ? 'No measured runs yet. Calibrate in Setup and type with eye tracking on.' : 'At least two measured runs are needed for a trend.'}</p>}
        {e.status.unknown > 0 && <p className="mt-3 text-xs text-zinc-600">{e.status.unknown} older session{e.status.unknown === 1 ? '' : 's'} (recorded before NoPeek stored tracking status) are not included in any eye figures, because earlier versions saved 100% when no tracking happened.</p>}
      </Card>

      {lessonRows.length > 0 && (
        <Card className="mt-8">
          <h2 className="text-lg font-semibold text-white">Improvement across lessons</h2>
          <p className="mb-3 mt-1 text-sm text-zinc-400">First attempt → best attempt.</p>
          <Table head={['Lesson', 'Attempts', 'WPM', 'Accuracy', 'Status']} rows={lessonRows} empty="" />
        </Card>
      )}

      <Card className="mt-8 overflow-hidden !p-0">
        <div className="border-b border-zinc-800 px-5 py-4"><h2 className="text-lg font-semibold text-white">Recent sessions</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-zinc-950/60 text-xs uppercase tracking-wider text-zinc-500"><tr>
              {['Date', 'Type', 'WPM', 'Accuracy', 'Consistency', 'Eyes', 'Duration'].map((h) => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-zinc-800">
              {[...sessions].reverse().slice(0, 15).map((s) => {
                const st = s.tracking?.status ?? 'unavailable'
                const [tone, label] = TRACK_BADGE[st] ?? ['neutral', 'Not recorded']
                return (
                  <tr key={s.id} className="text-zinc-300">
                    <td className="whitespace-nowrap px-5 py-3">{fmtDateTime(s.created_at)}</td>
                    <td className="px-5 py-3 text-zinc-400">{s.lesson_id ? `Lesson ${s.lesson_id}` : s.practice_kind ? `Practice · ${s.practice_kind}` : s.mode}</td>
                    <td className="px-5 py-3 tabular-nums">{Math.round(s.wpm)}</td>
                    <td className="px-5 py-3 tabular-nums">{r1(s.accuracy)}%</td>
                    <td className="px-5 py-3 tabular-nums">{s.consistency == null ? '—' : Math.round(s.consistency)}</td>
                    <td className="px-5 py-3">{st === 'measured' ? <span className="tabular-nums">{Math.round(s.tracking.discipline)}% · {s.tracking.peeks} look{s.tracking.peeks === 1 ? '' : 's'}</span> : <Badge tone={tone}>{label}</Badge>}</td>
                    <td className="px-5 py-3 tabular-nums">{Math.round(s.duration_seconds)}s</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
