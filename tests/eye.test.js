import { describe, expect, it } from 'vitest'
import { LM, LANDMARK_COUNT, eulerFromMatrix, extractFeatures, meanLuma } from '../src/eye/landmarks.js'
import { buildProfile, decisionPoint, frameLLR, preflight, profileUsable, robustStats, solve } from '../src/eye/calibration.js'
import { GazeTracker, OneEuro, STATE, frameConfidence, paramsFor, scoreFrame } from '../src/eye/classifier.js'
import { SessionTally, TRACKING_STATUS } from '../src/eye/tally.js'
import { calibrationSamples, makeUser, run, scaledUser } from './helpers/gazeSim.js'

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

function syntheticFace({ gazeV = 0, gazeH = 0, openness = 0.3, roll = 0, lidDrop = 0, W = 640, H = 480 } = {}) {
  const lm = Array.from({ length: LANDMARK_COUNT }, () => ({ x: 0.5, y: 0.5, z: 0 }))
  const set = (i, x, y) => (lm[i] = { x, y, z: 0 })
  const ew = 0.06 // eye width as fraction of frame width
  const cy = 0.45
  const eyeW = ew * W
  const half = (openness * eyeW) / 2 / H
  const place = (outerI, innerI, upSet, lowSet, irisI, cx, flip) => {
    // eye centred at cx; "outer" is on the side away from the nose
    const dir = flip ? -1 : 1
    set(outerI, cx - dir * (ew / 2), cy)
    set(innerI, cx + dir * (ew / 2), cy)
    for (const i of upSet) set(i, cx, cy - half + (lidDrop * eyeW) / H)
    for (const i of lowSet) set(i, cx, cy + half)
    set(irisI, cx + (gazeH * eyeW) / W, cy + (gazeV * eyeW) / H)
  }
  place(LM.rOuter, LM.rInner, LM.rUpperSet, LM.rLowerSet, LM.rIris, 0.43, false)
  place(LM.lOuter, LM.lInner, LM.lUpperSet, LM.lLowerSet, LM.lIris, 0.57, true)
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

  it('measures the upper-eyelid height, which rises as the lid drops', () => {
    const open = extractFeatures(syntheticFace(), null, 640, 480)
    const lowered = extractFeatures(syntheticFace({ lidDrop: 0.06 }), null, 640, 480)
    expect(open.lidTop).toBeCloseTo(-0.15, 3) // half the opening, above the corner line
    expect(lowered.lidTop - open.lidTop).toBeCloseTo(0.06, 3)
    expect(lowered.openness).toBeLessThan(open.openness)
  })

  it('gaze measurement is invariant to in-plane head roll', () => {
    const base = extractFeatures(syntheticFace({ gazeV: 0.06 }), null, 640, 480)
    const rolled = extractFeatures(syntheticFace({ gazeV: 0.06, roll: 20 }), null, 640, 480)
    expect(rolled.gazeV).toBeCloseTo(base.gazeV, 3)
    expect(rolled.lidTop).toBeCloseTo(base.lidTop, 3)
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
    expect(p.axes.map((a) => a.feature)).toEqual(expect.arrayContaining(['pitch', 'gazeV', 'lidTop']))
    expect(p.emission.k.mu).toBeGreaterThan(p.emission.s.mu + 0.5)
  })

  it('works regardless of which direction "down" is in camera coordinates', () => {
    const u = makeUser({ downDelta: { pitch: -14, gazeV: -0.055, gazeLid: -0.12, lidTop: -0.055, lookDown: -0.4, blink: -0.05 }, downOpen: 1.3 })
    const p = buildProfile(calibrationSamples(u))
    expect(profileUsable(p)).toBe(true)
    const t = (kind) => {
      const fr = run(u, [{ kind: 'screen', ms: 1000 }, { kind, ms: 2000 }])
      const g = new GazeTracker(p, paramsFor())
      let peeks = 0
      for (const f of fr) peeks += g.update(f.t, f.features).events.filter((e) => e.type === 'peek-start').length
      return peeks
    }
    expect(t('down')).toBe(1)
    expect(t('screen')).toBe(0)
  })

  it('refuses to claim quality when screen and keyboard look the same', () => {
    const p = buildProfile(calibrationSamples(scaledUser(0.02)))
    expect(profileUsable(p)).toBe(false)
    expect(p.quality.level).toBe('insufficient')
    expect(p.quality.issues.length).toBeGreaterThan(0)
  })

  it('reports overlapping clusters as poor/insufficient, never good', () => {
    const p = buildProfile(calibrationSamples(scaledUser(0.12, 2)))
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
    expect(b.screen.openness.median).toBeCloseTo(a.screen.openness.median, 2)
  })

  it('works with head-pose-less data (eye signals only)', () => {
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

  it('gives positioning guidance, and only a missing or tiny face blocks', () => {
    const base = { faceWidth: 0.36, marginFrac: 0.2, roll: 0, openness: 0.3, pitch: 0 }
    expect(preflight(base, 140)).toEqual([])
    expect(preflight(null)[0]).toMatchObject({ id: 'no-face', severity: 'error' })
    // sitting at arm's length is normal: no warning at all
    expect(preflight({ ...base, faceWidth: 0.14 }, 140)).toEqual([])
    expect(preflight({ ...base, faceWidth: 0.08 }, 140)).toEqual([expect.objectContaining({ id: 'too-far', severity: 'warn' })])
    expect(preflight({ ...base, faceWidth: 0.05 }, 140)).toEqual([expect.objectContaining({ id: 'too-far', severity: 'error' })])
    expect(preflight({ ...base, faceWidth: 0.75 }, 140).map((i) => i.id)).toContain('too-close')
    expect(preflight(base, 20).map((i) => i.severity)).toEqual(['warn'])
    expect(preflight({ ...base, roll: 30 }, 140).map((i) => i.id)).toContain('tilted')
    expect(preflight({ ...base, marginFrac: 0.005 }, 140).map((i) => i.id)).toContain('off-center')
  })

  it('turns a projected score into evidence that grows from screen to keyboard', () => {
    const p = buildProfile(calibrationSamples(makeUser()))
    const llr = [-0.5, 0, 0.3, 0.6, 1, 1.5].map((t) => frameLLR(p, t))
    expect(llr[0]).toBeLessThan(0)
    expect(llr[1]).toBeLessThan(0)
    expect(llr[4]).toBeGreaterThan(0)
    expect(llr[5]).toBeGreaterThan(0)
    for (const v of llr) expect(Math.abs(v)).toBeLessThanOrEqual(3) // no single frame decides alone
    const mid = decisionPoint(p)
    expect(mid).toBeGreaterThan(0.2)
    expect(mid).toBeLessThan(0.8)
  })
})

// ---------- classification --------------------------------------------------

function pipeline(user, scenario, { profile, seed = 's', params = paramsFor(), enabled = true, fps = 20 } = {}) {
  const prof = profile ?? buildProfile(calibrationSamples(user))
  const tracker = new GazeTracker(prof, params)
  const tally = new SessionTally({ enabled, calibrated: true })
  const frames = run(user, scenario, { seed, fps })
  const events = []
  const states = []
  for (const f of frames) {
    const out = tracker.update(f.t, f.features, f.brightness)
    tally.update(f.t, out)
    events.push(...out.events)
    states.push({ t: f.t, state: out.state, kind: f.kind, pK: out.pKeyboard })
  }
  const end = frames[frames.length - 1].t
  return { tracker, tally, events, states, summary: tally.finish(end, tracker), frames, profile: prof }
}
const peeksOf = (r) => r.events.filter((e) => e.type === 'peek-start')

describe('screen vs keyboard classification (simulated)', () => {
  const user = makeUser()

  it('steady screen-looking: no peeks, discipline ~100, measured', () => {
    const r = pipeline(user, [{ kind: 'screen', ms: 30000 }])
    expect(peeksOf(r)).toHaveLength(0)
    expect(r.summary.status).toBe(TRACKING_STATUS.MEASURED)
    expect(r.summary.discipline).toBeGreaterThan(98)
  })

  it('detects a 1.5 s look at the keyboard as exactly one peek of about the right length, quickly', () => {
    const r = pipeline(user, [{ kind: 'screen', ms: 5000 }, { kind: 'down', ms: 1500 }, { kind: 'screen', ms: 5000 }])
    const starts = peeksOf(r)
    const ends = r.events.filter((e) => e.type === 'peek-end')
    expect(starts).toHaveLength(1)
    expect(ends).toHaveLength(1)
    expect(Math.abs(ends[0].durationMs - 1500)).toBeLessThan(200)
    // onset is back-dated to when the evidence turned; confirmation follows within ~half a second
    expect(Math.abs(starts[0].startT - 5000)).toBeLessThan(150)
    expect(starts[0].confirmedAt - 5000).toBeLessThan(600)
    expect(r.summary.peeks).toBe(1)
    expect(r.summary.discipline).toBeLessThan(95)
  })

  it('a 200 ms downward flick is at most a glance, not a peek', () => {
    const r = pipeline(user, [{ kind: 'screen', ms: 3000 }, { kind: 'down', ms: 200 }, { kind: 'screen', ms: 3000 }])
    expect(peeksOf(r)).toHaveLength(0)
    expect(r.summary.peeks).toBe(0)
  })

  it('reading the bottom edge of the screen is not a peek', () => {
    const r = pipeline(user, [{ kind: 'screen-low', ms: 20000 }])
    expect(r.summary.peeks).toBe(0)
  })

  it('head dips with eyes still on screen (thinking/nodding) are not peeks', () => {
    const r = pipeline(user, [{ kind: 'screen', ms: 3000 }, { kind: 'nod', ms: 3000 }, { kind: 'screen', ms: 3000 }])
    expect(peeksOf(r)).toHaveLength(0)
    expect(r.summary.keyboardMs).toBe(0)
  })

  it('turning away (side/up) is classified as away, not keyboard', () => {
    const side = pipeline(user, [{ kind: 'screen', ms: 3000 }, { kind: 'away', ms: 3000 }, { kind: 'screen', ms: 3000 }])
    expect(side.events.some((e) => e.type === 'peek-start')).toBe(false)
    expect(side.events.some((e) => e.type === 'away-start')).toBe(true)
    const up = pipeline(user, [{ kind: 'screen', ms: 3000 }, { kind: 'up', ms: 3000 }, { kind: 'screen', ms: 3000 }])
    expect(up.events.some((e) => e.type === 'peek-start')).toBe(false)
  })

  it('ordinary blinks create neither peeks nor glances', () => {
    const sc = []
    for (let i = 0; i < 12; i++) sc.push({ kind: 'screen', ms: 2500 }, { kind: 'blink', ms: 150 })
    const r = pipeline(user, sc)
    expect(r.summary.peeks).toBe(0)
    expect(r.summary.glances).toBe(0)
  })

  it('slow blinks (400 ms) are not peeks either', () => {
    const sc = []
    for (let i = 0; i < 8; i++) sc.push({ kind: 'screen', ms: 3000 }, { kind: 'blink', ms: 400 })
    const r = pipeline(user, sc, { seed: 'slow' })
    expect(r.summary.peeks).toBe(0)
  })

  it('a deep look with the eyelids almost closed is a peek, not "uncertain" or a blink', () => {
    const r = pipeline(user, [{ kind: 'screen', ms: 3000 }, { kind: 'deep', ms: 1500 }, { kind: 'screen', ms: 3000 }])
    expect(peeksOf(r)).toHaveLength(1)
    expect(peeksOf(r)[0].confirmedAt - 3000).toBeLessThan(700)
  })

  it('a deep eyes-only look (head still, lids nearly shut) is still detected, by duration', () => {
    const r = pipeline(user, [{ kind: 'screen', ms: 3000 }, { kind: 'deepEyes', ms: 2500 }, { kind: 'screen', ms: 3000 }])
    expect(peeksOf(r)).toHaveLength(1)
    expect(r.summary.keyboardMs).toBeGreaterThan(1000)
  })

  it('eyes held closed for seconds while typing are never counted as screen time', () => {
    const r = pipeline(user, [{ kind: 'screen', ms: 3000 }, { kind: 'blink', ms: 4000 }, { kind: 'screen', ms: 3000 }])
    const closedFrames = r.states.filter((s) => s.kind === 'blink' && s.state === STATE.SCREEN && s.pK < 0.5)
    // a short hold right after the eyes close is fine; the rest must not be "screen"
    expect(closedFrames.length).toBeLessThan(20)
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

  it('scoreFrame flags head-down-with-eyes-up as uncertain with a reason', () => {
    const profile = buildProfile(calibrationSamples(user))
    const f = { pitch: 14, gazeV: -0.03, gazeLid: 0.4, lidTop: -0.16, lookDown: -0.1, blink: 0.08, yaw: 0, gazeH: 0, roll: 0, openness: 0.32, faceWidth: 0.36, marginFrac: 0.2, eyeDisagreement: 0 }
    const s = scoreFrame(profile, f)
    expect(s.label).toBe('uncertain')
    expect(s.reason).toBe('head-down-eyes-up')
  })

  it('sensitivity setting trades latency for stability', () => {
    const sc = [{ kind: 'screen', ms: 3000 }, { kind: 'down', ms: 550 }, { kind: 'screen', ms: 3000 }]
    const strict = pipeline(user, sc, { params: paramsFor('strict') })
    const relaxed = pipeline(user, sc, { params: paramsFor('relaxed') })
    expect(strict.summary.peeks).toBe(1)
    expect(relaxed.summary.peeks).toBe(0)
  })

  it('is not fooled by single wild frames (landmark glitches)', () => {
    const profile = buildProfile(calibrationSamples(user))
    const g = new GazeTracker(profile, paramsFor())
    const frames = run(user, [{ kind: 'screen', ms: 30000 }], { seed: 'glitch' })
    const glitchy = run(user, [{ kind: 'down', ms: 30000 }], { seed: 'g2' })
    let peeks = 0
    let glances = 0
    frames.forEach((f, i) => {
      const feat = i % 23 === 0 ? glitchy[i]?.features ?? f.features : f.features // one wrong frame every ~1.1 s
      const ev = g.update(f.t, feat).events
      peeks += ev.filter((e) => e.type === 'peek-start').length
      glances += ev.filter((e) => e.type === 'glance').length
    })
    expect(peeks).toBe(0)
    expect(glances).toBe(0)
  })
})

/** A posture change that moves every signal `k` of the way from the screen look toward the keyboard look. */
function postureShift(k) {
  const d = makeUser().downDelta
  return { pitch: d.pitch * k, gazeV: d.gazeV * k, gazeLid: d.gazeLid * k, lidTop: d.lidTop * k, lookDown: d.lookDown * k, blink: d.blink * k, openness: -0.3 * 0.28 * k }
}

describe('real-world setups that used to break tracking', () => {
  it('a face far from the camera (14 % of the frame width) is tracked, not discarded', () => {
    const far = makeUser({ screen: { faceWidth: 0.14 } })
    expect(frameConfidence({ faceWidth: 0.14, marginFrac: 0.1, eyeDisagreement: 0, roll: 0 }, 120)).toBeGreaterThan(0.9)
    const r = pipeline(far, [{ kind: 'screen', ms: 4000 }, { kind: 'down', ms: 1500 }, { kind: 'screen', ms: 4000 }])
    expect(r.summary.status).toBe(TRACKING_STATUS.MEASURED)
    expect(r.summary.peeks).toBe(1)
    expect(r.summary.uncertainMs).toBeLessThan(500)
  })

  it('works on a dim evening webcam image (brightness 40)', () => {
    const user = makeUser()
    const r = pipeline(user, [{ kind: 'screen', ms: 4000, brightness: 40 }, { kind: 'down', ms: 1500, brightness: 40 }, { kind: 'screen', ms: 4000, brightness: 40 }])
    expect(r.summary.peeks).toBe(1)
  })

  it('follows a posture shift (leaning in / slouching) without inventing peeks, and still sees real peeks', () => {
    const user = makeUser()
    const profile = buildProfile(calibrationSamples(user))
    const g = new GazeTracker(profile, paramsFor())
    // the user settles into a different posture: everything moves ~45 % of the way toward "keyboard"
    const shift = postureShift(0.45)
    const frames = run(user, [{ kind: 'screen', ms: 40000, shift }], { seed: 'posture' })
    let falsePeeks = 0
    let lateFalse = 0
    for (const f of frames) {
      const out = g.update(f.t, f.features)
      const n = out.events.filter((e) => e.type === 'peek-start').length
      falsePeeks += n
      if (f.t > 15000) lateFalse += n
    }
    expect(lateFalse).toBe(0)
    expect(falsePeeks).toBeLessThanOrEqual(1)
    expect(g.tOffset).toBeGreaterThan(0.15)
    // after adapting, a real look down is still caught
    const more = run(user, [{ kind: 'screen', ms: 2000, shift }, { kind: 'down', ms: 1500, shift }, { kind: 'screen', ms: 2000, shift }], { seed: 'p2', t0: 41000 })
    let peeks = 0
    for (const f of more) peeks += g.update(f.t, f.features).events.filter((e) => e.type === 'peek-start').length
    expect(peeks).toBe(1)
  })

  it('a beginner who looks down most of the time is not "adapted away"', () => {
    const user = makeUser()
    const sc = []
    for (let i = 0; i < 20; i++) sc.push({ kind: 'screen', ms: 600 }, { kind: 'down', ms: 1800 })
    const r = pipeline(user, sc, { seed: 'beginner' })
    expect(r.tracker.tOffset).toBeLessThan(0.15)
    expect(r.summary.peeks).toBeGreaterThanOrEqual(18)
    expect(r.summary.discipline).toBeLessThan(40)
  })

  it('re-centring fixes a sudden posture change at once', () => {
    const user = makeUser()
    const profile = buildProfile(calibrationSamples(user))
    const g = new GazeTracker(profile, paramsFor())
    const shift = postureShift(0.7)
    const moved = run(user, [{ kind: 'screen', ms: 3000, shift }], { seed: 'm' })
    let keyboardish = 0
    for (const f of moved) if (g.update(f.t, f.features).pKeyboard > 0.5) keyboardish++
    expect(keyboardish / moved.length).toBeGreaterThan(0.4) // baseline is stale
    expect(g.recenter(moved.slice(0, 30).map((f) => f.features))).toBe(true)
    const after = run(user, [{ kind: 'screen', ms: 4000, shift }, { kind: 'down', ms: 1500, shift }, { kind: 'screen', ms: 1500, shift }], { seed: 'n', t0: 10000 })
    let peeks = 0
    let bad = 0
    for (const f of after) {
      const o = g.update(f.t, f.features)
      peeks += o.events.filter((e) => e.type === 'peek-start').length
      if (f.kind === 'screen' && f.t < 13500 && o.pKeyboard > 0.5) bad++
    }
    expect(peeks).toBe(1)
    expect(bad).toBeLessThan(4)
  })
})

describe('simulated error rates across 25 different users (simulation, not real-world accuracy)', () => {
  const users = Array.from({ length: 25 }, (_, i) => scaledUser(0.15 + (i % 5) * 0.2, 1 + (i % 3) * 0.8))

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
        { kind: 'blink', ms: 350 }, { kind: 'up', ms: 2000 }, { kind: 'screen', ms: 20000 },
      ], { profile, seed: `n${i}` })
      fp += peeksOf(natural).length
      fpMinutes += natural.frames[natural.frames.length - 1].t / 60000
      // 10 true 1-second peeks
      const sc = []
      for (let k = 0; k < 10; k++) sc.push({ kind: 'screen', ms: 4000 }, { kind: 'down', ms: 1000 })
      sc.push({ kind: 'screen', ms: 3000 })
      const real = pipeline(u, sc, { profile, seed: `r${i}` })
      truePeeks += 10
      const starts = peeksOf(real)
      found += Math.min(10, starts.length)
    })
    console.log(`[simulation] usable calibrations: ${usable}/${users.length}; false peeks/min: ${(fp / fpMinutes).toFixed(3)}; 1s-peek recall: ${((found / truePeeks) * 100).toFixed(1)}%`)
    // weak setups must be refused by calibration rather than silently scored
    expect(usable).toBeGreaterThanOrEqual(12)
    expect(usable).toBeLessThan(users.length)
    expect(fp / fpMinutes).toBeLessThan(0.3)
    expect(found / truePeeks).toBeGreaterThan(0.9)
  })

  it('users with weak separation are refused rather than scored', () => {
    expect(profileUsable(buildProfile(calibrationSamples(scaledUser(0.08))))).toBe(false)
  })
})

