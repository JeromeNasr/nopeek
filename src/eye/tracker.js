// Browser camera + MediaPipe Face Landmarker wrapper.
//
// Privacy: frames are processed entirely in this tab. The model and WASM runtime
// are served from this app's own origin. Nothing is uploaded; no frame, image
// or landmark is ever stored or transmitted. Only derived summary numbers
// (time on screen, peek counts) leave the tracker, and calibration numbers stay
// on the device.

import { extractFeatures, meanLuma } from './landmarks.js'

const BASE = import.meta.env?.BASE_URL ?? '/'
const WASM_PATH = `${BASE}mediapipe/wasm`
const MODEL_PATH = `${BASE}models/face_landmarker.task`

export const CAMERA_ERRORS = {
  'permission-denied': 'Camera access was blocked. Allow the camera for this site in your browser settings, then try again.',
  'no-camera': 'No camera was found on this device.',
  'camera-busy': 'The camera is in use by another application. Close it and try again.',
  'camera-lost': 'The camera stopped providing video (unplugged or taken by another app).',
  'model-failed': 'The face-tracking model could not be loaded.',
  unsupported: 'This browser does not support camera access.',
}

function classifyCameraError(err) {
  const n = err?.name
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'permission-denied'
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'no-camera'
  if (n === 'NotReadableError' || n === 'AbortError') return 'camera-busy'
  return 'unsupported'
}

export class FaceTracker {
  constructor({ targetFps = 20 } = {}) {
    this.targetFps = targetFps
    this.minGapMs = 1000 / targetFps
    this.video = null
    this.stream = null
    this.landmarker = null
    this.running = false
    this.listeners = new Set()
    this.errorListeners = new Set()
    this.stats = { fps: 0, inferenceMs: 0, frames: 0, delegate: null }
    this._raf = null
    this._lastRun = 0
    this._lastVideoTime = -1
    this._brightness = null
    this._lastBrightness = 0
    this._canvas = null
    this._fpsWindow = []
    this._onVisibility = () => {
      if (document.hidden) this._pause()
      else if (this.stream) this._resume()
    }
  }

  onFrame(cb) {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  onError(cb) {
    this.errorListeners.add(cb)
    return () => this.errorListeners.delete(cb)
  }

  _fail(code, detail) {
    for (const cb of this.errorListeners) cb({ code, message: CAMERA_ERRORS[code] ?? String(detail), detail })
  }

  /** Opens the camera and loads the model. Rejects with {code, message}. */
  async start(videoEl = null) {
    if (this.running) return
    if (!navigator.mediaDevices?.getUserMedia) throw { code: 'unsupported', message: CAMERA_ERRORS.unsupported }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: 'user' },
        audio: false,
      })
    } catch (err) {
      const code = classifyCameraError(err)
      throw { code, message: CAMERA_ERRORS[code], detail: err }
    }

    const track = this.stream.getVideoTracks()[0]
    track?.addEventListener('ended', () => {
      this._fail('camera-lost')
      this.stop()
    })

    this.video = videoEl ?? document.createElement('video')
    this.video.muted = true
    this.video.playsInline = true
    this.video.srcObject = this.stream
    try {
      await this.video.play()
    } catch (err) {
      this.stop()
      throw { code: 'camera-busy', message: CAMERA_ERRORS['camera-busy'], detail: err }
    }

    try {
      await this._loadModel()
    } catch (err) {
      this.stop()
      throw { code: 'model-failed', message: CAMERA_ERRORS['model-failed'], detail: err }
    }

    this.running = true
    document.addEventListener('visibilitychange', this._onVisibility)
    this._schedule()
  }

  async _loadModel() {
    // loaded lazily so the ~100 kB JS and ~4 MB model only cost users who enable tracking
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH)
    const make = (delegate) =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })
    try {
      this.landmarker = await make('GPU')
      this.stats.delegate = 'GPU'
    } catch {
      this.landmarker = await make('CPU')
      this.stats.delegate = 'CPU'
    }
  }

  _schedule() {
    if (!this.running) return
    const v = this.video
    if (v && typeof v.requestVideoFrameCallback === 'function') {
      this._raf = v.requestVideoFrameCallback(() => this._tick())
      this._rvfc = true
    } else {
      this._raf = requestAnimationFrame(() => this._tick())
      this._rvfc = false
    }
  }

  _cancel() {
    if (this._raf == null) return
    if (this._rvfc && this.video?.cancelVideoFrameCallback) this.video.cancelVideoFrameCallback(this._raf)
    else cancelAnimationFrame(this._raf)
    this._raf = null
  }

  _pause() {
    this._cancel()
  }

  _resume() {
    if (this.running && this._raf == null) this._schedule()
  }

  _sampleBrightness(now) {
    if (now - this._lastBrightness < 1000) return
    this._lastBrightness = now
    try {
      this._canvas ??= Object.assign(document.createElement('canvas'), { width: 32, height: 24 })
      const ctx = this._canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(this.video, 0, 0, 32, 24)
      this._brightness = meanLuma(ctx.getImageData(0, 0, 32, 24).data)
    } catch {
      this._brightness = null
    }
  }

  _tick() {
    this._raf = null
    if (!this.running || document.hidden) return
    const now = performance.now()
    const v = this.video
    if (now - this._lastRun >= this.minGapMs && v.readyState >= 2 && v.currentTime !== this._lastVideoTime) {
      this._lastVideoTime = v.currentTime
      this._lastRun = now
      this._sampleBrightness(now)
      const t0 = performance.now()
      let features = null
      try {
        const res = this.landmarker.detectForVideo(v, now)
        const lm = res.faceLandmarks?.[0]
        const matrix = res.facialTransformationMatrixes?.[0]?.data ?? null
        features = lm ? extractFeatures(lm, matrix, v.videoWidth, v.videoHeight) : null
      } catch {
        features = null
      }
      const dt = performance.now() - t0
      this.stats.inferenceMs = this.stats.inferenceMs ? this.stats.inferenceMs * 0.9 + dt * 0.1 : dt
      this.stats.frames++
      this._fpsWindow.push(now)
      while (this._fpsWindow.length && now - this._fpsWindow[0] > 2000) this._fpsWindow.shift()
      this.stats.fps = this._fpsWindow.length / 2
      // back off if inference is slow so typing stays responsive on modest laptops
      this.minGapMs = this.stats.inferenceMs > 40 ? Math.max(1000 / this.targetFps, this.stats.inferenceMs * 1.8) : 1000 / this.targetFps
      for (const cb of this.listeners) cb({ t: now, features, brightness: this._brightness })
    }
    this._schedule()
  }

  /** Releases the camera (LED off), model and listeners' timers. Safe to call repeatedly. */
  stop() {
    this.running = false
    this._cancel()
    document.removeEventListener('visibilitychange', this._onVisibility)
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop()
      this.stream = null
    }
    if (this.video) {
      try {
        this.video.pause()
      } catch { /* ignore */ }
      this.video.srcObject = null
      this.video = null
    }
    if (this.landmarker) {
      try {
        this.landmarker.close()
      } catch { /* ignore */ }
      this.landmarker = null
    }
    this._canvas = null
  }
}
