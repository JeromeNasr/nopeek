// Gaze classification: per-frame scoring against a personal calibration, then a
// time-aware state machine.
//
// States
//   screen       looking at the screen
//   keyboard     confirmed look down toward the keyboard (a "peek")
//   away         confirmed look elsewhere (side, up, away from the desk)
//   uncertain    we cannot tell (blinks excluded; low confidence / ambiguous / disagreeing signals)
//   unavailable  no face / camera lost
// Short deviations that return to the screen are recorded as brief glances, not peeks.

import { projectScore } from './calibration.js'

export const STATE = Object.freeze({
  SCREEN: 'screen',
  KEYBOARD: 'keyboard',
  AWAY: 'away',
  UNCERTAIN: 'uncertain',
  UNAVAILABLE: 'unavailable',
})

export const SENSITIVITY = {
  relaxed: { confirmDownMs: 750, enterDown: 0.75 },
  balanced: { confirmDownMs: 450, enterDown: 0.7 },
  strict: { confirmDownMs: 300, enterDown: 0.62 },
}

export const DEFAULT_PARAMS = {
  enterDown: 0.7,
  exitDown: 0.45,
  confirmDownMs: 450,
  confirmAwayMs: 800,
  exitConfirmMs: 150,
  minBriefMs: 150,
  noFaceGraceMs: 600,
  reacquireFrames: 3,
  uncertainAfterMs: 1200,
  blinkOpenRatio: 0.55,
  blinkMaxMs: 500,
  yawAwayDeg: 22,
  gazeAwayH: 0.22,
  upScore: -0.9,
  smooth: 0.55, // weight of the newest score in the exponential smoother
  driftRate: 0.002,
  minConfidence: 0.5,
}

export function paramsFor(sensitivity = 'balanced') {
  return { ...DEFAULT_PARAMS, ...(SENSITIVITY[sensitivity] ?? SENSITIVITY.balanced) }
}

/** Confidence in a frame's measurements, 0..1. */
export function frameConfidence(f, brightness = null) {
  let q = 1
  if (f.faceWidth < 0.15) q *= 0.3
  else if (f.faceWidth > 0.75) q *= 0.5
  if (f.marginFrac < 0.015) q *= 0.4
  if (brightness != null && brightness < 40) q *= 0.4
  if ((f.eyeDisagreement ?? 0) > 0.12) q *= 0.5
  if (f.roll != null && Math.abs(f.roll) > 35) q *= 0.5
  return q
}

/**
 * Score one frame. Pure function: no temporal logic.
 * @returns {{ label: 'screen'|'down'|'away'|'blink'|'uncertain', t: number|null, z: object, confidence: number, reason?: string }}
 */
