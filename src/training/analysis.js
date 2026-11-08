// Mistake and rhythm analysis.
//
// Input is the keystroke log of the typing engine. Everything is derived from
// measured keystrokes. Important honesty note: a keyboard event tells us WHICH
// KEY was pressed (KeyboardEvent.code), never which FINGER pressed it. Finger
// statistics therefore describe "keys assigned to finger X" (under the user's
// assignment), not a detection of the finger actually used.

import { median, mean, percentile, stdDev, consistencyOf, roundTo } from '../engine/stats.js'
import { charToKey, profileFingerOfCode, DEFAULT_KEYBOARD_PROFILE } from './keyboard.js'

const MAX_DT = 2000 // longer gaps are pauses/thinking, not typing speed
const MAX_BIGRAMS = 80

const bump = (obj, key, init) => (obj[key] ??= init())

/** Per-session analysis object. Small enough to store as JSON on the session row. */
export function analyzeKeystrokes(log, profile = DEFAULT_KEYBOARD_PROFILE) {
  const layout = profile.layout
  const keys = {} // expected code -> {n, err, ms, k}
  const confusions = {} // "expected>typed" codes
  const bigrams = {} // "ab" -> {n, err, ms, k}
  const chars = {} // char class counters
  const intervals = []
  let pauses = 0
  let extra = 0
  let shiftN = 0
  let shiftErr = 0

  for (const e of log) {
    if (e.type !== 'c' && e.type !== 's') continue
    if (e.type === 's') {
      if (e.dt != null && e.prevOk && e.dt <= MAX_DT) intervals.push(e.dt)
      continue
    }
    if (e.exp == null) {
      extra++
      continue
    }
    const target = charToKey(layout, e.exp)
    if (!target) continue
    const k = bump(keys, target.code, () => ({ n: 0, err: 0, ms: 0, k: 0 }))
    k.n++
    if (target.shift) {
      shiftN++
      if (!e.ok) shiftErr++
    }
    const cls = /[a-z]/.test(e.exp) ? 'letter' : /[A-Z]/.test(e.exp) ? 'upper' : /[0-9]/.test(e.exp) ? 'digit' : 'symbol'
    const cc = bump(chars, cls, () => ({ n: 0, err: 0 }))
    cc.n++
    if (!e.ok) {
      k.err++
      cc.err++
      if (e.code && e.code !== target.code) {
        const key = `${target.code}>${e.code}`
        confusions[key] = (confusions[key] ?? 0) + 1
      }
    }
    // timing only counts for clean consecutive key presses
    if (e.ok && e.prevOk && e.dt != null) {
      if (e.dt > MAX_DT) pauses++
      else {
        k.ms += e.dt
        k.k++
        intervals.push(e.dt)
      }
    }
    if (e.pexp != null) {
      const g = e.pexp + e.exp
      const b = bump(bigrams, g, () => ({ n: 0, err: 0, ms: 0, k: 0 }))
      b.n++
      if (!e.ok) b.err++
      else if (e.prevOk && e.dt != null && e.dt <= MAX_DT) {
        b.ms += e.dt
        b.k++
      }
    }
  }

  // keep the most informative bigrams so rows stay small
  const bigramEntries = Object.entries(bigrams)
    .filter(([, b]) => b.n >= 2)
    .sort((a, b) => b[1].err * 3 + b[1].n - (a[1].err * 3 + a[1].n))
    .slice(0, MAX_BIGRAMS)

  return {
    v: 1,
    keys,
    confusions,
    bigrams: Object.fromEntries(bigramEntries),
    chars,
    shift: { n: shiftN, err: shiftErr },
    extra,
    rhythm: rhythmStats(intervals, log, pauses),
  }
}

/** Rhythm statistics from clean inter-key intervals (ms). */
export function rhythmStats(intervals, log = [], pauses = 0) {
  if (intervals.length < 8) return { n: intervals.length, enough: false }
  const med = median(intervals)
  const m = mean(intervals)
  const sd = stdDev(intervals)
  // burstiness: fastest 5-second window vs typical window, in keys per second
  const windows = []
  const presses = log.filter((e) => (e.type === 'c' || e.type === 's')).map((e) => e.t)
  if (presses.length) {
    const last = presses[presses.length - 1]
    for (let start = 0; start + 5000 <= last + 1; start += 2500) {
      const n = presses.filter((t) => t >= start && t < start + 5000).length
      windows.push(n / 5)
    }
  }
  const burstiness = windows.length >= 3 ? roundTo(percentile(windows, 90) / Math.max(0.1, median(windows)), 2) : null
  return {
    n: intervals.length,
    enough: true,
    meanMs: roundTo(m, 1),
    medianMs: roundTo(med, 1),
    sdMs: roundTo(sd, 1),
    cov: roundTo(sd / m, 3),
    keyConsistency: consistencyOf(intervals),
    p90Ms: roundTo(percentile(intervals, 90), 1),
    longPauses: pauses,
    burstiness,
  }
}

