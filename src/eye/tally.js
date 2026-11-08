// Session-level accounting of where the eyes were, with an explicit distinction
// between measured time and time we could not measure. Unavailable or uncertain
// time is NEVER counted as good visual discipline.

import { STATE } from './classifier.js'

export const TRACKING_STATUS = Object.freeze({
  DISABLED: 'disabled', // the user turned tracking off
  UNCALIBRATED: 'uncalibrated', // no usable calibration, so nothing is scored
  UNAVAILABLE: 'unavailable', // tracking on but too little was measured
  PARTIAL: 'partial', // some, but not enough to score
  MEASURED: 'measured', // enough reliable coverage to score
})

export const MIN_COVERAGE_MEASURED = 0.7
export const MIN_COVERAGE_PARTIAL = 0.3

const BUCKETS = ['screen', 'keyboard', 'away', 'uncertain', 'unavailable', 'glanceKeyboard', 'glanceAway']

export class SessionTally {
  constructor({ enabled = true, calibrated = true } = {}) {
    this.enabled = enabled
    this.calibrated = calibrated
    this.ms = Object.fromEntries(BUCKETS.map((b) => [b, 0]))
    this.peeks = []
    this.glances = 0
    this.awayEpisodes = 0
    this.lastT = null
    this.startT = null
    this.quality = null
  }

  _bucketOfState(state) {
    if (state === STATE.SCREEN) return 'screen'
    if (state === STATE.KEYBOARD) return 'keyboard'
    if (state === STATE.AWAY) return 'away'
    if (state === STATE.UNCERTAIN) return 'uncertain'
    return 'unavailable'
  }

  _move(from, to, ms) {
    const src = this._bucketOfState(from)
    const m = Math.max(0, Math.min(ms, this.ms[src]))
    this.ms[src] -= m
    this.ms[to] += m
  }

  /** Feed each tracker output. */
  update(t, out) {
    if (this.startT == null) this.startT = t
    if (this.lastT != null) {
      const dt = t - this.lastT
      if (dt > 0) {
        // a long gap means frames stopped arriving (tab hidden, stalled): not measured
        const bucket = dt > 1000 ? 'unavailable' : this._bucketOfState(out.state)
        this.ms[bucket] += dt
      }
    }
    this.lastT = t
    for (const e of out.events ?? []) {
      switch (e.type) {
        case 'peek-start':
          this._move(e.from ?? STATE.SCREEN, 'keyboard', e.confirmedAt - e.startT)
          break
        case 'peek-end':
          this.peeks.push({ startMs: e.startT - this.startT, durationMs: e.durationMs })
          // frames after the real return to screen were tallied as keyboard until debounce expired
          this.ms.keyboard = Math.max(0, this.ms.keyboard - Math.max(0, t - e.endT))
          this.ms.screen += Math.max(0, t - e.endT)
          break
        case 'away-start':
          this._move(e.from ?? STATE.SCREEN, 'away', e.confirmedAt - e.startT)
          break
        case 'away-end':
          this.awayEpisodes++
          break
        case 'glance':
          if (e.kind === 'keyboard') {
            this.glances++
            this._move(e.from ?? STATE.SCREEN, 'glanceKeyboard', e.durationMs)
          } else {
            this._move(e.from ?? STATE.SCREEN, 'glanceAway', e.durationMs)
          }
          break
        default:
          break
      }
    }
  }

  /** Close any open keyboard period at time t (end of session). */
  finish(t, tracker = null) {
    if (tracker && tracker.state === STATE.KEYBOARD && tracker.keyboardStart != null) {
      this.peeks.push({ startMs: tracker.keyboardStart - this.startT, durationMs: t - tracker.keyboardStart })
    }
    return this.summary()
  }

  summary() {
    const m = this.ms
    const total = Object.values(m).reduce((a, b) => a + b, 0)
    const measured = m.screen + m.keyboard + m.away + m.glanceKeyboard + m.glanceAway
    const coverage = total > 0 ? measured / total : 0

    let status
    if (!this.enabled) status = TRACKING_STATUS.DISABLED
    else if (!this.calibrated) status = TRACKING_STATUS.UNCALIBRATED
    else if (total < 5000 || coverage < MIN_COVERAGE_PARTIAL) status = TRACKING_STATUS.UNAVAILABLE
    else if (coverage < MIN_COVERAGE_MEASURED) status = TRACKING_STATUS.PARTIAL
    else status = TRACKING_STATUS.MEASURED

    const scored = status === TRACKING_STATUS.MEASURED
    const keyboardMs = m.keyboard
    const peekMs = this.peeks.map((p) => p.durationMs)
    const r1 = (v) => Math.round(v * 10) / 10
    return {
      status,
      totalMs: Math.round(total),
      measuredMs: Math.round(measured),
      coverage: r1(coverage * 100) / 100,
      screenMs: Math.round(m.screen),
      keyboardMs: Math.round(keyboardMs),
      awayMs: Math.round(m.away),
      uncertainMs: Math.round(m.uncertain),
      unavailableMs: Math.round(m.unavailable),
      peeks: this.peeks.length,
      glances: this.glances,
      awayEpisodes: this.awayEpisodes,
      avgPeekMs: peekMs.length ? Math.round(peekMs.reduce((a, b) => a + b, 0) / peekMs.length) : null,
      longestPeekMs: peekMs.length ? Math.round(Math.max(...peekMs)) : null,
      // Only present when enough of the session was reliably measured
      discipline: scored && measured > 0 ? r1((1 - keyboardMs / measured) * 100) : null,
      peeksPerMin: scored && measured > 0 ? r1(this.peeks.length / (measured / 60000)) : null,
      calibrationLevel: this.quality ?? null,
    }
  }
}
