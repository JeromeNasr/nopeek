// Small deterministic PRNG so generated exercises are reproducible from a seed.

export function hashString(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32 */
export function createRng(seed) {
  let a = (typeof seed === 'string' ? hashString(seed) : seed >>> 0) || 1
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  next.int = (n) => Math.floor(next() * n)
  next.pick = (arr) => arr[Math.floor(next() * arr.length)]
  next.chance = (p) => next() < p
  return next
}
