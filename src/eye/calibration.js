// Personal calibration: learns what "looking at my screen" and "looking down at my
// keyboard" look like for THIS user, camera and posture, and measures how well the
// two are separated.
//
// v5
//  * Signals: head pitch, iris position (relative to the eye corners and to the
//    lids), upper-lid height, eye opening, and MediaPipe's learned eye-look-down and
//    blink scores. With a webcam above the screen, the eyelids are among the
//    strongest cues for a downward look, so they are evidence here, not noise.
//  * A regularised Fisher LDA combines them into one score t (0 = screen, 1 = keyboard)
//    without double counting correlated signals. Distinct ways of peeking (head tilt,
//    eyes only…) each get their own prototype.
//  * The score distributions of both looks are fitted (robust Student-t), which turns
//    every frame into a log-likelihood ratio for the temporal filter in classifier.js.
//  * Quality is CROSS-VALIDATED on held-out capture steps. A calibration that only
//    looks good on its own data is not trusted.

import { median } from '../engine/stats.js'

export const SIGNALS = ['pitch', 'gazeV', 'gazeLid', 'lidTop', 'openness', 'lookDown', 'blink']
/** @deprecated name kept for older imports */
export const DISCRIMINATIVE = SIGNALS
export const CONTEXT = ['yaw', 'gazeH', 'roll', 'faceWidth']
const SD_FLOOR = {
  pitch: 0.6, gazeV: 0.003, gazeLid: 0.015, lidTop: 0.005, openness: 0.008, lookDown: 0.02, blink: 0.02,
  yaw: 1.0, gazeH: 0.004, roll: 0.8, faceWidth: 0.003,
}
const MIN_SNR = 1.0
const SHRINKAGE = 0.25
export const MIN_SAMPLES = 40
export const PROFILE_VERSION = 5
// emission model: real typing is less tidy than calibration, so both score
// distributions are widened, and real peeks are often shallower than the requested one
export const SCREEN_WIDEN = 1.6
export const KEY_WIDEN = 1.3
export const KEY_DEPTH = 0.9
const DOF = 4
export const LLR_CLAMP = 3

/** Median and robust SD (1.4826·MAD), after trimming gross outliers. */
export function robustStats(values, floor = 0) {
  const v = values.filter((x) => Number.isFinite(x))
  if (v.length < 3) return { median: v[0] ?? 0, sd: floor, n: v.length }
  let med = median(v)
  const mad = median(v.map((x) => Math.abs(x - med))) * 1.4826
  const keep = mad > 0 ? v.filter((x) => Math.abs(x - med) <= 3.5 * mad) : v
  med = median(keep)
  const mad2 = median(keep.map((x) => Math.abs(x - med))) * 1.4826
  return { median: med, sd: Math.max(mad2, floor), n: keep.length }
}

/** Drop blinks (relative to the same capture) and frames with a broken landmark fit. */
export function cleanSamples(samples) {
  const open = median(samples.filter((s) => s && s.openness != null).map((s) => s.openness))
  return samples.filter(
    (s) => s && (s.openness == null || open === 0 || s.openness >= open * 0.6) && (s.eyeDisagreement ?? 0) < 0.2,
  )
}

/** Live positioning guidance from a single frame's features. */
export function preflight(features, brightness = null) {
  const issues = []
  if (!features) return [{ id: 'no-face', severity: 'error', message: 'No face found. Face the camera and make sure the lens is uncovered.' }]
  // Only a missing (or unusably tiny) face blocks calibration. Everything else is advice:
  // the cross-validated quality check afterwards decides whether tracking can be trusted.
  if (features.faceWidth < 0.06) issues.push({ id: 'too-far', severity: 'error', message: 'Your face is tiny in the frame. Move much closer to the camera.' })
  else if (features.faceWidth < 0.1) issues.push({ id: 'too-far', severity: 'warn', message: 'You are quite far from the camera. Moving a little closer makes tracking steadier.' })
  else if (features.faceWidth > 0.7) issues.push({ id: 'too-close', severity: 'warn', message: 'You are very close to the camera – sit back a little.' })
  if (features.marginFrac < 0.01) issues.push({ id: 'off-center', severity: 'warn', message: 'Part of your face is at the edge of the frame. Centre yourself.' })
  if (brightness != null && brightness < 45) issues.push({ id: 'dark', severity: 'warn', message: 'It is quite dark. A lamp in front of you (not behind) helps a lot.' })
  if (brightness != null && brightness > 230) issues.push({ id: 'bright', severity: 'warn', message: 'The image is washed out – reduce glare or backlighting.' })
  if (features.roll != null && Math.abs(features.roll) > 20) issues.push({ id: 'tilted', severity: 'warn', message: 'Your head is tilted – straighten up.' })
  if (features.openness != null && features.openness < 0.08) issues.push({ id: 'eyes-closed', severity: 'warn', message: 'Your eyes look closed. Look at the screen with your eyes relaxed (glasses glare can also cause this).' })
  return issues
}

