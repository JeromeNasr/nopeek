import { describe, expect, it } from 'vitest'
import {
  LAYOUT_IDS, LAYOUTS, charToKey, codeToChar, fingerForChar, fingerOfCode, profileFingerForChar,
  normalizeProfile, scoreLayouts, suggestLayout, layoutFromLayoutMap, FINGER_OF_CODE, HOME_CODES, codeLabel,
} from '../src/training/keyboard.js'
import { LESSONS, STAGES, computeProgress, evaluateRun, LESSON_BY_ID } from '../src/training/lessons.js'
import { generateLessonWords, generatePracticeWords, charsForCodes } from '../src/training/generator.js'
import { aggregateAnalyses, analyzeKeystrokes, areAdjacent, detectWeaknesses, weaknessTrend, wilsonLower } from '../src/training/analysis.js'
import { buildRecommendations } from '../src/training/recommender.js'
import { generateWords } from '../src/engine/textSources.js'
import { simulate } from './helpers/typist.js'

describe('keyboard model', () => {
  it('every layout is internally consistent: no char on two keys, home keys exist', () => {
    for (const id of LAYOUT_IDS) {
      const seen = new Map()
      for (const [code, [lo, hi]] of Object.entries(LAYOUTS[id].map)) {
        for (const ch of new Set([lo, hi])) {
          if (code === 'Space' && ch === ' ') continue
          expect(seen.has(ch), `${id}: "${ch}" on ${code} and ${seen.get(ch)}`).toBe(false)
          seen.set(ch, code)
        }
      }
      for (const code of Object.values(HOME_CODES)) expect(LAYOUTS[id].map[code]).toBeTruthy()
    }
  })

  it('maps characters to physical keys per layout', () => {
    expect(charToKey('qwerty-us', 'a')).toEqual({ code: 'KeyA', shift: false })
    expect(charToKey('dvorak', 'e')).toEqual({ code: 'KeyD', shift: false })
    expect(charToKey('colemak', 'e').code).toBe('KeyK')
    expect(charToKey('azerty-fr', 'a').code).toBe('KeyQ')
    expect(charToKey('qwertz-de', 'z').code).toBe('KeyY')
    expect(charToKey('qwerty-us', '?')).toEqual({ code: 'Slash', shift: true })
    expect(codeToChar('qwerty-uk', 'Digit3', true)).toBe('£')
    expect(charToKey('qwerty-us', '£')).toBeNull()
  })

  it('assigns standard fingers', () => {
    expect(fingerOfCode('KeyA')).toBe('lp')
    expect(fingerOfCode('KeyF')).toBe('li')
    expect(fingerOfCode('KeyG')).toBe('li')
    expect(fingerOfCode('KeyH')).toBe('ri')
    expect(fingerOfCode('KeyL')).toBe('rr')
    expect(fingerOfCode('Semicolon')).toBe('rp')
    expect(fingerOfCode('Space')).toBe('rt')
    expect(fingerOfCode('IntlBackslash')).toBe('lp')
  })

  it('capitals need the opposite hand\'s pinky for shift', () => {
    expect(fingerForChar('qwerty-us', 'A')).toMatchObject({ finger: 'lp', shiftFinger: 'rp' })
    expect(fingerForChar('qwerty-us', 'J')).toMatchObject({ finger: 'ri', shiftFinger: 'lp' })
    expect(fingerForChar('qwerty-us', 'a').shiftFinger).toBeNull()
  })

  it('manual finger overrides are honoured', () => {
    const p = normalizeProfile({ fingerOverrides: { KeyB: 'ri' } })
    expect(profileFingerForChar(p, 'b').finger).toBe('ri')
    expect(profileFingerForChar(normalizeProfile({}), 'b').finger).toBe('li')
  })

  it('normalizeProfile repairs invalid data', () => {
    const p = normalizeProfile({ layout: 'nope', formFactor: 'x', physical: 'weird', fingerOverrides: 5 })
    expect(p).toMatchObject({ layout: 'qwerty-us', formFactor: 'full', physical: 'ansi', fingerOverrides: {} })
  })

  it('infers layout from observed (code,key) pairs, but only with strong evidence', () => {
    const obs = {}
    const add = (layout, n) => { for (const [code, [lo]] of Object.entries(LAYOUTS[layout].map)) if (code.startsWith('Key')) obs[`${code}|${lo}`] = n }
    add('dvorak', 3)
    expect(scoreLayouts(obs)[0].id).toBe('dvorak')
    expect(suggestLayout(obs, 'qwerty-us')?.id).toBe('dvorak')
    expect(suggestLayout(obs, 'dvorak')).toBeNull()
    expect(suggestLayout({ 'KeyA|a': 3 }, 'dvorak')).toBeNull() // too little evidence
  })

  it('layout map from navigator.keyboard is matched', () => {
    const m = new Map(Object.entries(LAYOUTS.colemak.map).filter(([c]) => c.startsWith('Key')).map(([c, v]) => [c, v[0]]))
    expect(layoutFromLayoutMap(m).id).toBe('colemak')
  })

  it('labels keys by what they print', () => {
    expect(codeLabel('dvorak', 'KeyS')).toBe('O')
    expect(codeLabel('qwerty-us', 'Space')).toBe('Space')
  })
})

