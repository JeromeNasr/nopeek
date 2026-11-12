import { useState } from 'react'
import EyeSetup from '../components/EyeSetup.jsx'
import KeyboardSetup from '../components/KeyboardSetup.jsx'
import PrefsPanel from '../components/PrefsPanel.jsx'
import { Button, Card, PageHeader } from '../components/ui.jsx'
import { eye } from '../eye/session.js'
import { useTraining } from '../data/trainingContext.js'
import { removeKey } from '../data/localStore.js'

function Privacy() {
  const { refresh } = useTraining()
  const [msg, setMsg] = useState(null)
  const wipe = (keys, label) => {
    if (!window.confirm(`Delete ${label} from this device? This cannot be undone.`)) return
    keys.forEach(removeKey)
    if (keys.includes('eye.profile.v4')) eye.clearCalibration()
    refresh()
    setMsg(`${label} deleted from this device.`)
  }
  return (
    <Card>
      <h3 className="text-lg font-semibold text-white">Privacy &amp; data</h3>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-400">
        <li><strong className="text-zinc-200">Webcam video never leaves your device.</strong> Face tracking runs in this tab using a model served from TouchType itself. No frames, images or landmarks are uploaded, recorded or stored.</li>
        <li><strong className="text-zinc-200">Stored on this device only:</strong> your eye calibration numbers (a handful of averages, not images) and settings.</li>
        <li><strong className="text-zinc-200">Saved with your sessions</strong> (locally, and to your account when signed in): WPM, accuracy, key-level error and timing counts, and eye-tracking <em>summary</em> counts such as time on screen and number of keyboard looks.</li>
        <li>The camera light is on only while a typing page or this setup page is open and tracking is enabled; it turns off when you leave.</li>
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="danger" size="sm" onClick={() => wipe(['eye.profile.v4', 'eye.samples.v4'], 'eye calibration')}>Delete calibration</Button>
        <Button variant="danger" size="sm" onClick={() => wipe(['sessions.v1'], 'locally saved sessions')}>Delete local sessions</Button>
        <Button variant="danger" size="sm" onClick={() => wipe(['keyboard.v1', 'goals.v1', 'layoutObs.v1', 'test.settings', 'prefs.v1'], 'keyboard setup, goals and preferences')}>Reset keyboard &amp; preferences</Button>
      </div>
      {msg && <p role="status" className="mt-3 text-sm text-emerald-400">{msg}</p>}
    </Card>
  )
}

export default function Setup() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <PageHeader title="Settings" subtitle="Everything here is optional. You can just type." />
      <div className="space-y-6">
        <KeyboardSetup />
        <div id="eye"><EyeSetup /></div>
        <PrefsPanel />
        <Privacy />
      </div>
    </div>
  )
}