function classStats(samples) {
  const out = {}
  for (const k of [...SIGNALS, ...CONTEXT]) {
    const vals = samples.map((s) => s[k]).filter((x) => Number.isFinite(x))
    out[k] = vals.length >= 3 ? robustStats(vals, SD_FLOOR[k]) : null
  }
  return out
}

/** Solve A·x = b for a small symmetric positive-definite matrix (Gauss–Jordan with pivoting). */
export function solve(A, b) {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    if (Math.abs(M[p][c]) < 1e-12) return null
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}

/** Regularised LDA weights in standardised feature space. */
function ldaWeights(axes, s, d, sStats, dStats) {
  const n = axes.length
  const resid = []
  const push = (samples, stats) => {
    for (const f of samples) {
      const row = []
      for (const a of axes) {
        const x = f[a.feature]
        if (!Number.isFinite(x)) {
          row.length = 0
          break
        }
        // winsorise so a few wild frames cannot dominate the covariance
        row.push(Math.max(-4, Math.min(4, (x - stats[a.feature].median) / a.scale)))
      }
      if (row.length === n) resid.push(row)
    }
  }
  push(s, sStats)
  push(d, dStats)
  const C = Array.from({ length: n }, () => new Array(n).fill(0))
  for (const r of resid) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) C[i][j] += r[i] * r[j]
  const m = Math.max(1, resid.length)
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) C[i][j] = (C[i][j] / m) * (1 - SHRINKAGE) + (i === j ? SHRINKAGE : 0)
  const delta = axes.map((a) => a.sep / a.scale)
  let w = solve(C, delta) ?? delta
  // A weight that votes against its own signal's direction is a suppressor effect;
  // it is fragile when a signal drops out, so those are removed.
  w = w.map((wi, i) => (wi * delta[i] > 0 ? wi : 0))
  if (w.every((x) => x === 0)) w = delta
  return w
}

function projectAxes(axes, screen, f, offset) {
  let num = 0
  let den = 0
  const z = {}
  for (const a of axes) {
    const x = f[a.feature]
    if (x == null || !Number.isFinite(x)) continue
    const base = screen[a.feature].median + (offset?.[a.feature] ?? 0)
    z[a.feature] = (x - base) / a.sep
    num += (a.w * (x - base)) / a.scale
    den += (a.w * a.sep) / a.scale
  }
  return { t: den > 1e-9 ? num / den : null, z }
}

/**
 * Each signal's own position between screen (0) and keyboard (1), taken from whichever
 * prototype separates that signal best. Used for diagnostics and the nodding rule.
 */
export function signalZ(profile, f, offset = null) {
  const best = {}
  for (const axes of [profile.axes, ...(profile.protos ?? []).map((p) => p.axes)]) {
    for (const a of axes) if (!best[a.feature] || a.snr > best[a.feature].snr) best[a.feature] = a
  }
  const z = {}
  for (const [k, a] of Object.entries(best)) {
    const x = f[k]
    if (x == null || !Number.isFinite(x)) continue
    z[k] = (x - profile.screen[k].median - (offset?.[k] ?? 0)) / a.sep
  }
  return z
}

/**
 * Project a feature vector onto the screen→keyboard axis: 0 = screen, 1 = keyboard.
 * People look at the keyboard in more than one way (tilting the head, or dropping only
 * the eyes). Each distinct way captured during calibration is its own prototype; the
 * score is the best match among them, so one style is not diluted by another.
 */
