import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

/** Current Supabase user (null when signed out or cloud not configured). */
export function useAuth() {
  const [state, setState] = useState({ user: null, loading: Boolean(supabase) })

  useEffect(() => {
    if (!supabase) return undefined
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setState({ user: data.session?.user ?? null, loading: false })
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ user: session?.user ?? null, loading: false })
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  return state
}
