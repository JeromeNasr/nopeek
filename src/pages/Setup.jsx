import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import EyeSetup from '../components/EyeSetup.jsx'
import KeyboardSetup from '../components/KeyboardSetup.jsx'
import PrefsPanel from '../components/PrefsPanel.jsx'
import { Button, Card } from '../components/ui.jsx'
import { eye } from '../eye/session.js'
import { useTraining } from '../data/trainingContext.js'
import { removeKey } from '../data/localStore.js'
import { cx } from '../lib/cx.js'

const SECTIONS = [
  { id: 'eye', label: 'Eye tracking' },
  { id: 'typing', label: 'Typing' },
  { id: 'keyboard', label: 'Keyboard' },
  { id: 'privacy', label: 'Privacy & data' },
]

function Privacy() {
  const { refresh } = useTraining()
  const [msg, setMsg] = useState(null)
  const wipe = (label, fn) => {
    if (!window.confirm(`Delete ${label} from this device? This cannot be undone.`)) return
    fn()
    refresh()
    setMsg(`${label[0].toUpperCase()}${label.slice(1)} deleted from this device.`)
  }
  return (
    <Card className="p-6">
      <h3 className="text-lg font-medium text-white">Privacy &amp; data</h3>
      <ul className="mt-3 space-y-2 text-sm text-zinc-400">
        <li><strong className="font-medium text-zinc-200">Camera video never leaves your device.</strong> Face tracking runs inside this tab with a model served by TouchType itself. No frames, images or face landmarks are uploaded, recorded or stored.</li>
        <li><strong className="font-medium text-zinc-200">On this device only:</strong> your eye calibration (a few hundred numbers, no images) and settings.</li>
        <li><strong className="font-medium text-zinc-200">With your sessions</strong> (on this device, and in your account when signed in): speed, accuracy, per-key error and timing counts, and eye-tracking totals such as time on screen and number of looks down.</li>
        <li>The camera is only on while a typing page or this page is open with eye tracking turned on.</li>
      </ul>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="danger" size="sm" onClick={() => wipe('eye calibration', () => eye.clearCalibration())}>Delete calibration</Button>
        <Button variant="danger" size="sm" onClick={() => wipe('locally saved sessions', () => removeKey('sessions.v1'))}>Delete local sessions</Button>
        <Button variant="danger" size="sm" onClick={() => wipe('keyboard setup, goals and preferences', () => ['keyboard.v1', 'goals.v1', 'layoutObs.v1', 'test.settings', 'prefs.v1'].forEach(removeKey))}>Reset keyboard &amp; preferences</Button>
      </div>
      {msg && <p role="status" className="mt-3 text-sm text-emerald-400">{msg}</p>}
    </Card>
  )
}

/** Highlights the section currently in view. */
function useActiveSection() {
  const [active, setActive] = useState(SECTIONS[0].id)
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean)
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]) setActive(visible[0].target.id)
    }, { rootMargin: '-20% 0px -60% 0px' })
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
  return active
}

export default function Setup() {
  const { hash } = useLocation()
  const active = useActiveSection()
  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(hash.slice(1))
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }))
  }, [hash])

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-4xl font-medium tracking-tight text-white">Settings</h1>
      <p className="mt-1.5 text-zinc-400">Everything here is optional – you can just type.</p>
      <div className="mt-8 grid gap-8 md:grid-cols-[10rem_1fr]">
        <nav aria-label="Settings sections" className="min-w-0 md:sticky md:top-6 md:self-start">
          <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] md:flex-col">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} aria-current={active === s.id ? 'true' : undefined}
                  className={cx('block whitespace-nowrap rounded-full px-3 py-1.5 text-sm', active === s.id ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-200')}>
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-10">
          <section id="eye" className="scroll-mt-6"><EyeSetup /></section>
          <section id="typing" className="scroll-mt-6">
            <Card className="p-6">
              <h3 className="text-lg font-medium text-white">Typing</h3>
              <PrefsPanel className="mt-2" />
            </Card>
          </section>
          <section id="keyboard" className="scroll-mt-6"><KeyboardSetup /></section>
          <section id="privacy" className="scroll-mt-6"><Privacy /></section>
        </div>
      </div>
    </div>
  )
}
