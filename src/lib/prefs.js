// User preferences for the typing experience (device-local, external store).
import { useSyncExternalStore } from 'react'
import { readJSON, writeJSON } from '../data/localStore.js'

export const THEMES = { paper: 'Paper', dusk: 'Dusk', moss: 'Moss' }
const LEGACY_THEMES = { ink: 'dusk', midnight: 'dusk' }

export const DEFAULT_PREFS = {
  theme: 'dusk',
  sound: 'off', // off | soft | mechanical
  caret: 'line', // line | block | underline
  ghost: 'off', // off | average | best
  guide: 'smart', // smart (only when you hesitate) | always
  focusMode: true,
  fontScale: 1,
}

const stored = readJSON('prefs.v2') ?? {}
// first visit: follow the system's light/dark setting
const systemTheme = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'paper' : 'dusk'
let prefs = { ...DEFAULT_PREFS, theme: systemTheme, ...stored }
prefs.theme = LEGACY_THEMES[prefs.theme] ?? prefs.theme
if (!THEMES[prefs.theme]) prefs.theme = systemTheme
const listeners = new Set()

function apply() {
  if (typeof document === 'undefined') return
  const r = document.documentElement
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
