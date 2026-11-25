import { describe, expect, it } from 'vitest'
import { english } from '../src/data/english.js'
import { generateWords } from '../src/engine/textSources.js'

describe('word list shown to strangers', () => {
  it('contains only plain lowercase words', () => {
    for (const w of english) expect(w, w).toMatch(/^[a-z]+$/)
  })
  it('has no web-spam, adult or abbreviation leftovers', () => {
    const banned = ['phentermine', 'babes', 'lingerie', 'sexual', 'naked', 'interracial', 'teens', 'ringtones', 'casino', 'ebay', 'usa', 'nj', 'tx', 'pm', 'isbn', 'html', 'faq']
    const set = new Set(english)
    expect(banned.filter((w) => set.has(w))).toEqual([])
  })
  it('still has plenty of words for tests and lessons', () => {
    expect(english.length).toBeGreaterThan(2500)
    expect(new Set(generateWords({ count: 300, seed: 'x' })).size).toBeGreaterThan(150)
  })
})
