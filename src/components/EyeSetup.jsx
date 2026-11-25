import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, Notice } from './ui.jsx'
import { describeLevel } from '../eye/calibration.js'
import { STATE } from '../eye/classifier.js'
import { describeEye } from '../eye/describe.js'
import { eye } from '../eye/session.js'
import { useEye } from '../eye/useEye.js'
import { cx } from '../lib/cx.js'
import { playCue, unlockAudio } from '../lib/sound.js'

// Dots sit near the real edges of the screen (the overlay is the viewport), so the
// screen baseline covers everywhere the user's eyes go while reading.
const SCREEN_DOTS = [[50, 50], [7, 10], [93, 10], [7, 90], [93, 90], [50, 50]]
const DOT_MS = 2000
const DOT_SETTLE_MS = 600
const DOWN_MS = 3600
const DOWN_SETTLE_MS = 700
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

const STEPS = ['position', 'screen', 'keyboard', 'check']

/** Full-viewport layer, portalled to <body> so no page transform/overflow can displace it. */
function Overlay({ step, title, hint, onCancel, cancelLabel = 'Cancel', children }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
  const idx = STEPS.indexOf(step)
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Eye tracking calibration" className="fixed inset-0 z-[100] overflow-hidden bg-zinc-950 text-zinc-100" style={{ height: '100dvh' }}>
      {idx >= 0 && (
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
      )}
      {(title || hint) && (
        <div className="pointer-events-none absolute inset-x-0 z-10 px-6 text-center" style={{ top: step === 'screen' ? '60%' : '16%' }}>
          {title && <h2 className="text-2xl font-medium text-white">{title}</h2>}
          {hint && <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">{hint}</p>}
        </div>
      )}
      {children}
      {onCancel && (
        <button type="button" onClick={onCancel} className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full px-4 py-1.5 text-sm text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200">{cancelLabel}</button>
      )}
    </div>,
    document.body,
  )
}

function FaceWarning() {
  const s = useEye()
  if (s.face) return null
  return <p role="status" className="absolute inset-x-0 bottom-14 z-10 text-center text-sm text-[color:var(--warn)]">Can&apos;t see your face – look toward the camera.</p>
}