describe('curriculum', () => {
  it('ids are unique, stages exist, thresholds sane', () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length)
    for (const l of LESSONS) {
      expect(STAGES.some((s) => s.id === l.stage)).toBe(true)
      expect(l.pass.minAccuracy).toBeGreaterThanOrEqual(85)
      expect(l.pass.minAccuracy).toBeLessThanOrEqual(100)
      expect(l.pass.minWpm).toBeGreaterThan(0)
    }
  })

  it('does not pass a lesson that merely finishes: accuracy and speed are both required', () => {
    const l = LESSON_BY_ID['2.2']
    const base = { accuracy: 99, wpm: l.pass.minWpm + 2, correctKeys: 100, incorrectKeys: 1, backspaces: 1 }
    expect(evaluateRun(l, base).passed).toBe(true)
    expect(evaluateRun(l, { ...base, accuracy: l.pass.minAccuracy - 1 }).passed).toBe(false)
    expect(evaluateRun(l, { ...base, wpm: l.pass.minWpm - 1 }).passed).toBe(false)
    expect(evaluateRun(l, { ...base, accuracy: null }).passed).toBe(false)
  })

  it('rhythm and correction lessons check those metrics', () => {
    const rhythm = LESSON_BY_ID['4.3']
    const run = { accuracy: 98, wpm: 40, keyConsistency: 30, correctKeys: 100, incorrectKeys: 0, backspaces: 0 }
    expect(evaluateRun(rhythm, run).passed).toBe(false)
    expect(evaluateRun(rhythm, { ...run, keyConsistency: 70 }).passed).toBe(true)
    const corr = LESSON_BY_ID['4.2']
    expect(evaluateRun(corr, { accuracy: 98, wpm: 40, correctKeys: 100, incorrectKeys: 0, backspaces: 20 }).passed).toBe(false)
  })

  it('unlocks sequentially and recommends the first unpassed lesson', () => {
    let p = computeProgress([])
    expect(p.nextLessonId).toBe('1.1')
    expect(p.byLesson['1.2'].unlocked).toBe(false)
    p = computeProgress([{ lessonId: '1.1', passed: false, wpm: 3, accuracy: 70, at: 1 }])
    expect(p.nextLessonId).toBe('1.1') // an attempt alone does not progress
    p = computeProgress([
      { lessonId: '1.1', passed: false, wpm: 3, accuracy: 70, at: 1 },
      { lessonId: '1.1', passed: true, wpm: 12, accuracy: 95, at: 2 },
    ])
    expect(p.nextLessonId).toBe('1.2')
    expect(p.byLesson['1.1']).toMatchObject({ attempts: 2, passed: true, bestWpm: 12, bestAccuracy: 95 })
    expect(p.byLesson['1.2'].unlocked).toBe(true)
    expect(p.byLesson['2.1'].unlocked).toBe(false)
  })

  it('a locked lesson passed as a test-out counts as passed', () => {
    const p = computeProgress([{ lessonId: '3.3', passed: true, wpm: 40, accuracy: 98, at: 5 }])
    expect(p.byLesson['3.3'].passed).toBe(true)
    expect(p.nextLessonId).toBe('1.1')
  })
})

