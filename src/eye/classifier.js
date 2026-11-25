// Gaze classification.
//
// Every frame is turned into EVIDENCE (a log-likelihood ratio: does this look more like
// my keyboard look or my screen look?) using the personal calibration. A two-state hidden
// Markov filter accumulates that evidence over time into P(keyboard):
//   * a single noisy frame cannot flip the state,
//   * a clear look flips it within a few frames,
//   * a borderline look needs more frames,
//   * frames that carry no information (blinks, bad light, half a face) simply hold it.
// Peeks, brief glances and returns are read from P(keyboard) with hysteresis and a short
// confirmation time.
//
// States
//   screen       looking at the screen
//   keyboard     confirmed look down toward the keyboard (a "peek")
//   away         confirmed look elsewhere (side, up, away from the desk)
//   uncertain    we cannot tell (poor measurements, or evidence that stays ambiguous)
//   unavailable  no face / camera lost

import { frameLLR, projectScore, signalZ } from './calibration.js'

/**
 * One-Euro filter (Casiez et al.): heavy smoothing while a signal is steady, little
 * while it moves fast. Used for display meters.
 */
export class OneEuro {
  constructor(minCutoff = 1.2, beta = 0.6, dCutoff = 1) {
    this.minCutoff = minCutoff
    this.beta = beta
    this.dCutoff = dCutoff
    this.reset()
  }
  reset() {
    this.x = null
    this.dx = 0
    this.t = null
  }
  filter(x, t) {
    if (this.x == null || t <= this.t) {
      this.x = x
      this.t = t
      return x
    }
    const dt = Math.min(0.5, (t - this.t) / 1000)
    const alpha = (cut) => 1 / (1 + 1 / (2 * Math.PI * cut * dt))
    const dx = (x - this.x) / dt
    this.dx += alpha(this.dCutoff) * (dx - this.dx)
    const a = alpha(this.minCutoff + this.beta * Math.abs(this.dx))
    this.x += a * (x - this.x)
    this.t = t
    return this.x
  }
}

export const STATE = Object.freeze({
  SCREEN: 'screen',
  KEYBOARD: 'keyboard',
  AWAY: 'away',
  UNCERTAIN: 'uncertain',
  UNAVAILABLE: 'unavailable',
})

export const SENSITIVITY = {
  relaxed: { confirmDownMs: 600, pEnter: 0.95 },
  balanced: { confirmDownMs: 280, pEnter: 0.9 },
  strict: { confirmDownMs: 150, pEnter: 0.85 },
}

export const DEFAULT_PARAMS = {
  confirmDownMs: 280,
  pEnter: 0.9,
  pExit: 0.35,
  exitConfirmMs: 150,
  confirmAwayMs: 800,
  minBriefMs: 150,
  noFaceGraceMs: 600,
  reacquireFrames: 3,
  uncertainAfterMs: 1200,
  // Eyes that look "closed" for longer than a blink while typing are, with a webcam above
  // the screen, almost always looking down at the keys.
  closedAsDownMs: 600,
  closedLLR: 1.2,
  // HMM priors: roughly one look down every 4 s, a look lasts about 1 s
  rateToKeyboard: 0.25,
  rateToScreen: 1.0,
  yawAwayDeg: 22,
  gazeAwayH: 0.22,
  upScore: -0.9,
  minConfidence: 0.5,
  // posture adaptation
  adaptWindowMs: 20000,
  adaptEveryMs: 1000,
  adaptMinFrames: 120,
  adaptMaxOffset: 0.4,
}

export function paramsFor(sensitivity = 'balanced') {
  return { ...DEFAULT_PARAMS, ...(SENSITIVITY[sensitivity] ?? SENSITIVITY.balanced) }
}

/**
 * Confidence in a frame's measurements, 0..1. Only genuinely unusable frames fall below
 * 0.5: a face far from the camera is normal and is not penalised much.
 */
