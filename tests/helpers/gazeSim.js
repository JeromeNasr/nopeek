// Synthetic gaze/feature generator for exercising calibration, classifier and
// tally. This is a SIMULATION: it validates the logic and its sensitivity to
// noise, not real-world webcam accuracy.
import { createRng } from '../../src/engine/random.js'

export const DEFAULT_USER = {
  // mean feature values when looking at the middle of the screen
  screen: { pitch: 0, yaw: 0, roll: 0, gazeV: 0.02, gazeH: 0, gazeLid: 0.48, lookDown: 0.1, blink: 0.08, openness: 0.3, faceWidth: 0.36 },
  // offsets applied when looking down at the keyboard
  downDelta: { pitch: 14, gazeV: 0.055, gazeLid: 0.12, lookDown: 0.4, blink: 0.22, yaw: 0, gazeH: 0 },
  // natural spread while reading the whole screen
  screenSpread: { pitch: 2.2, yaw: 4, gazeV: 0.018, gazeH: 0.05, gazeLid: 0.05, lookDown: 0.12 },
  noise: { pitch: 0.7, yaw: 0.7, gazeV: 0.005, gazeH: 0.006, gazeLid: 0.02, lookDown: 0.04, openness: 0.012 },
}

export function makeUser(overrides = {}) {
  const u = JSON.parse(JSON.stringify(DEFAULT_USER))
  for (const [k, v] of Object.entries(overrides)) Object.assign(u[k] ?? (u[k] = {}), v)
  return u
}

export function gaussian(rng) {
  let u = 0
  let v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/**
 * One frame's features.
 * kind: 'screen' | 'screen-low' | 'down' | 'away' | 'nod' (head down, eyes still on screen) |
 *       'blink' | 'up' | 'noface'
 */
export function frame(user, kind, rng, { spread = true, shift = {} } = {}) {
  if (kind === 'noface') return null
  const s = user.screen
  const sp = user.screenSpread
  const n = user.noise
  const g = () => gaussian(rng)
  // where on the screen the user happens to be looking (uniform within spread)
  const look = spread ? { x: (rng() - 0.5) * 2, y: (rng() - 0.5) * 2 } : { x: 0, y: 0 }
  const f = {
    pitch: s.pitch + look.y * sp.pitch * 0.5 + n.pitch * g(),
    yaw: s.yaw + look.x * sp.yaw * 0.5 + n.yaw * g(),
    roll: s.roll + 0.5 * g(),
    gazeV: s.gazeV + look.y * sp.gazeV * 0.5 + n.gazeV * g(),
    gazeH: s.gazeH + look.x * sp.gazeH * 0.5 + n.gazeH * g(),
    gazeLid: s.gazeLid + look.y * sp.gazeLid * 0.5 + n.gazeLid * g(),
    lookDown: s.lookDown + look.y * sp.lookDown * 0.5 + n.lookDown * g(),
    blink: s.blink + 0.02 * g(),
    openness: s.openness + n.openness * g(),
    faceWidth: s.faceWidth + 0.003 * g(),
    marginFrac: 0.2,
    eyeDisagreement: Math.abs(0.01 * g()),
  }
  switch (kind) {
    case 'down':
      for (const k of Object.keys(user.downDelta)) f[k] += user.downDelta[k]
      f.openness *= 0.72 // eyelids lower noticeably when looking down
      break
    case 'screen-low': // reading the bottom edge of the screen
      f.pitch += sp.pitch * 0.45
      f.gazeV += sp.gazeV * 0.45
      f.gazeLid += sp.gazeLid * 0.45
      f.lookDown += sp.lookDown * 0.45
      break
    case 'nod': // chin dips (thinking) but the eyes stay on the screen: eyes counter-rotate upward
      f.pitch += user.downDelta.pitch * 0.9
      f.gazeV -= user.downDelta.gazeV * 0.7
      f.gazeLid -= user.downDelta.gazeLid * 0.7
      f.lookDown -= user.downDelta.lookDown * 0.6
      break
    case 'away':
      f.yaw += 40
      f.gazeH += 0.3
      break
    case 'up':
      f.pitch -= user.downDelta.pitch * 1.4
      f.gazeV -= user.downDelta.gazeV * 1.6
      f.gazeLid -= user.downDelta.gazeLid * 1.6
      f.lookDown -= user.downDelta.lookDown * 1.2
      break
    case 'blink':
      f.openness = s.openness * 0.3
      f.blink = 0.92
      f.gazeV += 0.05 // iris appears to drop as lids close
      break
    default:
      break
  }
  for (const [k, v] of Object.entries(shift)) f[k] += v
  return f
}

/**
 * Run a scenario [{kind, ms, brightness?}] at `fps` and return frames
 * [{t, features, brightness}], starting at t0.
 */
export function run(user, scenario, { fps = 20, seed = 'g', t0 = 0, jitter = 0.15 } = {}) {
  const rng = createRng(seed)
  const out = []
  let t = t0
  const step = 1000 / fps
  for (const seg of scenario) {
    const end = t + seg.ms
    // 'screen' segments re-pick a gaze target slowly, like reading
    while (t < end) {
      const features = frame(user, seg.kind, rng, { shift: seg.shift })
      out.push({ t, features, brightness: seg.brightness ?? 140, kind: seg.kind })
      t += step * (1 + (rng() - 0.5) * 2 * jitter)
    }
  }
  return out
}

/** Calibration capture: screen sweep (5 targets) then down. */
export function calibrationSamples(user, { seed = 'cal', frames = 120 } = {}) {
  const rng = createRng(seed)
  const targets = [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]
  const screen = []
  for (let i = 0; i < frames; i++) {
    const [x, y] = targets[i % 5]
    const f = frame(user, 'screen', rng, { spread: false })
    f.pitch += y * user.screenSpread.pitch * 0.5
    f.yaw += x * user.screenSpread.yaw * 0.5
    f.gazeV += y * user.screenSpread.gazeV * 0.5
    f.gazeH += x * user.screenSpread.gazeH * 0.5
    f.gazeLid += y * user.screenSpread.gazeLid * 0.5
    f.lookDown += y * user.screenSpread.lookDown * 0.5
    screen.push(f)
  }
  const down = Array.from({ length: frames }, () => frame(user, 'down', rng, { spread: false }))
  // segments mirror the real wizard: 5 dots (+ typing) for screen, 2 captures for keyboard
  const screenSegments = [0, 1, 2, 3, 4].map((k) => screen.filter((_, i) => i % 5 === k))
  const downSegments = [down.slice(0, frames >> 1), down.slice(frames >> 1)]
  return { screen, down, screenSegments, downSegments }
}