// ---- aggregation -----------------------------------------------------------

function mergeStat(into, from) {
  into.n += from.n
  into.err += from.err
  into.ms += from.ms
  into.k += from.k
}

/** Merge many per-session analyses into a single aggregate. */
export function aggregateAnalyses(list) {
  const agg = { sessions: 0, keys: {}, confusions: {}, bigrams: {}, chars: {}, shift: { n: 0, err: 0 }, extra: 0 }
  for (const a of list) {
    if (!a || a.v !== 1) continue
    agg.sessions++
    for (const [c, s] of Object.entries(a.keys ?? {})) mergeStat(bump(agg.keys, c, () => ({ n: 0, err: 0, ms: 0, k: 0 })), s)
    for (const [c, n] of Object.entries(a.confusions ?? {})) agg.confusions[c] = (agg.confusions[c] ?? 0) + n
    for (const [g, s] of Object.entries(a.bigrams ?? {})) mergeStat(bump(agg.bigrams, g, () => ({ n: 0, err: 0, ms: 0, k: 0 })), s)
    for (const [c, s] of Object.entries(a.chars ?? {})) {
      const t = bump(agg.chars, c, () => ({ n: 0, err: 0 }))
      t.n += s.n
      t.err += s.err
    }
    agg.shift.n += a.shift?.n ?? 0
    agg.shift.err += a.shift?.err ?? 0
    agg.extra += a.extra ?? 0
  }
  return agg
}

// ---- geometry: are two physical keys neighbours? ----------------------------

const GRID = {}
;[
  ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'],
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'],
  ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'],
].forEach((row, r) => row.forEach((code, c) => (GRID[code] = { r, c: c + [0, 0.5, 0.75, 1.25][r] })))

export function areAdjacent(a, b) {
  const A = GRID[a]
  const B = GRID[b]
  if (!A || !B || a === b) return false
  return Math.abs(A.r - B.r) <= 1 && Math.abs(A.c - B.c) <= 1.3
}

// ---- weakness detection ------------------------------------------------------

/** Wilson lower bound: a conservative estimate of a true error rate. */
export function wilsonLower(errors, n, z = 1.64) {
  if (n === 0) return 0
  const p = errors / n
  const denom = 1 + (z * z) / n
  const centre = p + (z * z) / (2 * n)
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return Math.max(0, (centre - margin) / denom)
}

const KEY_MIN = 10
const BIGRAM_MIN = 6

/**
 * Finds statistically supported weaknesses. Requires minimum sample sizes and
 * compares against the user's own baseline so a slow typist is not flagged for
 * being slow overall.
 */
