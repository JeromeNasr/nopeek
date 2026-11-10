// Personal calibration: learns what "looking at my screen" and "looking down at
// my keyboard" look like for THIS user, camera and posture, and measures how well
// separated the two are.
//
// v3: the discriminant is a regularised Fisher LDA over the available signals
// (head pitch, iris offset, iris-between-lids, learned eye-look-down blendshape),
// so correlated signals are not double counted. Quality is CROSS-VALIDATED:
// each capture segment is held out in turn, the model is refit on the rest and
// scored on the unseen segment. If the two looks overlap, the calibration is
// reported as insufficient and never used for scoring.

import { median } from '../engine/stats.js'

export const DISCRIMINATIVE = ['pitch', 'gazeV', 'gazeLid', 'lookDown']
export const CONTEXT = ['yaw', 'gazeH', 'roll', 'openness', 'faceWidth', 'blink']
const SD_FLOOR = { pitch: 0.7, gazeV: 0.003, gazeLid: 0.015, lookDown: 0.02, yaw: 1.0, gazeH: 0.004, roll: 0.8, openness: 0.01, faceWidth: 0.003, blink: 0.02 }
const MIN_SNR = 1.2
const SHRINKAGE = 0.2
export const MIN_SAMPLES = 40
export const PROFILE_VERSION = 3
export const T_ENTER = 0.7
export const T_EXIT = 0.45

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

/** Drop blinks and frames with a bad landmark fit before calibrating. */
export function cleanSamples(samples) {
  const open = median(samples.filter((s) => s && s.openness != null).map((s) => s.openness))
  return samples.filter(
    (s) => s && (s.openness == null || open === 0 || s.openness >= open * 0.6) && (s.eyeDisagreement ?? 0) < 0.12,
  )
}

/** Live positioning guidance from a single frame's features. */
export function preflight(features, brightness = null) {
  const issues = []
  if (!features) return [{ id: 'no-face', severity: 'error', message: 'No face detected. Face the camera and make sure the lens is uncovered.' }]
  if (features.faceWidth < 0.2) issues.push({ id: 'too-far', severity: 'error', message: 'Move closer to the camera – your face is small in the frame.' })
  else if (features.faceWidth > 0.65) issues.push({ id: 'too-close', severity: 'warn', message: 'You are very close to the camera – sit back a little.' })
  if (features.marginFrac < 0.03) issues.push({ id: 'off-center', severity: 'warn', message: 'Part of your face is at the edge of the frame. Centre yourself in the preview.' })
  if (brightness != null && brightness < 55) issues.push({ id: 'dark', severity: 'error', message: 'It is too dark. Face a light source or turn on a lamp (light should come from in front, not behind).' })
  if (brightness != null && brightness > 225) issues.push({ id: 'bright', severity: 'warn', message: 'The image is very bright or washed out – reduce glare or backlighting.' })
  if (features.roll != null && Math.abs(features.roll) > 18) issues.push({ id: 'tilted', severity: 'warn', message: 'Your head is tilted – straighten up for the best accuracy.' })
  if (features.openness != null && features.openness < 0.1) issues.push({ id: 'eyes-closed', severity: 'warn', message: 'Your eyes look closed or squinting. Glasses glare or heavy hair across the eyes can cause this.' })
  if (features.pitch != null && Math.abs(features.pitch) > 35) issues.push({ id: 'pitch-extreme', severity: 'warn', message: 'The camera sees your face from a steep angle. A webcam near the top of the screen works best.' })
  return issues
}

