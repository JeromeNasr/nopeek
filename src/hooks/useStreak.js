import { useEffect, useState } from 'react'
import { calculateStreak } from '../lib/streak'
import { supabase } from '../supabaseClient'

export const SESSION_SAVED_EVENT = 'nopeek:session-saved'

export default function useStreak() {
  const [streak, setStreak] = useState(0)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function refresh() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (cancelled) return

      if (!user) {
        setAuthenticated(false)
        setStreak(0)
        return
      }

      const { data, error } = await supabase
        .from('sessions')
        .select('created_at')
        .eq('user_id', user.id)

      if (cancelled) return

      setAuthenticated(true)
      if (!error) setStreak(calculateStreak(data ?? []))
    }

    refresh()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => refresh())

    window.addEventListener(SESSION_SAVED_EVENT, refresh)

    return () => {
      cancelled = true
      subscription.unsubscribe()
      window.removeEventListener(SESSION_SAVED_EVENT, refresh)
    }
  }, [])

  return { streak, authenticated }
}
