// Measurable goals evaluated against real session history.

import { mean } from '../engine/stats.js'

export const GOAL_TYPES = {
  wpm: { label: 'Speed', unit: 'WPM', desc: (g) => `Reach ${g.target} WPM at ${g.minAccuracy ?? 95}%+ accuracy` },
  accuracy: { label: 'Accuracy', unit: '%', desc: (g) => `Average ${g.target}% accuracy over your last 5 runs` },
  discipline: { label: 'Visual discipline', unit: '%', desc: (g) => `Keep eyes off the keyboard ${g.target}% of tracked time (last 5 tracked runs)` },
  streak: { label: 'Consistency', unit: 'days', desc: (g) => `Practise ${g.target} days in a row` },
  lessons: { label: 'Curriculum', unit: 'lessons', desc: (g) => `Pass ${g.target} lessons` },
}

export function dayKey(d) {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

/** Consecutive practice days ending today (or yesterday, so an unfinished today doesn't reset it). */
export function currentStreak(sessions, now = new Date()) {
  const days = new Set(sessions.map((s) => dayKey(s.created_at)))
  const cursor = new Date(now)
  cursor.setHours(12, 0, 0, 0)
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let n = 0
  while (days.has(dayKey(cursor))) {
    n++
    cursor.setDate(cursor.getDate() - 1)
  }
  return n
}

export function evaluateGoal(goal, { sessions, passedLessons = 0, now = new Date() }) {
  let current = null
  switch (goal.type) {
    case 'wpm': {
      const ok = sessions.filter((s) => (s.accuracy ?? 0) >= (goal.minAccuracy ?? 95))
      current = ok.length ? Math.max(...ok.map((s) => s.wpm)) : null
      break
    }
    case 'accuracy': {
      const last = sessions.slice(-5).map((s) => s.accuracy).filter((v) => v != null)
      current = last.length >= 3 ? mean(last) : null
      break
    }
    case 'discipline': {
      const last = sessions.filter((s) => s.tracking?.status === 'measured' && s.tracking.discipline != null).slice(-5)
      current = last.length >= 3 ? mean(last.map((s) => s.tracking.discipline)) : null
      break
    }
    case 'streak':
      current = currentStreak(sessions, now)
      break
    case 'lessons':
      current = passedLessons
      break
    default:
      break
  }
  const done = current != null && current >= goal.target
  return { current, target: goal.target, done, pct: current == null ? 0 : Math.max(0, Math.min(100, (current / goal.target) * 100)), needsData: current == null }
}

/** A few sensible next goals, derived from where the user is now. */
export function suggestGoals({ sessions, passedLessons = 0 }) {
  const out = []
  const best = sessions.length ? Math.max(...sessions.filter((s) => (s.accuracy ?? 0) >= 95).map((s) => s.wpm), 0) : 0
  const nextWpm = Math.max(20, Math.ceil((best + 1) / 5) * 5 + (best % 5 === 0 ? 5 : 0))
  out.push({ type: 'wpm', target: nextWpm, minAccuracy: 95 })
  out.push({ type: 'accuracy', target: 97 })
  if (sessions.some((s) => s.tracking?.status === 'measured')) out.push({ type: 'discipline', target: 95 })
  out.push({ type: 'streak', target: 5 })
  out.push({ type: 'lessons', target: Math.min(27, passedLessons + 3) })
  return out
}