function PositionStep({ onContinue, onCancel }) {
  const s = useEye()
  // Ready after ~1 s of a clearly visible face; a dropped frame or two does not undo it.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let score = 0
    const id = setInterval(() => {
      const snap = eye.getSnapshot()
      const blocked = snap.issues.some((i) => i.severity === 'error')
      score = snap.face && !blocked ? Math.min(8, score + 1) : Math.max(0, score - 2)
      setReady((r) => (r ? score > 0 : score >= 4))
    }, 250)
    return () => clearInterval(id)
  }, [])
  const notes = s.issues.filter((i) => i.id !== 'no-face')
  return (
    <Overlay step="position" onCancel={onCancel}>
      <div className="absolute inset-0 flex items-center justify-center px-6 pb-16 pt-16">
        <div className="grid w-full max-w-4xl items-center gap-10 md:grid-cols-2">
          <div className="relative overflow-hidden rounded-2xl bg-zinc-900">
            <Preview className="aspect-[4/3] w-full" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
              <div className={cx('h-[78%] w-[46%] rounded-[50%] border-2 border-dashed transition-colors duration-300', ready ? 'border-emerald-400' : 'border-white/40')} />
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-medium text-white">Sit the way you type</h2>
            <ul className="mt-4 space-y-1.5 text-sm text-zinc-400">
              <li>Keep your face inside the oval, at your normal distance.</li>
              <li>Light from in front of you works best (not a window behind you).</li>
              <li>Turn your sound on: tones tell you when to look down and back up.</li>
            </ul>
            <div className="mt-6 min-h-[4.5rem] space-y-1.5" aria-live="polite">
              {!s.face && <p className="text-sm text-[color:var(--warn)]">Looking for your face…</p>}
              {s.face && ready && notes.length === 0 && <p className="text-sm text-emerald-400">✓ Looks good.</p>}
              {s.face && notes.map((i) => <p key={i.id} className={cx('text-sm', i.severity === 'error' ? 'text-[color:var(--bad)]' : 'text-[color:var(--warn)]')}>{i.message}</p>)}
            </div>
            <div className="mt-6 flex items-center gap-4">
              <Button size="lg" disabled={!ready} onClick={() => { unlockAudio(); onContinue() }} autoFocus>Start</Button>
              <span className="text-xs text-zinc-500">{s.runtime.phase === 'running' ? 'about 40 seconds' : 'starting camera…'}</span>
            </div>
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
    <Overlay step="screen" title="Follow the dot with your eyes" hint="Keep your head natural, as if you were reading." onCancel={onCancel}>
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

function DownArrow({ className }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v14m0 0-6-6m6 6 6-6" /></svg>
}

/**
 * Two keyboard looks, driven by tones because you cannot watch the screen while looking down:
 * a falling tone = look down now, a rising tone = look back up.
 */
function DownPhase({ onDone, onCancel }) {
  const rounds = 2
  const [round, setRound] = useState(0)
  const [phase, setPhase] = useState('ready') // ready | countdown | capture | between
  const acc = useRef({ segments: [], brightness: [] })
  const started = useRef(false)
  const countPct = useTimeline(phase === 'countdown', COUNTDOWN_MS, () => {
    playCue('down')
    setPhase('capture')
  }, round)
  const count = Math.max(1, 3 - Math.floor(countPct * 3))
  const pct = useTimeline(phase === 'capture', DOWN_MS, () => {
    const r = eye.endCapture()
    started.current = false
    acc.current.segments.push(r.samples)
    if (r.brightness != null) acc.current.brightness.push(r.brightness)
    playCue('up')
    if (round + 1 >= rounds) onDone(acc.current)
    else {
      setRound(round + 1)
      setPhase('between')
    }
  }, round)
  useTimeline(phase === 'between', 2600, () => setPhase('countdown'), round)
  useEffect(() => {
    if (phase === 'capture' && pct * DOWN_MS >= DOWN_SETTLE_MS && !started.current) {
      started.current = true
      eye.beginCapture()
    }
  }, [phase, pct])
  useEffect(() => () => { eye.endCapture() }, [])
  const prompts = [
    'Look down at your keyboard the way you usually do when you peek.',
    'Once more, the other way you peek: if you tilted your head before, keep it still and drop only your eyes (or the reverse).',
  ]
  return (
    <Overlay step="keyboard" title={phase === 'capture' ? 'Look at your keys…' : `Look at your keyboard · ${round + 1} of ${rounds}`} hint={phase === 'capture' ? 'Keep looking until the rising tone.' : prompts[round]} onCancel={onCancel}>
      <div className="absolute inset-x-0 top-[34%] mx-auto flex max-w-sm flex-col items-center px-6 text-center">
        {phase === 'ready' && (
          <>
            <p className="text-sm text-zinc-400">After the countdown you&apos;ll hear a <strong className="text-zinc-200">falling tone</strong>: look down at your keys. A <strong className="text-zinc-200">rising tone</strong> means look back up.</p>
            <Button className="mt-6" size="lg" onClick={() => { unlockAudio(); setPhase('countdown') }} autoFocus>I&apos;m ready</Button>
          </>
        )}
        {phase === 'between' && <p className="text-sm text-zinc-400">Good. The next one starts in a moment…</p>}
        {phase === 'countdown' && <p className="font-serif text-8xl text-emerald-400" aria-live="assertive">{count}</p>}
        {phase === 'capture' && (
          <>
            <DownArrow className="h-14 w-14 animate-bounce text-emerald-400" />
            <div className="mt-6 h-1 w-56 overflow-hidden rounded-full bg-zinc-800"><div className="h-full origin-left bg-emerald-400" style={{ transform: `scaleX(${pct})` }} /></div>
          </>
        )}
      </div>
      <FaceWarning />
    </Overlay>
  )
}

const CHECK_PHASES = [
  { kind: 'screen', ms: 3000, title: 'Look at the screen' },
  { kind: 'down', ms: 3000, title: 'Look at your keyboard', cue: 'down' },
  { kind: 'screen', ms: 3000, title: 'Back to the screen', cue: 'up' },
]

/**
 * A 10-second guided check that measures, on the live tracker, whether a real look down
 * is detected (and how fast), whether looking back up is detected, and whether looking at
 * the screen stays quiet.
 */
function QuickCheck({ onClose, onRetryKeyboard }) {
  const [i, setI] = useState(-1) // -1 intro, 0..2 phases, 3 result
  const samples = useRef([])
  const phaseStart = useRef([])
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (i < 0 || i > 2) return undefined
    phaseStart.current[i] = performance.now()
    const id = setInterval(() => samples.current.push({ phase: i, at: performance.now(), state: eye.getSnapshot().live.state }), 40)
    return () => clearInterval(id)
  }, [i])

  useTimeline(i >= 0 && i <= 2, CHECK_PHASES[Math.max(0, Math.min(2, i))].ms, () => {
    const next = i + 1
    if (next <= 2) {
      if (CHECK_PHASES[next].cue) playCue(CHECK_PHASES[next].cue)
      setI(next)
      return
    }
    playCue('done')
    const s = samples.current
    const first = (phase, test) => s.find((x) => x.phase === phase && test(x))
    const detect = first(1, (x) => x.state === STATE.KEYBOARD)
    const back = first(2, (x) => x.state === STATE.SCREEN)
    const falseAlarm = s.some((x) => x.phase === 0 && x.at - phaseStart.current[0] > 700 && x.state === STATE.KEYBOARD)
    const quiet = s.filter((x) => x.phase === 0 && x.at - phaseStart.current[0] > 700)
    const tracked = quiet.filter((x) => x.state === STATE.SCREEN).length / Math.max(1, quiet.length)
    setResult({
      detectMs: detect ? Math.round(detect.at - phaseStart.current[1]) : null,
      backMs: back ? Math.round(back.at - phaseStart.current[2]) : null,
      falseAlarm,
      tracked,
    })
    setI(3)
  }, i)

  const restart = () => {
    samples.current = []
    phaseStart.current = []
    setResult(null)
    unlockAudio()
    setI(0)
  }

  const pass = result && result.detectMs != null && result.detectMs < 2000 && result.backMs != null && !result.falseAlarm
  const phase = i >= 0 && i <= 2 ? CHECK_PHASES[i] : null
  return (
    <Overlay step="check" onCancel={onClose} cancelLabel={i === 3 ? 'Close' : 'Cancel'}>
      <div className="absolute inset-0 flex items-center justify-center px-6 pb-16 pt-16">
        {i === -1 && (
          <div className="max-w-md text-center">
            <h2 className="text-3xl font-medium text-white">Quick check</h2>
            <p className="mt-3 text-zinc-400">Ten seconds. Look at the screen; at the <strong className="text-zinc-200">falling tone</strong> look down at your keys; at the <strong className="text-zinc-200">rising tone</strong> look back up. It measures whether tracking really follows you.</p>
            <Button className="mt-8" size="lg" onClick={restart} autoFocus>Start check</Button>
          </div>
        )}
        {phase && (
          <div className="flex flex-col items-center text-center">
            <p className="text-xs text-zinc-500">{i + 1} of 3</p>
            <h2 className="mt-2 text-4xl font-medium text-white">{phase.title}</h2>
            {phase.kind === 'down' && <DownArrow className="mt-6 h-12 w-12 animate-bounce text-emerald-400" />}
          </div>
        )}
        {i === 3 && result && (
          <div className="w-full max-w-md">
            <p className={cx('text-xs font-medium', pass ? 'text-emerald-400' : 'text-[color:var(--warn)]')}>{pass ? 'check passed' : 'check not passed'}</p>
            <h2 className="mt-1 text-3xl font-medium text-white">{pass ? 'Tracking follows you' : 'Not quite right yet'}</h2>
            <ul className="mt-6 space-y-2.5 text-sm">
              <CheckRow ok={result.detectMs != null && result.detectMs < 2000} text={result.detectMs != null ? `Saw you look down after ${(result.detectMs / 1000).toFixed(1)} s` : 'Did not see you look down'} />
              <CheckRow ok={result.backMs != null} text={result.backMs != null ? `Saw you look back up after ${(result.backMs / 1000).toFixed(1)} s` : 'Did not see you look back up'} />
              <CheckRow ok={!result.falseAlarm} text={result.falseAlarm ? 'Thought you looked down while you were looking at the screen' : 'Stayed quiet while you looked at the screen'} />
            </ul>
            {!pass && (
              <p className="mt-5 text-sm text-zinc-400">
                {result.detectMs == null
                  ? 'Redo the keyboard step and look down more clearly (as if reading a key label). Good light on your face also helps.'
                  : result.falseAlarm
                    ? 'Use “I’m looking at the screen” in Settings to teach it your normal reading posture, or redo the calibration.'
                    : 'Try once more – if it keeps failing, redo the keyboard step.'}
              </p>
            )}
            <div className="mt-8 flex flex-wrap gap-3">
              {pass ? <Button size="lg" onClick={onClose} autoFocus>Done</Button> : <Button size="lg" onClick={restart} autoFocus>Try again</Button>}
              {!pass && onRetryKeyboard && <Button variant="secondary" onClick={onRetryKeyboard}>Redo keyboard step</Button>}
              {pass && <Button variant="ghost" onClick={restart}>Run again</Button>}
            </div>
          </div>
        )}
      </div>
      {i >= 0 && i <= 2 && <FaceWarning />}
    </Overlay>
  )
}

