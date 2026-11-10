import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge, Button, Card, Notice, ProgressBar } from './ui.jsx'
import { cx } from '../lib/cx.js'
import { describeEye } from '../eye/describe.js'
import { eye } from '../eye/session.js'
import { describeLevel } from '../eye/calibration.js'
import { SENSITIVITY } from '../eye/classifier.js'
import { useEye } from '../eye/useEye.js'

const SCREEN_DOTS = [
  { x: 50, y: 50, label: 'center' }, { x: 8, y: 10, label: 'top-left' }, { x: 92, y: 10, label: 'top-right' },
  { x: 8, y: 88, label: 'bottom-left' }, { x: 92, y: 88, label: 'bottom-right' },
]
const DOT_MS = 1700
const DOT_SETTLE_MS = 550
const TYPE_MS = 9000
const DOWN_MS = 3200
const DOWN_SETTLE_MS = 800

function Preview({ className }) {
  const ref = useRef(null)
  const s = useEye()
  useEffect(() => {
    const v = ref.current
    if (!v) return undefined
    const stream = eye.getStream()
    if (stream && v.srcObject !== stream) {
      v.srcObject = stream
      v.play().catch(() => {})
    }
    return () => { v.srcObject = null }
  }, [s.runtime.phase])
  return <video ref={ref} muted playsInline aria-label="Camera preview (stays on this device)" className={cx('-scale-x-100 bg-zinc-900 object-cover', className)} />
}