describe('exercise generation', () => {
  it('lesson text only uses the lesson keys (for every layout)', () => {
    for (const layout of ['qwerty-us', 'dvorak', 'colemak', 'azerty-fr', 'qwertz-de']) {
      for (const l of LESSONS.filter((x) => x.source === 'keys' || x.source === 'digits')) {
        const allowed = new Set(charsForCodes(layout, l.keys))
        const words = generateLessonWords(l, { layout })
        expect(words.length, `${l.id}/${layout}`).toBeGreaterThanOrEqual(l.words - 6)
        for (const w of words) for (const c of w) expect(allowed.has(c), `${l.id}/${layout}: "${c}" in "${w}"`).toBe(true)
      }
    }
  })

  it('new keys are actually practised', () => {
    const l = LESSON_BY_ID['2.3']
    const text = generateLessonWords(l, { layout: 'qwerty-us' }).join('')
    expect(text).toMatch(/r/)
    expect(text).toMatch(/u/)
  })

  it('is deterministic per seed and varies across seeds', () => {
    const l = LESSON_BY_ID['2.4']
    expect(generateLessonWords(l, { seed: 'a' })).toEqual(generateLessonWords(l, { seed: 'a' }))
    expect(generateLessonWords(l, { seed: 'a' })).not.toEqual(generateLessonWords(l, { seed: 'b' }))
  })

  it('weak-key practice is dominated by the target letters', () => {
    const words = generatePracticeWords({ kind: 'keys', chars: ['q', 'z'] }, { seed: 's' })
    const hit = words.filter((w) => /[qz]/.test(w)).length
    expect(hit / words.length).toBeGreaterThan(0.8)
  })

  it('bigram practice contains the bigrams', () => {
    const words = generatePracticeWords({ kind: 'bigrams', grams: ['th', 'ou'] }, { seed: 's' })
    expect(words.filter((w) => /th|ou/.test(w)).length / words.length).toBeGreaterThan(0.8)
  })

  it('finger practice uses that finger\'s keys', () => {
    const codes = Object.keys(FINGER_OF_CODE).filter((c) => FINGER_OF_CODE[c] === 'lr')
    const words = generatePracticeWords({ kind: 'finger', fingerCodes: codes }, { seed: 's' })
    expect(words.filter((w) => /[wsx]/.test(w)).length / words.length).toBeGreaterThan(0.85)
  })

  it('numbers / punctuation / shift generators produce the right material', () => {
    expect(generatePracticeWords({ kind: 'numbers' }).join(' ')).toMatch(/\d/)
    expect(generatePracticeWords({ kind: 'punctuation' }, { count: 80 }).join(' ')).toMatch(/[.,;:?!]/)
    expect(generatePracticeWords({ kind: 'shift' }).every((w) => /^[A-Z]/.test(w))).toBe(true)
  })

  it('every practice kind returns usable words', () => {
    for (const kind of ['keys', 'bigrams', 'finger', 'accuracy', 'speed', 'rhythm', 'numbers', 'punctuation', 'shift', 'visual']) {
      const w = generatePracticeWords({ kind, chars: ['e'], grams: ['th'], fingerCodes: ['KeyA'] })
      expect(w.length, kind).toBeGreaterThanOrEqual(20)
      expect(w.every((x) => typeof x === 'string' && x.length > 0)).toBe(true)
    }
  })
})

describe('mistake analysis on simulated typists', () => {
  const profile = normalizeProfile({})
  const runs = (n, opts) =>
    Array.from({ length: n }, (_, i) => {
      const words = generateWords({ count: 70, seed: `an${i}${opts.tag ?? ''}` })
      const { engine } = simulate(words, { wpm: 45, timeLimitMs: 30000, seed: `s${i}`, supplier: (m) => generateWords({ count: m, seed: `x${i}` }), ...opts })
      return { engine, analysis: analyzeKeystrokes(engine.log, profile), summary: engine.summary() }
    })

  it('flags a key the typist often misses and attributes it to the right finger', () => {
    const sess = runs(5, { errorByChar: { e: 0.35 }, baseError: 0.02 })
    const agg = aggregateAnalyses(sess.map((s) => s.analysis))
    const w = detectWeaknesses(agg, profile)
    expect(w.enoughData).toBe(true)
    expect(w.keys[0].code).toBe('KeyE')
    expect(w.keys[0].finger).toBe('lm')
    // the E→R adjacent slip should show up as a confusion
    expect(w.confusions.some((c) => c.expected === 'KeyE' && c.typed === 'KeyR' && c.adjacent)).toBe(true)
  })

  it('does not invent weaknesses for a clean typist', () => {
    const sess = runs(5, { baseError: 0.01, jitter: 0.08 })
    const w = detectWeaknesses(aggregateAnalyses(sess.map((s) => s.analysis)), profile)
    expect(w.keys).toEqual([])
    expect(w.fingers).toEqual([])
  })

  it('refuses to conclude anything from too little data', () => {
    const sess = runs(1, { errorByChar: { e: 0.9 } })
    const agg = aggregateAnalyses([{ ...sess[0].analysis, keys: { KeyE: { n: 5, err: 5, ms: 0, k: 0 } } }])
    expect(detectWeaknesses(agg, profile).enoughData).toBe(false)
  })

  it('detects slow transitions between specific letters', () => {
    const pool = ['the', 'that', 'this', 'with', 'other', 'and', 'for', 'are', 'was', 'not', 'you', 'all', 'can', 'her', 'one']
    const sess = Array.from({ length: 6 }, (_, i) => {
      const words = generateWords({ count: 80, seed: `slow${i}`, pool })
      const { engine } = simulate(words, { wpm: 55, jitter: 0.05, slowPairs: { th: 3.2 }, timeLimitMs: 30000, seed: `s${i}`, supplier: (m) => generateWords({ count: m, seed: `x${i}`, pool }) })
      return analyzeKeystrokes(engine.log, profile)
    })
    const w = detectWeaknesses(aggregateAnalyses(sess), profile)
    const th = w.bigrams.find((b) => b.gram === 'th')
    expect(th).toBeTruthy()
    expect(th.slowRatio).toBeGreaterThan(1.5)
    // and a normal pair is not flagged
    expect(w.bigrams.some((b) => b.gram === 'an')).toBe(false)
  })

  it('wilson bound is conservative for small samples', () => {
    expect(wilsonLower(3, 10)).toBeLessThan(0.3)
    expect(wilsonLower(30, 100)).toBeGreaterThan(wilsonLower(3, 10))
    expect(wilsonLower(0, 0)).toBe(0)
  })

  it('adjacency is physical', () => {
    expect(areAdjacent('KeyE', 'KeyR')).toBe(true)
    expect(areAdjacent('KeyE', 'KeyD')).toBe(true)
    expect(areAdjacent('KeyE', 'KeyP')).toBe(false)
  })

  it('trend recognises improvement over time', () => {
    const bad = runs(3, { errorByChar: { e: 0.4 }, baseError: 0.02, tag: 'b' })
    const good = runs(3, { errorByChar: { e: 0.02 }, baseError: 0.02, tag: 'g' })
    const t = weaknessTrend([...bad, ...good].map((s) => s.analysis), ['KeyE'])
    expect(t.status).toBe('improving')
    expect(weaknessTrend([bad[0].analysis], ['KeyE'])).toBeNull()
  })

  it('reports rhythm statistics', () => {
    const steady = runs(1, { jitter: 0.05, tag: 'r1' })[0].analysis.rhythm
    const erratic = runs(1, { jitter: 0.9, tag: 'r2' })[0].analysis.rhythm
    expect(steady.enough).toBe(true)
    expect(steady.keyConsistency).toBeGreaterThan(erratic.keyConsistency)
  })
})