export function scoreFrame(profile, f, { params = DEFAULT_PARAMS, offset = null, brightness = null, inKeyboard = false, openBaseline = null } = {}) {
  const confidence = frameConfidence(f, brightness)
  const open = openBaseline ?? profile.screen.openness?.median ?? null
  if (f.openness != null && open && f.openness < open * params.blinkOpenRatio) {
    return { label: 'blink', t: null, z: {}, confidence }
  }
  if (confidence < params.minConfidence) return { label: 'uncertain', t: null, z: {}, confidence, reason: 'low-confidence' }

  const { t, z } = projectScore(profile, f, offset)
  if (t == null) return { label: 'uncertain', t: null, z, confidence, reason: 'no-signal' }

  // Away: head turned sideways, eyes far to the side, or looking well above the screen.
  const sYaw = profile.screen.yaw
  const yawDev = f.yaw != null && sYaw ? Math.abs(f.yaw - sYaw.median - (offset?.yaw ?? 0)) : 0
  const yawLimit = Math.max(params.yawAwayDeg, (sYaw?.sd ?? 0) * 3.5)
  const sGaze = profile.screen.gazeH
  const gazeHDev = f.gazeH != null && sGaze ? Math.abs(f.gazeH - sGaze.median) : 0
  const gazeLimit = Math.max(params.gazeAwayH, (sGaze?.sd ?? 0) * 4)
  if (yawDev > yawLimit || (gazeHDev > gazeLimit && yawDev > yawLimit * 0.5) || t < params.upScore) {
    return { label: 'away', t, z, confidence, reason: yawDev > yawLimit ? 'head-turned' : t < params.upScore ? 'looking-up' : 'eyes-sideways' }
  }

  // Strong signals must agree: head down while eyes stay on the screen is thinking, not a peek.
  const strong = profile.axes.filter((a) => a.snr >= 2 && z[a.feature] != null)
  if (strong.length >= 2) {
    const zs = strong.map((a) => z[a.feature])
    if (Math.max(...zs) > 0.8 && Math.min(...zs) < 0.15) {
      return { label: 'uncertain', t, z, confidence, reason: 'signals-disagree' }
    }
  }

  const enter = inKeyboard ? params.exitDown : params.enterDown
  if (t >= enter) return { label: 'down', t, z, confidence }
  if (t >= params.exitDown && !inKeyboard) return { label: 'uncertain', t, z, confidence, reason: 'ambiguous' }
  return { label: 'screen', t, z, confidence }
}

