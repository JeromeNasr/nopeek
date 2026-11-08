// Safe wrappers around localStorage. Storage can be unavailable (private mode,
// blocked, quota) so every access is guarded and the app keeps working.

const PREFIX = 'nopeek.'

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
