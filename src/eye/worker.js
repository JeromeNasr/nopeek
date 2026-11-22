// Face-landmark inference off the main thread, so camera frames can never delay a keystroke.
// Receives ImageBitmaps (transferred, zero-copy), returns the small feature vector only.
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { extractFeatures, meanLuma } from './landmarks.js'

let landmarker = null
let avgMs = 0
let lumaCanvas = null
let lastLuma = 0
let brightness = null
let failures = 0

// CPU (XNNPACK) only: 15-30 ms per frame, and identical behaviour on every machine. The GPU
// delegate inside a worker depends on the browser's WebGL-in-worker support and can fail silently.
async function init({ wasmPath, model }) {
  const fileset = await FilesetResolver.forVisionTasks(wasmPath, true) // ES-module Wasm loader: required in a module worker
  landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: model, delegate: 'CPU' },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  })
}

function sampleBrightness(bitmap, t) {
  if (t - lastLuma < 1000) return
  lastLuma = t
  try {
    lumaCanvas ??= new OffscreenCanvas(32, 24)
    const ctx = lumaCanvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(bitmap, 0, 0, 32, 24)
    brightness = meanLuma(ctx.getImageData(0, 0, 32, 24).data)
  } catch {
    brightness = null
  }
}

self.onmessage = async (e) => {
  const m = e.data
  if (m.type === 'init') {
    try {
      await init(m)
      self.postMessage({ type: 'ready', delegate: 'CPU' })
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err?.message ?? err) })
    }
    return
  }
  if (m.type === 'frame') {
    const { bitmap, t } = m
    let features = null
    if (landmarker) {
      sampleBrightness(bitmap, t)
      const t0 = performance.now()
      try {
        const res = landmarker.detectForVideo(bitmap, t)
        const lm = res.faceLandmarks?.[0]
        features = lm
          ? extractFeatures(lm, res.facialTransformationMatrixes?.[0]?.data ?? null, bitmap.width, bitmap.height, res.faceBlendshapes?.[0]?.categories ?? null)
          : null
        failures = 0
      } catch (err) {
        features = null
        // a model that throws on every frame must be reported, not shown as "no face"
        if (++failures === 8) self.postMessage({ type: 'error', message: `Face tracking failed: ${err?.message ?? err}` })
      }
      const ms = performance.now() - t0
      avgMs = avgMs ? avgMs * 0.9 + ms * 0.1 : ms
    }
    bitmap.close()
    self.postMessage({ type: 'result', t, features, brightness, ms: avgMs, delegate: 'CPU', skipped: !landmarker })
  }
}