/**
 * Temporal state machine. Feed it timestamped feature frames; it emits events
 * (peek-start / peek-end / glance) and keeps `state` current.
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
    this.cand = null // pending {label:'down'|'away', since, from}
    this.exitSince = null
    this.lastFaceT = null
    this.goodStreak = 0
    this.uncertainSince = null
    this.blinkSince = null
    this.tSmooth = null
    this.offset = { pitch: 0, gazeV: 0, gazeLid: 0, yaw: 0 }
    this.keyboardStart = null
    this.awayStart = null
    this.last = { label: 'none', t: null, confidence: 0 }
  }

  _set(state, t) {
    if (this.state !== state) {
      this.state = state
      this.stateSince = t
    }
  }

  /** How far the screen baseline has drifted, relative to the screen→keyboard separation (0..1+). */
  driftRatio() {
    let worst = 0
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
   * @returns {{state:string, label:string, score:number|null, confidence:number, events:object[]}}
   */
  update(t, features, brightness = null) {
    const p = this.params
    const events = []
    const emit = (e) => events.push(e)

    if (!features) {
      this.goodStreak = 0
      if (this.lastFaceT == null || t - this.lastFaceT > p.noFaceGraceMs) {
        this._closeOpenPeriods(t, emit)
        this._set(STATE.UNAVAILABLE, t)
        this.cand = null
      }
      this.last = { label: 'none', t: null, confidence: 0 }
      return this._out(events)
    }
    this.lastFaceT = t

    const frame = scoreFrame(this.profile, features, {
      params: p,
      offset: this.offset,
      brightness,
      inKeyboard: this.state === STATE.KEYBOARD,
    })
    this.last = frame

    if (this.state === STATE.UNAVAILABLE) {
      if (frame.label === 'uncertain' || frame.label === 'blink') {
        this.goodStreak = 0
        return this._out(events)
      }
      this.goodStreak++
      if (this.goodStreak < p.reacquireFrames) return this._out(events)
      this._set(STATE.UNCERTAIN, t)
      this.uncertainSince = t
    }

    if (frame.t != null) this.tSmooth = this.tSmooth == null ? frame.t : p.smooth * frame.t + (1 - p.smooth) * this.tSmooth

    switch (frame.label) {
      case 'blink': {
        this.blinkSince ??= t
        if (t - this.blinkSince > p.blinkMaxMs && this.state === STATE.SCREEN) {
          // eyes held closed: we cannot know where they are looking
          this._set(STATE.UNCERTAIN, t)
          this.uncertainSince ??= t
        }
        break
      }
      case 'uncertain': {
        this.blinkSince = null
        this.uncertainSince ??= t
        if (this.state === STATE.KEYBOARD || this.state === STATE.AWAY) {
          // hold a confirmed state through short uncertainty
          if (t - this.uncertainSince > p.uncertainAfterMs) this._endPeriod(t, emit, STATE.UNCERTAIN)
        } else if (t - this.uncertainSince >= p.uncertainAfterMs) {
          this.cand = null
          this._set(STATE.UNCERTAIN, t)
        }
        break
      }
      case 'screen': {
        this.blinkSince = null
        this.uncertainSince = null
        this._onScreen(t, emit)
        break
      }
      case 'down':
      case 'away': {
        this.blinkSince = null
        this.uncertainSince = null
        this.exitSince = null
        this._onDeviation(frame.label, t, emit)
        break
      }
      default:
        break
    }
    return this._out(events)
  }

  _onScreen(t, emit) {
    const p = this.params
    if (this.state === STATE.KEYBOARD || this.state === STATE.AWAY) {
      this.exitSince ??= t
      if (t - this.exitSince >= p.exitConfirmMs) this._endPeriod(this.exitSince, emit, STATE.SCREEN)
      return
    }
    if (this.cand) {
      const dur = t - this.cand.since
      if (dur >= p.minBriefMs) emit({ type: 'glance', kind: this.cand.label === 'down' ? 'keyboard' : 'away', startT: this.cand.since, durationMs: dur, from: this.cand.from })
      this.cand = null
    }
    this._set(STATE.SCREEN, t)
  }

  _onDeviation(label, t, emit) {
    const p = this.params
    const kind = label === 'down' ? STATE.KEYBOARD : STATE.AWAY
    if (this.state === kind) return
    if (this.state === STATE.KEYBOARD || this.state === STATE.AWAY) {
      // switching directly between kinds: close the old period immediately
      this._endPeriod(t, emit, STATE.UNCERTAIN)
    }
    if (!this.cand || this.cand.label !== label) this.cand = { label, since: t, from: this.state }
    const need = label === 'down' ? p.confirmDownMs : p.confirmAwayMs
    if (t - this.cand.since >= need) {
      const startT = this.cand.since
      const from = this.cand.from
      this.cand = null
      this._set(kind, startT)
      if (kind === STATE.KEYBOARD) this.keyboardStart = startT
      else this.awayStart = startT
      emit({ type: kind === STATE.KEYBOARD ? 'peek-start' : 'away-start', startT, confirmedAt: t, from })
    }
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
    this._set(next, endT)
  }

  _closeOpenPeriods(t, emit) {
    if (this.state === STATE.KEYBOARD || this.state === STATE.AWAY) this._endPeriod(this.lastFaceT ?? t, emit, STATE.UNAVAILABLE)
  }

  /** Slowly follow posture changes, but only while clearly looking at the screen. */
  adaptFrom(features) {
    // Called by the orchestrator with the raw features of each frame.
    if (this.state !== STATE.SCREEN || !features || this.last.t == null || this.last.t > 0.25 || this.last.t < -0.4) return
    const rate = this.params.driftRate
    for (const key of ['pitch', 'gazeV', 'gazeLid', 'yaw']) {
      const base = this.profile.screen[key]
      const x = features[key]
      if (!base || x == null) continue
      const axis = this.profile.axes.find((a) => a.feature === key)
      const cap = axis ? Math.abs(axis.sep) * 0.6 : base.sd * 4
      const target = x - base.median
      this.offset[key] = Math.max(-cap, Math.min(cap, this.offset[key] + rate * (target - this.offset[key])))
    }
  }

  _out(events) {
    return {
      state: this.state,
      since: this.stateSince,
      label: this.last.label,
      score: this.last.t ?? null,
      smoothScore: this.tSmooth,
      confidence: this.last.confidence ?? 0,
      reason: this.last.reason,
      candidate: this.cand?.label ?? null,
      events,
    }
  }
}