export function frameConfidence(f, brightness = null) {
  let q = 1
  if (f.faceWidth < 0.06) q *= 0.3
  else if (f.faceWidth < 0.1) q *= 0.8
  else if (f.faceWidth > 0.8) q *= 0.6
  if (f.marginFrac < -0.02) q *= 0.5 // part of the face is outside the frame
  if (brightness != null && brightness < 25) q *= 0.45
  if ((f.eyeDisagreement ?? 0) > 0.25) q *= 0.5
  if (f.roll != null && Math.abs(f.roll) > 40) q *= 0.5
  return q
}

/** Is this frame a blink-like eye closure (relative to this user's own eyes)? */
function isClosed(profile, f) {
  const openS = profile.screen.openness?.median ?? null
  const openD = profile.down?.openness?.median ?? openS
  const blinkD = profile.down?.blink?.median ?? profile.screen.blink?.median ?? null
  const byLids = f.openness != null && openS != null && f.openness < Math.min(openS * 0.45, (openD ?? openS) * 0.65)
  const byShape = f.blink != null && blinkD != null && f.blink > Math.max(0.7, blinkD + 0.25)
  return byLids || byShape
}

/**
 * Score one frame. Pure function: no temporal logic.
 * @returns {{ label: 'screen'|'down'|'ambiguous'|'closed'|'away'|'uncertain', t: number|null, llr: number|null, z: object, confidence: number, reason?: string }}
 */
export function scoreFrame(profile, f, { params = DEFAULT_PARAMS, offset = null, tOffset = 0, brightness = null } = {}) {
  const confidence = frameConfidence(f, brightness)
  const { t, z: rawZ } = projectScore(profile, f, offset)
  const z = signalZ(profile, f, offset)
  if (confidence < params.minConfidence) return { label: 'uncertain', t, llr: null, z, confidence, reason: 'low-confidence' }
  if (t == null) return { label: 'uncertain', t: null, llr: null, z: rawZ, confidence, reason: 'no-signal' }

  if (isClosed(profile, f)) {
    // A blink and a very deep look down both close the eyes. A clearly dipped head says "look";
    // otherwise the tracker decides by duration (blinks are short).
    if (!(z.pitch != null && z.pitch >= 0.6)) return { label: 'closed', t, llr: null, z, confidence, reason: 'eyes-closed' }
  }

  // Away: head turned sideways, eyes far to the side, or looking well above the screen.
  const sYaw = profile.screen.yaw
  const yawDev = f.yaw != null && sYaw ? Math.abs(f.yaw - sYaw.median - (offset?.yaw ?? 0)) : 0
  const yawLimit = Math.max(params.yawAwayDeg, (sYaw?.sd ?? 0) * 3.5)
  const sGaze = profile.screen.gazeH
  const gazeHDev = f.gazeH != null && sGaze ? Math.abs(f.gazeH - sGaze.median) : 0
  const gazeLimit = Math.max(params.gazeAwayH, (sGaze?.sd ?? 0) * 4)
  const tc = t - tOffset
  if (yawDev > yawLimit || (gazeHDev > gazeLimit && yawDev > yawLimit * 0.5) || tc < params.upScore) {
    return { label: 'away', t, llr: null, z, confidence, reason: yawDev > yawLimit ? 'head-turned' : tc < params.upScore ? 'looking-up' : 'eyes-sideways' }
  }

  // A dipped head with the eyes rolled UP toward the screen is thinking or nodding, not a peek.
  // (Eyes dropping while the head stays still is a real, eyes-only peek and is NOT excluded.)
  const eyeZ = ['gazeV', 'gazeLid', 'lidTop', 'lookDown'].map((k) => z[k]).filter((v) => v != null)
  const eyeMean = eyeZ.length ? eyeZ.reduce((x, y) => x + y, 0) / eyeZ.length : null
  if (z.pitch != null && z.pitch > 0.5 && eyeMean != null && eyeMean < -0.2) {
    return { label: 'uncertain', t, llr: null, z, confidence, reason: 'head-down-eyes-up' }
  }

  // evidence, weighted by how much the measurements can be trusted
  const raw = frameLLR(profile, t, tOffset)
  if (raw == null) return { label: 'uncertain', t, llr: null, z, confidence, reason: 'no-model' }
  const llr = raw * Math.min(1, confidence)
  const label = llr > 0.5 ? 'down' : llr < -0.5 ? 'screen' : 'ambiguous'
  return { label, t, llr, z, confidence }
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))]