function CheckRow({ ok, text }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className={cx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs', ok ? 'bg-emerald-400 text-[color:var(--on-accent)]' : 'bg-[color:var(--bad)] text-white')}>{ok ? '✓' : '×'}</span>
      <span className="text-zinc-200">{text}</span>
    </li>
  )
}

function ResultStep({ result, onCheck, onRetryKeyboard, onRecalibrate, onSkip, onClose }) {
  const q = result.quality
  const good = result.ok
  const kept = !good && result.keptPrevious
  return (
    <Overlay step="keyboard" onCancel={good || kept ? onClose : onSkip} cancelLabel={good ? 'Skip the check' : kept ? 'Keep the previous calibration' : 'Cancel'}>
      <div className="absolute inset-0 flex items-center justify-center overflow-y-auto px-6 pb-16 pt-16">
        <div className="w-full max-w-lg">
          <p className={cx('text-xs font-medium', good ? 'text-emerald-400' : 'text-[color:var(--warn)]')}>{good ? 'calibration saved' : kept ? 'not saved · your previous calibration is still active' : 'calibration not usable'}</p>
          <h2 className="mt-1 text-3xl font-medium text-white">{good ? 'Calibrated' : "It can't tell your two looks apart yet"}</h2>
          <p className="mt-2 text-sm text-zinc-400">{describeLevel(q.level)}</p>
          {q.dPrime != null && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">Details</summary>
              <dl className="mt-3 grid grid-cols-3 gap-4">
                <div><dt className="text-xs text-zinc-500">separation (d′)</dt><dd className="tabular-nums text-zinc-100">{q.dPrime}</dd></div>
                <div><dt className="text-xs text-zinc-500">screen frames misread</dt><dd className="tabular-nums text-zinc-100">{Math.round(Math.max(q.falsePositive, q.cvFalsePositive ?? 0) * 100)}%</dd></div>
                <div><dt className="text-xs text-zinc-500">keyboard frames missed</dt><dd className="tabular-nums text-zinc-100">{Math.round(Math.max(q.falseNegative, q.cvFalseNegative ?? 0) * 100)}%</dd></div>
              </dl>
              <p className="mt-2 text-xs text-zinc-500">Measured on the calibration itself (held-out halves included), so real typing can be a little worse.</p>
            </details>
          )}
          {(q.issues?.length > 0 || !good) && (
            <ul className="mt-6 space-y-1.5 text-sm text-zinc-300">
              {q.issues?.map((i) => <li key={i.id} className={i.severity === 'error' ? 'text-[color:var(--bad)]' : i.severity === 'warn' ? 'text-[color:var(--warn)]' : 'text-zinc-400'}>• {i.message}</li>)}
              {!good && <li>• At the falling tone, look clearly down at your keys, as if reading a key label – a slight glance is too small to learn from.</li>}
              {!good && <li>• Put the camera at the top of the screen with your whole face in view, lit from the front.</li>}
            </ul>
          )}
          {good && <p className="mt-6 text-sm text-zinc-300">Now a 10-second check to confirm it really follows your eyes.</p>}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {good ? <Button size="lg" onClick={onCheck} autoFocus>Run the check</Button> : <Button size="lg" onClick={onRetryKeyboard} autoFocus>Redo the keyboard step</Button>}
            <Button variant="secondary" onClick={onRecalibrate}>{good ? 'Recalibrate' : 'Start over'}</Button>
            {!good && !kept && <Button variant="ghost" onClick={onSkip}>Continue without eye tracking</Button>}
          </div>
        </div>
      </div>
    </Overlay>
  )
}