/** 0..1 progress over `durationMs` while `active`; calls onDone once at the end. Restarts when runKey changes. */
function useTimeline(active, durationMs, onDone, runKey = 0) {
  const [pct, setPct] = useState(0)
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  })
  useEffect(() => {
    if (!active) return undefined
    const t0 = performance.now()
    let raf
    const loop = () => {
      const p = Math.min(1, (performance.now() - t0) / durationMs)
      setPct(p)
      if (p < 1) raf = requestAnimationFrame(loop)
      else done.current?.()
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [active, durationMs, runKey])
  return active ? pct : 0
}

function Overlay({ children, title, hint, onCancel }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 bg-zinc-950">
      <div className="pointer-events-none absolute inset-x-0 top-6 text-center">
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        {hint && <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">{hint}</p>}
      </div>
      <button type="button" onClick={onCancel} className="absolute right-4 top-4 rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white">Cancel</button>
      {children}
    </div>
  )
}

/** Capture a screen-gaze dot sequence. */
function ScreenPhase({ onDone, onCancel }) {
  const [i, setI] = useState(0)
  const samples = useRef([])
  const brightness = useRef([])
  const captured = useRef(false)
  const pct = useTimeline(true, DOT_MS, () => {
    const { samples: s, brightness: b } = eye.endCapture()
    samples.current.push(s)
    if (b != null) brightness.current.push(b)
    captured.current = false
    if (i + 1 >= SCREEN_DOTS.length) onDone({ segments: samples.current, brightness: brightness.current })
    else setI(i + 1)
  }, i)
  useEffect(() => {
    if (pct * DOT_MS >= DOT_SETTLE_MS && !captured.current) { captured.current = true; eye.beginCapture() }
  }, [pct])
  useEffect(() => () => { eye.endCapture() }, [])
  const d = SCREEN_DOTS[i]
  return (
    <Overlay title="Look at each dot" hint="Follow the dot with your eyes only, as if reading the screen. Keep your head natural." onCancel={onCancel}>
      <div key={i} className="absolute" style={{ left: `${d.x}%`, top: `${d.y}%`, transform: 'translate(-50%,-50%)' }}>
        <div className="relative flex h-16 w-16 items-center justify-center">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28" fill="none" stroke="#27272a" strokeWidth="4" /><circle cx="32" cy="32" r="28" fill="none" stroke="#34d399" strokeWidth="4" strokeDasharray={176} strokeDashoffset={176 * (1 - pct)} /></svg>
          <span className="h-4 w-4 rounded-full bg-emerald-400" />
        </div>
      </div>
      <p className="absolute bottom-6 w-full text-center text-sm text-zinc-500">{i + 1} / {SCREEN_DOTS.length} · {d.label}</p>
    </Overlay>
  )
}

function TypePhase({ onDone, onCancel }) {
  const [started, setStarted] = useState(false)
  const pct = useTimeline(started, TYPE_MS, () => { const r = eye.endCapture(); onDone(r) })
  useEffect(() => { if (started) eye.beginCapture(); return () => { eye.endCapture() } }, [started])
  const ref = useRef(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <Overlay title="Type while looking at the screen" hint="This captures how your head and eyes move while you really type. Look at the text, not the keys." onCancel={onCancel}>
      <div className="absolute inset-x-0 top-1/3 mx-auto max-w-xl px-6 text-center">
        <p className="font-mono text-2xl text-zinc-200">the quick brown fox jumps over the lazy dog</p>
        <textarea ref={ref} rows={2} onChange={() => setStarted(true)} aria-label="Type the sentence here" placeholder="Start typing to begin (any text is fine)"
          className="mt-6 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3 font-mono text-lg text-white outline-none focus:border-emerald-500" />
        <div className="mt-4"><ProgressBar value={pct * 100} label="Typing capture" /></div>
        <p className="mt-2 text-xs text-zinc-500">{started ? 'Keep typing – and keep looking at the screen.' : 'Waiting for you to start typing…'}</p>
      </div>
    </Overlay>
  )
}

function DownPhase({ onDone, onCancel }) {
  const [round, setRound] = useState(0)
  const [phase, setPhase] = useState('ready') // ready | countdown | capture
  const acc = useRef({ segments: [], brightness: [] })
  const countPct = useTimeline(phase === 'countdown', 2400, () => setPhase('capture'), round)
  const count = Math.max(1, 3 - Math.floor(countPct * 3))
  const captured = useRef(false)
  const pct = useTimeline(phase === 'capture', DOWN_MS, () => {
    const r = eye.endCapture()
    acc.current.segments.push(r.samples)
    if (r.brightness != null) acc.current.brightness.push(r.brightness)
    captured.current = false
    if (round >= 1) onDone(acc.current)
    else { setRound(round + 1); setPhase('ready') }
  })
  useEffect(() => {
    if (phase === 'capture' && pct * DOWN_MS >= DOWN_SETTLE_MS && !captured.current) { captured.current = true; eye.beginCapture() }
  }, [phase, pct])
  useEffect(() => () => { eye.endCapture() }, [])
  const prompts = ['Look down at your keyboard exactly as you do when you peek.', 'Once more. Peek the way you sometimes do – for example, moving only your eyes this time.']
  return (
    <Overlay title={`Look at your keyboard (${round + 1}/2)`} hint={prompts[round]} onCancel={onCancel}>
      <div className="absolute inset-x-0 top-1/3 mx-auto max-w-sm px-6 text-center">
        {phase === 'ready' && (<><p className="text-zinc-300">Press the button, then look down at your keys when the countdown ends. Keep looking until the bar fills.</p><Button className="mt-6" onClick={() => setPhase('countdown')} autoFocus>I&apos;m ready</Button></>)}
        {phase === 'countdown' && <p className="text-7xl font-semibold tabular-nums text-emerald-300" aria-live="assertive">{count}</p>}
        {phase === 'capture' && (<><p className="text-xl font-medium text-amber-200">Keep looking at your keyboard…</p><div className="mt-6"><ProgressBar value={pct * 100} tone="warn" label="Keyboard capture" /></div></>)}
      </div>
    </Overlay>
  )
}

function LiveCheck() {
  const s = useEye()
  const [recentering, setRecentering] = useState(null) // null | 'busy' | 'done' | 'failed'
  const d = describeEye(s)
  const tone = { good: 'bg-emerald-500/15 text-emerald-300', bad: 'bg-amber-500/15 text-amber-200', info: 'bg-sky-500/15 text-sky-300', warn: 'bg-zinc-800 text-zinc-300', off: 'bg-zinc-800 text-zinc-400' }[d.tone]
  const score = s.live.score
  return (
    <Card>
      <h3 className="font-medium text-white">Try it live</h3>
      <p className="mt-1 text-sm text-zinc-400">Look at the screen, then at your keyboard, then tilt your head while still looking at the screen. The label should follow you after about half a second. If it doesn&apos;t, recalibrate – that is useful information about your setup.</p>
      <p className={cx('mt-4 rounded-lg px-4 py-3 text-center text-lg font-semibold transition-colors', tone)} aria-live="polite">{d.text}</p>
      <div className="mt-3">
        <div className="relative h-2 overflow-hidden rounded-full bg-zinc-800">
          <div className="absolute inset-y-0 bg-emerald-500/70" style={{ left: 0, width: `${Math.max(0, Math.min(1, ((score ?? 0) + 0.5) / 1.8)) * 100}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-xs text-zinc-600"><span>screen</span><span>keyboard</span></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" disabled={recentering === 'busy' || s.runtime.phase !== 'running'}
          onClick={async () => { setRecentering('busy'); setRecentering((await eye.recenter()) ? 'done' : 'failed') }}>
          {recentering === 'busy' ? 'Look at the screen…' : 'Re-centre'}
        </Button>
        <span className="text-xs text-zinc-500">
          {recentering === 'done' ? 'Re-centred to your current posture.' : recentering === 'failed' ? 'Could not see your face clearly – try again.' : 'Moved your chair or laptop? Look at the screen and re-centre in 1.5 s – no full recalibration needed.'}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs text-zinc-500">
        <div><dt>Camera</dt><dd className="text-zinc-300">{s.runtime.fps ? `${s.runtime.fps.toFixed(0)} fps` : '—'}</dd></div>
        <div><dt>Processing</dt><dd className="text-zinc-300">{s.runtime.inferenceMs ? `${s.runtime.inferenceMs.toFixed(0)} ms/frame` : '—'}</dd></div>
        <div><dt>Engine</dt><dd className="text-zinc-300">{s.runtime.delegate ?? '—'}</dd></div>
      </dl>
    </Card>
  )
}

export default function EyeSetup() {
  const s = useEye()
  const [step, setStep] = useState('idle') // idle | position | screen | type | down | result
  const [error, setError] = useState(null)
  const data = useRef({ screenSegments: [], downSegments: [], brightness: [] })
  const [result, setResult] = useState(null)
  const [positionOk, setPositionOk] = useState(0)

  const cancel = useCallback(() => { eye.endCapture(); eye.setMode('idle'); setStep('idle') }, [])
  useEffect(() => () => { eye.setMode('idle') }, [])

  async function begin() {
    setError(null)
    eye.setSettings({ enabled: true })
    try {
      await eye.start()
      eye.setMode('positioning')
      setStep('position')
    } catch (e) {
      setError(e.message ?? String(e))
      eye.setSettings({ enabled: false })
    }
  }

  // require a steady good position for ~1.2s before allowing calibration
  const blocking = s.issues.filter((i) => i.severity === 'error')
  useEffect(() => {
    if (step !== 'position') return undefined
    const id = setInterval(() => setPositionOk((n) => (eye.issues.length && eye.issues.some((i) => i.severity === 'error') || !eye.lastFeatures ? 0 : Math.min(6, n + 1))), 250)
    return () => clearInterval(id)
  }, [step])
  const positionReady = positionOk >= 4

  function finish() {
    const brightness = data.current.brightness.length ? data.current.brightness.reduce((a, b) => a + b, 0) / data.current.brightness.length : null
    const { screenSegments, downSegments } = data.current
    const profile = eye.finishCalibration({ screen: screenSegments.flat(), down: downSegments.flat(), screenSegments, downSegments, brightness })
    eye.setMode('idle')
    setResult(profile)
    setStep('result')
  }

  const level = s.profile?.quality?.level
  const levelTone = { good: 'good', fair: 'info', poor: 'warn', insufficient: 'bad' }[level]

  return (
    <div className="space-y-4">
      {step === 'screen' && <ScreenPhase onCancel={cancel} onDone={(r) => { data.current.screenSegments = r.segments; data.current.brightness = [...r.brightness]; setStep('type') }} />}
      {step === 'type' && <TypePhase onCancel={cancel} onDone={(r) => { data.current.screenSegments = [...data.current.screenSegments, r.samples]; setStep('down') }} />}
      {step === 'down' && <DownPhase onCancel={cancel} onDone={(r) => { data.current.downSegments = r.segments; data.current.brightness = [...data.current.brightness, ...r.brightness]; finish() }} />}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Eye tracking</h3>
            <p className="mt-1 max-w-xl text-sm text-zinc-400">Uses your webcam to tell whether you are looking at the screen or down at the keyboard. Everything is processed in this browser tab: no video, images or face data are ever uploaded or saved. Only your calibration numbers and per-session summary counts are stored.</p>
          </div>
          {s.calibrated ? <Badge tone={levelTone}>Calibrated · {level}</Badge> : level === 'insufficient' || level === 'poor' ? <Badge tone="warn">Calibration {level}</Badge> : <Badge>Not calibrated</Badge>}
        </div>

        {error && <Notice tone="bad" className="mt-4" title="Could not start the camera">{error}</Notice>}
        {s.runtime.phase === 'error' && step === 'idle' && <Notice tone="warn" className="mt-4">{s.runtime.error?.message}</Notice>}

        {step === 'idle' && (
          <div className="mt-4 space-y-4">
            {s.profile?.quality && (
              <div className="rounded-lg border border-white/[0.08] p-4 text-sm">
                <p className="text-zinc-200">{describeLevel(level)}</p>
                {s.profile.quality.dPrime != null && <p className="mt-1 text-xs text-zinc-500">Separation score {s.profile.quality.dPrime} · measured on {s.profile.counts.screen + s.profile.counts.down} calibration frames · {new Date(s.profile.createdAt).toLocaleDateString()}. {s.profile.quality.validated ? ' Quality was cross-validated on held-out capture steps.' : ''}</p>}
                {s.profile.quality.issues?.map((i) => <p key={i.id} className={cx('mt-2 text-xs', i.severity === 'error' ? 'text-red-300' : i.severity === 'warn' ? 'text-amber-300' : 'text-zinc-400')}>• {i.message}</p>)}
              </div>
            )}
            {s.live.drift > 0.5 && s.runtime.phase === 'running' && <Notice tone="warn">Your sitting position seems to have changed since calibration. Recalibrating will improve accuracy.</Notice>}
            <div className="flex flex-wrap gap-2">
              <Button onClick={begin}>{s.calibrated ? 'Recalibrate' : s.profile ? 'Try calibration again' : 'Enable & calibrate'}</Button>
              {s.profile && <Button variant="secondary" onClick={() => { eye.clearCalibration(); setResult(null) }}>Remove calibration</Button>}
              {s.settings.enabled && <Button variant="ghost" onClick={() => eye.setSettings({ enabled: false })}>Turn tracking off</Button>}
              {!s.settings.enabled && s.calibrated && <Button variant="secondary" onClick={() => eye.setSettings({ enabled: true })}>Turn tracking on</Button>}
            </div>
            {s.calibrated && (
              <fieldset className="grid gap-3 sm:grid-cols-3">
                <legend className="mb-2 text-sm font-medium text-zinc-300">Preferences</legend>
                <label className="text-sm text-zinc-400">Sensitivity
                  <select value={s.settings.sensitivity} onChange={(e) => eye.setSettings({ sensitivity: e.target.value })} className="mt-1 block w-full rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-zinc-200">
                    {Object.keys(SENSITIVITY).map((k) => <option key={k} value={k}>{k} ({SENSITIVITY[k].confirmDownMs} ms)</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 pt-6 text-sm text-zinc-300"><input type="checkbox" checked={s.settings.hints} onChange={(e) => eye.setSettings({ hints: e.target.checked })} /> Gentle “eyes up” hint</label>
                <label className="flex items-center gap-2 pt-6 text-sm text-zinc-300"><input type="checkbox" checked={s.settings.showPreview} onChange={(e) => eye.setSettings({ showPreview: e.target.checked })} /> Camera thumbnail while typing</label>
              </fieldset>
            )}
          </div>
        )}

        {step === 'position' && (
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <div className="relative overflow-hidden rounded-xl border border-white/[0.08]">
              <Preview className="aspect-[4/3] w-full" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true"><div className="h-3/4 w-1/2 rounded-[50%] border-2 border-dashed border-white/40" /></div>
            </div>
            <div>
              <h4 className="font-medium text-white">Position yourself</h4>
              <ul className="mt-2 space-y-1 text-sm text-zinc-400">
                <li>• Sit in your normal typing posture, about an arm's length from the screen.</li>
                <li>• Your face should fill roughly the dashed oval.</li>
                <li>• Put the webcam at the top of the screen, light in front of you (not behind).</li>
              </ul>
              <div className="mt-4 space-y-2" aria-live="polite">
                {s.issues.length === 0 && s.mode === 'positioning' && positionReady && <p className="text-sm text-emerald-300">✓ Good position</p>}
                {s.issues.map((i) => <p key={i.id} className={cx('rounded-md px-3 py-2 text-sm', i.severity === 'error' ? 'bg-red-950/40 text-red-200' : 'bg-amber-950/30 text-amber-200')}>{i.message}</p>)}
              </div>
              <div className="mt-5 flex gap-2">
                <Button disabled={!positionReady || blocking.length > 0} onClick={() => { data.current = { screenSegments: [], downSegments: [], brightness: [] }; setStep('screen') }}>Continue</Button>
                <Button variant="ghost" onClick={cancel}>Cancel</Button>
              </div>
              <p className="mt-3 text-xs text-zinc-600">Calibration takes about 30 seconds in three short steps: follow dots, type a sentence, then look down at your keys.</p>
            </div>
          </div>
        )}

        {step === 'result' && result && (
          <div className="mt-4 space-y-4">
            <div className={cx('rounded-lg border p-4', result.ok ? 'border-emerald-800/60' : 'border-red-900/60')}>
              <p className="text-lg font-semibold text-white">{result.ok ? `Calibration saved – ${result.quality.level}` : `Calibration ${result.quality.level}`}</p>
              <p className="mt-1 text-sm text-zinc-300">{describeLevel(result.quality.level)}</p>
              {result.quality.dPrime != null && (
                <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <div><dt className="text-zinc-500">Separation</dt><dd className="tabular-nums text-white">{result.quality.dPrime}</dd></div>
                  <div><dt className="text-zinc-500">Screen frames misread</dt><dd className="tabular-nums text-white">{(result.quality.falsePositive * 100).toFixed(1)}%</dd></div>
                  <div><dt className="text-zinc-500">Keyboard frames missed</dt><dd className="tabular-nums text-white">{(result.quality.falseNegative * 100).toFixed(1)}%</dd></div>
                </dl>
              )}
              <p className="mt-3 text-xs text-zinc-500">{result.quality.validated ? 'These rates are cross-validated: each capture step was held out and scored by a model that never saw it.' : 'These rates were measured on the calibration frames themselves.'} They describe this short calibration, so use the live check below to confirm tracking follows you while you really type.</p>
              {result.quality.issues?.map((i) => <p key={i.id} className={cx('mt-2 text-sm', i.severity === 'error' ? 'text-red-300' : i.severity === 'warn' ? 'text-amber-300' : 'text-zinc-400')}>• {i.message}</p>)}
            </div>
            {!result.ok && <Notice tone="warn">Tracking will not be used to score your sessions with this calibration, so you won&apos;t get a misleading visual-discipline number. Adjust the camera or lighting and try again, or continue without eye tracking.</Notice>}
            <div className="flex flex-wrap gap-2">
              {result.ok ? <Button onClick={async () => { await eye.start().catch(() => {}); setStep('idle') }}>Done</Button> : <Button onClick={begin}>Recalibrate</Button>}
              {result.ok && <Button variant="secondary" onClick={begin}>Recalibrate</Button>}
              {!result.ok && <Button variant="secondary" onClick={() => { eye.setSettings({ enabled: false }); setStep('idle') }}>Continue without eye tracking</Button>}
            </div>
          </div>
        )}
      </Card>

      {(step === 'idle' || step === 'result') && s.calibrated && s.settings.enabled && <><LiveStart /><LiveCheck /></>}
    </div>
  )
}

function LiveStart() {
  const s = useEye()
  useEffect(() => {
    if (s.settings.enabled && s.calibrated) return eye.acquire()
    return undefined
  }, [s.settings.enabled, s.calibrated])
  return null
}
