// Deterministic exercise generation: structured lessons and weakness-targeted
// practice. Same inputs (including seed) always produce the same words.

import { english } from '../data/english.js'
import { codeSnippets } from '../data/wordLists.js'
import { emails, extraCode, prose, technicalWords } from '../data/corpus.js'
import { createRng } from '../engine/random.js'
import { generateWords, parseCustomText } from '../engine/textSources.js'
import { LAYOUTS, charToKey, codeToChar, fingerOfCode, handOfFinger, reverseMap } from './keyboard.js'

const COMMON = english.slice(0, 200)
const ALPHA = /^[a-z]+$/

/** Lower-case printable characters produced by the given physical keys on a layout. */
export function charsForCodes(layoutId, codes) {
  const out = []
  for (const code of codes) {
    const c = codeToChar(layoutId, code, false)
    if (c) out.push(c)
  }
  return out
}

/** Words from the corpus whose letters are all within `chars`. */
export function wordsUsing(chars, { minLen = 2, maxLen = 12, pool = english } = {}) {
  const set = chars instanceof Set ? chars : new Set(chars)
  return pool.filter((w) => w.length >= minLen && w.length <= maxLen && [...w].every((c) => set.has(c)))
}

function handOf(layoutId, ch) {
  const key = charToKey(layoutId, ch)
  return key ? handOfFinger(fingerOfCode(key.code)) : null
}

/** Pseudo-word from allowed characters, favouring focus characters and hand alternation. */
function pseudoWord(rng, layoutId, chars, focus, minLen, maxLen) {
  const len = minLen + rng.int(Math.max(1, maxLen - minLen + 1))
  const bag = []
  for (const c of chars) bag.push(c)
  for (const c of focus) bag.push(c, c, c)
  let w = ''
  let lastHand = null
  for (let i = 0; i < len; i++) {
    let c
    for (let tries = 0; tries < 6; tries++) {
      c = rng.pick(bag)
      if (w.length >= 2 && w[w.length - 1] === c && w[w.length - 2] === c) continue
      if (i > 0 && handOf(layoutId, c) === lastHand && rng.chance(0.35)) continue
      break
    }
    w += c
    lastHand = handOf(layoutId, c)
  }
  return w
}

function takeUnique(rng, make, count, recent = 6) {
  const out = []
  const guard = count * 30
  for (let i = 0; i < guard && out.length < count; i++) {
    const w = make()
    if (!w || out.slice(-recent).includes(w)) continue
    out.push(w)
  }
  return out
}

function corpusWords(rng, kind, count) {
  const wordsOf = (texts) => texts.flatMap((t) => parseCustomText(t))
  switch (kind) {
    case 'prose': {
      const p = rng.pick(prose)
      let w = parseCustomText(p)
      while (w.length < count) w = w.concat(parseCustomText(rng.pick(prose)))
      return w.slice(0, count)
    }
    case 'email': {
      let w = parseCustomText(rng.pick(emails))
      while (w.length < count) w = w.concat(parseCustomText(rng.pick(emails)))
      return w.slice(0, count)
    }
    case 'code': {
      const all = [...codeSnippets, ...extraCode]
      let w = []
      while (w.length < count) w = w.concat(wordsOf([rng.pick(all)]))
      return w.slice(0, count)
    }
    case 'technical': {
      return takeUnique(rng, () => (rng.chance(0.55) ? rng.pick(technicalWords) : rng.pick(english.slice(0, 600))), count)
    }
    case 'capitalized': {
      return takeUnique(rng, () => {
        const w = rng.pick(english.slice(0, 900))
        return rng.chance(0.5) ? w[0].toUpperCase() + w.slice(1) : w
      }, count)
    }
    case 'punctuated':
      return generateWords({ count, seed: `punct:${rng.int(1e9)}`, pool: english.slice(0, 600), punctuation: true })
    case 'common':
    default:
      return takeUnique(rng, () => rng.pick(COMMON), count)
  }
}

/**
 * Words for a structured lesson.
 * @returns {string[]}
 */
export function generateLessonWords(lesson, { layout = 'qwerty-us', seed = lesson.id, count } = {}) {
  const rng = createRng(`${seed}:${lesson.id}:${layout}`)
  const n = count ?? lesson.words ?? 40
  const chars = charsForCodes(layout, lesson.keys ?? [])
  const focus = charsForCodes(layout, lesson.focus ?? [])

  switch (lesson.source) {
    case 'keys': {
      const set = new Set(chars)
      const [minLen, maxLen] = lesson.wordLen ?? [3, 6]
      const real = wordsUsing(set, { minLen: Math.max(2, minLen - 1), maxLen: maxLen + 2 })
      const focusReal = focus.length ? real.filter((w) => focus.some((f) => w.includes(f))) : real
      return takeUnique(rng, () => {
        if (lesson.guided || real.length < 12) return pseudoWord(rng, layout, chars, focus, minLen, maxLen)
        if (focusReal.length >= 6 && rng.chance(0.7)) return rng.pick(focusReal)
        if (lesson.preferReal || rng.chance(0.65)) return rng.pick(real)
        return pseudoWord(rng, layout, chars, focus, minLen, maxLen)
      }, n)
    }
    case 'ngrams': {
      const grams = lesson.ngrams.filter((g) => [...g].every((c) => chars.includes(c)))
      return takeUnique(rng, () => {
        const g = rng.pick(grams)
        const real = english.slice(0, 1500).filter((w) => w.includes(g) && w.length <= 9)
        return real.length && rng.chance(0.6) ? rng.pick(real) : g + g + (rng.chance(0.4) ? g : '')
      }, n)
    }
    case 'digits': {
      return takeUnique(rng, () => {
        const len = 2 + rng.int(4)
        let s = ''
        for (let i = 0; i < len; i++) s += charsForCodes(layout, [rng.pick(lesson.keys)])[0] ?? ''
        return s
      }, n)
    }
    case 'corpus':
    default:
      return corpusWords(rng, lesson.corpus ?? 'common', n)
  }
}

