import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import EyeStatus from './EyeStatus.jsx'
import Keyboard from './Keyboard.jsx'
import Results from './Results.jsx'
import TypingArea from './TypingArea.jsx'
import { Button, Notice, ProgressBar } from './ui.jsx'
import { mergeLayoutObservations, newId, saveSession } from '../data/repo.js'
import { useTraining } from '../data/trainingContext.js'
import { TypingEngine } from '../engine/typingEngine.js'
import { STATE } from '../eye/classifier.js'
import { eye } from '../eye/session.js'
import { useEye, useEyeTracking } from '../eye/useEye.js'
import { usePrefs } from '../lib/prefs.js'
import { playKey, playTick } from '../lib/sound.js'
import { analyzeKeystrokes, attributePeeks } from '../training/analysis.js'
import { FINGERS, ISO_ONLY_CODES, charToKey, profileFingerOfCode } from '../training/keyboard.js'
import { evaluateRun } from '../training/lessons.js'

const MIN_RECORD_MS = 5000
const MIN_RECORD_KEYS = 10
const HESITATE_MS = 1100

/** Re-reads the engine on a timer so the HUD updates without touching the typing path. */
function useEngineClock(engine, intervalMs) {
  const [snap, setSnap] = useState(() => ({ live: engine.live(0), wi: engine.wi, started: engine.started }))
  useEffect(() => {
    const read = () => setSnap({ live: engine.live(performance.now()), wi: engine.wi, started: engine.started })
    read()
    const id = setInterval(read, intervalMs)
    return () => clearInterval(id)
  }, [engine, intervalMs])
  return snap
}

function LiveHud({ engine, timeLimitMs, totalWords }) {
  const { live, wi, started } = useEngineClock(engine, 250)
  const remaining = timeLimitMs ? Math.max(0, Math.ceil((timeLimitMs - live.elapsedMs) / 1000)) : null
  const label = 'text-[0.68rem] font-medium uppercase tracking-[0.14em] text-zinc-500'
  const value = 'font-mono text-3xl font-medium tabular-nums'
  return (
    <div className="flex items-end gap-7" aria-label="Live statistics">
      {timeLimitMs
        ? <div><p className={label}>time</p><p className={`${value} text-emerald-400`}>{started ? remaining : timeLimitMs / 1000}</p></div>
        : <div><p className={label}>words</p><p className={`${value} text-emerald-400`}>{wi}/{totalWords}</p></div>}
      <div><p className={label}>wpm</p><p className={`${value} text-zinc-100`}>{started ? live.wpm : '–'}</p></div>
      <div><p className={label}>acc</p><p className={`${value} text-zinc-100`}>{live.accuracy == null ? '–' : `${Math.round(live.accuracy)}%`}</p></div>
    </div>
  )
}

function RunProgress({ engine, timeLimitMs, totalWords }) {
  const { live, wi } = useEngineClock(engine, 250)
  return <ProgressBar value={timeLimitMs ? live.elapsedMs : wi} max={timeLimitMs ?? totalWords} label="Progress" />
}

function EyesUpHint() {
  const e = useEye()
  if (!e.settings.hints || e.live.state !== STATE.KEYBOARD || e.runtime.phase !== 'running') return <span className="h-6" />
  return <span role="status" className="h-6 text-xs font-medium text-amber-300">eyes up – trust your fingers</span>
}

/**
 * On-screen keyboard with the next key highlighted. Updated imperatively (class toggles on
 * existing key elements) so showing a hint costs no React render.
 */
const KeyGuide = forwardRef(function KeyGuide({ profile, highlight, mode }, ref) {
  const box = useRef(null)
  const text = useRef(null)
  const lit = useRef([])

  useImperativeHandle(ref, () => {
    const clear = () => {
      for (const el of lit.current) el.classList.remove('target')
      lit.current = []
    }
    return {
      rest() {
        clear()
        box.current?.classList.add('resting')
        if (text.current) text.current.textContent = 'Hints appear when you pause – trust your fingers.'
      },
      show(engine) {
        clear()
        const root = box.current
        if (!root || engine.finished) return
        root.classList.remove('resting')
        const atEnd = engine.currentTyped.length >= engine.currentWord.length
        const ch = atEnd ? ' ' : engine.currentWord[engine.currentTyped.length]
        const key = charToKey(profile.layout, ch)
        if (!key) {
          if (text.current) text.current.textContent = ''
          return
        }
        const finger = profileFingerOfCode(profile, key.code)
        const codes = [key.code]
        if (key.shift) codes.push(finger?.[0] === 'l' ? 'ShiftRight' : 'ShiftLeft')
        for (const c of codes) {
          const el = root.querySelector(`[data-code="${c}"]`)
          if (el) {
            el.classList.add('target')
            lit.current.push(el)
          }
        }
        if (text.current) {
          text.current.textContent = atEnd
            ? 'Space – with your thumb'
            : `Next: ${finger ? FINGERS[finger].label.toLowerCase() : ''}${key.shift ? ' + opposite Shift' : ''}`
        }
      },
    }
  }, [profile])

  return (
    <div ref={box} className={`kb-guide mt-8 ${mode === 'smart' ? 'resting' : ''}`}>
      <p ref={text} className="mb-3 h-5 text-sm text-zinc-500" />
      <Keyboard compact profile={profile} highlight={highlight} />
    </div>
  )
})