export function projectScore(profile, f, offset = null) {
  let best = projectAxes(profile.axes, profile.screen, f, offset)
  for (const proto of profile.protos ?? []) {
    const r = projectAxes(proto.axes, profile.screen, f, offset)
    if (r.t != null && (best.t == null || r.t > best.t)) best = r
  }
  return best
}

/** log density of a Student-t (location m, scale s, dof v), up to a constant shared by both classes. */
export function studentLogPdf(x, m, s, v = DOF) {
  const z = (x - m) / s
  return -((v + 1) / 2) * Math.log(1 + (z * z) / v) - Math.log(s)
}

/**
 * Evidence for "keyboard" over "screen" carried by one projected score:
 * log p(t | keyboard) − log p(t | screen), clamped so no single frame can decide alone.
 */
export function frameLLR(profile, t, tOffset = 0) {
  const e = profile.emission
  if (!e || t == null) return null
  const x = t - tOffset
  const ls = studentLogPdf(x, e.s.mu, e.s.sd * SCREEN_WIDEN)
  const lk = studentLogPdf(x, e.k.mu * KEY_DEPTH, e.k.sd * KEY_WIDEN)
  return Math.max(-LLR_CLAMP, Math.min(LLR_CLAMP, lk - ls))
}

/** The score at which a frame is equally likely to be screen or keyboard (for display). */
export function decisionPoint(profile) {
  if (!profile?.emission) return 0.5
  let lo = profile.emission.s.mu
  let hi = profile.emission.k.mu * KEY_DEPTH
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (frameLLR(profile, mid) > 0) hi = mid
    else lo = mid
  }
  return Math.round(((lo + hi) / 2) * 100) / 100
}

function fit(s, d) {
  const screenStats = classStats(s)
  const downStats = classStats(d)
  const axes = []
  for (const feature of SIGNALS) {
    const a = screenStats[feature]
    const b = downStats[feature]
    if (!a || !b) continue
    const sep = b.median - a.median
    const scale = Math.sqrt((a.sd ** 2 + b.sd ** 2) / 2)
    const snr = Math.abs(sep) / scale
    if (snr >= MIN_SNR) axes.push({ feature, sep, snr, scale })
  }
  if (axes.length) {
    const w = ldaWeights(axes, s, d, screenStats, downStats)
    axes.forEach((a, i) => (a.w = w[i]))
  }
  return { screen: screenStats, down: downStats, axes }
}

/** Do two keyboard captures look like different ways of peeking? */
function distinctStyles(a, b) {
  for (const k of SIGNALS) {
    if (!a.down[k] || !b.down[k]) continue
    const gap = Math.abs(a.down[k].median - b.down[k].median)
    const scale = Math.sqrt((a.down[k].sd ** 2 + b.down[k].sd ** 2) / 2)
    if (gap / scale > 2.5) return true
  }
  return false
}

/** Fit emission distributions to the projected scores of each class. */
function emissionFor(model, s, d) {
  const ts = s.map((f) => projectScore(model, f).t).filter((x) => x != null)
  const td = d.map((f) => projectScore(model, f).t).filter((x) => x != null)
  const rs = robustStats(ts, 0.07)
  const rk = robustStats(td, 0.1)
  return { s: { mu: rs.median, sd: rs.sd }, k: { mu: Math.max(rk.median, rs.median + 0.3), sd: rk.sd }, ts, td }
}

/** Pooled model plus one prototype per distinct keyboard-look style, with its emission model. */
function fitFull(s, d, dSegs = []) {
  const model = fit(s, d)
  const protos = []
  if (model.axes.length && dSegs.length >= 2) {
    const fits = dSegs.filter((seg) => seg.length >= 15).map((seg) => fit(s, seg)).filter((m) => m.axes.length)
    const kept = []
    for (const m of fits) if (!kept.some((k) => !distinctStyles(k, m))) kept.push(m)
    if (kept.length >= 2) for (const m of kept.slice(0, 4)) protos.push({ axes: m.axes, down: m.down })
  }
  const full = { ...model, protos }
  if (model.axes.length) {
    const { s: es, k: ek } = emissionFor(full, s, d)
    full.emission = { s: es, k: ek }
  }
  return full
}