export function detectWeaknesses(agg, profile = DEFAULT_KEYBOARD_PROFILE) {
  const layout = profile.layout
  const out = { enoughData: false, keys: [], slowKeys: [], confusions: [], fingers: [], bigrams: [], classes: [], shift: null }
  let totalN = 0
  let totalErr = 0
  const keyMeans = []
  for (const s of Object.values(agg.keys)) {
    totalN += s.n
    totalErr += s.err
    if (s.k >= 5) keyMeans.push(s.ms / s.k)
  }
  out.totalPresses = totalN
  if (totalN < 150) return out
  out.enoughData = true
  const baseErr = totalErr / totalN
  const baseMs = keyMeans.length ? median(keyMeans) : null
  out.baselineErrorRate = baseErr
  out.baselineKeyMs = baseMs

  for (const [code, s] of Object.entries(agg.keys)) {
    if (s.n < KEY_MIN) continue
    const rate = s.err / s.n
    const lower = wilsonLower(s.err, s.n)
    // supported if the conservative estimate still exceeds the user's overall rate by a margin
    if (s.err >= 3 && lower > Math.max(0.03, baseErr * 1.3)) {
      out.keys.push({ code, n: s.n, err: s.err, rate, lower, finger: profileFingerOfCode(profile, code), score: lower - baseErr })
    }
    if (baseMs && s.k >= 8) {
      const ms = s.ms / s.k
      if (ms > baseMs * 1.45 && ms - baseMs > 60) out.slowKeys.push({ code, meanMs: ms, ratio: ms / baseMs, n: s.k, finger: profileFingerOfCode(profile, code) })
    }
  }
  out.keys.sort((a, b) => b.score - a.score)
  out.slowKeys.sort((a, b) => b.ratio - a.ratio)

  for (const [pair, n] of Object.entries(agg.confusions)) {
    if (n < 3) continue
    const [exp, typed] = pair.split('>')
    out.confusions.push({
      expected: exp,
      typed,
      n,
      adjacent: areAdjacent(exp, typed),
      sameHand: profileFingerOfCode(profile, exp)?.[0] === profileFingerOfCode(profile, typed)?.[0],
      expectedFinger: profileFingerOfCode(profile, exp),
      typedFinger: profileFingerOfCode(profile, typed),
    })
  }
  out.confusions.sort((a, b) => b.n - a.n)

  // finger (key-ownership) aggregates
  const fingerAgg = {}
  for (const [code, s] of Object.entries(agg.keys)) {
    const f = profileFingerOfCode(profile, code)
    if (!f) continue
    mergeStat(bump(fingerAgg, f, () => ({ n: 0, err: 0, ms: 0, k: 0 })), s)
  }
  out.fingerStats = fingerAgg
  for (const [f, s] of Object.entries(fingerAgg)) {
    if (s.n < 40) continue
    const rate = s.err / s.n
    if (rate >= 0.05 && wilsonLower(s.err, s.n) > baseErr * 1.25) out.fingers.push({ finger: f, n: s.n, err: s.err, rate })
  }
  out.fingers.sort((a, b) => b.rate - a.rate)

  // bigrams
  const bigramMs = Object.values(agg.bigrams).filter((b) => b.k >= 3).map((b) => b.ms / b.k)
  const bgBase = bigramMs.length ? median(bigramMs) : null
  for (const [g, b] of Object.entries(agg.bigrams)) {
    if (b.n < BIGRAM_MIN) continue
    const slow = bgBase && b.k >= 4 ? b.ms / b.k / bgBase : null
    const errRate = b.err / b.n
    const kA = charToKey(layout, g[0])
    const kB = charToKey(layout, g[1])
    const fa = kA && profileFingerOfCode(profile, kA.code)
    const fb = kB && profileFingerOfCode(profile, kB.code)
    const sameFinger = !!fa && fa === fb && g[0] !== g[1]
    if ((slow && slow >= 1.5) || (b.err >= 2 && errRate >= Math.max(0.1, baseErr * 2))) {
      out.bigrams.push({ gram: g, n: b.n, err: b.err, errRate, meanMs: b.k ? b.ms / b.k : null, slowRatio: slow, sameFinger })
    }
  }
  out.bigrams.sort((a, b) => (b.errRate + (b.slowRatio ?? 0) / 4) - (a.errRate + (a.slowRatio ?? 0) / 4))

  for (const [cls, s] of Object.entries(agg.chars)) {
    if (s.n >= 25 && s.err / s.n > Math.max(0.06, baseErr * 1.6)) out.classes.push({ cls, n: s.n, rate: s.err / s.n })
  }
  if (agg.shift.n >= 20 && agg.shift.err / agg.shift.n > Math.max(0.08, baseErr * 1.6)) {
    out.shift = { n: agg.shift.n, rate: agg.shift.err / agg.shift.n }
  }
  return out
}

/** Error rate for a set of key codes over a list of session analyses (null if too little data). */
export function errorRateForKeys(analyses, codes, minN = 10) {
  let n = 0
  let err = 0
  for (const a of analyses) {
    for (const c of codes) {
      const s = a?.keys?.[c]
      if (s) {
        n += s.n
        err += s.err
      }
    }
  }
  return n >= minN ? { rate: err / n, n } : null
}

/**
 * Has a weakness improved? Compares the older half of the sessions with the
 * most recent ones; returns null unless both sides have enough data.
 */
export function weaknessTrend(analyses, codes) {
  if (analyses.length < 4) return null
  const mid = Math.floor(analyses.length / 2)
  const older = errorRateForKeys(analyses.slice(0, mid), codes, 12)
  const recent = errorRateForKeys(analyses.slice(mid), codes, 12)
  if (!older || !recent) return null
  const delta = recent.rate - older.rate
  const status = delta <= -0.02 ? 'improving' : delta >= 0.02 ? 'worsening' : 'steady'
  return { older: older.rate, recent: recent.rate, delta, status }
}