/**
 * Runs one typing exercise end to end: engine, input, eye tracking, results and persistence.
 *
 * @param {object} props
 * @param {(attempt:number)=>{words:string[], timeLimitMs?:number, supplier?:Function}} props.makeRun  builds a run; called again on restart
 * @param {object} props.meta  { mode, modeKey?, lessonId?, practiceKind?, title? }
 */
export default function SessionRunner({ makeRun, meta, lesson = null, showKeyboard = false, guideMode = null, metronome = false, Actions = null, actionsProps = null }) {
  const { profile, sessions, refresh } = useTraining()
  const prefs = usePrefs()
  const eyeState = useEyeTracking(true)
  const [attempt, setAttempt] = useState(0)
  const [focused, setFocused] = useState(true)
  const [outcome, setOutcome] = useState(null) // { engine, result, check, mistakes, peekCodes, saveStatus }
  const [metroOn, setMetroOn] = useState(false)
  const inputRef = useRef(null)
  const surfaceRef = useRef(null)
  const guideRef = useRef(null)
  const hesitateTimer = useRef(null)
  const obs = useRef({ pairs: {}, iso: false })
  const composing = useRef(false)
  const handled = useRef(false)
  const eyeEngine = useRef(null)
  const finalized = useRef(null)

  const run = useMemo(() => makeRun(attempt), [makeRun, attempt])
  const engine = useMemo(
    () => new TypingEngine({ words: run.words, mode: meta.mode, timeLimitMs: run.timeLimitMs ?? null, fixedLength: !run.timeLimitMs, supplier: run.supplier ?? null }),
    [run, meta.mode],
  )
  const totalWords = engine.words.length
  const shown = outcome && outcome.engine === engine ? outcome : null

  const avgWpm = useMemo(() => {
    const r = sessions.slice(-10).map((s) => s.wpm).filter((v) => v > 0)
    return r.length >= 3 ? r.reduce((a, b) => a + b, 0) / r.length : null
  }, [sessions])
  const bestWpm = useMemo(() => (sessions.length >= 3 ? Math.max(...sessions.map((s) => s.wpm)) : null), [sessions])
  const ghostWpm = meta.mode === 'lesson' || prefs.ghost === 'off' ? null : prefs.ghost === 'best' ? bestWpm : avgWpm
  const guide = guideMode ?? (showKeyboard ? prefs.guide : 'off')

  const clearFocusMode = () => { delete document.documentElement.dataset.typing }

  useEffect(() => {
    inputRef.current?.focus()
    if (guide === 'always') guideRef.current?.show(engine)
  }, [engine, guide])

  const restart = useCallback(() => {
    clearFocusMode()
    clearTimeout(hesitateTimer.current)
    setAttempt((a) => a + 1)
    eye.endSession()
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const ensureEye = useCallback((t) => {
    if (eyeEngine.current !== engine) {
      eyeEngine.current = engine
      eye.startSession(t)
    }
  }, [engine])

  /** Called from event handlers right after the engine finishes. */
  const finalize = useCallback(() => {
    if (finalized.current === engine) return
    finalized.current = engine
    clearFocusMode()
    clearTimeout(hesitateTimer.current)
    const tracking = eye.endSession(performance.now())
    eyeEngine.current = null
    const summary = engine.summary()
    const analysis = analyzeKeystrokes(engine.log, profile)
    if (tracking.status === 'measured' || tracking.status === 'partial') analysis.peek = attributePeeks(engine.log, tracking.peekTimes, profile)
    const keystrokes = summary.correctKeys + summary.incorrectKeys
    const check = lesson ? evaluateRun(lesson, summary) : null
    const mistakes = Object.entries(analysis.keys)
      .filter(([, s]) => s.err > 0)
      .map(([code, s]) => ({ code, err: s.err, n: s.n }))
      .sort((a, b) => b.err - a.err)
      .slice(0, 5)
    const peekCodes = Object.entries(analysis.peek?.keys ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([code, n]) => ({ code, n }))
    const tooShort = summary.durationMs < MIN_RECORD_MS || keystrokes < MIN_RECORD_KEYS
    setOutcome({
      engine, result: { ...summary, tracking }, check, mistakes, peekCodes,
      saveStatus: tooShort ? 'Too short to record – runs need at least 5 seconds to count toward your stats.' : 'Saving…',
    })

    mergeLayoutObservations(obs.current.pairs, obs.current.iso)
    obs.current = { pairs: {}, iso: false }
    if (tooShort) return

    saveSession({
      id: newId(),
      created_at: new Date().toISOString(),
      mode: meta.modeKey ?? meta.mode,
      lesson_id: meta.lessonId ?? null,
      practice_kind: meta.practiceKind ?? null,
      passed: check ? check.passed : null,
      layout: profile.layout,
      wpm: summary.wpm,
      raw_wpm: summary.rawWpm,
      accuracy: summary.accuracy,
      consistency: summary.consistency,
      key_consistency: summary.keyConsistency,
      keyConsistency: summary.keyConsistency,
      duration_seconds: summary.durationMs / 1000,
      keystrokes,
      backspaces: summary.backspaces,
      corrections: summary.corrections,
      wpm_history: summary.wpmHistory,
      analysis,
      tracking,
    }).then((res) => {
      const saveStatus =
        res.cloud === 'saved' ? 'Saved to your account.'
          : res.cloud === 'signed-out' ? 'Saved on this device.'
          : res.cloud === 'error' ? 'Saved on this device; syncing to your account failed.'
          : 'Saved on this device.'
      setOutcome((o) => (o && o.engine === engine ? { ...o, saveStatus } : o))
      refresh()
    })
  }, [engine, lesson, meta, profile, refresh])

  /** After every engine mutation. No React state is touched unless the test just ended. */
  const settle = useCallback((changed) => {
    if (!changed) return
    surfaceRef.current?.update()
    if (engine.finished) {
      finalize()
      return
    }
    if (prefs.focusMode && engine.started) document.documentElement.dataset.typing = '1'
    if (guide === 'always') guideRef.current?.show(engine)
    else if (guide === 'smart') {
      guideRef.current?.rest()
      clearTimeout(hesitateTimer.current)
      hesitateTimer.current = setTimeout(() => guideRef.current?.show(engine), HESITATE_MS)
    }
  }, [engine, finalize, prefs.focusMode, guide])

  // timer for timed tests
  useEffect(() => {
    if (!run.timeLimitMs) return undefined
    const id = setInterval(() => {
      if (engine.started && !engine.finished && engine.tick(performance.now())) finalize()
    }, 100)
    return () => clearInterval(id)
  }, [engine, run.timeLimitMs, finalize])

  // ---- input -----------------------------------------------------------------
  const onKeyDown = useCallback((e) => {
    handled.current = false
    if (engine.finished) return
    if (e.isComposing || composing.current || e.key === 'Process' || e.key === 'Dead' || e.key === 'Unidentified') return
    if (e.key === 'Escape') {
      e.preventDefault()
      restart()
      return
    }
    if (e.key === 'Tab') return // keep Tab for focus navigation; Tab then Enter lands on Restart
    const t = e.timeStamp || performance.now()
    if (e.key === 'Backspace') {
      e.preventDefault()
      handled.current = true
      settle(engine.backspace({ t, word: e.ctrlKey || e.altKey }))
      return
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return // keep browser shortcuts working
    if (e.key.length !== 1) return
    e.preventDefault()
    handled.current = true
    if (!engine.started) ensureEye(t)
    if (e.key !== ' ' && e.code) {
      const k = `${e.code}|${e.key}`
      obs.current.pairs[k] = (obs.current.pairs[k] ?? 0) + 1
    }
    if (ISO_ONLY_CODES.has(e.code)) obs.current.iso = true
    const changed = engine.insertChar(e.key, { t, code: e.code })
    if (changed && prefs.sound !== 'off') playKey(prefs.sound, engine.log[engine.log.length - 1]?.ok !== false)
    settle(changed)
  }, [engine, restart, settle, ensureEye, prefs.sound])

  // Virtual keyboards / IME: keydown reports no usable key, so take text from input events.
  const insertText = useCallback((text) => {
    if (!text || engine.finished) return
    const t = performance.now()
    if (!engine.started) ensureEye(t)
    let changed = false
    for (const ch of text) if (engine.insertChar(ch, { t, code: null })) changed = true
    settle(changed)
  }, [engine, settle, ensureEye])

  const onInput = useCallback((e) => {
    const ta = e.currentTarget
    const text = ta.value
    ta.value = ''
    if (composing.current || handled.current) return
    insertText(text)
  }, [insertText])

  const onCompositionEnd = useCallback((e) => {
    composing.current = false
    insertText(e.data ?? '')
    e.currentTarget.value = ''
  }, [insertText])

  // typing anywhere focuses the input; mouse movement leaves focus mode
  useEffect(() => {
    const onWindowKey = (e) => {
      if (document.activeElement === inputRef.current) return
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onWindowKey)
    window.addEventListener('mousemove', clearFocusMode, { passive: true })
    return () => {
      window.removeEventListener('keydown', onWindowKey)
      window.removeEventListener('mousemove', clearFocusMode)
      clearFocusMode()
      clearTimeout(hesitateTimer.current)
    }
  }, [engine])

  // optional metronome for rhythm drills: one tick per key at ~90% of your usual pace
  const metroMs = Math.round(60000 / (Math.max(15, (avgWpm ?? 30) * 0.9) * 5))
  useEffect(() => {
    if (!metronome || !metroOn) return undefined
    let n = 0
    const id = setInterval(() => playTick(n++ % 4 === 0), metroMs)
    return () => clearInterval(id)
  }, [metronome, metroOn, metroMs, engine])

  if (shown) {
    return (
      <Results
        title={meta.title ?? 'Results'}
        result={shown.result}
        lessonCheck={shown.check}
        mistakeCodes={shown.mistakes}
        peekCodes={shown.peekCodes}
        layout={profile.layout}
        history={sessions}
        saveStatus={shown.saveStatus}
        actions={
          <>
            <Button onClick={restart} autoFocus>Next test</Button>
            {Actions && <Actions {...actionsProps} result={shown.result} check={shown.check} />}
          </>
        }
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <LiveHud engine={engine} timeLimitMs={run.timeLimitMs} totalWords={totalWords} />
        <div className="chrome flex flex-col items-end gap-1">
          <EyeStatus />
          <EyesUpHint />
        </div>
      </div>
      <RunProgress engine={engine} timeLimitMs={run.timeLimitMs} totalWords={totalWords} />

      <div className="relative mt-8">
        <textarea
          ref={inputRef}
          aria-label="Typing input"
          className="absolute left-0 top-0 h-px w-px opacity-0"
          autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false}
          onKeyDown={onKeyDown}
          onInput={onInput}
          onCompositionStart={() => { composing.current = true }}
          onCompositionEnd={onCompositionEnd}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <TypingArea ref={surfaceRef} engine={engine} focused={focused} onFocusRequest={() => inputRef.current?.focus()} ghostWpm={ghostWpm} ghostLabel={prefs.ghost === 'best' ? 'your best' : 'your average'} />
      </div>

      <div className="chrome mt-8 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
        <span><kbd>esc</kbd> restart <span className="mx-1.5 text-zinc-700">/</span> <kbd>ctrl</kbd> + <kbd>backspace</kbd> delete word</span>
        <span className="flex items-center gap-1">
          {metronome && <Button variant={metroOn ? 'secondary' : 'ghost'} size="sm" aria-pressed={metroOn} onClick={() => setMetroOn((v) => !v)}>{metroOn ? `metronome on · ${metroMs} ms` : 'metronome'}</Button>}
          <Button variant="ghost" size="sm" onClick={restart}>restart</Button>
        </span>
      </div>

      {guide !== 'off' && <KeyGuide ref={guideRef} profile={profile} highlight={lesson?.keys ?? null} mode={guide} />}

      {eyeState.settings.enabled && eyeState.runtime.phase === 'error' && (
        <Notice tone="warn" className="mt-6" title="Eye tracking is unavailable">{eyeState.runtime.error?.message} You can keep typing – this run just won&apos;t measure keyboard-looking.</Notice>
      )}
    </div>
  )
}