// ---- targeted practice -----------------------------------------------------

/**
 * Practice spec (produced by the recommender):
 *  { kind: 'keys', chars: ['e','r'] }
 *  { kind: 'bigrams', grams: ['th','er'] }
 *  { kind: 'finger', fingerCodes: [...] }
 *  { kind: 'accuracy' | 'speed' | 'rhythm' | 'numbers' | 'punctuation' | 'shift' | 'visual' }
 */
export function generatePracticeWords(spec, { layout = 'qwerty-us', seed = 'practice', count = 40 } = {}) {
  const rng = createRng(`${seed}:${spec.kind}:${layout}`)
  const pool = english.slice(0, 2500)

  const scoreBy = (matcher) => {
    const scored = pool.map((w) => ({ w, s: matcher(w) })).filter((x) => x.s > 0)
    scored.sort((a, b) => b.s - a.s || (a.w < b.w ? -1 : 1))
    return scored
  }
  const pickFromScored = (scored, n) => {
    const top = scored.slice(0, Math.max(n * 2, 30))
    return top.length ? takeUnique(rng, () => rng.pick(top).w, n) : []
  }

  switch (spec.kind) {
    case 'keys': {
      const chars = new Set(spec.chars)
      const scored = scoreBy((w) => {
        let hits = 0
        for (const c of w) if (chars.has(c)) hits++
        return (hits / w.length) * Math.min(3, hits) * (w.length >= 3 ? 1 : 0.5)
      })
      const words = pickFromScored(scored, count)
      if (words.length >= 10) return words
      const all = Object.keys(LAYOUTS[layout].map).length ? [...chars] : []
      return takeUnique(rng, () => pseudoWord(rng, layout, all, all, 3, 6), count)
    }
    case 'bigrams': {
      const grams = spec.grams ?? []
      const scored = scoreBy((w) => grams.reduce((s, g) => s + (w.includes(g) ? 1 : 0), 0) - (w.length > 9 ? 0.5 : 0))
      const words = pickFromScored(scored, count)
      if (words.length >= 10) {
        // interleave a short drill of the bigram itself
        return words.map((w, i) => (i % 5 === 4 && grams.length ? grams[i % grams.length].repeat(2) : w))
      }
      return takeUnique(rng, () => (grams.length ? rng.pick(grams).repeat(2 + rng.int(2)) : null), count)
    }
    case 'finger': {
      const chars = new Set(charsForCodes(layout, spec.fingerCodes ?? []))
      const scored = scoreBy((w) => {
        let hits = 0
        for (const c of w) if (chars.has(c)) hits++
        return hits >= 1 ? hits / w.length + 0.1 : 0
      })
      const words = pickFromScored(scored, count)
      return words.length >= 10 ? words : takeUnique(rng, () => pseudoWord(rng, layout, [...chars], [...chars], 3, 5), count)
    }
    case 'accuracy':
      // common, medium-length words: slow, careful practice material
      return takeUnique(rng, () => rng.pick(english.slice(0, 500).filter((w) => w.length >= 4)), count)
    case 'speed':
      return takeUnique(rng, () => rng.pick(english.slice(0, 200)), count)
    case 'rhythm': {
      // uniform word length and hand alternation encourage an even beat
      const alt = english.slice(0, 1500).filter((w) => w.length === 4 || w.length === 5)
      return takeUnique(rng, () => rng.pick(alt), count)
    }
    case 'numbers':
      return generateWords({ count, seed: `${seed}:num`, pool: english.slice(0, 300), numbers: true }).map((w, i) => (i % 3 === 0 ? String(rng.int(10000)) : w))
    case 'punctuation':
      return generateWords({ count, seed: `${seed}:p`, pool: english.slice(0, 500), punctuation: true, numbers: false })
    case 'shift':
      return takeUnique(rng, () => {
        const w = rng.pick(english.slice(0, 1000))
        return w[0].toUpperCase() + w.slice(1) + (rng.chance(0.3) ? rng.pick([',', '.', '?']) : '')
      }, count)
    case 'visual':
      // familiar words, so the challenge is attention rather than difficulty
      return takeUnique(rng, () => rng.pick(english.slice(0, 400)), count)
    default:
      return takeUnique(rng, () => rng.pick(COMMON), count)
  }
}

export { reverseMap, ALPHA }
