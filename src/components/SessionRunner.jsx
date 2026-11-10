import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import EyeStatus from './EyeStatus.jsx'
import Keyboard from './Keyboard.jsx'
import Results from './Results.jsx'
import TypingArea from './TypingArea.jsx'
import { Button, Notice, ProgressBar } from './ui.jsx'
import { mergeLayoutObservations, newId, saveSession } from '../data/repo.js'
import { useTraining } from '../data/trainingContext.js'
import { TypingEngine } from '../engine/typingEngine.js'
import { STATE } from '../eye/classifier.js'
import { usePrefs } from '../lib/prefs.js'
import { playKey, playTick } from '../lib/sound.js'
import { eye } from '../eye/session.js'
import { useEye, useEyeTracking } from '../eye/useEye.js'
import { analyzeKeystrokes, attributePeeks } from '../training/analysis.js'
import { FINGERS, ISO_ONLY_CODES, charToKey, profileFingerOfCode } from '../training/keyboard.js'
import { evaluateRun } from '../training/lessons.js'

const MIN_RECORD_MS = 5000
const MIN_RECORD_KEYS = 10

/** Re-reads the engine on a timer so the HUD updates without re-rendering the text. */
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
  const { live, wi, started } = useEngineClock(engine, 200)
  const remaining = timeLimitMs ? Math.max(0, Math.ceil((timeLimitMs - live.elapsedMs) / 1000)) : null
  return (
    <div className="flex items-end gap-6 font-mono" aria-label="Live statistics">
      {timeLimitMs ? (
        <div><p className="font-sans text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">Time</p><p className="gradient-text text-4xl font-semibold tabular-nums">{started ? remaining : timeLimitMs / 1000}</p></div>
      ) : (
        <div><p className="font-sans text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">Words</p><p className="gradient-text text-4xl font-semibold tabular-nums">{wi}/{totalWords}</p></div>
      )}
      <div><p className="font-sans text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">WPM</p><p className="text-4xl font-semibold tabular-nums text-white">{started ? live.wpm : '–'}</p></div>
      <div><p className="font-sans text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">Acc</p><p className="text-4xl font-semibold tabular-nums text-white">{live.accuracy == null ? '–' : `${Math.round(live.accuracy)}%`}</p></div>
    </div>
  )
}

function RunProgress({ engine, timeLimitMs, totalWords }) {
  const { live, wi } = useEngineClock(engine, 250)
  return <ProgressBar value={timeLimitMs ? live.elapsedMs : wi} max={timeLimitMs ?? totalWords} label="Progress" />
}

function EyesUpHint() {
  const e = useEye()
  if (!e.settings.hints || e.live.state !== STATE.KEYBOARD || e.runtime.phase !== 'running') return <span className="h-7" />
  return (
    <span role="status" className="rounded-full bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-200 transition-opacity">
      Eyes up – trust your fingers
    </span>
  )
}

/**
 * Runs one typing exercise end to end: engine, input, eye tracking, results and persistence.
 *
 * @param {object} props
 * @param {(attempt:number)=>{words:string[], timeLimitMs?:number, supplier?:Function}} props.makeRun  builds a run; called again on restart
 * @param {object} props.meta  { mode, modeKey?, lessonId?, practiceKind?, title? }
 * @param {object} [props.lesson]
 */
