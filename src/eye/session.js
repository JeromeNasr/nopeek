// Eye-tracking orchestrator (singleton external store).
//
// Owns the camera, the gaze state machine and the per-session tally. React reads
// it through useSyncExternalStore (see useEye.js); snapshots are throttled so the
// 20 fps frame loop does not trigger 20 renders per second.

import { readJSON, removeKey, writeJSON } from '../data/localStore.js'
import { buildProfile, preflight, profileUsable } from './calibration.js'
import { GazeTracker, paramsFor, STATE } from './classifier.js'
import { SessionTally } from './tally.js'
import { FaceTracker } from './tracker.js'

const SETTINGS_KEY = 'eye.settings'
const PROFILE_KEY = 'eye.profile.v2' // calibration numbers only; never uploaded

const DEFAULT_SETTINGS = { enabled: false, sensitivity: 'balanced', showPreview: true, hints: true }

const PUSH_INTERVAL_MS = 200
const RELEASE_DELAY_MS = 3000

function emptyLive() {
  return { state: STATE.UNAVAILABLE, label: 'none', score: null, confidence: 0, reason: null, candidate: null, since: null }
}

class EyeSession {
  constructor() {
    this.listeners = new Set()
    this.settings = { ...DEFAULT_SETTINGS, ...(readJSON(SETTINGS_KEY) ?? {}) }
    this.profile = readJSON(PROFILE_KEY)
    if (this.profile && !profileUsable(this.profile)) this.profile = this.profile?.ok === false ? this.profile : null
    this.runtime = { phase: 'off', error: null, fps: 0, inferenceMs: 0, delegate: null }
    this.live = emptyLive()
    this.issues = []
    this.mode = 'idle'
    this.tracker = null
    this.gaze = null
    this.tally = null
    this.sessionSummary = null
    this.consumers = 0
    this._releaseTimer = null
    this._capture = null
    this._lastPush = 0
    this._lastIssue = 0
    this._starting = null
    this.snapshot = this._buildSnapshot()
    this._rebuildGaze()
  }

  // ---- store plumbing ------------------------------------------------------

