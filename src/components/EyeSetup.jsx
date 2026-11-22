import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, Card, Notice } from './ui.jsx'
import { cx } from '../lib/cx.js'
import { describeLevel } from '../eye/calibration.js'
import { SENSITIVITY } from '../eye/classifier.js'
import { describeEye } from '../eye/describe.js'
import { eye } from '../eye/session.js'
import { useEye } from '../eye/useEye.js'
import { playTick } from '../lib/sound.js'

// Dots sit near the real edges of the screen (the overlay is the viewport), so the
// screen baseline covers everywhere the user's eyes go while reading.
const SCREEN_DOTS = [[50, 50], [7, 10], [93, 10], [7, 90], [93, 90], [50, 50]]
const DOT_MS = 2000
const DOT_SETTLE_MS = 600
const DOWN_MS = 3600
const DOWN_SETTLE_MS = 800
const COUNTDOWN_MS = 2400

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

const STEPS = ['position', 'screen', 'keyboard']

/** Full-viewport layer, portalled to <body> so no page transform/overflow can displace it. */
function Overlay({ step, title, hint, onCancel, children }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  const idx = STEPS.indexOf(step)
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Eye tracking calibration" className="fixed inset-0 z-[100] overflow-hidden bg-zinc-950 text-zinc-100" style={{ height: '100dvh' }}>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-5" aria-hidden="true">
        <ol className="flex items-center gap-3 text-xs">
          {STEPS.map((s, i) => (
            <li key={s} className={cx('flex items-center gap-2', i === idx ? 'text-zinc-100' : i < idx ? 'text-emerald-400' : 'text-zinc-600')}>
              <span className={cx('h-1.5 w-1.5 rounded-full', i <= idx ? 'bg-current' : 'bg-zinc-700')} />
              {s}
              {i < STEPS.length - 1 && <span className="ml-1 h-px w-6 bg-zinc-800" />}
            </li>
          ))}
        </ol>
      </div>
      {(title || hint) && (
        <div className="pointer-events-none absolute inset-x-0 z-10 px-6 text-center" style={{ top: step === 'screen' ? '60%' : '14%' }}>
          {title && <h2 className="text-xl font-semibold text-white">{title}</h2>}
          {hint && <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">{hint}</p>}
        </div>
      )}
      {children}
      <button type="button" onClick={onCancel} className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">Cancel</button>
    </div>,
    document.body,
  )
}

function FaceWarning() {
  const s = useEye()
  if (s.face) return null
  return <p role="status" className="absolute inset-x-0 bottom-14 z-10 text-center text-sm text-[color:var(--warn)]">Can&apos;t see your face – look at the camera.</p>
}

function PositionStep({ onContinue, onCancel }) {
  const s = useEye()
  const [steady, setSteady] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      const snap = eye.getSnapshot()
      const blocked = snap.issues.some((i) => i.severity === 'error')
      setSteady((n) => (snap.face && !blocked ? Math.min(8, n + 1) : 0))
    }, 250)
    return () => clearInterval(id)
  }, [])
  const ready = steady >= 4
  const warnings = s.issues.filter((i) => i.severity !== 'error' || i.id !== 'no-face')
  return (
    <Overlay step="position" onCancel={onCancel}>
      <div className="absolute inset-0 flex items-center justify-center px-6 pb-16 pt-16">
        <div className="grid w-full max-w-4xl items-center gap-10 md:grid-cols-2">
          <div className="relative overflow-hidden rounded-xl bg-zinc-900">
            <Preview className="aspect-[4/3] w-full" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
              <div className={cx('h-[78%] w-[46%] rounded-[50%] border-2 border-dashed transition-colors', ready ? 'border-emerald-400' : 'border-white/40')} />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-white">Sit as you normally type</h2>
            <ul className="mt-4 space-y-1.5 text-sm text-zinc-400">
              <li>Keep your face inside the dashed oval.</li>
              <li>Light should come from in front of you, not behind.</li>
              <li>A webcam at the top of the screen works best.</li>
            </ul>
            <div className="mt-6 min-h-[5rem] space-y-1.5" aria-live="polite">
              {!s.face && <p className="text-sm text-[color:var(--warn)]">Looking for your face…</p>}
              {s.face && ready && <p className="text-sm text-emerald-400">✓ Good — you&apos;re all set.</p>}
              {s.face && warnings.map((i) => <p key={i.id} className={cx('text-sm', i.severity === 'error' ? 'text-[color:var(--bad)]' : 'text-[color:var(--warn)]')}>{i.message}</p>)}
            </div>
            <div className="mt-6 flex items-center gap-4">
              <Button size="lg" disabled={!ready} onClick={onContinue} autoFocus>Start calibration</Button>
              <span className="text-xs text-zinc-600">about 30 seconds</span>
            </div>
            <p className="mt-4 text-xs text-zinc-600">{s.runtime.fps ? `${s.runtime.fps.toFixed(0)} fps` : 'starting camera…'}</p>
          </div>
        </div>
      </div>
    </Overlay>
  )
}

