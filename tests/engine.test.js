import { describe, expect, it } from 'vitest'
import { TypingEngine, MAX_EXTRA_CHARS } from '../src/engine/typingEngine.js'
import { consistencyFromCov, consistencyOf, wpmFromChars, accuracyPct } from '../src/engine/stats.js'
import { generateWords, parseCustomText, normalizeTypography } from '../src/engine/textSources.js'
import { createRng } from '../src/engine/random.js'
import { simulate } from './helpers/typist.js'

const type = (e, str, t0 = 0, gap = 100) => {
  let t = t0
  for (const ch of str) {
    e.insertChar(ch, { t, code: null })
    t += gap
  }
  return t
}

describe('stats', () => {
  it('wpm: 5 characters = 1 word', () => {
    expect(wpmFromChars(300, 60000)).toBe(60)
    expect(wpmFromChars(50, 10000)).toBe(60)
    expect(wpmFromChars(10, 0)).toBe(0)
  })
  it('accuracy is null with no keystrokes', () => {
    expect(accuracyPct(0, 0)).toBeNull()
    expect(accuracyPct(9, 1)).toBe(90)
  })
  it('consistency mapping: cov 0 => 100, grows worse monotonically', () => {
    expect(consistencyFromCov(0)).toBe(100)
    expect(consistencyFromCov(0.2)).toBeGreaterThan(consistencyFromCov(0.5))
    expect(consistencyFromCov(5)).toBeLessThan(1)
    expect(consistencyOf([100, 100, 100, 100])).toBe(100)
    expect(consistencyOf([1])).toBeNull()
  })
})

describe('character validation and word flow', () => {
  it('records correct and incorrect characters', () => {
    const e = new TypingEngine({ words: ['hello', 'world'] })
    type(e, 'hexlo')
    expect(e.correctKeys).toBe(4)
    expect(e.incorrectKeys).toBe(1)
    expect(e.currentTyped).toBe('hexlo')
  })

  it('space commits the word and records correctness', () => {
    const e = new TypingEngine({ words: ['hello', 'world'] })
    type(e, 'hello world')
    expect(e.finished).toBe(true) // last word fully typed
    expect(e.committed).toEqual([true])
    expect(e.summary().wordsCorrect).toBe(1)
  })

  it('ignores leading and repeated spaces', () => {
    const e = new TypingEngine({ words: ['a', 'b'] })
    expect(e.insertChar(' ', { t: 0 })).toBe(false)
    expect(e.started).toBe(false)
    type(e, 'a ', 10)
    expect(e.insertChar(' ', { t: 500 })).toBe(false)
    expect(e.wi).toBe(1)
  })

  it('pressing space early marks missed characters and an incorrect keystroke', () => {
    const e = new TypingEngine({ words: ['hello', 'world'] })
    type(e, 'he ')
    expect(e.committed).toEqual([false])
    expect(e.incorrectKeys).toBe(1) // the premature space
    expect(e.charCounts().missed).toBe(3)
  })

  it('extra characters are capped', () => {
    const e = new TypingEngine({ words: ['hi', 'there'] })
    type(e, 'h'.repeat(100))
    expect(e.currentTyped.length).toBe(2 + MAX_EXTRA_CHARS)
    expect(e.charCounts().extra).toBe(MAX_EXTRA_CHARS)
  })

  it('handles punctuation, numbers and capitals exactly', () => {
    const words = ['Hello,', '"quoted"', '3.14', "it's", '(ok)']
    const e = new TypingEngine({ words })
    type(e, words.join(' '))
    expect(e.finished).toBe(true)
    expect(e.incorrectKeys).toBe(0)
    expect(e.summary().accuracy).toBe(100)
  })

  it('is case sensitive', () => {
    const e = new TypingEngine({ words: ['Hello'] })
    type(e, 'hello')
    expect(e.incorrectKeys).toBe(1)
  })
})

describe('backspace', () => {
  it('removes the last char and counts the keystrokes honestly', () => {
    const e = new TypingEngine({ words: ['hello', 'world'] })
    type(e, 'hex')
    e.backspace({ t: 500 })
    expect(e.currentTyped).toBe('he')
    // the mistake still counts against accuracy even though it was corrected
    expect(e.incorrectKeys).toBe(1)
    expect(e.corrections).toBe(1)
    expect(e.summary(600).accuracy).toBeCloseTo(66.67, 1)
  })

  it('can step back into an incorrect previous word only', () => {
    const e = new TypingEngine({ words: ['cat', 'dog', 'owl'] })
    type(e, 'cxt ')
    expect(e.wi).toBe(1)
    expect(e.backspace({ t: 1000 })).toBe(true)
    expect(e.wi).toBe(0)
    expect(e.currentTyped).toBe('cxt')

    type(e, '', 0)
    e.backspace({ t: 1100 }); e.backspace({ t: 1200 }); e.backspace({ t: 1300 })
    type(e, 'cat ', 2000)
    expect(e.wi).toBe(1)
    expect(e.backspace({ t: 3000 })).toBe(false) // previous word is correct: locked
    expect(e.wi).toBe(1)
  })

  it('ctrl+backspace deletes the whole word', () => {
    const e = new TypingEngine({ words: ['hello', 'world'] })
    type(e, 'helxo')
    e.backspace({ t: 900, word: true })
    expect(e.currentTyped).toBe('')
  })

  it('does nothing before the test starts', () => {
    const e = new TypingEngine({ words: ['a'] })
    expect(e.backspace({ t: 0 })).toBe(false)
  })
})