const SIGNAL_LABEL = { pitch: 'head tilt', gazeV: 'iris height', gazeLid: 'iris between lids', lidTop: 'upper eyelid', openness: 'eye opening', lookDown: 'eye direction', blink: 'lid closure' }

function Meter({ value, marker = null, label }) {
  const v = Math.max(0, Math.min(1, value ?? 0))
  return (
    <div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-zinc-800" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-400 transition-[width] duration-150 ease-out" style={{ width: `${v * 100}%` }} />
        {marker != null && <div className="absolute inset-y-0 w-0.5 bg-zinc-300" style={{ left: `${marker * 100}%` }} />}
      </div>
    </div>
  )
}

/** Live view of the tracker, with ways to correct it on the spot. */
function LiveCheck({ onQuickCheck }) {
  const s = useEye()
  const [busy, setBusy] = useState(null) // null | 'recenter' | 'screen' | 'down'
  const [msg, setMsg] = useState(null)
  const d = describeEye(s)
  const tone = { good: 'text-emerald-400', bad: 'text-[color:var(--warn)]', info: 'text-zinc-200', warn: 'text-zinc-400', off: 'text-zinc-500' }[d.tone]
  const running = s.runtime.phase === 'running'
  const pK = s.live.pKeyboard

  async function teach(label) {
    unlockAudio()
    setBusy(label)
    setMsg(label === 'down' ? 'At the falling tone, look at your keyboard until the rising tone…' : 'Keep looking at the screen for two seconds…')
    const profile = await eye.teach(label, {
      delayMs: label === 'down' ? 1400 : 200,
      onStart: () => label === 'down' && playCue('down'),
      onEnd: () => playCue(label === 'down' ? 'up' : 'done'),
    })
    setBusy(null)
    setMsg(!profile ? 'Could not see your face clearly – nothing was changed.' : profile.ok ? `Learned. Calibration is now ${profile.quality.level}.` : 'That made the two looks harder to tell apart, so it was not kept.')
  }

  return (
    <section className="card p-6" aria-labelledby="live-h">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 id="live-h" className="font-medium text-white">Live</h3>
          <p className="mt-1 text-sm text-zinc-400">Look at the screen, then at your keys. The label should follow within about half a second.</p>
        </div>
        <Button size="sm" onClick={onQuickCheck} disabled={!running}>Run 10-second check</Button>
      </div>
      <p className={cx('mt-6 font-serif text-3xl', tone)} aria-live="polite">{d.text}</p>
      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-xs text-zinc-500"><span>screen</span><span>keyboard {pK != null ? `· ${Math.round(pK * 100)}%` : ''}</span></div>
        <Meter value={pK} marker={0.9} label="How sure it is that you are looking at the keyboard" />
      </div>

      {s.live.z && Object.keys(s.live.z).length > 0 && (
        <details className="mt-5 text-xs">
          <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">Signals</summary>
          <dl className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {Object.entries(s.live.z).map(([k, v]) => (
              <div key={k} className="flex items-center gap-3">
                <dt className="w-28 text-zinc-500">{SIGNAL_LABEL[k] ?? k}</dt>
                <dd className="flex-1"><Meter value={(v + 0.3) / 1.6} label={SIGNAL_LABEL[k] ?? k} /></dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      <div className="mt-6 border-t border-zinc-800 pt-5">
        <p className="text-sm text-zinc-200">Getting it wrong?</p>
        <p className="mt-0.5 text-xs text-zinc-500">Teach it. Each press adds two seconds of your real posture to the calibration and refits it.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={!running || busy} onClick={() => teach('screen')}>{busy === 'screen' ? 'Learning…' : "I'm looking at the screen"}</Button>
          <Button size="sm" variant="secondary" disabled={!running || busy} onClick={() => teach('down')}>{busy === 'down' ? 'Listen for the tone…' : "I'll look at the keyboard"}</Button>
          <Button size="sm" variant="ghost" disabled={!running || busy} onClick={async () => { setBusy('recenter'); setMsg('Keep looking at the screen…'); const ok = await eye.recenter(); setBusy(null); setMsg(ok ? 'Re-centred to your current posture.' : 'Could not see your face clearly.') }}>I moved – re-centre</Button>
        </div>
        {msg && <p role="status" className="mt-2 text-xs text-zinc-400">{msg}</p>}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600">
        <span>{s.runtime.fps ? `${s.runtime.fps.toFixed(0)} fps` : '–'} · {s.runtime.inferenceMs ? `${s.runtime.inferenceMs.toFixed(0)} ms per frame` : '–'} · {s.runtime.thread === 'worker' ? 'background thread' : 'main thread'}</span>
        <button type="button" className="underline hover:text-zinc-400" onClick={async () => { try { await navigator.clipboard.writeText(JSON.stringify(eye.diagnostics(), null, 1)); setMsg('Diagnostics copied (numbers only, no images).') } catch { setMsg('Could not copy to the clipboard.') } }}>copy diagnostics</button>
      </div>
    </section>
  )
}

export default function EyeSetup() {
  const s = useEye()
  const [step, setStep] = useState('idle') // idle | position | screen | down | result | check
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const data = useRef({ screenSegments: [], downSegments: [], brightness: [] })

  const close = useCallback(() => {
    eye.endCapture()
    eye.setMode('idle')
    setStep('idle')
    // cancelled before any usable calibration exists: switch the camera off straight away
    if (!eye.getSnapshot().calibrated) eye.setSettings({ enabled: false })
  }, [])
  useEffect(() => () => { eye.setMode('idle') }, [])
  // Hold the camera for the whole flow (calibration or check); it is released a few
  // seconds after the flow ends unless something else (the live view) still uses it.
  const inFlow = step !== 'idle'
  useEffect(() => (inFlow ? eye.acquire() : undefined), [inFlow])

  async function begin() {
    setError(null)
    unlockAudio()
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
  const running = s.runtime.phase === 'running'
  const statusText = !s.settings.enabled
    ? 'Off'
    : s.calibrated
      ? `On · calibration ${level}`
      : level === 'insufficient' || level === 'poor'
        ? 'Calibration not usable yet'
        : 'Not calibrated'

  return (
    <div className="space-y-4">
      {step === 'position' && <PositionStep onCancel={close} onContinue={() => { data.current = { screenSegments: [], downSegments: [], brightness: [] }; eye.setMode('idle'); setStep('screen') }} />}
      {step === 'screen' && <ScreenPhase onCancel={close} onDone={(r) => { data.current.screenSegments = r.segments; data.current.brightness = r.brightness; setStep('down') }} />}
      {step === 'down' && <DownPhase onCancel={close} onDone={(r) => { data.current.downSegments = r.segments; data.current.brightness = [...data.current.brightness, ...r.brightness]; finish() }} />}
      {step === 'result' && result && (
        <ResultStep
          result={result}
          onCheck={() => setStep('check')}
          onClose={() => setStep('idle')}
          onRetryKeyboard={() => setStep('down')}
          onRecalibrate={() => { eye.setMode('positioning'); setStep('position') }}
          onSkip={() => { eye.setSettings({ enabled: false }); setStep('idle') }}
        />
      )}
      {step === 'check' && <QuickCheck onClose={() => setStep('idle')} onRetryKeyboard={() => setStep('down')} />}

      <section className="card p-6" aria-labelledby="eye-h">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <h3 id="eye-h" className="text-lg font-medium text-white">Eye tracking</h3>
            <p className="mt-1 text-sm text-zinc-400">Notices when you look down at your keyboard while typing. Everything runs in this browser tab: no video, images or face data are ever uploaded or saved.</p>
          </div>
          <span className={cx('rounded-full px-3 py-1 text-xs', s.calibrated && s.settings.enabled ? 'bg-emerald-400/15 text-emerald-400' : 'bg-zinc-800 text-zinc-400')}>{statusText}</span>
        </div>

        {error && <Notice tone="bad" className="mt-4" title="Could not start the camera">{error}</Notice>}
        {s.runtime.phase === 'error' && step === 'idle' && <Notice tone="warn" className="mt-4">{s.runtime.error?.message}</Notice>}

        {s.profile?.quality && step === 'idle' && (
          <p className="mt-4 text-sm text-zinc-300">
            {describeLevel(level)}
            {s.profile.createdAt && <span className="text-zinc-500"> · calibrated {new Date(s.profile.createdAt).toLocaleDateString()}</span>}
          </p>
        )}
        {s.live.drift > 0.3 && running && <Notice tone="warn" className="mt-4">Your posture seems to have changed since calibration. Use “I moved – re-centre” below if it gets things wrong.</Notice>}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={begin}>{s.calibrated ? 'Recalibrate' : s.profile ? 'Calibrate again' : 'Turn on & calibrate'}</Button>
          {s.settings.enabled && <Button variant="ghost" onClick={() => eye.setSettings({ enabled: false })}>Turn off</Button>}
          {!s.settings.enabled && s.calibrated && <Button variant="secondary" onClick={() => eye.setSettings({ enabled: true })}>Turn on</Button>}
        </div>

        {s.calibrated && (
          <div className="mt-6 grid gap-4 border-t border-zinc-800 pt-5 sm:grid-cols-3">
            <label className="text-sm text-zinc-400">Sensitivity
              <select value={s.settings.sensitivity} onChange={(e) => eye.setSettings({ sensitivity: e.target.value })} className="mt-1.5 block w-full rounded-lg bg-zinc-900 px-3 py-2 text-zinc-200">
                <option value="strict">Strict – counts quick glances</option>
                <option value="balanced">Balanced</option>
                <option value="relaxed">Relaxed – only longer looks</option>
              </select>
            </label>
            <label className="flex items-center gap-2.5 text-sm text-zinc-300 sm:pt-6"><input type="checkbox" className="h-4 w-4 accent-[color:var(--accent)]" checked={s.settings.hints} onChange={(e) => eye.setSettings({ hints: e.target.checked })} /> “Eyes up” reminder while typing</label>
            <label className="flex items-center gap-2.5 text-sm text-zinc-300 sm:pt-6"><input type="checkbox" className="h-4 w-4 accent-[color:var(--accent)]" checked={s.settings.showPreview} onChange={(e) => eye.setSettings({ showPreview: e.target.checked })} /> Small camera preview</label>
          </div>
        )}
      </section>

      {s.calibrated && s.settings.enabled && <LiveStart />}
      {step === 'idle' && s.calibrated && s.settings.enabled && <LiveCheck onQuickCheck={() => setStep('check')} />}
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
