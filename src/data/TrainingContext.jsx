import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeProgress } from '../training/lessons.js'
import { buildRecommendations } from '../training/recommender.js'
import { claimLocalSessions, loadSessions, pullKeyboardProfile, readKeyboardProfile, saveKeyboardProfile } from './repo.js'
import { TrainingCtx } from './trainingContext.js'
import { useAuth } from './useAuth.js'

export function TrainingProvider({ children }) {
  const { user, loading: authLoading } = useAuth()
  const [sessions, setSessions] = useState([])
  const [meta, setMeta] = useState({ cloudError: null, pendingLocal: 0, signedIn: false })
  const [loading, setLoading] = useState(true)
  const [profile, setProfileState] = useState(readKeyboardProfile)
  const loadId = useRef(0)

  const refresh = useCallback(async () => {
    const id = ++loadId.current
    const res = await loadSessions()
    if (id !== loadId.current) return
    setSessions(res.sessions)
    setMeta({ cloudError: res.cloudError, pendingLocal: res.pendingLocal, signedIn: res.signedIn })
    setLoading(false)
  }, [])

  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    ;(async () => {
      if (user) {
        const remote = await pullKeyboardProfile()
        if (remote && !cancelled) setProfileState(remote)
      }
      if (!cancelled) await refresh()
    })()
    return () => {
      cancelled = true
    }
  }, [user, authLoading, refresh])

  const setProfile = useCallback(async (next) => {
    const res = await saveKeyboardProfile(next)
    setProfileState(res.profile)
    return res
  }, [])

  const claim = useCallback(async () => {
    const res = await claimLocalSessions()
    await refresh()
    return res
  }, [refresh])

  const attempts = useMemo(
    () => sessions.filter((s) => s.lesson_id).map((s) => ({ lessonId: s.lesson_id, passed: !!s.passed, wpm: s.wpm, accuracy: s.accuracy, at: s.created_at })),
    [sessions],
  )
  const progress = useMemo(() => computeProgress(attempts), [attempts])
  const rec = useMemo(() => buildRecommendations({ sessions, profile, attempts }), [sessions, profile, attempts])

  const value = useMemo(
    () => ({ sessions, loading, profile, setProfile, refresh, attempts, progress, rec, user, claim, ...meta }),
    [sessions, loading, profile, setProfile, refresh, attempts, progress, rec, user, claim, meta],
  )
  return <TrainingCtx.Provider value={value}>{children}</TrainingCtx.Provider>
}
