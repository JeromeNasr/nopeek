// User preferences for the typing experience (device-local, external store).
import { useSyncExternalStore } from 'react'
import { readJSON, writeJSON } from '../data/localStore.js'

export const ACCENTS = {
  mint: { label: 'Mint', a: '#34e3b0', b: '#22d3ee' },
  violet: { label: 'Violet', a: '#a78bfa', b: '#f472b6' },
  amber: { label: 'Amber', a: '#fbbf24', b: '#fb7185' },
  sky: { label: 'Sky', a: '#38bdf8', b: '#818cf8' },
}

export const DEFAULT_PREFS = {
  accent: 'mint',
  sound: 'off', // off | soft | mechanical
  caret: 'line', // line | block | underline
  ghost: 'average', // off | average | best
  guide: 'smart', // off | smart (only when you hesitate) | always
  focusMode: true,
  fontScale: 1,
}

let prefs = { ...DEFAULT_PREFS, ...(readJSON('prefs.v1') ?? {}) }
const listeners = new Set()

function apply() {
  if (typeof document === 'undefined') return
  const acc = ACCENTS[prefs.accent] ?? ACCENTS.mint
  const r = document.documentElement
  r.style.setProperty('--accent', acc.a)
  r.style.setProperty('--accent-2', acc.b)
  r.style.setProperty('--type-scale', String(prefs.fontScale))
  r.dataset.caret = prefs.caret
}
apply()

export function getPrefs() {
  return prefs
}

export function setPrefs(patch) {
  prefs = { ...prefs, ...patch }
  writeJSON('prefs.v1', prefs)
  apply()
  for (const l of listeners) l()
}

const subscribe = (cb) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function usePrefs() {
  return useSyncExternalStore(subscribe, getPrefs, getPrefs)
}