/**
 * Temporal filter + state machine. Feed it timestamped feature frames; it emits events
 * (peek-start / peek-end / glance / away-start / away-end) and keeps `state` current.
 */
export class GazeTracker {
  constructor(profile, params = DEFAULT_PARAMS) {
    this.profile = profile
    this.params = params
    this.reset()
  }

  reset() {
    this.state = STATE.UNAVAILABLE
    this.stateSince = null
    this.pK = 0.05 // P(keyboard)
    this.lastT = null
    this.lastFaceT = null
    this.goodStreak = 0
    this.uncertainSince = null
    this.ambiguousSince = null
    this.closedSince = null
    this.aboveSince = null // P(keyboard) first crossed 0.5 in this excursion
    this.aboveFrom = null
    this.enterSince = null // P(keyboard) >= pEnter continuously since
    this.belowSince = null // while in keyboard: P(keyboard) first dropped below 0.5
    this.exitSince = null
    this.awayCand = null
    this.awayExitSince = null
    this.keyboardStart = null
    this.awayStart = null
    this.offset = { pitch: 0, gazeV: 0, gazeLid: 0, lidTop: 0, openness: 0, lookDown: 0, blink: 0, yaw: 0 }
    this.tOffset = 0
    this.window = []
    this.lastAdapt = 0
    this.last = { label: 'none', t: null, llr: null, confidence: 0 }
  }

  _set(state, t) {
    if (this.state !== state) {
      this.state = state
      this.stateSince = t
    }
  }

  /** How far the screen baseline has drifted, relative to the screen→keyboard separation (0..1+). */
  driftRatio() {
    let worst = Math.abs(this.tOffset)
    for (const a of this.profile.axes) {
      const off = Math.abs(this.offset[a.feature] ?? 0)
      worst = Math.max(worst, off / Math.abs(a.sep))
    }
    return worst
  }