describe('timing and completion', () => {
  it('timer starts at the first keystroke, not at construction', () => {
    const e = new TypingEngine({ words: ['hello'], timeLimitMs: 30000 })
    expect(e.started).toBe(false)
    e.insertChar('h', { t: 5000 })
    expect(e.startedAt).toBe(5000)
  })

  it('timed test ends exactly at the limit and ignores later keys', () => {
    const e = new TypingEngine({ words: ['alpha', 'beta', 'gamma', 'delta'], timeLimitMs: 2000 })
    e.insertChar('a', { t: 1000 })
    e.insertChar('l', { t: 1500 })
    expect(e.tick(2900)).toBe(false)
    expect(e.tick(3000)).toBe(true)
    expect(e.finished).toBe(true)
    expect(e.finishReason).toBe('time')
    expect(e.insertChar('p', { t: 3100 })).toBe(false)
    expect(e.summary().durationMs).toBe(2000)
  })

  it('a keystroke arriving after the deadline finishes the test instead of counting', () => {
    const e = new TypingEngine({ words: ['alpha', 'beta'], timeLimitMs: 1000 })
    e.insertChar('a', { t: 0 })
    expect(e.insertChar('l', { t: 1200 })).toBe(false)
    expect(e.finished).toBe(true)
    expect(e.correctKeys).toBe(1)
  })

  it('word-count test completes when the final word is typed, without trailing space', () => {
    const e = new TypingEngine({ words: ['one', 'two'], mode: 'words' })
    type(e, 'one tw')
    expect(e.finished).toBe(false)
    type(e, 'o', 700)
    expect(e.finished).toBe(true)
    expect(e.finishReason).toBe('completed')
  })

  it('supplies more words for endless timed tests', () => {
    const supplier = (n) => Array.from({ length: n }, (_, i) => `w${i}`)
    const e = new TypingEngine({ words: ['a', 'b', 'c', 'd'], timeLimitMs: 60000, supplier })
    type(e, 'a b c ')
    expect(e.words.length).toBeGreaterThan(4)
  })

  it('manual finish records the reason', () => {
    const e = new TypingEngine({ words: ['abc', 'def'] })
    type(e, 'ab')
    e.finishNow(500)
    expect(e.finishReason).toBe('manual')
  })
})

describe('WPM, raw WPM and accuracy against a simulated typist', () => {
  it('a perfect 60 WPM typist measures ~60 WPM, 100% accuracy, high consistency', () => {
    const words = generateWords({ count: 60, seed: 'a' })
    const { engine } = simulate(words, { wpm: 60, jitter: 0.05, timeLimitMs: 30000, supplier: (n) => generateWords({ count: n, seed: 'more' }) })
    const s = engine.summary()
    expect(s.durationMs).toBe(30000)
    expect(s.wpm).toBeGreaterThan(55)
    expect(s.wpm).toBeLessThan(65)
    expect(s.accuracy).toBe(100)
    expect(s.consistency).toBeGreaterThan(85)
    expect(s.rawWpm).toBeGreaterThanOrEqual(s.wpm)
  })

  it('errors lower accuracy and WPM relative to raw, and increase corrections', () => {
    const words = generateWords({ count: 80, seed: 'b' })
    const { engine } = simulate(words, { wpm: 60, baseError: 0.1, timeLimitMs: 30000, supplier: (n) => generateWords({ count: n, seed: 'more2' }) })
    const s = engine.summary()
    expect(s.accuracy).toBeLessThan(95)
    expect(s.accuracy).toBeGreaterThan(80)
    expect(s.corrections).toBeGreaterThan(5)
    expect(s.backspaces).toBeGreaterThan(5)
  })

  it('erratic timing yields lower consistency than steady timing', () => {
    const words = generateWords({ count: 70, seed: 'c' })
    const steady = simulate(words, { wpm: 60, jitter: 0.05, timeLimitMs: 30000, seed: 'x', supplier: (n) => generateWords({ count: n, seed: 'm' }) }).engine.summary()
    const erratic = simulate(words, { wpm: 60, jitter: 0.9, timeLimitMs: 30000, seed: 'x', supplier: (n) => generateWords({ count: n, seed: 'm' }) }).engine.summary()
    expect(erratic.keyConsistency).toBeLessThan(steady.keyConsistency)
  })

  it('live() never reports absurd WPM in the first second', () => {
    const e = new TypingEngine({ words: ['hello', 'world'] })
    e.insertChar('h', { t: 0 })
    e.insertChar('e', { t: 10 })
    expect(e.live(20).wpm).toBeLessThan(40)
  })
})

describe('text generation', () => {
  it('is deterministic for the same seed and differs between seeds', () => {
    const a = generateWords({ count: 40, seed: 's1', punctuation: true, numbers: true })
    const b = generateWords({ count: 40, seed: 's1', punctuation: true, numbers: true })
    const c = generateWords({ count: 40, seed: 's2', punctuation: true, numbers: true })
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })
  it('punctuation and numbers options actually add them', () => {
    const plain = generateWords({ count: 120, seed: 'p' }).join(' ')
    expect(plain).toMatch(/^[a-z ]+$/)
    const rich = generateWords({ count: 120, seed: 'p', punctuation: true, numbers: true }).join(' ')
    expect(rich).toMatch(/[0-9]/)
    expect(rich).toMatch(/[.,;:?!"()]/)
    expect(rich).toMatch(/[A-Z]/)
  })
  it('custom text is normalised to typeable characters', () => {
    expect(normalizeTypography('“Hi” – it’s…')).toBe('"Hi" - it\'s...')
    expect(parseCustomText('  one\ntwo   three ')).toEqual(['one', 'two', 'three'])
    expect(parseCustomText('', {})).toEqual([])
  })
  it('rng is reproducible', () => {
    const a = createRng('x'), b = createRng('x')
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
})