describe('recommendations', () => {
  const profile = normalizeProfile({})
  const mk = (n, opts) =>
    Array.from({ length: n }, (_, i) => {
      const words = generateWords({ count: 70, seed: `rc${i}${opts.tag ?? ''}` })
      const { engine } = simulate(words, { wpm: 45, timeLimitMs: 30000, seed: `q${i}`, supplier: (m) => generateWords({ count: m, seed: `y${i}` }), ...opts })
      const s = engine.summary()
      return { ...s, keystrokes: s.correctKeys + s.incorrectKeys, analysis: analyzeKeystrokes(engine.log, profile), created_at: i }
    })

  it('new users are pointed to lesson 1.1', () => {
    const { recs } = buildRecommendations({ sessions: [], profile, attempts: [] })
    expect(recs[0].action).toEqual({ type: 'lesson', lessonId: '1.1' })
  })

  it('recommends a problem-key drill with evidence for a specific weak key', () => {
    const sessions = mk(5, { errorByChar: { s: 0.4 }, baseError: 0.02 })
    const { recs } = buildRecommendations({ sessions, profile, attempts: [] })
    const r = recs.find((x) => x.id === 'weak-keys')
    expect(r).toBeTruthy()
    expect(r.title).toMatch(/S/)
    expect(r.action.spec.chars).toContain('s')
    expect(r.evidence[0]).toMatch(/errors over \d+ presses/)
  })

  it('suggests rhythm work for accurate but erratic typists, not accuracy work', () => {
    const sessions = mk(4, { jitter: 1.1, baseError: 0, wpm: 40, tag: 'er' })
    const { recs } = buildRecommendations({ sessions, profile, attempts: [] })
    expect(recs.some((r) => r.id === 'rhythm')).toBe(true)
    expect(recs.some((r) => r.id === 'accuracy')).toBe(false)
  })

  it('does not claim visual discipline without measured tracking', () => {
    const sessions = mk(3, { baseError: 0.01 }).map((s) => ({ ...s, tracking: { status: 'unavailable' } }))
    const { recs } = buildRecommendations({ sessions, profile, attempts: [] })
    expect(recs.some((r) => r.id === 'visual')).toBe(false)
    expect(recs.some((r) => r.id === 'enable-tracking')).toBe(true)
  })

  it('recommends eyes-up practice only when measured discipline is low', () => {
    const base = mk(3, { baseError: 0.01 })
    const low = base.map((s) => ({ ...s, tracking: { status: 'measured', discipline: 70, peeksPerMin: 6 } }))
    const high = base.map((s) => ({ ...s, tracking: { status: 'measured', discipline: 98, peeksPerMin: 0.2 } }))
    expect(buildRecommendations({ sessions: low, profile }).recs.some((r) => r.id === 'visual')).toBe(true)
    expect(buildRecommendations({ sessions: high, profile }).recs.some((r) => r.id === 'visual')).toBe(false)
  })
})
