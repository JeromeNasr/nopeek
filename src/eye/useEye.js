import { useEffect, useSyncExternalStore } from 'react'
import { eye } from './session.js'

/** Subscribe to the eye-tracking store. */
export function useEye() {
  return useSyncExternalStore(eye.subscribe, eye.getSnapshot, eye.getSnapshot)
}

/** Keep the camera running while this component is mounted (and tracking is enabled). */
export function useEyeTracking(active = true) {
  useEffect(() => {
    if (!active) return undefined
    return eye.acquire()
  }, [active])
  return useEye()
}