describe('calibration internals', () => {
  const user = makeUser()

  it('quality is cross-validated on held-out capture segments', () => {
    const p = buildProfile(calibrationSamples(user))
    expect(p.quality.validated).toBe(true)
    expect(p.quality.cvFalsePositive).not.toBeNull()
    const noSeg = calibrationSamples(user)
    const q = buildProfile({ screen: noSeg.screen, down: noSeg.down })
    expect(q.quality.validated).toBe(false)
  })

  it('cross-validation exposes a calibration that only looks good in-sample', () => {
    // the second keyboard capture is really screen-looking (the user looked up to check the screen)
    const c = calibrationSamples(user)
    const bad = run(user, [{ kind: 'screen', ms: 3000 }], { seed: 'oops' }).map((f) => f.features).slice(0, c.downSegments[1].length)
    const p = buildProfile({ ...c, down: [...c.downSegments[0], ...bad], downSegments: [c.downSegments[0], bad] })
    expect(p.quality.level).not.toBe('good')
  })

  it('uses the eyelids and the learned eye-look signal alongside head pose and iris geometry', () => {
    const p = buildProfile(calibrationSamples(user))
    expect(p.quality.signals).toEqual(expect.arrayContaining(['lookDown', 'lidTop', 'openness', 'pitch']))
    expect(p.axes.every((a) => a.w >= 0 === a.sep >= 0 || a.w === 0)).toBe(true)
  })

  it('LDA does not double count correlated signals: a keyboard look projects to ~1', () => {
    const c = calibrationSamples(user)
    const p = buildProfile(c)
    const ts = c.down.map((f) => {
      let n = 0, d = 0
      for (const a of p.axes) { n += (a.w * (f[a.feature] - p.screen[a.feature].median)) / a.scale; d += (a.w * a.sep) / a.scale }
      return n / d
    })
    const mean = ts.reduce((a, b) => a + b, 0) / ts.length
    expect(mean).toBeGreaterThan(0.85)
    expect(mean).toBeLessThan(1.15)
  })

  it('small linear systems are solved correctly', () => {
    const x = solve([[2, 1], [1, 3]], [5, 10])
    expect(x[0]).toBeCloseTo(1, 6)
    expect(x[1]).toBeCloseTo(3, 6)
    expect(solve([[1, 1], [1, 1]], [1, 2])).toBeNull()
  })

  it('One-Euro filter removes jitter but follows a real change quickly', () => {
    const f = new OneEuro()
    let t = 0
    const noisy = []
    const out = []
    for (let i = 0; i < 60; i++) { const x = (i % 2 ? 0.08 : -0.08); noisy.push(x); out.push(f.filter(x, (t += 50))) }
    const amp = (a) => Math.max(...a.slice(20)) - Math.min(...a.slice(20))
    expect(amp(out)).toBeLessThan(amp(noisy) * 0.6)
    let crossed = null
    for (let i = 0; i < 20; i++) { const y = f.filter(1, (t += 50)); if (crossed == null && y > 0.7) crossed = (i + 1) * 50 }
    expect(crossed).not.toBeNull()
    expect(crossed).toBeLessThanOrEqual(250)
  })
})

