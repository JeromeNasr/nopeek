// Pure statistics helpers shared by the typing engine, rhythm analysis and the
// dashboard. No DOM, no React.

export function mean(values) {
  if (!values.length) return 0
  let sum = 0
  for (const v of values) sum += v
  return sum / values.length
}

/** Population standard deviation. */
export function stdDev(values) {
  if (values.length < 2) return 0
  const m = mean(values)
  let acc = 0
  for (const v of values) acc += (v - m) * (v - m)
  return Math.sqrt(acc / values.length)
}

export function median(values) {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function percentile(values, p) {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const idx = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))
  return s[idx]
}

export const roundTo = (v, places = 2) => {
  const f = 10 ** places
  return Math.round(v * f) / f
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/**
 * Maps a coefficient of variation in [0, inf) to a 0-100 consistency score.
 * This is the same published mapping Monkeytype uses ("kogasa"): a variant of
 * tanh that stays close to linear near 0. It is a mathematical formula, written
 * here independently; see NOTICE.md.
 */
export function consistencyFromCov(cov) {
  if (!Number.isFinite(cov) || cov < 0) return 0
  return 100 * (1 - Math.tanh(cov + cov ** 3 / 3 + cov ** 5 / 5))
}

/** Consistency (0-100) of a series: 100 = perfectly even. */
export function consistencyOf(values) {
  if (values.length < 2) return null
  const m = mean(values)
  if (m <= 0) return null
  return roundTo(consistencyFromCov(stdDev(values) / m))
}

/** Standard WPM: five characters = one word. */
export function wpmFromChars(chars, ms) {
  if (ms <= 0) return 0
  return (chars / 5) * (60000 / ms)
}

export function accuracyPct(correct, incorrect) {
  const total = correct + incorrect
  return total === 0 ? null : (correct / total) * 100
}