  /**
   * @param {number} t ms timestamp
   * @param {object|null} features from extractFeatures, or null when no face
   * @param {number|null} brightness
   */
  update(t, features, brightness = null) {
    const p = this.params
    const events = []
    const emit = (e) => events.push(e)
    const dt = this.lastT == null ? 50 : Math.max(0, Math.min(500, t - this.lastT))
    this.lastT = t

    if (!features) {
      this.goodStreak = 0
      this.closedSince = null
      if (this.lastFaceT == null || t - this.lastFaceT > p.noFaceGraceMs) {
        this._closeOpenPeriods(t, emit)
        this._clearCandidates()
        this.pK = 0.05
        this._set(STATE.UNAVAILABLE, t)
      }
      this.last = { label: 'none', t: null, llr: null, confidence: 0 }
      return this._out(events)
    }
    this.lastFaceT = t

    const frame = scoreFrame(this.profile, features, { params: p, offset: this.offset, tOffset: this.tOffset, brightness })
    this.last = frame

    if (this.state === STATE.UNAVAILABLE) {
      if (frame.label === 'uncertain') {
        this.goodStreak = 0
        return this._out(events)
      }
      this.goodStreak++
      if (this.goodStreak < p.reacquireFrames) return this._out(events)
      this.pK = 0.05
      this._set(STATE.UNCERTAIN, t)
    }

    // ---- evidence ------------------------------------------------------------------
    let llr = frame.llr
    if (frame.label === 'closed') {
      this.closedSince ??= t
      llr = t - this.closedSince >= p.closedAsDownMs ? p.closedLLR : null
    } else {
      this.closedSince = null
    }

    // HMM predict (continuous-time switching) then update with this frame's evidence
    const a = 1 - Math.exp(-(dt / 1000) * p.rateToScreen)
    const b = 1 - Math.exp(-(dt / 1000) * p.rateToKeyboard)
    let pk = this.pK * (1 - a) + (1 - this.pK) * b
    if (llr != null && frame.label !== 'away') {
      const odds = (pk / (1 - pk)) * Math.exp(llr)
      pk = odds / (1 + odds)
    }
    this.pK = Math.min(1 - 1e-4, Math.max(1e-4, pk))

    if (frame.llr != null && frame.confidence >= 0.7) this._adapt(t, frame.t)

    // ---- away ----------------------------------------------------------------------
    if (frame.label === 'away') {
      this.awayExitSince = null
      if (this.state !== STATE.AWAY) {
        this.awayCand ??= { since: t, from: this.state }
        if (t - this.awayCand.since >= p.confirmAwayMs) {
          const { since, from } = this.awayCand
          this.awayCand = null
          if (this.state === STATE.KEYBOARD) this._endPeriod(since, emit, STATE.UNCERTAIN)
          this._clearKeyboardCandidate()
          this._set(STATE.AWAY, since)
          this.awayStart = since
          emit({ type: 'away-start', startT: since, confirmedAt: t, from })
        }
      }
      this.uncertainSince = null
      return this._out(events)
    }
    if (this.awayCand) {
      const dur = t - this.awayCand.since
      if (dur >= p.minBriefMs) emit({ type: 'glance', kind: 'away', startT: this.awayCand.since, durationMs: dur, from: this.awayCand.from })
      this.awayCand = null
    }
    if (this.state === STATE.AWAY && llr != null && this.pK < 0.5) {
      this.awayExitSince ??= t
      if (t - this.awayExitSince >= p.exitConfirmMs) this._endPeriod(this.awayExitSince, emit, STATE.SCREEN)
    }

    // ---- frames we cannot use --------------------------------------------------------
    if (llr == null && frame.label !== 'closed') {
      this.uncertainSince ??= t
      if (t - this.uncertainSince >= p.uncertainAfterMs) {
        if (this.state === STATE.KEYBOARD || this.state === STATE.AWAY) this._endPeriod(t, emit, STATE.UNCERTAIN)
        else if (this.state === STATE.SCREEN) this._set(STATE.UNCERTAIN, t)
        this._clearKeyboardCandidate()
      }
    } else {
      this.uncertainSince = null
    }

    // ---- keyboard ------------------------------------------------------------------
    if (this.state === STATE.KEYBOARD) {
      if (this.pK < 0.5) this.belowSince ??= t
      else this.belowSince = null
      if (this.pK <= p.pExit) {
        this.exitSince ??= t
        if (t - this.exitSince >= p.exitConfirmMs) this._endPeriod(this.belowSince ?? this.exitSince, emit, STATE.SCREEN)
      } else {
        this.exitSince = null
      }
      return this._out(events)
    }

    if (this.pK >= 0.5) {
      if (this.aboveSince == null) {
        this.aboveSince = t
        this.aboveFrom = this.state
      }
    } else if (this.aboveSince != null) {
      const dur = t - this.aboveSince
      if (dur >= p.minBriefMs) emit({ type: 'glance', kind: 'keyboard', startT: this.aboveSince, durationMs: dur, from: this.aboveFrom })
      this.aboveSince = null
      this.aboveFrom = null
    }

    if (this.pK >= p.pEnter) {
      this.enterSince ??= t
      if (t - this.enterSince >= p.confirmDownMs) {
        const startT = this.aboveSince ?? this.enterSince
        const from = this.aboveFrom ?? this.state
        if (this.state === STATE.AWAY) this._endPeriod(startT, emit, STATE.UNCERTAIN)
        this._clearKeyboardCandidate()
        this._set(STATE.KEYBOARD, startT)
        this.keyboardStart = startT
        this.belowSince = null
        this.exitSince = null
        emit({ type: 'peek-start', startT, confirmedAt: t, from })
        return this._out(events)
      }
    } else {
      this.enterSince = null
    }

    if (llr != null && this.state !== STATE.AWAY) {
      if (this.pK < 0.5) {
        this.ambiguousSince = null
        this._set(STATE.SCREEN, t)
      } else {
        // probability stuck between "screen" and a confirmed look: say so honestly
        this.ambiguousSince ??= t
        if (t - this.ambiguousSince >= p.uncertainAfterMs && this.state === STATE.SCREEN) this._set(STATE.UNCERTAIN, t)
      }
    }
    return this._out(events)
  }

