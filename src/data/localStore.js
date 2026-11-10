// Safe wrappers around localStorage. Storage can be unavailable (private mode,
// blocked, quota) so every access is guarded and the app keeps working.

const PREFIX = 'touchtype.'
const OLD_PREFIX = 'nopeek.' // the app's previous name; data is carried over once

try {
  if (!localStorage.getItem(PREFIX + 'migrated')) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(OLD_PREFIX)) {
        const nk = PREFIX + k.slice(OLD_PREFIX.length)
        if (localStorage.getItem(nk) == null) localStorage.setItem(nk, localStorage.getItem(k))
      }
    }
    localStorage.setItem(PREFIX + 'migrated', '1')
  }
} catch {
  /* storage unavailable */
}

export function readJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw == null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function writeJSON(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function removeKey(key) {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    /* ignore */
  }
}
