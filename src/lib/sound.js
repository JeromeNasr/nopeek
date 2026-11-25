// Tiny synthesised key sounds (Web Audio). No audio files; created lazily on the
// first key press so nothing loads or plays unless sound is switched on.
let ctx = null
let noise = null

function ensure() {
  if (ctx) return ctx
  const AC = window.AudioContext ?? window.webkitAudioContext
  if (!AC) return null
  ctx = new AC()
  const len = Math.floor(ctx.sampleRate * 0.05)
  noise = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = noise.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2
  return ctx
}

function burst({ freq, q, gain, dur }) {
  const c = ensure()
  if (!c) return
  if (c.state === 'suspended') c.resume()
  const src = c.createBufferSource()
  src.buffer = noise
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = freq
  f.Q.value = q
  const g = c.createGain()
  g.gain.setValueAtTime(gain, c.currentTime)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur)
  src.connect(f).connect(g).connect(c.destination)
  src.start()
}

function tone(freq, gain, dur) {
  const c = ensure()
  if (!c) return
  if (c.state === 'suspended') c.resume()
  const o = c.createOscillator()
  const g = c.createGain()
  o.frequency.value = freq
  g.gain.setValueAtTime(gain, c.currentTime)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur)
  o.connect(g).connect(c.destination)
  o.start()
  o.stop(c.currentTime + dur)
}

export function playKey(style, ok = true) {
  if (style === 'off') return
  if (!ok) return tone(150, 0.06, 0.09)
  if (style === 'mechanical') burst({ freq: 2400 + Math.random() * 500, q: 1.2, gain: 0.5, dur: 0.045 })
  else burst({ freq: 1100 + Math.random() * 250, q: 0.8, gain: 0.22, dur: 0.035 })
}

export function playTick(accent = false) {
  tone(accent ? 1320 : 880, 0.05, 0.04)
}

function note(freq, at, dur, gain) {
  const c = ensure()
  if (!c) return
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = 'sine'
  o.frequency.value = freq
  const t0 = c.currentTime + at
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g).connect(c.destination)
  o.start(t0)
  o.stop(t0 + dur + 0.02)
}

/** Call from a click/keypress so later cues are allowed to play. */
export function unlockAudio() {
  const c = ensure()
  if (c && c.state === 'suspended') c.resume()
}

/**
 * Spoken-free cues for eyes-off-screen moments: a falling pair means "look down now",
 * a rising pair "look back up", a short chime "done". Always plays (independent of key sounds).
 */
export function playCue(kind) {
  const c = ensure()
  if (!c) return
  if (c.state === 'suspended') c.resume()
  if (kind === 'down') {
    note(784, 0, 0.16, 0.16)
    note(523, 0.15, 0.22, 0.16)
  } else if (kind === 'up') {
    note(523, 0, 0.16, 0.16)
    note(784, 0.15, 0.22, 0.16)
  } else {
    note(659, 0, 0.12, 0.12)
    note(784, 0.09, 0.12, 0.12)
    note(1047, 0.18, 0.25, 0.12)
  }
}