function classStats(samples) {
  const out = {}
  for (const k of [...DISCRIMINATIVE, ...CONTEXT]) {
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
        if (!Number.isFinite(x)) { row.length = 0; break }
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

/** Project a feature vector onto the screen→keyboard axis: 0 = screen, 1 = keyboard. */
export function projectScore(profile, f, offset = null) {
  let num = 0
  let den = 0
  const z = {}
  for (const a of profile.axes) {
    const x = f[a.feature]
    if (x == null || !Number.isFinite(x)) continue
    const base = profile.screen[a.feature].median + (offset?.[a.feature] ?? 0)
    z[a.feature] = (x - base) / a.sep
    num += (a.w * (x - base)) / a.scale
    den += (a.w * a.sep) / a.scale
  }
  return { t: den > 1e-9 ? num / den : null, z }
}

function fit(s, d) {
  const screenStats = classStats(s)
  const downStats = classStats(d)
  const axes = []
  for (const feature of DISCRIMINATIVE) {
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

function rates(model, s, d) {
  const ts = s.map((f) => projectScore(model, f).t).filter((x) => x != null)
  const td = d.map((f) => projectScore(model, f).t).filter((x) => x != null)
  return { ts, td, fp: ts.filter((x) => x > T_ENTER).length, fn: td.filter((x) => x < T_EXIT).length }
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
        issues: [{ id: 'few-samples', severity: 'error', message: 'Not enough clear frames were captured. Keep your face in view and your eyes open during each step.' }],
      },
    }
  }

  const model = fit(s, d)
  const profile = { ...base, ...model }
  if (model.axes.length === 0) {
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
              'Looking at the screen and looking at the keyboard produced almost the same measurements. Raise the camera to the top of the screen, sit so your face fills about a third of the frame, and look clearly down at the keys during the keyboard step.',
          },
          ...preflightFromStats(model.screen, brightness),
        ],
      },
    }
  }

  // In-sample separation of the projected scores
  const ins = rates(profile, s, d)
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
  const sd = (a) => {
    const m = mean(a)
    return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length)
  }
  const pooledT = Math.sqrt((sd(ins.ts) ** 2 + sd(ins.td) ** 2) / 2) || 1e-6
  const dPrime = (mean(ins.td) - mean(ins.ts)) / pooledT
  let falsePositive = ins.fp / ins.ts.length
  let falseNegative = ins.fn / ins.td.length

  // Leave-one-segment-out cross-validation: an honest, out-of-sample estimate
  let validated = false
  let cvFalsePositive = null
  let cvFalseNegative = null
  const sSeg = (screenSegments ?? []).map(cleanSamples).filter((x) => x.length >= 8)
  const dSeg = (downSegments ?? []).map(cleanSamples).filter((x) => x.length >= 8)
  if (sSeg.length >= 2 && dSeg.length >= 2) {
    let fp = 0
    let nS = 0
    let fn = 0
    let nD = 0
    for (let i = 0; i < sSeg.length; i++) {
      const train = sSeg.filter((_, j) => j !== i).flat()
      if (train.length < MIN_SAMPLES / 2) continue
      const m = fit(train, d)
      if (!m.axes.length) { fp += sSeg[i].length; nS += sSeg[i].length; continue }
      const r = rates(m, sSeg[i], [])
      fp += r.fp
      nS += r.ts.length
    }
    for (let i = 0; i < dSeg.length; i++) {
      const train = dSeg.filter((_, j) => j !== i).flat()
      if (train.length < MIN_SAMPLES / 2) continue
      const m = fit(s, train)
      if (!m.axes.length) { fn += dSeg[i].length; nD += dSeg[i].length; continue }
      const r = rates(m, [], dSeg[i])
      fn += r.fn
      nD += r.td.length
    }
    if (nS > 0 && nD > 0) {
      validated = true
      cvFalsePositive = fp / nS
      cvFalseNegative = fn / nD
      falsePositive = Math.max(falsePositive, cvFalsePositive)
      falseNegative = Math.max(falseNegative, cvFalseNegative)
    }
  }

  let level = 'insufficient'
  if (dPrime >= 3 && falsePositive <= 0.02 && falseNegative <= 0.06) level = 'good'
  else if (dPrime >= 2 && falsePositive <= 0.06 && falseNegative <= 0.15) level = 'fair'
  else if (dPrime >= 1.4 && falsePositive <= 0.12 && falseNegative <= 0.3) level = 'poor'

  const qIssues = preflightFromStats(model.screen, brightness)
  const label = { pitch: 'head pitch', gazeV: 'iris position', gazeLid: 'iris position', lookDown: 'eye direction' }
  if (model.axes.length === 1) qIssues.push({ id: 'single-signal', severity: 'info', message: `Only ${label[model.axes[0].feature]} separates screen from keyboard for you, so tracking relies on a single signal and is less robust to natural head movement.` })
  if (level === 'poor') qIssues.push({ id: 'overlap', severity: 'warn', message: 'Screen and keyboard readings overlap noticeably. Expect missed or false detections; try raising the camera or improving lighting, then recalibrate.' })
  if (level === 'insufficient') qIssues.push({ id: 'overlap', severity: 'error', message: 'Screen and keyboard readings overlap too much to classify reliably. Tracking will not be used for scoring.' })

  const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000)
  return {
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
      signals: model.axes.map((a) => a.feature),
      issues: qIssues,
    },
  }
}

function preflightFromStats(stats, brightness) {
  const out = []
  if (stats.faceWidth && stats.faceWidth.median < 0.2) out.push({ id: 'too-far', severity: 'warn', message: 'You were far from the camera; eye landmarks are small and noisy. Sit closer.' })
  if (stats.yaw && Math.abs(stats.yaw.sd) > 9) out.push({ id: 'unstable-head', severity: 'warn', message: 'Your head moved a lot while looking at the screen. Keep still during calibration.' })
  if (stats.openness && stats.openness.median < 0.14) out.push({ id: 'narrow-eyes', severity: 'info', message: 'Your eyes appear quite narrow to the camera (glasses, glare or low camera angle). Detection may be less certain.' })
  if (brightness != null && brightness < 55) out.push({ id: 'dark', severity: 'warn', message: 'Lighting was dim during calibration.' })
  return out
}

export function describeLevel(level) {
  return {
    good: 'Good – screen and keyboard are clearly distinguishable.',
    fair: 'Fair – usable, with occasional uncertain frames.',
    poor: 'Poor – tracking would often be wrong, so it is not used for scoring. Improve camera position or lighting and recalibrate.',
    insufficient: 'Insufficient – tracking cannot reliably tell screen from keyboard on this setup.',
  }[level]
}

/** Is a stored profile usable for scoring? */
export function profileUsable(profile) {
  return !!profile && profile.version === PROFILE_VERSION && profile.ok && (profile.quality.level === 'good' || profile.quality.level === 'fair')
}
