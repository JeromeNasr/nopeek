// Personal calibration: learns what "looking at my screen" and "looking down at
// my keyboard" look like for THIS user, camera and posture, and measures how well
// separated the two are. Quality is computed from the data, not assumed:
// if the two clusters overlap, the calibration is reported as insufficient.

import { median } from '../engine/stats.js'

export const DISCRIMINATIVE = ['pitch', 'gazeV', 'gazeLid']
export const CONTEXT = ['yaw', 'gazeH', 'roll', 'openness', 'faceWidth']
const SD_FLOOR = { pitch: 0.7, gazeV: 0.003, gazeLid: 0.015, yaw: 1.0, gazeH: 0.004, roll: 0.8, openness: 0.01, faceWidth: 0.003 }
const MIN_SNR = 1.2
const MAX_WEIGHT = 25
export const MIN_SAMPLES = 40

export const PROFILE_VERSION = 2

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

/** Project a feature vector onto the screen→keyboard axis: 0 = screen, 1 = keyboard. */
export function projectScore(profile, f, offset = null) {
  let num = 0
  let den = 0
  const z = {}
  for (const a of profile.axes) {
    const x = f[a.feature]
    if (x == null || !Number.isFinite(x)) continue
    const base = profile.screen[a.feature].median + (offset?.[a.feature] ?? 0)
    const zi = (x - base) / a.sep
    z[a.feature] = zi
    num += a.weight * zi
    den += a.weight
  }
  return { t: den > 0 ? num / den : null, z }
}

/**
 * Build a calibration profile.
 * @param {{screen: object[], down: object[], brightness?: number|null}} data feature samples for each phase
 */
export function buildProfile({ screen, down, brightness = null }) {
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
        score: 0,
        issues: [{ id: 'few-samples', severity: 'error', message: 'Not enough clear frames were captured. Keep your face in view and your eyes open during each step.' }],
      },
    }
  }

  const screenStats = classStats(s)
  const downStats = classStats(d)

  const axes = []
  for (const feature of DISCRIMINATIVE) {
    const a = screenStats[feature]
    const b = downStats[feature]
    if (!a || !b) continue
    const sep = b.median - a.median
    const pooled = Math.sqrt((a.sd ** 2 + b.sd ** 2) / 2)
    const snr = Math.abs(sep) / pooled
    if (snr >= MIN_SNR) axes.push({ feature, sep, snr, weight: Math.min(MAX_WEIGHT, snr * snr) })
  }

  const profile = { ...base, screen: screenStats, down: downStats, axes }
  if (axes.length === 0) {
    return {
      ...profile,
      ok: false,
      quality: {
        level: 'insufficient',
        score: 0,
        issues: [
          {
            id: 'no-separation',
            severity: 'error',
            message:
              'Looking at the screen and looking at the keyboard produced almost the same measurements. Raise the camera to the top of the screen, sit so your face fills about a third of the frame, and look clearly down at the keys during step 2.',
          },
          ...preflightFromStats(screenStats, brightness),
        ],
      },
    }
  }

  // Empirical separation of the projected scores (accounts for correlated features)
  const ts = s.map((f) => projectScore(profile, f).t).filter((x) => x != null)
  const td = d.map((f) => projectScore(profile, f).t).filter((x) => x != null)
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
  const sd = (a) => {
    const m = mean(a)
    return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length)
  }
  const pooledT = Math.sqrt((sd(ts) ** 2 + sd(td) ** 2) / 2) || 1e-6
  const dPrime = (mean(td) - mean(ts)) / pooledT
  const falsePositive = ts.filter((x) => x > 0.7).length / ts.length // screen frames that look "keyboard"
  const falseNegative = td.filter((x) => x < 0.45).length / td.length // keyboard frames that look "screen"

  let level = 'insufficient'
  if (dPrime >= 3 && falsePositive <= 0.02 && falseNegative <= 0.05) level = 'good'
  else if (dPrime >= 2 && falsePositive <= 0.06 && falseNegative <= 0.12) level = 'fair'
  else if (dPrime >= 1.4 && falsePositive <= 0.12 && falseNegative <= 0.25) level = 'poor'

  const qIssues = preflightFromStats(screenStats, brightness)
  if (axes.length === 1) qIssues.push({ id: 'single-signal', severity: 'info', message: `Only ${axes[0].feature === 'pitch' ? 'head pitch' : 'eye direction'} separates screen from keyboard for you, so tracking relies on a single signal and is less robust to natural head movement.` })
  if (level === 'poor') qIssues.push({ id: 'overlap', severity: 'warn', message: 'Screen and keyboard readings overlap noticeably. Expect missed or false detections; try raising the camera or improving lighting, then recalibrate.' })
  if (level === 'insufficient') qIssues.push({ id: 'overlap', severity: 'error', message: 'Screen and keyboard readings overlap too much to classify reliably. Tracking will not be used for scoring.' })

  return {
    ...profile,
    // 'poor' is reported honestly but is not used to score sessions
    ok: level === 'good' || level === 'fair',
    quality: {
      level,
      dPrime: Math.round(dPrime * 100) / 100,
      // in-sample rates on the calibration frames themselves; NOT real-world accuracy
      inSampleFalsePositive: Math.round(falsePositive * 1000) / 1000,
      inSampleFalseNegative: Math.round(falseNegative * 1000) / 1000,
      signals: axes.map((a) => a.feature),
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
    poor: 'Poor – tracking will often be uncertain. Improve camera position or lighting and recalibrate.',
    insufficient: 'Insufficient – tracking cannot reliably tell screen from keyboard on this setup.',
  }[level]
}

/** Is a stored profile usable for scoring? */
export function profileUsable(profile) {
  return !!profile && profile.version === PROFILE_VERSION && profile.ok && (profile.quality.level === 'good' || profile.quality.level === 'fair')
}
