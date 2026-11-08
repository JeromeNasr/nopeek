import { Link } from 'react-router-dom'
import { Badge, Button, Card, Notice, Stat } from './ui.jsx'
import { cx } from '../lib/cx.js'
import { codeLabel } from '../training/keyboard.js'
import { TRACKING_STATUS } from '../eye/tally.js'
import { mean } from '../engine/stats.js'

export function Sparkline({ series, raw = null, height = 80, label = 'WPM per second' }) {
  if (!series || series.length < 2) return null
  const w = 600
  const all = [...series, ...(raw ?? [])]
  const max = Math.max(10, ...all)
  const x = (i) => (i / (series.length - 1)) * w
  const y = (v) => height - 6 - (v / max) * (height - 12)
  const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="h-20 w-full" role="img" aria-label={`${label}: from ${series[0]} to ${series[series.length - 1]}, peak ${Math.max(...series)}`} preserveAspectRatio="none">
      {raw && <path d={path(raw)} fill="none" stroke="#52525b" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
      <path d={path(series)} fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function EyeSummary({ tracking, history = [] }) {
  const t = tracking
  if (!t) return null
  const pct = (v) => `${Math.round(v * 100)}%`
  const fmtS = (ms) => `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`
  const prior = history.filter((s) => s.tracking?.status === TRACKING_STATUS.MEASURED && s.tracking.discipline != null).slice(-5)

  if (t.status === TRACKING_STATUS.DISABLED) {
    return <Notice tone="info" title="Eye tracking was off">Keyboard-looking was not measured for this run. Turn it on in Setup if you want visual-discipline coaching.</Notice>
  }
  if (t.status === TRACKING_STATUS.UNCALIBRATED) {
    return <Notice tone="warn" title="Eye tracking is not calibrated">Nothing was measured. <Link className="underline" to="/setup">Calibrate in Setup</Link> (about a minute).</Notice>
  }
  if (t.status === TRACKING_STATUS.UNAVAILABLE) {
    return <Notice tone="warn" title="Eye tracking was unavailable for most of this run">Only {pct(t.coverage ?? 0)} of the run could be measured (camera or face not visible), so no visual-discipline score is given. This is not counted as good or bad discipline.</Notice>
  }
  const rows = (
    <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
      <div><dt className="text-zinc-500">Looked at keyboard</dt><dd className="tabular-nums text-zinc-200">{t.peeks}× {t.peeks ? `· avg ${fmtS(t.avgPeekMs)}` : ''}</dd></div>
      <div><dt className="text-zinc-500">Brief glances</dt><dd className="tabular-nums text-zinc-200">{t.glances}</dd></div>
      <div><dt className="text-zinc-500">Looking away</dt><dd className="tabular-nums text-zinc-200">{fmtS(t.awayMs)}</dd></div>
      <div><dt className="text-zinc-500">Tracked</dt><dd className="tabular-nums text-zinc-200">{pct(t.coverage)} of run</dd></div>
    </dl>
  )
  if (t.status === TRACKING_STATUS.PARTIAL) {
    return (
      <Card>
        <h3 className="font-medium text-white">Eye tracking: partial <Badge tone="warn">not scored</Badge></h3>
        <p className="mt-1 text-sm text-zinc-400">Only {pct(t.coverage)} of this run was measured, which is too little for a reliable score. Figures below cover just that portion.</p>
        {rows}
      </Card>
    )
  }
  const prevAvg = prior.length ? mean(prior.map((s) => s.tracking.discipline)) : null
  const delta = prevAvg != null ? t.discipline - prevAvg : null
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium text-white">Visual discipline</h3>
          <p className="mt-0.5 text-sm text-zinc-400">Share of tracked time your eyes were not on the keyboard.</p>
        </div>
        <p className="text-3xl font-semibold tabular-nums text-white">{t.discipline}%</p>
      </div>
      {delta != null && (
        <p className={cx('mt-2 text-sm', delta >= 1 ? 'text-emerald-300' : delta <= -1 ? 'text-amber-300' : 'text-zinc-400')}>
          {delta >= 1 ? `Up ${delta.toFixed(0)} points` : delta <= -1 ? `Down ${Math.abs(delta).toFixed(0)} points` : 'About the same'} compared with your last {prior.length} tracked session{prior.length === 1 ? '' : 's'}.
        </p>
      )}
      {rows}
      {t.uncertainMs > 0 && <p className="mt-2 text-xs text-zinc-500">{fmtS(t.uncertainMs)} was uncertain and {fmtS(t.unavailableMs)} unavailable; neither is counted as screen time.</p>}
    </Card>
  )
}

export default function Results({ result, lessonCheck, mistakeCodes, layout, history, saveStatus, actions, title = 'Results' }) {
  const r = result
  const tone = (v, good, ok) => (v == null ? undefined : v >= good ? 'good' : v >= ok ? 'warn' : 'bad')
  return (
    <div className="mx-auto max-w-3xl space-y-5" aria-live="polite">
      <div className="text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-emerald-400">{title}</p>
      </div>

      {lessonCheck && (
        <Card className={lessonCheck.passed ? 'border-emerald-700/60' : 'border-amber-800/60'}>
          <h2 className="text-lg font-semibold text-white">{lessonCheck.passed ? 'Lesson passed' : 'Not quite yet – here is what to improve'}</h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {lessonCheck.checks.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3">
                <span className="text-zinc-300">{c.ok ? '✓' : '✗'} {c.label}</span>
                <span className={cx('tabular-nums', c.ok ? 'text-emerald-300' : 'text-amber-300')}>
                  {c.actual == null ? '—' : typeof c.actual === 'number' ? Math.round(c.actual * 10) / 10 : c.actual}{c.unit} <span className="text-zinc-500">/ target {c.target}{c.unit}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="WPM" value={Math.round(r.wpm)} tone={undefined} hint={`raw ${Math.round(r.rawWpm)}`} />
        <Stat label="Accuracy" value={r.accuracy == null ? null : Math.round(r.accuracy * 10) / 10} unit="%" tone={tone(r.accuracy, 97, 92)} />
        <Stat label="Consistency" value={r.consistency == null ? null : Math.round(r.consistency)} unit="/100" hint="even pace per second" />
        <Stat label="Rhythm" value={r.keyConsistency == null ? null : Math.round(r.keyConsistency)} unit="/100" hint="even key intervals" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-400">
          <span>Speed over time</span>
          <span><span className="text-emerald-400">━</span> WPM <span className="ml-2 text-zinc-500">━</span> raw</span>
        </div>
        <Sparkline series={r.wpmHistory} raw={r.rawHistory} />
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-5">
          <div><dt className="text-zinc-500">Correct</dt><dd className="tabular-nums text-zinc-200">{r.correctKeys}</dd></div>
          <div><dt className="text-zinc-500">Incorrect</dt><dd className="tabular-nums text-zinc-200">{r.incorrectKeys}</dd></div>
          <div><dt className="text-zinc-500">Corrections</dt><dd className="tabular-nums text-zinc-200">{r.backspaces}</dd></div>
          <div><dt className="text-zinc-500">Words</dt><dd className="tabular-nums text-zinc-200">{r.wordsCorrect}/{r.wordsCompleted}</dd></div>
          <div><dt className="text-zinc-500">Time</dt><dd className="tabular-nums text-zinc-200">{(r.durationMs / 1000).toFixed(1)}s</dd></div>
        </dl>
      </Card>

      {mistakeCodes?.length > 0 && (
        <Card>
          <h3 className="font-medium text-white">Keys that tripped you up this run</h3>
          <p className="mt-2 flex flex-wrap gap-2">
            {mistakeCodes.map((m) => (
              <Badge key={m.code} tone="warn">{codeLabel(layout, m.code)} · {m.err}/{m.n}</Badge>
            ))}
          </p>
        </Card>
      )}

      <EyeSummary tracking={r.tracking} history={history} />

      {saveStatus && <p className="text-center text-sm text-zinc-400">{saveStatus}</p>}
      <div className="flex flex-wrap justify-center gap-3">{actions}</div>
    </div>
  )
}

export { Button }
