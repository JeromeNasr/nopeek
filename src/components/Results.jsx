import { Link } from 'react-router-dom'
import { Badge, Button, Card, CountUp, Notice, SectionTitle, Stat } from './ui.jsx'
import { cx } from '../lib/cx.js'
import { codeLabel } from '../training/keyboard.js'
import { TRACKING_STATUS } from '../eye/tally.js'
import { mean } from '../engine/stats.js'

export function Sparkline({ series, raw = null, height = 80, label = 'WPM per second' }) {
  if (!series || series.length < 2) return null
  const w = 600
  const all = [...series, ...(raw ?? [])]
  // pad the range so a steady run sits mid-chart instead of on the top edge
  const hi = Math.max(10, ...all) * 1.12
  const lo = Math.max(0, Math.min(...all) * 0.7)
  const x = (i) => (i / (series.length - 1)) * w
  const y = (v) => height - 6 - ((v - lo) / (hi - lo || 1)) * (height - 12)
  const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="h-24 w-full" role="img" aria-label={`${label}: from ${series[0]} to ${series[series.length - 1]}, peak ${Math.max(...series)}`} preserveAspectRatio="none">
      {raw && <path d={path(raw)} fill="none" stroke="var(--n-700)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
      <path className="draw-line" pathLength="1" d={path(series)} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
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
        <p className={cx('mt-2 text-sm', delta >= 1 ? 'text-emerald-400' : delta <= -1 ? 'text-[#d9a441]' : 'text-zinc-400')}>
          {delta >= 1 ? `Up ${delta.toFixed(0)} points` : delta <= -1 ? `Down ${Math.abs(delta).toFixed(0)} points` : 'About the same'} compared with your last {prior.length} tracked session{prior.length === 1 ? '' : 's'}.
        </p>
      )}
      {rows}
      {t.uncertainMs > 0 && <p className="mt-2 text-xs text-zinc-500">{fmtS(t.uncertainMs)} was uncertain and {fmtS(t.unavailableMs)} unavailable; neither is counted as screen time.</p>}
    </Card>
  )
}

export default function Results({ result, lessonCheck, mistakeCodes, peekCodes, layout, history, saveStatus, actions, title = 'result' }) {
  const r = result
  const prev = history.filter((s) => s.wpm > 0)
  const best = prev.length ? Math.max(...prev.map((s) => s.wpm)) : null
  const isBest = best != null && prev.length >= 3 && r.wpm > best && (r.accuracy ?? 0) >= 90
  return (
    <div className="page-enter mx-auto max-w-4xl" aria-live="polite">
      <p className="text-xs text-zinc-500">{title}</p>
      <div className="mt-2 grid gap-x-12 gap-y-8 md:grid-cols-[auto_1fr] md:items-end">
        <div className="flex gap-10">
          <div>
            <p className="text-sm text-zinc-500">wpm</p>
            <p className="font-mono text-7xl font-medium leading-none tabular-nums text-emerald-400"><CountUp value={Math.round(r.wpm)} /></p>
          </div>
          <div>
            <p className="text-sm text-zinc-500">acc</p>
            <p className="font-mono text-7xl font-medium leading-none tabular-nums text-emerald-400">{r.accuracy == null ? '–' : <><CountUp value={Math.round(r.accuracy)} />%</>}</p>
          </div>
        </div>
        <Sparkline series={r.wpmHistory} raw={r.rawHistory} />
      </div>
      {isBest && <p className="mt-3 text-sm text-emerald-400">New personal best — previous was {Math.round(best)}.</p>}

      <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 md:grid-cols-6">
        <Stat label="raw" value={Math.round(r.rawWpm)} />
        <Stat label="consistency" value={r.consistency == null ? null : Math.round(r.consistency)} unit="%" />
        <Stat label="rhythm" value={r.keyConsistency == null ? null : Math.round(r.keyConsistency)} unit="%" />
        <Stat label="characters" value={`${r.chars.correctWord}/${r.chars.incorrect}/${r.chars.extra}/${r.chars.missed}`} hint="correct / wrong / extra / missed" />
        <Stat label="corrections" value={r.backspaces} />
        <Stat label="time" value={Math.round(r.durationMs / 100) / 10} unit="s" decimals={1} />
      </dl>

      {lessonCheck && (
        <div className="mt-10">
          <SectionTitle>{lessonCheck.passed ? 'Lesson passed' : 'Not passed yet'}</SectionTitle>
          <ul className="space-y-1.5 text-sm">
            {lessonCheck.checks.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-3">
                <span className="text-zinc-300"><span className={cx('mr-2 font-mono', c.ok ? 'text-emerald-400' : 'text-[#e0605b]')}>{c.ok ? '✓' : '×'}</span>{c.label}</span>
                <span className="font-mono tabular-nums text-zinc-200">
                  {c.actual == null ? '–' : typeof c.actual === 'number' ? Math.round(c.actual * 10) / 10 : c.actual}{c.unit}
                  <span className="text-zinc-600"> / {c.target}{c.unit}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(mistakeCodes?.length > 0 || peekCodes?.length > 0) && (
        <div className="mt-10 grid gap-8 sm:grid-cols-2">
          {mistakeCodes?.length > 0 && (
            <div>
              <SectionTitle>Missed keys</SectionTitle>
              <p className="flex flex-wrap gap-2">{mistakeCodes.map((m) => <span key={m.code} className="rounded-md bg-zinc-900 px-2.5 py-1 font-mono text-sm text-zinc-200">{codeLabel(layout, m.code)} <span className="text-zinc-500">{m.err}/{m.n}</span></span>)}</p>
            </div>
          )}
          {peekCodes?.length > 0 && (
            <div>
              <SectionTitle aside="what you were typing when your eyes dropped">Keys you looked down for</SectionTitle>
              <p className="flex flex-wrap gap-2">{peekCodes.map((m) => <span key={m.code} className="rounded-md bg-zinc-900 px-2.5 py-1 font-mono text-sm text-zinc-200">{codeLabel(layout, m.code)} <span className="text-zinc-500">{m.n}×</span></span>)}</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-10"><EyeSummary tracking={r.tracking} history={history} /></div>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        {actions}
        {saveStatus && <span className="ml-auto text-xs text-zinc-600">{saveStatus}</span>}
      </div>
    </div>
  )
}

export { Button }