/** Fraction of frames the per-frame evidence would assign to the wrong look. */
function frameErrors(model, s, d) {
  let fp = 0
  let nS = 0
  for (const f of s) {
    const t = projectScore(model, f).t
    if (t == null) continue
    nS++
    if (frameLLR(model, t) > 0) fp++
  }
  let fn = 0
  let nD = 0
  for (const f of d) {
    const t = projectScore(model, f).t
    if (t == null) continue
    nD++
    if (frameLLR(model, t) < 0) fn++
  }
  return { fp, nS, fn, nD }
}

/**
 * Build a calibration profile.
 * @param {object} data
 * @param {object[]} data.screen  feature samples while looking at the screen
 * @param {object[]} data.down    feature samples while looking at the keyboard
 * @param {object[][]} [data.screenSegments]  the same screen samples split by capture step (enables cross-validation)
 * @param {object[][]} [data.downSegments]
 */
export function buildProfile({ screen, down, brightness = null, screenSegments = null, downSegments = null }) {
  const s = cleanSamples(screen)
  const d = cleanSamples(down)
  const base = {
    version: PROFILE_VERSION,
    createdAt: Date.now(),
    counts: { screen: s.length, down: d.length, screenRaw: screen.length, downRaw: down.length },
    brightness,
  }
  if (s.length < MIN_SAMPLES || d.length < MIN_SAMPLES) {
    return {
      ...base,
      ok: false,
      quality: {
        level: 'insufficient',
        issues: [{ id: 'few-samples', severity: 'error', message: 'Not enough clear frames were captured. Keep your face in view and your eyes on the target during each step.' }],
      },
    }
  }

  const dSegAll = (downSegments ?? []).map(cleanSamples)
  const model = fitFull(s, d, dSegAll)
  const profile = { ...base, ...model }
  if (model.axes.length === 0 || !model.emission) {
    return {
      ...profile,
      ok: false,
      quality: {
        level: 'insufficient',
        issues: [
          {
            id: 'no-separation',
            severity: 'error',
            message:
              'Looking at the screen and looking at the keyboard produced almost the same measurements. Put the camera at the top of the screen, sit so your whole face is visible, and look clearly down at the keys when you hear the beep.',
          },
          ...preflightFromStats(model.screen, brightness),
        ],
      },
    }
  }

  // separation of the projected scores
  const { s: es, k: ek } = model.emission
  const dPrime = (ek.mu - es.mu) / Math.sqrt((es.sd ** 2 + ek.sd ** 2) / 2)
  const ins = frameErrors(profile, s, d)
  let falsePositive = ins.fp / Math.max(1, ins.nS)
  let falseNegative = ins.fn / Math.max(1, ins.nD)

  // Leave-one-segment-out cross-validation: an honest, out-of-sample estimate
  let validated = false
  let cvFalsePositive = null
  let cvFalseNegative = null
  const sSeg = (screenSegments ?? []).map(cleanSamples).filter((x) => x.length >= 8)
  const dSeg = dSegAll.filter((x) => x.length >= 8)
  if (sSeg.length >= 2 && dSeg.length >= 2) {
    let fp = 0
    let nS = 0
    let fn = 0
    let nD = 0
    for (let i = 0; i < sSeg.length; i++) {
      const train = sSeg.filter((_, j) => j !== i).flat()
      if (train.length < MIN_SAMPLES / 2) continue
      const m = fitFull(train, d, dSegAll)
      if (!m.emission) {
        fp += sSeg[i].length
        nS += sSeg[i].length
        continue
      }
      const r = frameErrors(m, sSeg[i], [])
      fp += r.fp
      nS += r.nS
    }
    if (model.protos.length >= 2) {
      // Distinct peeking styles were each captured once, so holding a whole capture out
      // would test a style the model never saw. Hold out alternating slices of every capture instead.
      for (const half of [0, 1]) {
        const trainSegs = dSeg.map((seg) => seg.filter((_, k) => (k >> 2) % 2 !== half))
        const testSet = dSeg.flatMap((seg) => seg.filter((_, k) => (k >> 2) % 2 === half))
        const m = fitFull(s, trainSegs.flat(), trainSegs)
        if (!m.emission) {
          fn += testSet.length
          nD += testSet.length
          continue
        }
        const r = frameErrors(m, [], testSet)
        fn += r.fn
        nD += r.nD
      }
    } else {
      for (let i = 0; i < dSeg.length; i++) {
        const train = dSeg.filter((_, j) => j !== i).flat()
        if (train.length < MIN_SAMPLES / 2) continue
        const m = fitFull(s, train)
        if (!m.emission) {
          fn += dSeg[i].length
          nD += dSeg[i].length
          continue
        }
        const r = frameErrors(m, [], dSeg[i])
        fn += r.fn
        nD += r.nD
      }
    }
    if (nS > 0 && nD > 0) {
      validated = true
      cvFalsePositive = fp / nS
      cvFalseNegative = fn / nD
      falsePositive = Math.max(falsePositive, cvFalsePositive)
      falseNegative = Math.max(falseNegative, cvFalseNegative)
    }
  }

  // Frame-level error rates. The temporal filter needs several consistent frames to
  // switch state, so moderate frame error rates still give reliable peek detection.
  let level = 'insufficient'
  if (dPrime >= 2.5 && falsePositive <= 0.04 && falseNegative <= 0.12) level = 'good'
  else if (dPrime >= 1.6 && falsePositive <= 0.1 && falseNegative <= 0.25) level = 'fair'
  else if (dPrime >= 1.1 && falsePositive <= 0.2 && falseNegative <= 0.4) level = 'poor'

  const qIssues = preflightFromStats(model.screen, brightness)
  if (level === 'poor') qIssues.push({ id: 'overlap', severity: 'warn', message: 'Screen and keyboard readings overlap noticeably. Look down more clearly at the keys during the keyboard step, or raise the camera, then try again.' })
  if (level === 'insufficient') qIssues.push({ id: 'overlap', severity: 'error', message: 'Screen and keyboard readings overlap too much to tell apart. Tracking will not be used for scoring.' })

  const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000)
  const usedSignals = [...new Set([...model.axes, ...model.protos.flatMap((p) => p.axes)].map((a) => a.feature))]
  const full = {
    ...profile,
    // 'poor' is reported honestly but is not used to score sessions
    ok: level === 'good' || level === 'fair',
    quality: {
      level,
      dPrime: Math.round(dPrime * 100) / 100,
      validated,
      // held-out estimates when validated; otherwise measured on the calibration frames themselves
      falsePositive: r3(falsePositive),
      falseNegative: r3(falseNegative),
      cvFalsePositive: r3(cvFalsePositive),
      cvFalseNegative: r3(cvFalseNegative),
      signals: usedSignals,
      styles: Math.max(1, model.protos.length),
      issues: qIssues,
    },
  }
  full.thresholds = { enter: decisionPoint(full), exit: decisionPoint(full) }
  return full
}