/** Follow six dots across the screen. */
function ScreenPhase({ onDone, onCancel }) {
  const [i, setI] = useState(0)
  const segs = useRef([])
  const bright = useRef([])
  const started = useRef(false)
  const pct = useTimeline(true, DOT_MS, () => {
    const { samples, brightness } = eye.endCapture()
    started.current = false
    segs.current.push(samples)
    if (brightness != null) bright.current.push(brightness)
    if (i + 1 >= SCREEN_DOTS.length) onDone({ segments: segs.current, brightness: bright.current })
    else setI(i + 1)
  }, i)
  useEffect(() => {
    if (pct * DOT_MS >= DOT_SETTLE_MS && !started.current) {
      started.current = true
      eye.beginCapture()
    }
  }, [pct])
  useEffect(() => () => { eye.endCapture() }, [])
  const [x, y] = SCREEN_DOTS[i]
  const settling = pct * DOT_MS < DOT_SETTLE_MS
  return (
    <Overlay step="screen" title="Follow the dot with your eyes" hint="Keep your head natural, as if reading." onCancel={onCancel}>
      <div key={i} className="absolute" style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)' }}>
        <div className="relative flex h-16 w-16 items-center justify-center">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="28" fill="none" stroke="var(--n-800)" strokeWidth="3" />
            <circle cx="32" cy="32" r="28" fill="none" stroke="var(--accent)" strokeWidth="3" strokeDasharray={176} strokeDashoffset={176 * (1 - (settling ? 0 : pct))} />
          </svg>
          <span className={cx('rounded-full bg-emerald-400 transition-all duration-300', settling ? 'h-6 w-6' : 'h-3.5 w-3.5')} />
        </div>
      </div>
      <p className="absolute inset-x-0 bottom-14 text-center text-xs text-zinc-600">{i + 1} of {SCREEN_DOTS.length}</p>
      <FaceWarning />
    </Overlay>
  )
}

/** Two keyboard looks. Auto-runs after one click so the user can get ready. */
function DownPhase({ onDone, onCancel, firstOnly = false }) {
  const rounds = firstOnly ? 1 : 2
  const [round, setRound] = useState(0)
  const [phase, setPhase] = useState('ready') // ready | countdown | capture | between
  const acc = useRef({ segments: [], brightness: [] })
  const started = useRef(false)
  const countPct = useTimeline(phase === 'countdown', COUNTDOWN_MS, () => setPhase('capture'), round)
  const count = Math.max(1, 3 - Math.floor(countPct * 3))
  const pct = useTimeline(phase === 'capture', DOWN_MS, () => {
    const r = eye.endCapture()
    started.current = false
    acc.current.segments.push(r.samples)
    if (r.brightness != null) acc.current.brightness.push(r.brightness)
    playTick(true)
    if (round + 1 >= rounds) onDone(acc.current)
    else { setRound(round + 1); setPhase('between') }
  })
  useTimeline(phase === 'between', 1800, () => setPhase('countdown'), round)
  useEffect(() => {
    if (phase === 'capture' && pct * DOWN_MS >= DOWN_SETTLE_MS && !started.current) {
      started.current = true
      eye.beginCapture()
    }
  }, [phase, pct])
  useEffect(() => () => { eye.endCapture() }, [])
  const prompts = ['Look down at your keyboard the way you usually do when you peek.', 'Now the other way you peek. If you tilted your head before, keep it still and drop only your eyes (or the reverse).']
  return (
    <Overlay step="keyboard" title={phase === 'capture' ? 'Keep looking at your keys' : `Look at your keyboard${rounds > 1 ? ` (${round + 1} of ${rounds})` : ''}`} hint={phase === 'capture' ? undefined : prompts[round]} onCancel={onCancel}>
      <div className="absolute inset-x-0 top-[42%] mx-auto flex max-w-sm flex-col items-center px-6 text-center">
        {phase === 'ready' && (<><p className="text-sm text-zinc-400">Press the button, then look down when the count ends.</p><Button className="mt-5" size="lg" onClick={() => setPhase('countdown')} autoFocus>I&apos;m ready</Button></>)}
        {phase === 'between' && <p className="text-sm text-zinc-400">Good. Get ready for the next one…</p>}
        {phase === 'countdown' && <p className="font-mono text-7xl text-emerald-400" aria-live="assertive">{count}</p>}
        {phase === 'capture' && (
          <>
            <svg viewBox="0 0 24 24" className="h-12 w-12 animate-bounce text-[color:var(--warn)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v14m0 0-6-6m6 6 6-6" /></svg>
            <div className="mt-5 h-1 w-48 overflow-hidden bg-zinc-800"><div className="h-full origin-left bg-emerald-400" style={{ transform: `scaleX(${pct})` }} /></div>
          </>
        )}
      </div>
      <FaceWarning />
    </Overlay>
  )
}

