import { memo, useCallback, useEffect, useLayoutEffect, useRef } from 'react'

/** One word; re-renders only when its own typed text / state changes. */
const Word = memo(function Word({ word, typed, state, index }) {
  // state: 'future' | 'active' | 'done'
  const letters = []
  const len = Math.max(word.length, typed.length)
  for (let i = 0; i < len; i++) {
    let cls
    const ch = i < word.length ? word[i] : typed[i]
    if (i >= word.length) cls = 'l x' // extra character
    else if (i < typed.length) cls = typed[i] === word[i] ? 'l c' : 'l w'
    else cls = state === 'done' ? 'l m' : 'l'
    letters.push(
      <span key={i} className={cls}>
        {ch}
      </span>,
    )
  }
  const wrong = state === 'done' && typed !== word
  return (
    <span className={wrong ? 'typing-word word-error' : 'typing-word'} data-w={index} data-state={state}>
      {letters}
    </span>
  )
})

/**
 * Renders the words of a TypingEngine with a smooth caret and three-line viewport.
 * `version` changes whenever the engine mutates; caret/scroll are applied directly to the DOM
 * (no React state) so a keystroke costs one or two word re-renders.
 */
export default function TypingArea({ engine, version, focused, onFocusRequest, ghostWpm = null, ghostLabel = 'your pace', blurLabel = 'Click here or start typing to focus' }) {
  const viewportRef = useRef(null)
  const wordsRef = useRef(null)
  const caretRef = useRef(null)
  const idleTimer = useRef(null)
  const ghostRef = useRef(null)
  const firstPlace = useRef(true)

  const placeCaret = useCallback(() => {
    const words = wordsRef.current
    const caret = caretRef.current
    if (!words || !caret || !engine) return
    const wordEl = words.querySelector(`[data-w="${engine.wi}"]`)
    if (!wordEl) return
    const typedLen = engine.currentTyped.length
    const kids = wordEl.children
    let x
    let y
    if (typedLen < kids.length) {
      const k = kids[typedLen]
      x = k.offsetLeft + wordEl.offsetLeft
      y = k.offsetTop + wordEl.offsetTop
    } else {
      const k = kids[kids.length - 1]
      x = (k ? k.offsetLeft + k.offsetWidth : 0) + wordEl.offsetLeft
      y = (k ? k.offsetTop : 0) + wordEl.offsetTop
    }
    const lineH = parseFloat(getComputedStyle(viewportRef.current).lineHeight) || 40
    const line = Math.round(y / lineH)
    const scroll = Math.max(0, line - 1) * lineH
    words.style.transform = `translateY(${-scroll}px)`
    caret.style.transform = `translate(${x - 1}px, ${y}px)`
    if (firstPlace.current) {
      caret.classList.add('snap')
      requestAnimationFrame(() => caret.classList.remove('snap'))
      firstPlace.current = false
    }
  }, [engine])

  useLayoutEffect(() => {
    placeCaret()
    const caret = caretRef.current
    if (caret) {
      caret.classList.remove('idle')
      clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(() => caret.classList.add('idle'), 700)
    }
  }, [version, placeCaret])

  // Pace ghost: a faint marker moving at a steady target speed (your own average or best).
  useEffect(() => {
    const ghost = ghostRef.current
    if (!ghost || !ghostWpm) return undefined
    let raf
    let wi = 0
    let consumed = 0 // characters before word `wi`
    const cps = (ghostWpm * 5) / 60
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const words = wordsRef.current
      if (!words || engine.startedAt == null || engine.finished) {
        ghost.style.opacity = '0'
        return
      }
      const pos = ((performance.now() - engine.startedAt) / 1000) * cps
      while (wi < engine.words.length && pos >= consumed + engine.words[wi].length + 1) {
        consumed += engine.words[wi].length + 1
        wi++
      }
      const el = words.querySelector(`[data-w="${wi}"]`)
      if (!el) {
        ghost.style.opacity = '0'
        return
      }
      const within = pos - consumed
      const idx = Math.min(Math.floor(within), el.children.length - 1)
      const k = el.children[Math.max(0, idx)]
      if (!k) return
      const frac = Math.min(1, within - idx)
      ghost.style.opacity = ''
      ghost.style.transform = `translate(${el.offsetLeft + k.offsetLeft + frac * k.offsetWidth}px, ${el.offsetTop + k.offsetTop}px)`
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [engine, ghostWpm])

  useEffect(() => {
    const ro = new ResizeObserver(() => placeCaret())
    if (viewportRef.current) ro.observe(viewportRef.current)
    return () => {
      ro.disconnect()
      clearTimeout(idleTimer.current)
    }
  }, [placeCaret])

  const words = engine.words
  const wi = engine.wi
  // render a window of words: everything up to a few screens ahead keeps DOM small for endless tests
  const end = Math.min(words.length, wi + 90)
  const items = []
  for (let i = 0; i < end; i++) {
    const state = i < wi ? 'done' : i === wi ? 'active' : 'future'
    items.push(<Word key={i} index={i} word={words[i]} typed={engine.typed[i] ?? ''} state={state} />)
  }

  return (
    <div className="relative" onMouseDown={(e) => { e.preventDefault(); onFocusRequest?.() }}>
      <div
        ref={viewportRef}
        className={'typing-viewport ' + (focused ? '' : 'typing-blur')}
        role="img"
        aria-label="Typing text. Type the words shown."
      >
        <div ref={wordsRef} className="typing-words">
          {items}
          {ghostWpm ? <span ref={ghostRef} className="ghost" data-label={ghostLabel} style={{ opacity: 0 }} aria-hidden="true" /> : null}
          <span ref={caretRef} className="caret idle" aria-hidden="true" />
        </div>
      </div>
      {!focused && (
        <button
          type="button"
          onClick={onFocusRequest}
          className="absolute inset-0 flex animate-fade-up items-center justify-center gap-2 text-sm font-medium text-zinc-200"
        >
          {blurLabel}
        </button>
      )}
    </div>
  )
}