  subscribe = (cb) => {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  getSnapshot = () => this.snapshot

  _buildSnapshot() {
    return {
      settings: this.settings,
      profile: this.profile,
      calibrated: profileUsable(this.profile),
      runtime: this.runtime,
      live: this.live,
      issues: this.issues,
      mode: this.mode,
      session: this.sessionSummary,
    }
  }

  _emit() {
    this.snapshot = this._buildSnapshot()
    for (const cb of this.listeners) cb()
  }

  // ---- settings & profile ---------------------------------------------------

  setSettings(patch) {
    this.settings = { ...this.settings, ...patch }
    writeJSON(SETTINGS_KEY, this.settings)
    if (patch.sensitivity) this._rebuildGaze()
    if (patch.enabled === false) this.stop()
    this._emit()
  }

  _rebuildGaze() {
    this.gaze = profileUsable(this.profile) ? new GazeTracker(this.profile, paramsFor(this.settings.sensitivity)) : null
  }

  /** Build and store a profile from labelled capture arrays. Returns the (possibly rejected) profile. */
  finishCalibration({ screen, down, brightness }) {
    const profile = buildProfile({ screen, down, brightness })
    this.profile = profile
    if (profile.ok) writeJSON(PROFILE_KEY, profile)
    else removeKey(PROFILE_KEY)
    this._rebuildGaze()
    this._emit()
    return profile
  }

  clearCalibration() {
    this.profile = null
    removeKey(PROFILE_KEY)
    this._rebuildGaze()
    this._emit()
  }

  // ---- camera lifecycle ------------------------------------------------------

  /** Consumers (pages) acquire tracking; the camera closes shortly after the last one leaves. */
  acquire() {
    this.consumers++
    clearTimeout(this._releaseTimer)
    if (this.settings.enabled) this.start().catch(() => {})
    let released = false
    return () => {
      if (released) return
      released = true
      this.consumers--
      if (this.consumers <= 0) {
        clearTimeout(this._releaseTimer)
        this._releaseTimer = setTimeout(() => {
          if (this.consumers <= 0) this.stop()
        }, RELEASE_DELAY_MS)
      }
    }
  }

  async start() {
    if (this.runtime.phase === 'running') return
    if (this._starting) return this._starting
    this.runtime = { ...this.runtime, phase: 'starting', error: null }
    this._emit()
    this.tracker = new FaceTracker()
    const tracker = this.tracker
    tracker.onFrame((f) => this._onFrame(f))
    tracker.onError((e) => {
      this.runtime = { ...this.runtime, phase: 'error', error: e }
      this.live = emptyLive()
      this._emit()
    })
    this._starting = tracker
      .start()
      .then(() => {
        this.runtime = { ...this.runtime, phase: 'running', error: null, delegate: tracker.stats.delegate }
        this._emit()
      })
      .catch((err) => {
        this.tracker = null
        this.runtime = { ...this.runtime, phase: 'error', error: { code: err.code ?? 'unsupported', message: err.message ?? String(err) } }
        this._emit()
        throw err
      })
      .finally(() => {
        this._starting = null
      })
    return this._starting
  }

  stop() {
    this.tracker?.stop()
    this.tracker = null
    this.runtime = { ...this.runtime, phase: 'off', error: null, fps: 0 }
    this.live = emptyLive()
    this.issues = []
    this.mode = 'idle'
    this._capture = null
    this.gaze?.reset()
    this._emit()
  }

  getStream() {
    return this.tracker?.stream ?? null
  }

  setMode(mode) {
    this.mode = mode
    this.issues = []
    this._emit()
  }

  // ---- calibration capture ----------------------------------------------------

  beginCapture() {
    this._capture = { samples: [], brightness: [] }
  }

  endCapture() {
    const c = this._capture
    this._capture = null
    if (!c) return { samples: [], brightness: null }
    const b = c.brightness.filter((x) => x != null)
    return { samples: c.samples, brightness: b.length ? b.reduce((x, y) => x + y, 0) / b.length : null }
  }

  captureCount() {
    return this._capture?.samples.length ?? 0
  }

  // ---- typing sessions ----------------------------------------------------------

  startSession(t = performance.now()) {
    const calibrated = profileUsable(this.profile)
    this.tally = new SessionTally({ enabled: this.settings.enabled, calibrated })
    this.tally.quality = calibrated ? this.profile.quality.level : null
    this.tally.startT = t
    this.tally.lastT = t
    if (this.gaze && this.runtime.phase === 'running') {
      // seed the tally with the current state so the first interval is attributed correctly
      this.tally.lastT = t
    }
    this.sessionSummary = null
  }

  endSession(t = performance.now()) {
    if (!this.tally) return new SessionTally({ enabled: this.settings.enabled, calibrated: false }).summary()
    // time since the last frame has no measurement behind it
    const lastFrame = this.tally.lastT ?? t
    if (t - lastFrame > 1000) this.tally.ms.unavailable += t - lastFrame
    const summary = this.tally.finish(Math.min(t, lastFrame), this.gaze)
    this.sessionSummary = summary
    this.tally = null
    this._emit()
    return summary
  }

  // ---- frame handling -------------------------------------------------------------

  _onFrame({ t, features, brightness }) {
    const tracker = this.tracker
    if (!tracker) return
    let dirty = false

    if (this._capture) {
      if (features && this._capture.samples.length < 600) this._capture.samples.push(features)
      this._capture.brightness.push(brightness)
    }

    if (this.mode === 'positioning' && t - this._lastIssue > 250) {
      this._lastIssue = t
      this.issues = preflight(features, brightness)
      this.lastFeatures = features
      dirty = true
    }

    if (this.gaze) {
      const out = this.gaze.update(t, features, brightness)
      this.gaze.adaptFrom(features)
      this.tally?.update(t, out)
      const changed = out.state !== this.live.state || out.events.length > 0
      if (changed || t - this._lastPush > PUSH_INTERVAL_MS) {
        this.live = {
          state: out.state, label: out.label, score: out.score, confidence: out.confidence,
          reason: out.reason ?? null, candidate: out.candidate, since: out.since,
        }
        dirty = true
      }
    }

    if (dirty || t - this._lastPush > 1000) {
      this._lastPush = t
      this.runtime = { ...this.runtime, fps: tracker.stats.fps, inferenceMs: tracker.stats.inferenceMs }
      this._emit()
    }
  }
}

export const eye = new EyeSession()