  _clearKeyboardCandidate() {
    this.aboveSince = null
    this.aboveFrom = null
    this.enterSince = null
    this.ambiguousSince = null
  }

  _clearCandidates() {
    this._clearKeyboardCandidate()
    this.awayCand = null
    this.awayExitSince = null
    this.uncertainSince = null
    this.closedSince = null
  }

  _endPeriod(endT, emit, next) {
    if (this.state === STATE.KEYBOARD) {
      emit({ type: 'peek-end', startT: this.keyboardStart, endT, durationMs: Math.max(0, endT - this.keyboardStart) })
      this.keyboardStart = null
    } else if (this.state === STATE.AWAY) {
      emit({ type: 'away-end', startT: this.awayStart, endT, durationMs: Math.max(0, endT - this.awayStart) })
      this.awayStart = null
    }
    this.exitSince = null
    this.belowSince = null
    this.awayExitSince = null
    this._set(next, endT)
  }

  _closeOpenPeriods(t, emit) {
    if (this.state === STATE.KEYBOARD || this.state === STATE.AWAY) this._endPeriod(this.lastFaceT ?? t, emit, STATE.UNAVAILABLE)
  }

  /**
   * Follow posture changes (leaning in, slouching, moving the laptop). The 15th percentile
   * of recent scores is where "looking at the screen" now sits, as long as the user spends at
   * least ~15 % of the time on the screen. Large, keyboard-sized shifts are never absorbed, so
   * someone who peeks constantly does not teach the tracker that peeking is normal.
   */
  _adapt(t, rawT) {
    const p = this.params
    this.window.push({ at: t, v: rawT })
    let drop = 0
    while (drop < this.window.length && t - this.window[drop].at > p.adaptWindowMs) drop++
    if (drop) this.window.splice(0, drop)
    if (t - this.lastAdapt < p.adaptEveryMs || this.window.length < p.adaptMinFrames) return
    this.lastAdapt = t
    const vals = this.window.map((x) => x.v - this.tOffset).sort((x, y) => x - y)
    const p15 = quantile(vals, 0.15)
    let next = this.tOffset
    if (p15 > 0.12 && p15 < 0.55) next += 0.3 * (p15 - 0.05)
    else if (p15 < -0.3) next += 0.3 * (p15 + 0.1)
    this.tOffset = Math.max(-p.adaptMaxOffset, Math.min(p.adaptMaxOffset, next))
  }

  /**
   * Instantly re-centre the screen baseline from a short burst of frames captured
   * while the user looks at the screen (after shifting in the chair, moving the laptop…).
   */
  recenter(samples) {
    const ok = samples.filter(Boolean)
    if (ok.length < 8) return false
    for (const key of Object.keys(this.offset)) {
      const base = this.profile.screen[key]
      const vals = ok.map((f) => f[key]).filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
      if (!base || !vals.length) continue
      this.offset[key] = vals[vals.length >> 1] - base.median
    }
    this.tOffset = 0
    this.window = []
    this.pK = 0.05
    return true
  }

  /** Kept for callers of the previous API; adaptation now happens inside update(). */
  adaptFrom() {}

  _out(events) {
    return {
      state: this.state,
      since: this.stateSince,
      label: this.last.label,
      score: this.last.t ?? null,
      pKeyboard: this.pK,
      confidence: this.last.confidence ?? 0,
      reason: this.last.reason,
      z: this.last.z ?? null,
      candidate: this.aboveSince != null ? 'down' : this.awayCand ? 'away' : null,
      events,
    }
  }
}