function ResultStep({ result, onDone, onRetryKeyboard, onRecalibrate, onSkip }) {
  const q = result.quality
  const good = result.ok
  return (
    <Overlay step="keyboard" onCancel={onSkip}>
      <div className="absolute inset-0 flex items-center justify-center overflow-y-auto px-6 pb-16 pt-16">
        <div className="w-full max-w-lg">
          <p className={cx('text-xs font-medium', good ? 'text-emerald-400' : 'text-[color:var(--warn)]')}>{good ? 'calibration saved' : 'calibration not usable'}</p>
          <h2 className="mt-1 text-3xl font-semibold text-white">{good ? (q.level === 'good' ? 'Tracking is ready' : 'Tracking is ready (fair)') : "It can't tell your two looks apart yet"}</h2>
          <p className="mt-2 text-sm text-zinc-400">{describeLevel(q.level)}</p>
          {q.dPrime != null && (
            <dl className="mt-6 grid grid-cols-3 gap-4 text-sm">
              <div><dt className="text-zinc-500">separation</dt><dd className="font-mono text-lg text-zinc-100">{q.dPrime}</dd></div>
              <div><dt className="text-zinc-500">screen misread</dt><dd className="font-mono text-lg text-zinc-100">{(q.falsePositive * 100).toFixed(0)}%</dd></div>
              <div><dt className="text-zinc-500">keyboard missed</dt><dd className="font-mono text-lg text-zinc-100">{(q.falseNegative * 100).toFixed(0)}%</dd></div>
            </dl>
          )}
          {(q.issues?.length > 0 || !good) && (
            <ul className="mt-6 space-y-1.5 text-sm text-zinc-300">
              {q.issues?.map((i) => <li key={i.id} className={i.severity === 'error' ? 'text-[color:var(--bad)]' : i.severity === 'warn' ? 'text-[color:var(--warn)]' : 'text-zinc-400'}>• {i.message}</li>)}
              {!good && <li>• Make the keyboard look more obvious: tilt your head down noticeably, as if reading your keys.</li>}
              {!good && <li>• Put the camera at the top of the screen and sit so your face fills about a third of the frame.</li>}
            </ul>
          )}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {good ? <Button size="lg" onClick={onDone} autoFocus>Try it live</Button> : <Button size="lg" onClick={onRetryKeyboard} autoFocus>Redo the keyboard step</Button>}
            <Button variant="secondary" onClick={onRecalibrate}>{good ? 'Recalibrate' : 'Start over'}</Button>
            {!good && <Button variant="ghost" onClick={onSkip}>Continue without eye tracking</Button>}
          </div>
        </div>
      </div>
    </Overlay>
  )
}

const SIGNAL_LABEL = { pitch: 'head tilt', gazeV: 'iris position', gazeLid: 'iris between lids', lookDown: 'eye direction' }

