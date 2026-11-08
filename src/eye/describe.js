import { STATE } from './classifier.js'

/** Describe the live tracking state honestly, in one short phrase. */
export function describeEye(eye) {
  const { settings, calibrated, runtime, live } = eye
  if (!settings.enabled) return { tone: 'off', text: 'Eye tracking off', detail: 'Tracking is switched off, so keyboard-looking is not measured.' }
  if (!calibrated) return { tone: 'off', text: 'Not calibrated', detail: 'Calibrate eye tracking in Setup to measure keyboard-looking.' }
  if (runtime.phase === 'error') return { tone: 'warn', text: 'Camera unavailable', detail: runtime.error?.message ?? 'The camera could not be used.' }
  if (runtime.phase !== 'running') return { tone: 'off', text: runtime.phase === 'starting' ? 'Starting camera…' : 'Camera idle', detail: '' }
  switch (live.state) {
    case STATE.SCREEN: return { tone: 'good', text: 'Eyes on screen', detail: '' }
    case STATE.KEYBOARD: return { tone: 'bad', text: 'Looking at keyboard', detail: '' }
    case STATE.AWAY: return { tone: 'info', text: 'Looking away', detail: '' }
    case STATE.UNCERTAIN: return { tone: 'warn', text: 'Uncertain', detail: 'The tracker cannot tell where you are looking (lighting, angle, or head position).' }
    default: return { tone: 'warn', text: 'No face detected', detail: 'Make sure your face is visible to the camera.' }
  }
}
