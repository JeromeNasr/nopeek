import { useEffect, useRef } from 'react'
import { eye } from '../eye/session.js'
import { useEye } from '../eye/useEye.js'

/** Small mirrored preview while typing, so the user can see what the camera sees. Local only. */
export default function CameraThumb() {
  const s = useEye()
  const ref = useRef(null)
  const show = s.settings.enabled && s.settings.showPreview && s.runtime.phase === 'running'
  useEffect(() => {
    const v = ref.current
    if (!v || !show) return undefined
    const stream = eye.getStream()
    if (stream) {
      v.srcObject = stream
      v.play().catch(() => {})
    }
    return () => { v.srcObject = null }
  }, [show])
  if (!show) return null
  return (
    <video ref={ref} muted playsInline aria-label="Camera preview, processed on this device only"
      className="fixed bottom-4 right-4 z-30 h-24 w-32 -scale-x-100 rounded-lg border border-zinc-700 bg-zinc-900 object-cover opacity-80 shadow-lg shadow-black/40 transition hover:opacity-100" />
  )
}
