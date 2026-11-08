// Deterministic text generation for tests: random common words with optional
// punctuation / numbers, quotes, code and custom text.

import { english } from '../data/english.js'
import { codeSnippets, quotes } from '../data/wordLists.js'
import { createRng } from './random.js'

export const TIME_OPTIONS = [15, 30, 60, 120]
export const WORD_OPTIONS = [10, 25, 50, 100]

const ENDERS = ['.', '.', '.', '?', '!']
const MID = [',', ',', ',', ';', ':']

/**
 * Generates `count` words. Same seed + options = same words.
 * punctuation: sentences with capitals, commas, full stops, quotes, brackets, hyphens.
 * numbers: ~1 in 6 tokens becomes a 1-4 digit number.
 */
export function generateWords({
  count = 50,
  seed = 'default',
  pool = english.slice(0, 1000),
  punctuation = false,
  numbers = false,
} = {}) {
  const rng = createRng(seed)
  const out = []
  let startOfSentence = true
  let sinceBreak = 0
  let prev = null
  for (let i = 0; i < count; i++) {
    let w
    if (numbers && rng.chance(0.17)) {
      const digits = 1 + rng.int(4)
      w = String(rng.int(10 ** digits))
    } else {
      do {
        w = rng.pick(pool)
      } while (w === prev && pool.length > 1)
    }
    prev = w
    if (punctuation) {
      if (startOfSentence && /^[a-z]/.test(w)) w = w[0].toUpperCase() + w.slice(1)
      startOfSentence = false
      sinceBreak++
      const r = rng()
      if (sinceBreak >= 4 && r < 0.14) {
        w += rng.pick(ENDERS)
        startOfSentence = true
        sinceBreak = 0
      } else if (sinceBreak >= 2 && r < 0.26) {
        w += rng.pick(MID)
      } else if (r < 0.31) {
        w = `"${w}"`
      } else if (r < 0.35) {
        w = `(${w})`
      } else if (r < 0.38 && i < count - 1) {
        w += '-' + rng.pick(pool)
      } else if (r < 0.41 && /^[a-z]+$/.test(w)) {
        w += "'s"
      }
    }
    out.push(w)
  }
  return out
}

/** Replace typographic characters that most keyboards cannot type. */
export function normalizeTypography(text) {
  return text
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[   ]/g, ' ')
}

/** Custom text -> words. Whitespace (incl. newlines) separates words. */
export function parseCustomText(text, { maxWords = 1000 } = {}) {
  const words = normalizeTypography(String(text ?? ''))
    .split(/\s+/)
    .filter(Boolean)
  return words.slice(0, maxWords)
}

export function quoteWords(seed) {
  const rng = createRng(seed)
  const words = []
  while (words.length < 40) words.push(...parseCustomText(rng.pick(quotes)))
  return words
}

export function codeWords(seed, count = 40) {
  const rng = createRng(seed)
  const words = []
  while (words.length < count) words.push(...parseCustomText(rng.pick(codeSnippets)))
  return words
}

/** Endless supplier for timed tests: returns a function that yields the next n words. */
export function makeSupplier(options, seedBase) {
  let batch = 0
  return (n) => generateWords({ ...options, count: n, seed: `${seedBase}:more:${batch++}` })
}
