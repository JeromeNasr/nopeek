// Turns measured session history into ranked, evidence-backed recommendations.
// Nothing here is estimated without data: each recommendation lists the numbers
// it is based on, and categories with too little data say so instead.

import { mean } from '../engine/stats.js'
import { aggregateAnalyses, detectWeaknesses, weaknessTrend } from './analysis.js'
import { FINGERS, codeLabel, codeToChar, profileFingerOfCode } from './keyboard.js'
import { LESSON_BY_ID, computeProgress } from './lessons.js'

const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`
const RECENT = 12

/**
 * @param {object} input
 * @param {Array} input.sessions     chronological, each: { wpm, accuracy, consistency, keyConsistency, backspaces, keystrokes, analysis, tracking, ... }
 * @param {object} input.profile     keyboard profile
 * @param {Array} input.attempts     lesson attempts for progress
 */
export function buildRecommendations({ sessions, profile, attempts = [] }) {
  const recs = []
  const progress = computeProgress(attempts)
  const recent = sessions.slice(-RECENT)
  const analyses = sessions.map((s) => s.analysis).filter(Boolean)
  const agg = aggregateAnalyses(analyses.slice(-30))
  const weak = detectWeaknesses(agg, profile)
  const layout = profile.layout
  const label = (code) => codeLabel(layout, code)
  const charOf = (code) => codeToChar(layout, code, false)

  if (sessions.length === 0) {
    recs.push({
      id: 'start', priority: 100, kind: 'lesson', title: 'Start with Lesson 1.1',
      reason: 'No sessions recorded yet. The first lesson takes about two minutes and sets your baseline.',
      evidence: [], action: { type: 'lesson', lessonId: '1.1' },
    })
    return { recs, weak, progress, agg }
  }

  const acc = mean(recent.map((s) => s.accuracy).filter((v) => v != null))
  const wpm = mean(recent.map((s) => s.wpm))
  const cons = mean(recent.map((s) => s.consistency).filter((v) => v != null))
  const keyCons = mean(recent.map((s) => s.keyConsistency).filter((v) => v != null))
  const totalKeys = recent.reduce((s, x) => s + (x.keystrokes ?? 0), 0)
  const totalBack = recent.reduce((s, x) => s + (x.backspaces ?? 0), 0)

  // 1. Weak keys
  if (weak.enoughData && weak.keys.length) {
    const top = weak.keys.slice(0, 4)
    const trend = weaknessTrend(analyses, top.map((k) => k.code))
    recs.push({
      id: 'weak-keys', priority: 90, kind: 'keys',
      title: `Drill your problem keys: ${top.map((k) => label(k.code)).join(', ')}`,
      reason: `These keys are mistyped noticeably more than your ${pct(weak.baselineErrorRate, 1)} average.`,
      evidence: top.map((k) => `${label(k.code)}: ${pct(k.rate, 0)} errors over ${k.n} presses (${FINGERS[k.finger]?.label ?? 'unassigned'})`),
      trend,
      action: { type: 'practice', label: 'Problem-key drill', spec: { kind: 'keys', chars: top.map((k) => charOf(k.code)).filter(Boolean) } },
    })
  }

  // 2. Finger-level pattern
  if (weak.fingers.length) {
    const f = weak.fingers[0]
    const codes = Object.keys(agg.keys).filter((c) => profileFingerOfCode(profile, c) === f.finger)
    recs.push({
      id: 'weak-finger', priority: 85, kind: 'finger',
      title: `Errors cluster on keys assigned to your ${FINGERS[f.finger].label.toLowerCase()}`,
      reason: 'Mistakes on this finger\'s keys are well above your average. (We see which keys were hit, not which finger pressed them.)',
      evidence: [`${pct(f.rate, 1)} error rate over ${f.n} presses of that finger's keys`],
      trend: weaknessTrend(analyses, codes),
      action: { type: 'practice', label: `${FINGERS[f.finger].label} drill`, spec: { kind: 'finger', fingerCodes: codes } },
    })
  }

  // 3. Slow / error-prone transitions
  if (weak.bigrams.length) {
    const top = weak.bigrams.slice(0, 5)
    recs.push({
      id: 'bigrams', priority: 75, kind: 'bigrams',
      title: `Smooth out letter pairs: ${top.map((b) => b.gram).join(', ')}`,
      reason: 'These two-letter transitions are slower or less accurate than your typical pairs.',
      evidence: top.map((b) => `${b.gram}: ${b.slowRatio ? `${b.slowRatio.toFixed(1)}× slower than your median pair` : ''}${b.err ? `${b.slowRatio ? ', ' : ''}${b.err}/${b.n} errors` : ''}${b.sameFinger ? ' (same finger twice)' : ''}`),
      action: { type: 'practice', label: 'Bigram drill', spec: { kind: 'bigrams', grams: top.map((b) => b.gram) } },
    })
  }

  // 4. Adjacent-key slips
  const adj = weak.confusions.filter((c) => c.adjacent).slice(0, 3)
  if (adj.length && adj[0].n >= 4) {
    recs.push({
      id: 'adjacent', priority: 60, kind: 'accuracy',
      title: 'Adjacent-key slips: ' + adj.map((c) => `${label(c.expected)}→${label(c.typed)}`).join(', '),
      reason: 'You often hit a neighbouring key instead of the intended one – usually a sign of hurrying or drifting from home position.',
      evidence: adj.map((c) => `Intended ${label(c.expected)}, pressed ${label(c.typed)}: ${c.n}×`),
      action: { type: 'practice', label: 'Slow accuracy drill', spec: { kind: 'keys', chars: [...new Set(adj.flatMap((c) => [charOf(c.expected), charOf(c.typed)]).filter(Boolean))] } },
    })
  }

  // 5. Accuracy
  if (Number.isFinite(acc) && acc < 94) {
    recs.push({
      id: 'accuracy', priority: 88, kind: 'accuracy', title: 'Slow down: accuracy first',
      reason: `Your recent accuracy is ${acc.toFixed(1)}%. Below ~95% mistakes cost more time than speed gains.`,
      evidence: [`Average of last ${recent.length} sessions: ${acc.toFixed(1)}% accuracy at ${Math.round(wpm)} WPM`],
      action: { type: 'practice', label: 'Accuracy practice', spec: { kind: 'accuracy' } },
    })
  }

  // 6. Corrections
  if (totalKeys > 200 && totalBack / totalKeys > 0.12) {
    recs.push({
      id: 'corrections', priority: 65, kind: 'accuracy', title: 'Reduce backspacing',
      reason: 'A high correction rate usually means rushing. Try to notice errors as you make them and keep going.',
      evidence: [`${pct(totalBack / totalKeys, 1)} of keystrokes were corrections`],
      lessonId: '4.2', action: { type: 'lesson', lessonId: '4.2' },
    })
  }

  // 7. Rhythm / consistency
  if (Number.isFinite(acc) && acc >= 95 && ((Number.isFinite(keyCons) && keyCons < 55) || (Number.isFinite(cons) && cons < 55))) {
    recs.push({
      id: 'rhythm', priority: 80, kind: 'rhythm', title: 'Work on typing rhythm',
      reason: 'Your accuracy is good, but your pace is uneven. Even timing is what turns accuracy into speed.',
      evidence: [
        Number.isFinite(keyCons) ? `Key-interval consistency ${keyCons.toFixed(0)}/100` : null,
        Number.isFinite(cons) ? `Speed consistency ${cons.toFixed(0)}/100` : null,
      ].filter(Boolean),
      action: { type: 'practice', label: 'Rhythm practice', spec: { kind: 'rhythm' } },
    })
  }

  // 8. Numbers / punctuation / shift
  for (const c of weak.classes) {
    const map = { digit: ['numbers', 'Numbers'], symbol: ['punctuation', 'Punctuation and symbols'], upper: ['shift', 'Capital letters'] }
    const m = map[c.cls]
    if (!m) continue
    recs.push({
      id: `class-${c.cls}`, priority: 55, kind: m[0], title: `Practise ${m[1].toLowerCase()}`,
      reason: `${m[1]} are mistyped more often than ordinary letters.`,
      evidence: [`${pct(c.rate, 0)} errors over ${c.n} presses`],
      action: { type: 'practice', label: `${m[1]} practice`, spec: { kind: m[0] } },
    })
  }
  if (weak.shift && !recs.some((r) => r.id === 'class-upper')) {
    recs.push({
      id: 'shift', priority: 50, kind: 'shift', title: 'Use Shift with the opposite pinky',
      reason: 'Capital letters and shifted symbols cause extra errors.',
      evidence: [`${pct(weak.shift.rate, 0)} errors on shifted characters`],
      action: { type: 'practice', label: 'Capitals practice', spec: { kind: 'shift' } },
    })
  }

  // 9. Visual discipline
  const tracked = recent.filter((s) => s.tracking?.status === 'measured' && s.tracking.discipline != null)
  if (tracked.length >= 2) {
    const disc = mean(tracked.map((s) => s.tracking.discipline))
    const peeks = mean(tracked.map((s) => s.tracking.peeksPerMin ?? 0))
    if (disc < 90) {
      recs.push({
        id: 'visual', priority: 70, kind: 'visual', title: 'Keep your eyes on the screen',
        reason: 'You still check the keyboard fairly often. Slower, easier text is the best place to practise trusting your fingers.',
        evidence: [`${disc.toFixed(0)}% of measured time on screen over ${tracked.length} tracked sessions`, `${peeks.toFixed(1)} keyboard looks per minute`],
        action: { type: 'practice', label: 'Eyes-up drill', spec: { kind: 'visual' } },
      })
    }
  } else {
    recs.push({
      id: 'enable-tracking', priority: 30, kind: 'setup', title: 'Add eye tracking to measure visual discipline',
      reason: 'No sessions with reliable eye tracking yet, so keyboard-looking is not measured. Calibrating takes about a minute and stays on your device.',
      evidence: [], action: { type: 'route', to: '/setup' },
    })
  }

  // 10. Speed (only when accuracy is solid)
  if (Number.isFinite(acc) && acc >= 96 && (!Number.isFinite(cons) || cons >= 55)) {
    recs.push({
      id: 'speed', priority: 45, kind: 'speed', title: 'Push your speed',
      reason: `You are accurate (${acc.toFixed(1)}%) and steady, so you can safely try to go faster.`,
      evidence: [`Recent average ${Math.round(wpm)} WPM`],
      action: { type: 'practice', label: 'Speed practice', spec: { kind: 'speed' } },
    })
  }

  // 11. Next lesson
  if (progress.nextLessonId) {
    const l = LESSON_BY_ID[progress.nextLessonId]
    recs.push({
      id: 'next-lesson', priority: 72, kind: 'lesson', title: `Next lesson: ${l.id} ${l.title}`,
      reason: `${progress.passedCount} of ${progress.total} lessons passed. ${l.summary}`,
      evidence: [`Target: ${l.pass.minAccuracy}% accuracy at ${l.pass.minWpm}+ WPM`],
      action: { type: 'lesson', lessonId: l.id },
    })
  }

  recs.sort((a, b) => b.priority - a.priority)
  return { recs, weak, progress, agg }
}