describe('several ways of looking at the keyboard', () => {
  // This user sometimes tilts their head to look down and sometimes drops only their eyes.
  const user = makeUser()
  const tilt = { pitch: 16, gazeV: 0.012, gazeLid: 0.03, lidTop: 0.012, lookDown: 0.1, blink: 0.05 }
  const eyesOnly = { pitch: 1.5, gazeV: 0.07, gazeLid: 0.16, lidTop: 0.07, lookDown: 0.5, blink: 0.25 }
  const capture = (delta, open, seed) => run(makeUser({ downDelta: delta, downOpen: open }), [{ kind: 'down', ms: 3000 }], { seed }).map((f) => f.features)
  const base = calibrationSamples(user)
  const segA = capture(tilt, 0.95, 'a')
  const segB = capture(eyesOnly, 0.68, 'b')
  const profile = buildProfile({ screen: base.screen, screenSegments: base.screenSegments, down: [...segA, ...segB], downSegments: [segA, segB] })

  const peeksFor = (delta, open, seed) => {
    const u = makeUser({ downDelta: delta, downOpen: open })
    const sc = []
    for (let i = 0; i < 10; i++) sc.push({ kind: 'screen', ms: 3000 }, { kind: 'down', ms: 1000 })
    sc.push({ kind: 'screen', ms: 2000 })
    const g = new GazeTracker(profile, paramsFor())
    let n = 0
    for (const f of run(u, sc, { seed })) n += g.update(f.t, f.features).events.filter((e) => e.type === 'peek-start').length
    return n
  }

  it('keeps one prototype per distinct style', () => {
    expect(profile.ok).toBe(true)
    expect(profile.protos.length).toBe(2)
    expect(profile.quality.styles).toBe(2)
  })

  it('detects head-tilt peeks AND eyes-only peeks', () => {
    expect(peeksFor(tilt, 0.95, 't1')).toBeGreaterThanOrEqual(9)
    expect(peeksFor(eyesOnly, 0.68, 'e1')).toBeGreaterThanOrEqual(9)
  })

  it('still produces no peeks for pure screen-looking and nodding', () => {
    const g = new GazeTracker(profile, paramsFor())
    let n = 0
    for (const f of run(user, [{ kind: 'screen', ms: 40000 }, { kind: 'screen-low', ms: 15000 }, { kind: 'nod', ms: 3000 }, { kind: 'screen', ms: 10000 }], { seed: 'q' })) {
      n += g.update(f.t, f.features).events.filter((e) => e.type === 'peek-start').length
    }
    expect(n).toBe(0)
  })
})
