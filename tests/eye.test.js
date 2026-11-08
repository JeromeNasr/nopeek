import { describe, expect, it } from 'vitest'
import { LM, LANDMARK_COUNT, eulerFromMatrix, extractFeatures, meanLuma } from '../src/eye/landmarks.js'
import { buildProfile, preflight, profileUsable, robustStats, projectScore } from '../src/eye/calibration.js'
import { GazeTracker, STATE, paramsFor, scoreFrame } from '../src/eye/classifier.js'
import { SessionTally, TRACKING_STATUS } from '../src/eye/tally.js'
import { calibrationSamples, makeUser, run } from './helpers/gazeSim.js'

// ---------- geometry -------------------------------------------------------

const rotX = (a) => [1, 0, 0, 0, 0, Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1]
const rotY = (a) => [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1]
const rotZ = (a) => [Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const mul = (A, B) => {
  const o = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += A[k * 4 + r] * B[c * 4 + k]
  return o
}
const deg = (d) => (d * Math.PI) / 180

function syntheticFace({ gazeV = 0, gazeH = 0, openness = 0.3, roll = 0, W = 640, H = 480 } = {}) {
  const lm = Array.from({ length: LANDMARK_COUNT }, () => ({ x: 0.5, y: 0.5, z: 0 }))
  const set = (i, x, y) => (lm[i] = { x, y, z: 0 })
  const ew = 0.06 // eye width as fraction of frame width
  const cy = 0.45
  const eyeW = ew * W
  const half = (openness * eyeW) / 2 / H
  const place = (outerI, innerI, upI, lowI, irisI, cx, flip) => {
    // eye centred at cx; "outer" is on the side away from the nose
    const dir = flip ? -1 : 1
    set(outerI, cx - dir * (ew / 2), cy)
    set(innerI, cx + dir * (ew / 2), cy)
    set(upI, cx, cy - half)
    set(lowI, cx, cy + half)
    set(irisI, cx + (gazeH * eyeW) / W, cy + (gazeV * eyeW) / H)
  }
  place(LM.rOuter, LM.rInner, LM.rUpper, LM.rLower, LM.rIris, 0.43, false)
  place(LM.lOuter, LM.lInner, LM.lUpper, LM.lLower, LM.lIris, 0.57, true)
  set(LM.faceLeft, 0.3, 0.5); set(LM.faceRight, 0.7, 0.5); set(LM.forehead, 0.5, 0.25); set(LM.chin, 0.5, 0.78); set(LM.noseTip, 0.5, 0.55)
  if (roll) {
    const a = deg(roll)
    const cx = 0.5, cyy = 0.5
    for (let i = 0; i < lm.length; i++) {
      const x = (lm[i].x - cx) * W, y = (lm[i].y - cyy) * H
      lm[i] = { x: cx + (x * Math.cos(a) - y * Math.sin(a)) / W, y: cyy + (x * Math.sin(a) + y * Math.cos(a)) / H, z: 0 }
    }
  }
  return lm
}

describe('landmark geometry', () => {
  it('recovers head pitch, yaw and roll from a transform matrix', () => {
    for (const [p, y, r] of [[0, 0, 0], [15, 0, 0], [-20, 10, 5], [5, -30, 8], [30, 20, -10]]) {
      const m = mul(rotZ(deg(r)), mul(rotY(deg(y)), rotX(deg(p))))
      const e = eulerFromMatrix(m)
      expect(e.pitch).toBeCloseTo(p, 5)
      expect(e.yaw).toBeCloseTo(y, 5)
      expect(e.roll).toBeCloseTo(r, 5)
    }
  })

  it('measures vertical and horizontal iris offset in eye-widths', () => {
    const f = extractFeatures(syntheticFace({ gazeV: 0.07, gazeH: -0.04 }), rotX(0), 640, 480)
    expect(f.gazeV).toBeCloseTo(0.07, 4)
    expect(f.gazeH).toBeCloseTo(-0.04, 4)
    expect(f.openness).toBeCloseTo(0.3, 2)
  })

  it('gaze measurement is invariant to in-plane head roll', () => {
    const base = extractFeatures(syntheticFace({ gazeV: 0.06 }), null, 640, 480)
    const rolled = extractFeatures(syntheticFace({ gazeV: 0.06, roll: 20 }), null, 640, 480)
    expect(rolled.gazeV).toBeCloseTo(base.gazeV, 3)
    expect(base.pitch).toBeNull() // no matrix => no head pose, feature simply absent
  })

  it('gazeV increases as the iris moves down within the eye', () => {
    const vals = [-0.05, 0, 0.05, 0.1].map((g) => extractFeatures(syntheticFace({ gazeV: g }), null, 640, 480).gazeV)
    expect(vals).toEqual([...vals].sort((a, b) => a - b))
  })

  it('rejects incomplete landmark sets and reports face size/position', () => {
    expect(extractFeatures(null, null, 640, 480)).toBeNull()
    expect(extractFeatures([{ x: 0, y: 0 }], null, 640, 480)).toBeNull()
    const f = extractFeatures(syntheticFace(), null, 640, 480)
    expect(f.faceWidth).toBeCloseTo(0.4, 2)
    expect(f.marginFrac).toBeGreaterThan(0.2)
  })

  it('meanLuma reads brightness', () => {
    expect(meanLuma(new Uint8ClampedArray(64).fill(255))).toBeGreaterThan(250)
    expect(meanLuma(new Uint8ClampedArray(64).fill(0))).toBe(0)
  })
})

// ---------- calibration -----------------------------------------------------

describe('calibration', () => {
  it('produces a good, usable profile for a typical user and learns direction from data', () => {
    const p = buildProfile({ ...calibrationSamples(makeUser()), brightness: 140 })
    expect(p.quality.level).toBe('good')
    expect(profileUsable(p)).toBe(true)
    expect(p.quality.dPrime).toBeGreaterThan(3)
    expect(p.axes.map((a) => a.feature)).toEqual(expect.arrayContaining(['pitch', 'gazeV']))
  })

  it('works regardless of which direction "down" is in camera coordinates', () => {
    const u = makeUser({ downDelta: { pitch: -14, gazeV: -0.055, gazeLid: -0.12 } })
    const p = buildProfile(calibrationSamples(u))
    expect(profileUsable(p)).toBe(true)
    const t = (kind) => {
      const t = run(u, [{ kind, ms: 2000 }])
      const g = new GazeTracker(p, paramsFor())
      let peeks = 0
      for (const f of t) peeks += g.update(f.t, f.features).events.filter((e) => e.type === 'peek-start').length
      return peeks
    }
    expect(t('down')).toBe(1)
    expect(t('screen')).toBe(0)
  })

  it('refuses to claim quality when screen and keyboard look the same', () => {
    const u = makeUser({ downDelta: { pitch: 0.3, gazeV: 0.001, gazeLid: 0.002 } })
    const p = buildProfile(calibrationSamples(u))
    expect(profileUsable(p)).toBe(false)
    expect(p.quality.level).toBe('insufficient')
    expect(p.quality.issues.length).toBeGreaterThan(0)
  })

  it('reports overlapping clusters as poor/insufficient, never good', () => {
    // small screen->keyboard difference relative to a noisy measurement
    const u = makeUser({
      downDelta: { pitch: 3.5, gazeV: 0.014, gazeLid: 0.03 },
      noise: { pitch: 1.4, gazeV: 0.01, gazeLid: 0.04, yaw: 1.4, gazeH: 0.012 },
    })
    const p = buildProfile(calibrationSamples(u))
    expect(['poor', 'insufficient']).toContain(p.quality.level)
    expect(profileUsable(p)).toBe(false)
  })

  it('needs enough clean frames', () => {
    const { screen, down } = calibrationSamples(makeUser())
    const p = buildProfile({ screen: screen.slice(0, 10), down })
    expect(p.ok).toBe(false)
    expect(p.quality.issues[0].id).toBe('few-samples')
  })

  it('excludes blink frames from calibration statistics', () => {
    const u = makeUser()
    const { screen, down } = calibrationSamples(u)
    const withBlinks = [...screen, ...run(u, [{ kind: 'blink', ms: 1500 }]).map((x) => x.features)]
    const a = buildProfile({ screen, down })
    const b = buildProfile({ screen: withBlinks, down })
    expect(b.screen.gazeV.median).toBeCloseTo(a.screen.gazeV.median, 2)
  })

  it('works with head-pose-less data (eye signals only) but notes the single signal', () => {
    const strip = (arr) => arr.map((f) => ({ ...f, pitch: null, yaw: null, roll: null }))
    const { screen, down } = calibrationSamples(makeUser())
    const p = buildProfile({ screen: strip(screen), down: strip(down) })
    expect(p.axes.every((a) => a.feature !== 'pitch')).toBe(true)
    expect(profileUsable(p)).toBe(true)
  })

  it('robust stats ignore outliers', () => {
    const s = robustStats([1, 1.1, 0.9, 1, 1.05, 0.95, 50])
    expect(s.median).toBeCloseTo(1, 1)
    expect(s.sd).toBeLessThan(0.3)
  })

  it('gives positioning guidance', () => {
    const base = { faceWidth: 0.36, marginFrac: 0.2, roll: 0, openness: 0.3, pitch: 0 }
    expect(preflight(base, 140)).toEqual([])
    expect(preflight(null)[0].id).toBe('no-face')
    expect(preflight({ ...base, faceWidth: 0.12 }, 140).map((i) => i.id)).toContain('too-far')
    expect(preflight({ ...base, faceWidth: 0.7 }, 140).map((i) => i.id)).toContain('too-close')
    expect(preflight(base, 20).map((i) => i.id)).toContain('dark')
    expect(preflight({ ...base, roll: 30 }, 140).map((i) => i.id)).toContain('tilted')
    expect(preflight({ ...base, marginFrac: 0.01 }, 140).map((i) => i.id)).toContain('off-center')
  })
})

// ---------- classification --------------------------------------------------

function pipeline(user, scenario, { profile, seed = 's', params = paramsFor(), enabled = true } = {}) {
  const prof = profile ?? buildProfile(calibrationSamples(user))
  const tracker = new GazeTracker(prof, params)
  const tally = new SessionTally({ enabled, calibrated: true })
  const frames = run(user, scenario, { seed })
  const events = []
  const states = []
  for (const f of frames) {
    const out = tracker.update(f.t, f.features, f.brightness)
    tracker.adaptFrom(f.features)
    tally.update(f.t, out)
    events.push(...out.events)
    states.push({ t: f.t, state: out.state })
  }
  const end = frames[frames.length - 1].t
  return { tracker, tally, events, states, summary: tally.finish(end, tracker), frames, profile: prof }
}

describe('screen vs keyboard classification (simulated)', () => {
  const user = makeUser()

  it('steady screen-looking: no peeks, discipline ~100, measured', () => {
    const r = pipeline(user, [{ kind: 'screen', ms: 30000 }])
    expect(r.events.filter((e) => e.type === 'peek-start')).toHaveLength(0)
    expect(r.summary.status).toBe(TRACKING_STATUS.MEASURED)
    expect(r.summary.discipline).toBeGreaterThan(98)
  })

  it('detects a 1.5 s look at the keyboard as exactly one peek of about the right length', () => {
    const r = pipeline(user, [{ kind: 'screen', ms: 5000 }, { kind: 'down', ms: 1500 }, { kind: 'screen', ms: 5000 }])
    const starts = r.events.filter((e) => e.type === 'peek-start')
    const ends = r.events.filter((e) => e.type === 'peek-end')
    expect(starts).toHaveLength(1)
    expect(ends).toHaveLength(1)
    expect(Math.abs(ends[0].durationMs - 1500)).toBeLessThan(200)
    // detection latency (event confirmed - true onset) is bounded by the dwell setting
    const latency = starts[0].confirmedAt - 5000
    expect(latency).toBeLessThan(paramsFor().confirmDownMs + 150)
    expect(r.summary.peeks).toBe(1)
    expect(r.summary.discipline).toBeLessThan(95)
  })

  it('a 250 ms downward glance is recorded as a glance, not a peek', () => {
    const r = pipeline(user, [{ kind: 'screen', ms: 3000 }, { kind: 'down', ms: 250 }, { kind: 'screen', ms: 3000 }])
    expect(r.events.filter((e) => e.type === 'peek-start')).toHaveLength(0)
    expect(r.summary.peeks).toBe(0)
  })

  it('reading the bottom edge of the screen is not a peek', () => {
    const r = pipeline(user, [{ kind: 'screen-low', ms: 20000 }])
    expect(r.summary.peeks).toBe(0)
  })

  it('head dips with eyes still on screen (thinking/nodding) are not peeks', () => {
    const r = pipeline(user, [{ kind: 'screen', ms: 3000 }, { kind: 'nod', ms: 3000 }, { kind: 'screen', ms: 3000 }])
    expect(r.events.filter((e) => e.type === 'peek-start')).toHaveLength(0)
    // and the ambiguous time is reported as uncertain, never as good discipline
    expect(r.summary.keyboardMs).toBe(0)
  })

  it('turning away (side/up) is classified as away, not keyboard', () => {
    const side = pipeline(user, [{ kind: 'screen', ms: 3000 }, { kind: 'away', ms: 3000 }, { kind: 'screen', ms: 3000 }])
    expect(side.events.some((e) => e.type === 'peek-start')).toBe(false)
    expect(side.events.some((e) => e.type === 'away-start')).toBe(true)
    const up = pipeline(user, [{ kind: 'screen', ms: 3000 }, { kind: 'up', ms: 3000 }, { kind: 'screen', ms: 3000 }])
    expect(up.events.some((e) => e.type === 'peek-start')).toBe(false)
  })

  it('blinks do not create peeks', () => {
    const sc = []
    for (let i = 0; i < 12; i++) sc.push({ kind: 'screen', ms: 2500 }, { kind: 'blink', ms: 150 })
    const r = pipeline(user, sc)
    expect(r.summary.peeks).toBe(0)
    expect(r.summary.glances).toBe(0)
  })

  it('a long eyes-closed period becomes uncertain, not "looking at the screen"', () => {
    const r = pipeline(user, [{ kind: 'screen', ms: 3000 }, { kind: 'blink', ms: 4000 }, { kind: 'screen', ms: 3000 }])
    expect(r.summary.uncertainMs).toBeGreaterThan(1500)
  })

  it('tracking loss is unavailable time and is not counted as discipline; it recovers', () => {
    const r = pipeline(user, [{ kind: 'screen', ms: 5000 }, { kind: 'noface', ms: 5000 }, { kind: 'screen', ms: 5000 }])
    expect(r.states.some((s) => s.state === STATE.UNAVAILABLE)).toBe(true)
    expect(r.states[r.states.length - 1].state).toBe(STATE.SCREEN)
    expect(r.summary.unavailableMs).toBeGreaterThan(3500)
    expect(r.summary.coverage).toBeLessThan(0.75)
  })

  it('mostly-lost tracking yields no discipline score', () => {
    const r = pipeline(user, [{ kind: 'screen', ms: 4000 }, { kind: 'noface', ms: 16000 }])
    expect(r.summary.discipline).toBeNull()
    expect([TRACKING_STATUS.UNAVAILABLE, TRACKING_STATUS.PARTIAL]).toContain(r.summary.status)
  })

  it('partial coverage (30-70%) is labelled partial with no discipline figure', () => {
    const r = pipeline(user, [{ kind: 'screen', ms: 10000 }, { kind: 'noface', ms: 8000 }])
    expect(r.summary.status).toBe(TRACKING_STATUS.PARTIAL)
    expect(r.summary.discipline).toBeNull()
  })

  it('very dark frames degrade to uncertain rather than guessing', () => {
    const r = pipeline(user, [{ kind: 'screen', ms: 3000 }, { kind: 'down', ms: 4000, brightness: 20 }, { kind: 'screen', ms: 3000 }])
    expect(r.summary.keyboardMs).toBe(0)
  })

  it('disabled tracking is reported as disabled with no figures', () => {
    const r = pipeline(user, [{ kind: 'screen', ms: 10000 }], { enabled: false })
    expect(r.summary.status).toBe(TRACKING_STATUS.DISABLED)
    expect(r.summary.discipline).toBeNull()
  })

  it('a slow posture drift is followed without false peeks; a posture jump is surfaced', () => {
    const profile = buildProfile(calibrationSamples(user))
    const tracker = new GazeTracker(profile, paramsFor())
    // 6 minutes, pitch drifts +3 degrees (user slouches a little)
    const base = run(user, [{ kind: 'screen', ms: 360000 }], { seed: 'drift', fps: 10 })
    let peeks = 0
    for (const f of base) {
      const shifted = { ...f.features, pitch: f.features.pitch + (3 * (f.t / 360000)) }
      const out = tracker.update(f.t, shifted, 140)
      tracker.adaptFrom(shifted)
      peeks += out.events.filter((e) => e.type === 'peek-start').length
    }
    expect(peeks).toBe(0)
    expect(tracker.offset.pitch).toBeGreaterThan(0.3)
    expect(tracker.driftRatio()).toBeLessThan(0.6)
  })

  it('scoreFrame flags disagreeing signals as uncertain with a reason', () => {
    const profile = buildProfile(calibrationSamples(user))
    const f = { pitch: 14, gazeV: -0.03, gazeLid: 0.4, yaw: 0, gazeH: 0, roll: 0, openness: 0.3, faceWidth: 0.36, marginFrac: 0.2, eyeDisagreement: 0 }
    const s = scoreFrame(profile, f)
    expect(s.label).toBe('uncertain')
    expect(s.reason).toBe('signals-disagree')
    expect(projectScore(profile, f).t).toBeLessThan(0.7) // head alone would have been misread by a simple head-pitch rule
  })

  it('sensitivity setting trades latency for stability', () => {
    const sc = [{ kind: 'screen', ms: 3000 }, { kind: 'down', ms: 600 }, { kind: 'screen', ms: 3000 }]
    const strict = pipeline(user, sc, { params: paramsFor('strict') })
    const relaxed = pipeline(user, sc, { params: paramsFor('relaxed') })
    expect(strict.summary.peeks).toBe(1)
    expect(relaxed.summary.peeks).toBe(0)
  })
})

describe('simulated error rates across 25 different users (simulation, not real-world accuracy)', () => {
  const users = Array.from({ length: 25 }, (_, i) => {
    const k = 0.2 + (i % 5) * 0.2 // separation 0.2x .. 1.0x of the typical user
    const noise = 1 + (i % 3) * 0.8
    return makeUser({
      downDelta: { pitch: 14 * k, gazeV: 0.055 * k, gazeLid: 0.12 * k },
      noise: { pitch: 0.7 * noise, gazeV: 0.005 * noise, gazeLid: 0.02 * noise },
    })
  })

  it('false-positive peeks stay rare and 1 s peeks are found, for users with a usable calibration', () => {
    let usable = 0
    let fpMinutes = 0
    let fp = 0
    let truePeeks = 0
    let found = 0
    users.forEach((u, i) => {
      const profile = buildProfile(calibrationSamples(u, { seed: `c${i}` }))
      if (!profileUsable(profile)) return
      usable++
      // 2 minutes of mixed natural behaviour with NO keyboard looking
      const natural = pipeline(u, [
        { kind: 'screen', ms: 20000 }, { kind: 'screen-low', ms: 10000 }, { kind: 'nod', ms: 2500 }, { kind: 'screen', ms: 15000 },
        { kind: 'blink', ms: 150 }, { kind: 'screen', ms: 15000 }, { kind: 'away', ms: 3000 }, { kind: 'screen', ms: 20000 },
        { kind: 'up', ms: 2000 }, { kind: 'screen', ms: 20000 },
      ], { profile, seed: `n${i}` })
      fp += natural.events.filter((e) => e.type === 'peek-start').length
      fpMinutes += natural.frames[natural.frames.length - 1].t / 60000
      // 10 true 1-second peeks
      const sc = []
      for (let k = 0; k < 10; k++) sc.push({ kind: 'screen', ms: 4000 }, { kind: 'down', ms: 1000 })
      sc.push({ kind: 'screen', ms: 3000 })
      const real = pipeline(u, sc, { profile, seed: `r${i}` })
      truePeeks += 10
      found += Math.min(10, real.events.filter((e) => e.type === 'peek-start').length)
    })
    console.log(`[simulation] usable calibrations: ${usable}/${users.length}; false peeks/min: ${(fp / fpMinutes).toFixed(3)}; 1s-peek recall: ${(found / truePeeks * 100).toFixed(1)}%`)
    // weak setups must be refused by calibration rather than silently scored
    expect(usable).toBeGreaterThanOrEqual(12)
    expect(usable).toBeLessThan(users.length)
    expect(fp / fpMinutes).toBeLessThan(0.5)
    expect(found / truePeeks).toBeGreaterThan(0.9)
  })

  it('users with weak separation are refused rather than scored', () => {
    const weak = makeUser({ downDelta: { pitch: 2.5, gazeV: 0.01, gazeLid: 0.02 } })
    expect(profileUsable(buildProfile(calibrationSamples(weak)))).toBe(false)
  })
})