function preflightFromStats(stats, brightness) {
  const out = []
  if (stats.faceWidth && stats.faceWidth.median < 0.1) out.push({ id: 'too-far', severity: 'info', message: 'You were fairly far from the camera; sitting a little closer gives steadier eye readings.' })
  if (stats.yaw && Math.abs(stats.yaw.sd) > 9) out.push({ id: 'unstable-head', severity: 'info', message: 'Your head moved a lot while following the dots. Keep your head natural and move mainly your eyes.' })
  if (brightness != null && brightness < 45) out.push({ id: 'dark', severity: 'info', message: 'Lighting was dim during calibration; more light in front of you helps.' })
  return out
}

export function describeLevel(level) {
  return {
    good: 'Good – screen and keyboard are clearly distinguishable.',
    fair: 'Fair – usable; a few looks may be detected a moment late.',
    poor: 'Poor – it would often be wrong, so it is not used for scoring. Try the keyboard step again, looking down more clearly.',
    insufficient: 'Insufficient – it cannot tell screen from keyboard on this setup yet.',
  }[level]
}

/** Is a stored profile usable for scoring? */
export function profileUsable(profile) {
  return !!profile && profile.version === PROFILE_VERSION && profile.ok && !!profile.emission && (profile.quality.level === 'good' || profile.quality.level === 'fair')
}
