// User preferences for the typing experience (device-local, external store).
import { useSyncExternalStore } from 'react'
import { readJSON, writeJSON } from '../data/localStore.js'

export const THEMES = { ink: 'Ink', midnight: 'Midnight', paper: 'Paper' }
export const ACCENTS = {
  amber: { label: 'Amber', color: '#e2a03f' },
  sage: { label: 'Sage', color: '#8fbf7f' },
  coral: { label: 'Coral', color: '#e8776a' },
  sky: { label: 'Sky', color: '#6fa8dc' },
  lilac: { label: 'Lilac', color: '#b19cd9' },
}

export const DEFAULT_PREFS = {
  theme: 'ink',
  accent: 'amber',
  sound: 'off', // off | soft | mechanical
  caret: 'line', // line | block | underline
  ghost: 'off', // off | average | best
  guide: 'smart', // smart (only when you hesitate) | always
  focusMode: true,
  fontScale: 1,
}

let prefs = { ...DEFAULT_PREFS, ...(readJSON('prefs.v2') ?? {}) }
if (!ACCENTS[prefs.accent]) prefs.accent = DEFAULT_PREFS.accent
if (!THEMES[prefs.theme]) prefs.theme = DEFAULT_PREFS.theme
const listeners = new Set()

function apply() {
  if (typeof document === 'undefined') return
  const r = document.documentElement
  // the paper theme needs a slightly deeper accent to keep contrast on a light page
  const c = ACCENTS[prefs.accent].color
  r.style.setProperty('--accent', prefs.theme === 'paper' ? `color-mix(in oklab, ${c} 72%, #000)` : c)
  r.style.setProperty('--type-scale', String(prefs.fontScale))
  r.dataset.caret = prefs.caret
  r.dataset.theme = prefs.theme
}
apply()

export function getPrefs() {
  return prefs
}

export function setPrefs(patch) {
  prefs = { ...prefs, ...patch }
  writeJSON('prefs.v2', prefs)
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
