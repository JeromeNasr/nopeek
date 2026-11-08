// Dashboard statistics and the four questions it must answer. Pure functions:
// every statement carries the numbers it is based on, and categories without
// enough data are reported as such rather than guessed.

import { mean } from '../engine/stats.js'
import { codeLabel, FINGERS } from './keyboard.js'
import { currentStreak, dayKey } from './goals.js'

const avg = (xs) => (xs.length ? mean(xs) : null)
const num = (v) => typeof v === 'number' && Number.isFinite(v)

export function summarizeHistory(sessions, now = new Date()) {
  const n = sessions.length
  const wpms = sessions.map((s) => s.wpm).filter(num)
  const cons = sessions.map((s) => s.consistency).filter(num)
  const last = sessions[n - 1] ?? null
  const recent = sessions.slice(-10)
  const typingSeconds = sessions.reduce((a, s) => a + (s.duration_seconds ?? 0), 0)

  // older vs newer comparison needs enough runs on both sides
  let trend = null
  if (n >= 8) {
    const half = Math.floor(n / 2)
    const older = sessions.slice(0, half)
    const newer = sessions.slice(half)
    trend = {
      wpm: avg(newer.map((s) => s.wpm).filter(num)) - avg(older.map((s) => s.wpm).filter(num)),
      accuracy: avg(newer.map((s) => s.accuracy).filter(num)) - avg(older.map((s) => s.accuracy).filter(num)),
    }
  }

  const status = { measured: 0, partial: 0, unavailable: 0, disabled: 0, uncalibrated: 0, unknown: 0 }
  for (const s of sessions) {
    const k = s.tracking?.status
    if (k in status) status[k]++
    else status.unknown++ // legacy rows: eye data cannot be trusted
  }
  const measured = sessions.filter((s) => s.tracking?.status === 'measured' && num(s.tracking.discipline))
  let eyeTrend = null
  if (measured.length >= 6) {
    const half = Math.floor(measured.length / 2)
    eyeTrend = avg(measured.slice(half).map((s) => s.tracking.discipline)) - avg(measured.slice(0, half).map((s) => s.tracking.discipline))
  }

  const days = new Set(sessions.map((s) => dayKey(s.created_at)))
  const calibrationLevels = measured.map((s) => s.tracking.calibrationLevel).filter(Boolean)

  return {
    sessions: n,
    typingSeconds,
    currentWpm: last ? last.wpm : null,
    avgWpm: avg(recent.map((s) => s.wpm).filter(num)),
    bestWpm: wpms.length ? Math.max(...wpms) : null,
    avgAccuracy: avg(recent.map((s) => s.accuracy).filter(num)),
    avgConsistency: avg(cons.slice(-10)),
    streak: currentStreak(sessions, now),
    practiceDays: days.size,
    trend,
    eye: {
      status,
      measuredSessions: measured.length,
      avgDiscipline: avg(measured.slice(-10).map((s) => s.tracking.discipline)),
      avgPeeksPerMin: avg(measured.slice(-10).map((s) => s.tracking.peeksPerMin).filter(num)),
      avgCoverage: avg(measured.slice(-10).map((s) => s.tracking.coverage).filter(num)),
      avgPeekMs: avg(measured.slice(-10).map((s) => s.tracking.avgPeekMs).filter(num)),
      trend: eyeTrend,
      lastCalibration: calibrationLevels[calibrationLevels.length - 1] ?? null,
    },
  }
}

/**
 * Answers: what am I doing well / struggling with / what improved / what next.
 * @param {object} summary from summarizeHistory
 * @param {object} rec      from buildRecommendations
 */
export function narrative(summary, rec, profile) {
  const good = []
  const bad = []
  const improved = []
  const next = []
  const layout = profile.layout
  const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1)

  if (summary.sessions < 3) {
    return { good, bad, improved, next: rec.recs.slice(0, 2).map((r) => ({ text: r.title, evidence: r.reason })), insufficient: true }
  }

  if (summary.avgAccuracy != null && summary.avgAccuracy >= 96) good.push({ text: 'Accurate typing', evidence: `${f1(summary.avgAccuracy)}% over your last ${Math.min(10, summary.sessions)} runs` })
  if (summary.avgConsistency != null && summary.avgConsistency >= 70) good.push({ text: 'Steady pace', evidence: `Consistency ${Math.round(summary.avgConsistency)}/100` })
  if (summary.streak >= 3) good.push({ text: 'Regular practice', evidence: `${summary.streak}-day streak` })
  if (summary.eye.measuredSessions >= 3 && summary.eye.avgDiscipline >= 95) good.push({ text: 'Strong visual discipline', evidence: `${f1(summary.eye.avgDiscipline)}% of tracked time on screen (${summary.eye.measuredSessions} tracked runs)` })
  if (summary.bestWpm != null && summary.currentWpm != null && summary.currentWpm >= summary.bestWpm * 0.95 && summary.sessions >= 5) good.push({ text: 'Near your best speed', evidence: `${Math.round(summary.currentWpm)} WPM vs best ${Math.round(summary.bestWpm)}` })

  if (summary.avgAccuracy != null && summary.avgAccuracy < 94) bad.push({ text: 'Accuracy', evidence: `${f1(summary.avgAccuracy)}% – below the ~95% needed to build speed safely` })
  if (summary.avgConsistency != null && summary.avgConsistency < 55) bad.push({ text: 'Uneven pace', evidence: `Consistency ${Math.round(summary.avgConsistency)}/100` })
  if (summary.eye.measuredSessions >= 3 && summary.eye.avgDiscipline < 85) bad.push({ text: 'Looking at the keyboard', evidence: `${f1(summary.eye.avgDiscipline)}% on screen; ${f1(summary.eye.avgPeeksPerMin ?? 0)} keyboard looks per minute` })
  const w = rec.weak
  if (w?.enoughData) {
    for (const k of w.keys.slice(0, 3)) bad.push({ text: `Key ${codeLabel(layout, k.code)}`, evidence: `${Math.round(k.rate * 100)}% errors over ${k.n} presses (${FINGERS[k.finger]?.label ?? 'unassigned'})` })
    for (const f of w.fingers.slice(0, 1)) bad.push({ text: `Keys under your ${FINGERS[f.finger].label.toLowerCase()}`, evidence: `${Math.round(f.rate * 100)}% errors over ${f.n} presses` })
    for (const b of w.bigrams.slice(0, 2)) bad.push({ text: `Transition "${b.gram}"`, evidence: b.slowRatio ? `${b.slowRatio.toFixed(1)}× slower than your median pair` : `${b.err}/${b.n} errors` })
  }

  if (summary.trend) {
    if (summary.trend.wpm >= 2) improved.push({ text: 'Speed', evidence: `+${f1(summary.trend.wpm)} WPM comparing your newer runs with older ones` })
    if (summary.trend.accuracy >= 1) improved.push({ text: 'Accuracy', evidence: `+${f1(summary.trend.accuracy)} points` })
  }
  if (summary.eye.trend != null && summary.eye.trend >= 3) improved.push({ text: 'Visual discipline', evidence: `+${f1(summary.eye.trend)} points on tracked runs` })
  for (const r of rec.recs) if (r.trend?.status === 'improving') improved.push({ text: `${r.title.split(':')[0]}`, evidence: `error rate fell from ${Math.round(r.trend.older * 100)}% to ${Math.round(r.trend.recent * 100)}%` })

  for (const r of rec.recs.slice(0, 3)) next.push({ text: r.title, evidence: r.reason, action: r.action })
  return { good, bad, improved, next, insufficient: false }
}
