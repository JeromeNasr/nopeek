// A virtual typist: feeds the engine realistic, timed keystrokes.
import { TypingEngine } from '../../src/engine/typingEngine.js'
import { createRng } from '../../src/engine/random.js'
import { charToKey } from '../../src/training/keyboard.js'

/**
 * @param {string[]} words
 * @param {object} o
 * @param {number} o.wpm            target speed (sets mean inter-key gap)
 * @param {number} o.jitter         0..1 relative timing noise
 * @param {Record<string, number>} o.errorByChar  per-character error probability
 * @param {number} o.baseError
 * @param {string} o.layout
 */
export function simulate(words, { wpm = 60, jitter = 0.15, errorByChar = {}, baseError = 0, layout = 'qwerty-us', seed = 'sim', timeLimitMs = null, fixedLength, slowPairs = {}, supplier = null } = {}) {
  const rng = createRng(seed)
  const engine = new TypingEngine({ words, mode: timeLimitMs ? 'time' : 'words', timeLimitMs, fixedLength, supplier })
  const gap = 60000 / (wpm * 5)
  let t = 1000
  const typeKey = (ch, code) => {
    engine.insertChar(ch, { t, code })
  }
  const neighbour = { a: 's', s: 'a', d: 'f', f: 'd', e: 'r', r: 'e', i: 'o', o: 'i', k: 'l', l: 'k', t: 'y', n: 'm' }
  let prev = ' '
  outer: for (let wi = 0; wi < words.length * 3 && !engine.finished; wi++) {
    const target = engine.words[engine.wi]
    if (target == null) break
    for (const ch of target) {
      if (engine.finished) break outer
      t += gap * (1 + (rng() - 0.5) * 2 * jitter) * (slowPairs[prev + ch] ?? 1)
      const p = errorByChar[ch] ?? baseError
      let typed = ch
      if (rng() < p) typed = neighbour[ch] ?? (ch === 'z' ? 'x' : 'z')
      const key = charToKey(layout, typed)
      typeKey(typed, key?.code ?? null)
      if (typed !== ch) {
        // notice and correct
        t += gap * 1.5
        engine.backspace({ t })
        t += gap
        const ck = charToKey(layout, ch)
        typeKey(ch, ck?.code ?? null)
      }
      prev = ch
    }
    t += gap
    typeKey(' ', 'Space')
    prev = ' '
    if (timeLimitMs && t - 1000 >= timeLimitMs + 5000) break
  }
  if (timeLimitMs) engine.tick(t + 10)
  return { engine, endT: t }
}