function LiveCheck() {
  const s = useEye()
  const [busy, setBusy] = useState(null) // null | 'recenter' | 'screen' | 'down'
  const [msg, setMsg] = useState(null)
  const d = describeEye(s)
  const tone = { good: 'text-emerald-400', bad: 'text-[color:var(--warn)]', info: 'text-zinc-200', warn: 'text-zinc-400', off: 'text-zinc-500' }[d.tone]
  const score = s.live.score
  const th = s.profile?.thresholds
  const running = s.runtime.phase === 'running'

  async function teach(label) {
    setBusy(label)
    setMsg(label === 'down' ? 'Look at your keyboard now and hold…' : 'Keep looking at the screen…')
    const profile = await eye.teach(label, { delayMs: label === 'down' ? 1200 : 200 })
    playTick(true)
    setBusy(null)
    setMsg(!profile ? 'Could not see your face clearly – nothing was changed.' : profile.ok ? `Learned. Calibration is now ${profile.quality.level}.` : 'That made the two looks harder to tell apart, so it was not kept.')
  }

  return (
    <Card>
      <h3 className="font-medium text-white">Try it live</h3>
      <p className="mt-1 text-sm text-zinc-400">Look at the screen, then at your keys. The label should follow you in under half a second.</p>
      <p className={cx('mt-5 font-mono text-2xl', tone)} aria-live="polite">{d.text.toLowerCase()}</p>
      <div className="relative mt-3 h-1 bg-zinc-800">
        <div className="absolute inset-y-0 left-0 bg-emerald-400" style={{ width: `${Math.max(0, Math.min(1, ((score ?? 0) + 0.3) / 1.6)) * 100}%` }} />
        {th && <div className="absolute -inset-y-1 w-px bg-zinc-400" style={{ left: `${((th.enter + 0.3) / 1.6) * 100}%` }} title="your keyboard threshold" />}
      </div>
      <div className="mt-1 flex justify-between text-xs text-zinc-600"><span>screen</span><span>keyboard</span></div>

      {s.live.z && (
        <dl className="mt-5 grid gap-x-8 gap-y-1.5 text-xs sm:grid-cols-2">
          {Object.entries(s.live.z).map(([k, v]) => (
            <div key={k} className="flex items-center gap-3">
              <dt className="w-28 text-zinc-500">{SIGNAL_LABEL[k] ?? k}</dt>
              <dd className="relative h-1 flex-1 bg-zinc-800"><span className="absolute inset-y-0 left-0 bg-zinc-400" style={{ width: `${Math.max(0, Math.min(1, (v + 0.3) / 1.6)) * 100}%` }} /></dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-6 border-t border-zinc-800 pt-4">
        <p className="text-sm text-zinc-200">Getting it wrong?</p>
        <p className="mt-0.5 text-xs text-zinc-500">Teach it. Each press adds two seconds of your real posture to the calibration and refits it.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={!running || busy} onClick={() => teach('screen')}>{busy === 'screen' ? 'learning…' : "I'm looking at the screen"}</Button>
          <Button size="sm" variant="secondary" disabled={!running || busy} onClick={() => teach('down')}>{busy === 'down' ? 'look down…' : "I'll look at the keyboard"}</Button>
          <Button size="sm" variant="ghost" disabled={!running || busy} onClick={async () => { setBusy('recenter'); setMsg('Keep looking at the screen…'); const ok = await eye.recenter(); setBusy(null); setMsg(ok ? 'Re-centred to your current posture.' : 'Could not see your face clearly.') }}>I moved – re-centre</Button>
        </div>
        {msg && <p role="status" className="mt-2 text-xs text-zinc-400">{msg}</p>}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600">
        <span>{s.runtime.fps ? `${s.runtime.fps.toFixed(0)} fps` : '–'} · {s.runtime.inferenceMs ? `${s.runtime.inferenceMs.toFixed(0)} ms/frame` : '–'} · {s.runtime.thread === 'worker' ? 'background thread' : 'main thread'}</span>
        <button type="button" className="underline hover:text-zinc-400" onClick={async () => { try { await navigator.clipboard.writeText(JSON.stringify(eye.diagnostics(), null, 1)); setMsg('Diagnostics copied (numbers only, no images).') } catch { setMsg('Could not copy to the clipboard.') } }}>copy diagnostics</button>
      </div>
    </Card>
  )
}

export default function EyeSetup() {
  const s = useEye()
  const [step, setStep] = useState('idle') // idle | position | screen | down | result
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const data = useRef({ screenSegments: [], downSegments: [], brightness: [] })

  const close = useCallback(() => {
    eye.endCapture()
    eye.setMode('idle')
    setStep('idle')
  }, [])
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

  function finish() {
    const { screenSegments, downSegments, brightness } = data.current
    const b = brightness.length ? brightness.reduce((x, y) => x + y, 0) / brightness.length : null
    const profile = eye.finishCalibration({ screen: screenSegments.flat(), down: downSegments.flat(), screenSegments, downSegments, brightness: b })
    eye.setMode('idle')
    setResult(profile)
    setStep('result')
  }

  const level = s.profile?.quality?.level
  const levelTone = { good: 'text-emerald-400', fair: 'text-zinc-200', poor: 'text-[color:var(--warn)]', insufficient: 'text-[color:var(--bad)]' }[level]

  return (
    <div className="space-y-4">
      {step === 'position' && <PositionStep onCancel={close} onContinue={() => { data.current = { screenSegments: [], downSegments: [], brightness: [] }; eye.setMode('idle'); setStep('screen') }} />}
      {step === 'screen' && <ScreenPhase onCancel={close} onDone={(r) => { data.current.screenSegments = r.segments; data.current.brightness = r.brightness; setStep('down') }} />}
      {step === 'down' && <DownPhase onCancel={close} onDone={(r) => { data.current.downSegments = r.segments; data.current.brightness = [...data.current.brightness, ...r.brightness]; finish() }} />}
      {step === 'result' && result && (
        <ResultStep
          result={result}
          onDone={async () => { await eye.start().catch(() => {}); setStep('idle') }}
          onRetryKeyboard={() => setStep('down')}
          onRecalibrate={() => { eye.setMode('positioning'); setStep('position') }}
          onSkip={() => { eye.setSettings({ enabled: false }); setStep('idle') }}
        />
      )}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Eye tracking</h3>
            <p className="mt-1 max-w-xl text-sm text-zinc-400">Uses your webcam to tell whether you are looking at the screen or down at the keyboard. Everything runs in this browser tab: no video, images or face data are ever uploaded or saved.</p>
          </div>
          <span className={cx('text-sm', levelTone ?? 'text-zinc-500')}>{s.calibrated ? `calibrated · ${level}` : level === 'insufficient' || level === 'poor' ? `calibration ${level}` : 'not calibrated'}</span>
        </div>

        {error && <Notice tone="bad" className="mt-4" title="Could not start the camera">{error}</Notice>}
        {s.runtime.phase === 'error' && step === 'idle' && <Notice tone="warn" className="mt-4">{s.runtime.error?.message}</Notice>}

        <div className="mt-4 space-y-4">
          {s.profile?.quality && step === 'idle' && (
            <div className="text-sm">
              <p className="text-zinc-300">{describeLevel(level)}</p>
              {s.profile.quality.dPrime != null && <p className="mt-1 text-xs text-zinc-500">Separation {s.profile.quality.dPrime} · {s.profile.counts.screen + s.profile.counts.down} calibration frames · {new Date(s.profile.createdAt).toLocaleDateString()}{s.profile.quality.validated ? ' · cross-validated' : ''}</p>}
            </div>
          )}
          {s.live.drift > 0.5 && s.runtime.phase === 'running' && <Notice tone="warn">Your sitting position seems to have changed since calibration. Use “I moved – re-centre” below, or recalibrate.</Notice>}
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
                <select value={s.settings.sensitivity} onChange={(e) => eye.setSettings({ sensitivity: e.target.value })} className="mt-1 block w-full rounded-lg bg-zinc-900 px-3 py-2 text-zinc-200">
                  {Object.keys(SENSITIVITY).map((k) => <option key={k} value={k}>{k} ({SENSITIVITY[k].confirmDownMs} ms)</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 pt-6 text-sm text-zinc-300"><input type="checkbox" checked={s.settings.hints} onChange={(e) => eye.setSettings({ hints: e.target.checked })} /> “Eyes up” hint</label>
              <label className="flex items-center gap-2 pt-6 text-sm text-zinc-300"><input type="checkbox" checked={s.settings.showPreview} onChange={(e) => eye.setSettings({ showPreview: e.target.checked })} /> Camera thumbnail</label>
            </fieldset>
          )}
        </div>
      </Card>

      {step === 'idle' && s.calibrated && s.settings.enabled && <><LiveStart /><LiveCheck /></>}
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
