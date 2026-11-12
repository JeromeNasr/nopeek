import { useEffect, useState } from 'react'
import { getSupabase, hasStoredSession, isCloudConfigured, onClientReady } from '../supabaseClient'

/** Current Supabase user (null when signed out or cloud not configured). */
export function useAuth() {
  const [state, setState] = useState(() => ({ user: null, loading: isCloudConfigured && hasStoredSession() }))

  useEffect(() => {
    if (!isCloudConfigured) return undefined
    let cancelled = false
    let unsubscribe = null
    const off = onClientReady((supabase) => {
      if (cancelled) return
      supabase.auth.getSession().then(({ data }) => {
        if (!cancelled) setState({ user: data.session?.user ?? null, loading: false })
      })
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        setState({ user: session?.user ?? null, loading: false })
      })
      unsubscribe = () => sub.subscription.unsubscribe()
    })
    if (hasStoredSession()) getSupabase()
    return () => {
      cancelled = true
      off()
      unsubscribe?.()
    }
  }, [])

  return state
}