export default function SessionRunner({ makeRun, meta, lesson = null, showKeyboard = false, guideMode = null, metronome = false, Actions = null, actionsProps = null }) {
  const { profile, sessions, refresh } = useTraining()
  const prefs = usePrefs()
  const [hesitating, setHesitating] = useState(true)
  const hesitateTimer = useRef(null)
  const eyeState = useEyeTracking(true)
  const [attempt, setAttempt] = useState(0)
  const [, bump] = useReducer((x) => x + 1, 0)
  const [focused, setFocused] = useState(true)
  const [outcome, setOutcome] = useState(null) // { engine, result, check, mistakes, saveStatus }
  const inputRef = useRef(null)
  const obs = useRef({ pairs: {}, iso: false })
  const composing = useRef(false)
  const handled = useRef(false)
  const eyeEngine = useRef(null)
  const finalized = useRef(null)

  const run = useMemo(() => makeRun(attempt), [makeRun, attempt])
  const engine = useMemo(
    () =>
      new TypingEngine({
        words: run.words,
        mode: meta.mode,
        timeLimitMs: run.timeLimitMs ?? null,
        fixedLength: !run.timeLimitMs,
        supplier: run.supplier ?? null,
      }),
    [run, meta.mode],
  )
  const totalWords = engine.words.length
  const shown = outcome && outcome.engine === engine ? outcome : null

  useEffect(() => {
    inputRef.current?.focus()
  }, [engine])

  const restart = useCallback(() => {
    delete document.documentElement.dataset.typing
    setHesitating(true)
    setAttempt((a) => a + 1)
    eye.endSession()
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const ensureEye = useCallback(
    (t) => {
      if (eyeEngine.current !== engine) {
        eyeEngine.current = engine
        eye.startSession(t)
      }
    },
    [engine],
  )

  /** Called from event handlers right after the engine finishes. */
  const finalize = useCallback(() => {
    if (finalized.current === engine) return
    finalized.current = engine
    const tracking = eye.endSession(performance.now())
    eyeEngine.current = null
    const summary = engine.summary()
    const analysis = analyzeKeystrokes(engine.log, profile)
    if (tracking.status === 'measured' || tracking.status === 'partial') analysis.peek = attributePeeks(engine.log, tracking.peekTimes, profile)
    delete document.documentElement.dataset.typing
    const keystrokes = summary.correctKeys + summary.incorrectKeys
    const check = lesson ? evaluateRun(lesson, summary) : null
    const mistakes = Object.entries(analysis.keys)
      .filter(([, s]) => s.err > 0)
      .map(([code, s]) => ({ code, err: s.err, n: s.n }))
      .sort((a, b) => b.err - a.err)
      .slice(0, 5)
    const result = { ...summary, tracking }
    const tooShort = summary.durationMs < MIN_RECORD_MS || keystrokes < MIN_RECORD_KEYS
    const peekCodes = Object.entries(analysis.peek?.keys ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([code, n]) => ({ code, n }))
    setOutcome({
      engine, result, check, mistakes, peekCodes,
      saveStatus: tooShort ? 'Too short to record – only runs of at least 5 seconds count toward your stats.' : 'Saving…',
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
          : res.cloud === 'signed-out' ? 'Saved on this device. Sign in to keep your history across devices.'
          : res.cloud === 'error' ? 'Saved on this device; syncing to your account failed and will be retried from Analyze.'
          : 'Saved on this device.'
      setOutcome((o) => (o && o.engine === engine ? { ...o, saveStatus } : o))
      refresh()
    })
  }, [engine, lesson, meta, profile, refresh])

  /** Apply the result of an engine mutation. */
  const settle = useCallback(
    (changed) => {
      if (!changed) return
      bump()
      if (engine.finished) {
        finalize()
        return
      }
      // focus mode: fade the chrome while typing; smart guide: hide the hint until you hesitate
      if (prefs.focusMode && engine.started) document.documentElement.dataset.typing = '1'
      setHesitating(false)
      clearTimeout(hesitateTimer.current)
      hesitateTimer.current = setTimeout(() => setHesitating(true), 1100)
    },
    [engine, finalize, prefs.focusMode],
  )

  // timer for timed tests
  useEffect(() => {
    if (!run.timeLimitMs) return undefined
    const id = setInterval(() => {
      if (engine.started && !engine.finished) settle(engine.tick(performance.now()))
    }, 100)
    return () => clearInterval(id)
  }, [engine, run.timeLimitMs, settle])

  // ---- input -----------------------------------------------------------------
  const onKeyDown = useCallback(
    (e) => {
      handled.current = false
      if (engine.finished) return
      if (e.isComposing || composing.current || e.key === 'Process' || e.key === 'Dead' || e.key === 'Unidentified') return
      if (e.key === 'Escape') {
        e.preventDefault()
        restart()
        return
      }
      if (e.key === 'Tab') return // keep Tab for focus navigation (accessibility)
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
    },
    [engine, restart, settle, ensureEye, prefs.sound],
  )

  // Virtual keyboards / IME: keydown reports no usable key, so take text from input events.
  const onInput = useCallback(
    (e) => {
      const ta = e.currentTarget
      const text = ta.value
      ta.value = ''
      if (composing.current || handled.current || !text || engine.finished) return
      const t = performance.now()
      if (!engine.started) ensureEye(t)
      let changed = false
      for (const ch of text) if (engine.insertChar(ch, { t, code: null })) changed = true
      settle(changed)
    },
    [engine, settle, ensureEye],
  )

  const onCompositionEnd = useCallback(
    (e) => {
      composing.current = false
      const t = performance.now()
      if (!engine.started && e.data) ensureEye(t)
      let changed = false
      for (const ch of e.data ?? '') if (engine.insertChar(ch, { t, code: null })) changed = true
      e.currentTarget.value = ''
      settle(changed)
    },
    [engine, settle, ensureEye],
  )

  // leave focus mode on mouse movement, restart or unmount
  useEffect(() => {
    const clear = () => { delete document.documentElement.dataset.typing }
    window.addEventListener('mousemove', clear)
    return () => {
      window.removeEventListener('mousemove', clear)
      clear()
      clearTimeout(hesitateTimer.current)
    }
  }, [engine])

  // optional metronome for rhythm drills: one tick per key at ~90% of your usual pace
  const [metroOn, setMetroOn] = useState(false)
  const avgWpm = useMemo(() => {
    const r = sessions.slice(-10).map((s) => s.wpm).filter((v) => v > 0)
    return r.length >= 3 ? r.reduce((a, b) => a + b, 0) / r.length : null
  }, [sessions])
  const bestWpm = useMemo(() => (sessions.length >= 3 ? Math.max(...sessions.map((s) => s.wpm)) : null), [sessions])
  const metroMs = Math.round(60000 / (Math.max(15, (avgWpm ?? 30) * 0.9) * 5))
  useEffect(() => {
    if (!metronome || !metroOn) return undefined
    let n = 0
    const id = setInterval(() => playTick(n++ % 4 === 0), metroMs)
    return () => clearInterval(id)
  }, [metronome, metroOn, metroMs, engine])

  // typing anywhere on the page focuses the input
  useEffect(() => {
    const onWindowKey = (e) => {
      if (document.activeElement === inputRef.current) return
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onWindowKey)
    return () => window.removeEventListener('keydown', onWindowKey)
  }, [])

  // ---- derived UI ----------------------------------------------------------------
  const nextChar = !engine.finished ? engine.currentWord[engine.currentTyped.length] ?? ' ' : null
  const nextKey = nextChar ? charToKey(profile.layout, nextChar) : null
  const nextFinger = nextKey ? profileFingerOfCode(profile, nextKey.code) : null
  const shiftCode = nextKey?.shift ? (nextFinger?.[0] === 'l' ? 'ShiftRight' : 'ShiftLeft') : null
  const targets = nextKey ? [nextKey.code, ...(shiftCode ? [shiftCode] : [])] : []

  const ghostWpm = meta.mode === 'lesson' || prefs.ghost === 'off' ? null : prefs.ghost === 'best' ? bestWpm : avgWpm
  const guide = guideMode ?? (showKeyboard ? (prefs.guide === 'off' ? 'smart' : prefs.guide) : 'off')
  const showTarget = guide === 'always' || (guide === 'smart' && hesitating)

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
            <Button onClick={restart} autoFocus>Try again</Button>
            {Actions && <Actions {...actionsProps} result={shown.result} check={shown.check} />}
          </>
        }
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl animate-fade-up">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <LiveHud engine={engine} timeLimitMs={run.timeLimitMs} totalWords={totalWords} />
        <div className="flex flex-col items-end gap-1.5">
          <EyeStatus />
          <EyesUpHint />
        </div>
      </div>
      <RunProgress engine={engine} timeLimitMs={run.timeLimitMs} totalWords={totalWords} />

      <div className="card relative mt-4 p-6 sm:p-9" style={{ animation: 'none' }}>
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
        <TypingArea engine={engine} version={engine.version} focused={focused} onFocusRequest={() => inputRef.current?.focus()} ghostWpm={ghostWpm} ghostLabel={prefs.ghost === 'best' ? 'your best' : 'your average'} />
      </div>

      <div className="chrome mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
        <span><kbd className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-zinc-300">Esc</kbd> restart · <kbd className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-zinc-300">Ctrl</kbd>+<kbd className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-zinc-300">⌫</kbd> delete word</span>
        <span className="flex items-center gap-1">
          {metronome && <Button variant={metroOn ? 'secondary' : 'ghost'} size="sm" aria-pressed={metroOn} onClick={() => setMetroOn((v) => !v)}>{metroOn ? `Metronome on · ${metroMs} ms` : 'Metronome'}</Button>}
          <Button variant="ghost" size="sm" onClick={restart}>Restart</Button>
        </span>
      </div>

      {guide !== 'off' && (
        <div className={`kb-guide chrome-keep mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 ${showTarget ? '' : 'resting'}`}>
          <p className="mb-3 h-5 text-sm text-zinc-400">
            {!showTarget ? <span className="text-zinc-600">Hints appear only when you pause – trust your fingers.</span> : nextFinger && nextKey
              ? <>Next key: use your <strong className="text-white">{FINGERS[nextFinger].label.toLowerCase()}</strong>{nextKey.shift ? ' (and the opposite Shift)' : ''}</>
              : engine.currentTyped.length >= engine.currentWord.length ? 'Space with your thumb' : ''}
          </p>
          <Keyboard compact profile={profile} highlight={lesson?.keys ?? null} target={showTarget ? targets : []} />
        </div>
      )}

      {eyeState.settings.enabled && eyeState.runtime.phase === 'error' && (
        <Notice tone="warn" className="mt-4" title="Eye tracking is unavailable">{eyeState.runtime.error?.message} You can keep typing – this run just won&apos;t measure keyboard-looking.</Notice>
      )}
    </div>
  )
}
