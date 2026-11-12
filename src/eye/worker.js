// Face-landmark inference off the main thread, so camera frames can never delay a keystroke.
// Receives ImageBitmaps (transferred, zero-copy), returns the small feature vector only.
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { extractFeatures, meanLuma } from './landmarks.js'

let landmarker = null
let delegate = null
let fileset = null
let modelPath = null
let avgMs = 0
let frames = 0
let switching = false
let lumaCanvas = null
let lastLuma = 0
let brightness = null

async function make(kind) {
  const options = {
    baseOptions: { modelAssetPath: modelPath, delegate: kind },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  }
  if (kind === 'GPU') options.canvas = new OffscreenCanvas(1, 1)
  return FaceLandmarker.createFromOptions(fileset, options)
}

/** True when "GPU" would really be software rendering (SwiftShader, llvmpipe…), which is far slower than CPU inference. */
function gpuIsSoftware() {
  try {
    const gl = new OffscreenCanvas(1, 1).getContext('webgl2') ?? new OffscreenCanvas(1, 1).getContext('webgl')
    if (!gl) return true
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
    return /swiftshader|llvmpipe|software|basic render/i.test(name)
  } catch {
    return true
  }
}

async function init({ wasmPath, model, prefer }) {
  modelPath = model
  if (!prefer && gpuIsSoftware()) prefer = 'CPU'
  fileset = await FilesetResolver.forVisionTasks(wasmPath, true) // ES-module Wasm loader: required inside a module worker
  if (prefer !== 'CPU') {
    try {
      landmarker = await make('GPU')
      delegate = 'GPU'
      return
    } catch {
      /* fall through */
    }
  }
  landmarker = await make('CPU')
  delegate = 'CPU'
}

async function toCpu() {
  if (switching || delegate !== 'GPU') return
  switching = true
  try {
    const old = landmarker
    landmarker = null
    const next = await make('CPU')
    try { old?.close() } catch { /* ignore */ }
    landmarker = next
    delegate = 'CPU'
    avgMs = 0
    frames = 0
  } catch (err) {
    self.postMessage({ type: 'error', message: `CPU fallback failed: ${err?.message ?? err}` })
  } finally {
    switching = false
  }
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
      self.postMessage({ type: 'ready', delegate })
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
      } catch {
        features = null
      }
      const ms = performance.now() - t0
      avgMs = avgMs ? avgMs * 0.9 + ms * 0.1 : ms
      frames++
      if (delegate === 'GPU' && frames >= 4 && avgMs > 90) toCpu()
    }
    bitmap.close()
    self.postMessage({ type: 'result', t, features, brightness, ms: avgMs, delegate, skipped: !landmarker })
  }
}
