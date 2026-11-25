import { useEffect, useSyncExternalStore } from 'react'
import { eye } from './session.js'

/** Subscribe to the whole eye-tracking store (re-renders on every update). */
export function useEye() {
  return useSyncExternalStore(eye.subscribe, eye.getSnapshot, eye.getSnapshot)
}

/**
 * Subscribe to one derived value. The component re-renders only when that value changes,
 * so the typing screen is not re-rendered by camera frames. `select` must return a
 * primitive (string, number, boolean) or a stable reference.
 */
export function useEyeValue(select) {
  const get = () => select(eye.getSnapshot())
  return useSyncExternalStore(eye.subscribe, get, get)
}

/** Keep the camera running while mounted (if tracking is enabled). Does not subscribe. */
export function useEyeCamera(active = true) {
  useEffect(() => {
    if (!active) return undefined
    return eye.acquire()
  }, [active])
}

/** Keep the camera running while this component is mounted and subscribe to the store. */
export function useEyeTracking(active = true) {
  useEyeCamera(active)
  return useEye()
}
