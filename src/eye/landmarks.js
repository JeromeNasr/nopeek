// Landmarks -> features.
//
// Input is MediaPipe Face Landmarker output (478 normalised landmarks including
// both irises, plus the 4x4 facial transformation matrix). Output is a small,
// pose-aware feature vector. All maths here is pure and unit-tested with
// synthetic geometry; real-world behaviour must be validated on a webcam.

// MediaPipe FaceMesh indices
export const LM = {
  // subject's right eye (appears on the image LEFT)
  rOuter: 33, rInner: 133, rUpper: 159, rLower: 145, rIris: 468,
  // subject's left eye (image RIGHT)
  lOuter: 263, lInner: 362, lUpper: 386, lLower: 374, lIris: 473,
  noseTip: 1, faceLeft: 234, faceRight: 454, forehead: 10, chin: 152,
}
export const LANDMARK_COUNT = 478

const RAD = 180 / Math.PI

/**
 * Euler angles (degrees) from a column-major 4x4 transform. R = Rz(roll)·Ry(yaw)·Rx(pitch).
 * Sign conventions follow the camera frame; the calibration learns which direction
 * is "down" for a given user, so only consistency matters, not absolute sign.
 */
export function eulerFromMatrix(m) {
  const r = (row, col) => m[col * 4 + row]
  const pitch = Math.atan2(r(2, 1), r(2, 2))
  const yaw = Math.atan2(-r(2, 0), Math.hypot(r(2, 1), r(2, 2)))
  const roll = Math.atan2(r(1, 0), r(0, 0))
  return { pitch: pitch * RAD, yaw: yaw * RAD, roll: roll * RAD }
}

function eyeFeatures(lm, W, H, left, right, upper, lower, iris) {
  const p = (i) => ({ x: lm[i].x * W, y: lm[i].y * H })
  const L = p(left)
  const R = p(right)
  const U = p(upper)
  const D = p(lower)
  const I = p(iris)
  const width = Math.hypot(R.x - L.x, R.y - L.y)
  if (width < 4) return null // face too small / degenerate
  const ux = (R.x - L.x) / width
  const uy = (R.y - L.y) / width
  const vx = -uy // perpendicular, pointing image-down when u points image-right
  const vy = ux
  const cx = (L.x + R.x) / 2
  const cy = (L.y + R.y) / 2
  const dx = I.x - cx
  const dy = I.y - cy
  const gazeH = (dx * ux + dy * uy) / width
  const gazeV = (dx * vx + dy * vy) / width
  const lidSpan = (D.x - U.x) * vx + (D.y - U.y) * vy
  const lidPos = lidSpan > 1e-6 ? ((I.x - U.x) * vx + (I.y - U.y) * vy) / lidSpan : null
  const openness = Math.hypot(D.x - U.x, D.y - U.y) / width
  return { gazeH, gazeV, lidPos, openness, width }
}

/**
 * @param {Array<{x:number,y:number,z?:number}>} lm  478 normalised landmarks
 * @param {ArrayLike<number>|null} matrix            4x4 column-major face transform
 * @param {number} W video width (px)
 * @param {number} H video height (px)
 */
/** Pick the eye-related blendshape scores we use (MediaPipe ARKit-style names). */
export function readBlendshapes(categories) {
  if (!categories?.length) return null
  const get = {}
  for (const c of categories) get[c.categoryName] = c.score
  const pair = (a, b) => (get[a] == null || get[b] == null ? null : (get[a] + get[b]) / 2)
  return {
    lookDown: pair('eyeLookDownLeft', 'eyeLookDownRight'),
    lookUp: pair('eyeLookUpLeft', 'eyeLookUpRight'),
    blink: pair('eyeBlinkLeft', 'eyeBlinkRight'),
  }
}

export function extractFeatures(lm, matrix, W, H, blendshapes = null) {
  if (!lm || lm.length < LANDMARK_COUNT) return null
  const r = eyeFeatures(lm, W, H, LM.rOuter, LM.rInner, LM.rUpper, LM.rLower, LM.rIris)
  const l = eyeFeatures(lm, W, H, LM.lInner, LM.lOuter, LM.lUpper, LM.lLower, LM.lIris)
  if (!r || !l) return null
  const avg = (a, b) => (a == null || b == null ? (a ?? b) : (a + b) / 2)

  const pose = matrix ? eulerFromMatrix(matrix) : null
  const xs = [lm[LM.faceLeft].x, lm[LM.faceRight].x]
  const faceWidth = Math.abs(xs[1] - xs[0]) // fraction of frame width
  const nose = lm[LM.noseTip]
  const top = lm[LM.forehead].y
  const bottom = lm[LM.chin].y
  const margin = Math.min(
    Math.min(...xs), 1 - Math.max(...xs), top, 1 - bottom,
  )

  const bs = readBlendshapes(blendshapes)
  return {
    // learned eye-look signal: "down" minus "up" so it is signed around neutral
    lookDown: bs && bs.lookDown != null ? bs.lookDown - (bs.lookUp ?? 0) : null,
    blink: bs ? bs.blink : null,
    pitch: pose ? pose.pitch : null,
    yaw: pose ? pose.yaw : null,
    roll: pose ? pose.roll : null,
    gazeV: avg(r.gazeV, l.gazeV),
    gazeH: avg(r.gazeH, l.gazeH),
    gazeLid: avg(r.lidPos, l.lidPos),
    openness: avg(r.openness, l.openness),
    // how far the two eyes disagree: large values mean a bad landmark fit
    eyeDisagreement: Math.abs(r.gazeV - l.gazeV),
    faceWidth,
    marginFrac: margin, // distance of the face box from the nearest frame edge
    noseX: nose.x,
    noseY: nose.y,
  }
}

/** Mean luma (0-255) of an RGBA buffer, sampled sparsely. */
export function meanLuma(rgba) {
  let sum = 0
  let n = 0
  for (let i = 0; i < rgba.length; i += 16) {
    sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]
    n++
  }
  return n ? sum / n : 0
}
