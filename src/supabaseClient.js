// Supabase is loaded on demand: a visitor who just wants to type never downloads it.
// It loads at startup only when this browser already holds a sign-in session.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** True when Supabase credentials are present. Without them the app runs local-only. */
export const isCloudConfigured = Boolean(supabaseUrl && supabaseAnonKey)

let clientPromise = null
const ready = new Set()

export function hasStoredSession() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) return true
    }
  } catch {
    /* storage unavailable */
  }
  return false
}

/** Resolves to the Supabase client, or null when cloud is not configured. */
export function getSupabase() {
  if (!isCloudConfigured) return Promise.resolve(null)
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) => {
    const client = createClient(supabaseUrl, supabaseAnonKey)
    for (const cb of ready) cb(client)
    ready.clear()
    return client
  })
  return clientPromise
}

/** Run `cb(client)` once the client exists (immediately if it already does). */
export function onClientReady(cb) {
  if (clientPromise) {
    let cancelled = false
    clientPromise.then((c) => { if (!cancelled) cb(c) })
    return () => { cancelled = true }
  }
  ready.add(cb)
  return () => ready.delete(cb)
}
