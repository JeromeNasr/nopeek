// TouchType typing engine: a pure, DOM-free state machine.
//
// Behaviour is modelled on the well-known conventions of modern typing tests
// (timer starts on the first keystroke; space commits a word; you may only
// step back into a word you got wrong; WPM counts only correct words; accuracy
// counts every keystroke, including ones later corrected). It is an
// independent implementation - no Monkeytype source code is included. See
// NOTICE.md.
//
// All times are supplied by the caller (ms, any monotonic origin) which makes
// the engine fully deterministic and unit-testable.

import { accuracyPct, consistencyOf, mean, roundTo, wpmFromChars } from './stats.js'

export const MAX_EXTRA_CHARS = 20

export class TypingEngine {
  /**
   * @param {object} o
   * @param {string[]} o.words
   * @param {'time'|'words'|'custom'|'lesson'} [o.mode]
   * @param {number|null} [o.timeLimitMs]   end automatically after this long
   * @param {boolean} [o.fixedLength]       end when the last word is typed
   * @param {(n:number)=>string[]} [o.supplier] extend words for endless/timed tests
   */
  constructor({ words, mode = 'time', timeLimitMs = null, fixedLength = null, supplier = null }) {
    this.words = [...words]
    this.mode = mode
    this.timeLimitMs = timeLimitMs
    this.fixedLength = fixedLength ?? timeLimitMs == null
    this.supplier = supplier
    this.reset()
  }

  reset() {
    this.typed = ['']
    this.committed = [] // boolean per committed word
    this.wi = 0
    this.log = []
    this.startedAt = null
    this.endedAt = null
    this.finished = false
    this.finishReason = null
    this.correctKeys = 0
    this.incorrectKeys = 0
    this.backspaces = 0
    this.corrections = 0
    this.samples = [] // per-second {sec, wpm, raw, errors}
    this._nextSample = 1000
    this._lastKeyAt = null
    this._lastCode = null
    this._lastOk = true
    this.version = 0
  }

  get started() {
    return this.startedAt !== null
  }

  get currentWord() {
    return this.words[this.wi] ?? ''
  }

  get currentTyped() {
    return this.typed[this.wi] ?? ''
  }

  // ---- input -------------------------------------------------------------

  /** Type one character. Returns true if it changed state. */
  insertChar(ch, { t, code = null } = {}) {
    if (this.finished || typeof ch !== 'string' || ch.length === 0) return false
    if (ch === ' ') return this._commitWord(t, code)
    if (this.startedAt === null) this.startedAt = t
    if (this._timedOut(t)) return false
    this._sampleUpTo(t)

    const word = this.currentWord
    const typed = this.currentTyped
    if (typed.length >= word.length + MAX_EXTRA_CHARS) return false

    const expected = word[typed.length] ?? null
    const ok = expected === ch
    this.typed[this.wi] = typed + ch
    this._recordKey({ t, type: 'c', ch, exp: expected, code, ok })

    if (
      this.fixedLength &&
      this.wi === this.words.length - 1 &&
      this.typed[this.wi].length >= word.length
    ) {
      this._finish('completed', t)
    }
    this.version++
    return true
  }

  _commitWord(t, code) {
    const typed = this.currentTyped
    if (typed.length === 0) return false // like most typing tests: ignore leading/double spaces
    if (this._timedOut(t)) return false
    this._sampleUpTo(t)
    const word = this.currentWord
    const ok = typed.length >= word.length // space only "correct" once the word is fully typed
    this._recordKey({ t, type: 's', ch: ' ', exp: ' ', code, ok })
    this.committed[this.wi] = typed === word
    this.wi++
    this.typed[this.wi] = ''
    if (this.wi >= this.words.length - 3 && this.supplier) {
      this.words.push(...this.supplier(40))
    }
    if (this.fixedLength && this.wi >= this.words.length) this._finish('completed', t)
    this.version++
    return true
  }

  /** Backspace; `word` deletes the whole current word (ctrl/alt+backspace). */
  backspace({ t, word = false } = {}) {
    if (this.finished || this.startedAt === null) return false
    if (this._timedOut(t)) return false
    let typed = this.currentTyped
    if (typed.length === 0) {
      // Only step back into a word that was wrong.
      if (this.wi > 0 && this.committed[this.wi - 1] === false) {
        this.typed.pop()
        this.committed.pop()
        this.wi--
        this.log.push({ t: t - this.startedAt, type: 'b', ok: false, wi: this.wi })
        this.backspaces++
        this._lastOk = false
        this.version++
        return true
      }
      return false
    }
    this._sampleUpTo(t)
    const target = this.currentWord
    const removeFrom = word ? 0 : typed.length - 1
    for (let i = removeFrom; i < typed.length; i++) {
      if (typed[i] !== target[i]) this.corrections++
    }
    typed = typed.slice(0, removeFrom)
    this.typed[this.wi] = typed
    this.backspaces++
    this._lastOk = false
    this.log.push({ t: t - this.startedAt, type: 'b', ok: false, wi: this.wi })
    this.version++
    return true
  }

  /** Call from a timer; ends timed tests. */
  tick(t) {
    if (this.finished || this.startedAt === null) return false
    this._sampleUpTo(t)
    if (this._timedOut(t)) {
      this._finish('time', this.startedAt + this.timeLimitMs)
      this.version++
      return true
    }
    return false
  }

  finishNow(t) {
    if (this.finished || this.startedAt === null) return
    this._finish('manual', t)
    this.version++
  }

  // ---- internals ---------------------------------------------------------

  _timedOut(t) {
    if (this.timeLimitMs == null || this.startedAt === null) return false
    if (t - this.startedAt >= this.timeLimitMs) {
      this._sampleUpTo(this.startedAt + this.timeLimitMs)
      this._finish('time', this.startedAt + this.timeLimitMs)
      this.version++
      return true
    }
    return false
  }

  _recordKey({ t, type, ch, exp, code, ok }) {
    const pos = type === 's' ? this.currentTyped.length : this.currentTyped.length - 1
    if (ok) this.correctKeys++
    else this.incorrectKeys++
    this.log.push({
      t: t - this.startedAt,
      type,
      ch,
      exp,
      code,
      ok,
      wi: this.wi,
      pos,
      // previous expected character within the same word (for bigram timing)
      pexp: pos > 0 ? this.words[this.wi]?.[pos - 1] ?? null : null,
      prevCode: this._lastCode,
      // time since the previous keystroke; only meaningful if that one was a clean key press
      dt: this._lastKeyAt == null ? null : t - this._lastKeyAt,
      prevOk: this._lastOk,
    })
    this._lastKeyAt = t
    this._lastCode = code
    this._lastOk = ok
  }

  _finish(reason, t) {
    this.finished = true
    this.finishReason = reason
    this.endedAt = Math.max(t, this.startedAt)
  }

  _sampleUpTo(t) {
    if (this.startedAt === null) return
    const elapsed = t - this.startedAt
    while (this._nextSample <= elapsed) {
      const c = this.charCounts()
      this.samples.push({
        sec: this._nextSample / 1000,
        wpm: roundTo(wpmFromChars(c.correctWord, this._nextSample)),
        raw: roundTo(wpmFromChars(c.typedTotal, this._nextSample)),
        errors: this.incorrectKeys,
      })
      this._nextSample += 1000
    }
  }

  // ---- statistics --------------------------------------------------------

  /**
   * Character accounting at the current state.
   * correctWord counts characters in correct words plus their trailing space,
   * and the correct prefix of the word being typed - the figure used for WPM.
   */
  charCounts() {
    let correctWord = 0
    let incorrect = 0
    let extra = 0
    let missed = 0
    let typedTotal = 0
    const lastIndex = Math.min(this.wi, this.typed.length - 1)
    for (let i = 0; i <= lastIndex; i++) {
      const typed = this.typed[i] ?? ''
      const word = this.words[i] ?? ''
      const isCommitted = i < this.wi
      typedTotal += typed.length + (isCommitted ? 1 : 0)
      if (isCommitted && typed === word) {
        correctWord += word.length + 1
        continue
      }
      if (!isCommitted) {
        // the word being typed: its correct prefix counts toward WPM
        let prefix = 0
        while (prefix < typed.length && typed[prefix] === word[prefix]) prefix++
        correctWord += prefix
      }
      for (let k = 0; k < typed.length; k++) {
        if (k >= word.length) extra++
        else if (typed[k] !== word[k]) incorrect++
      }
      if (isCommitted && typed.length < word.length) missed += word.length - typed.length
    }
    return { correctWord, incorrect, extra, missed, typedTotal }
  }

  elapsedMs(t) {
    if (this.startedAt === null) return 0
    const end = this.finished ? this.endedAt : Math.min(t, this.timeLimitMs != null ? this.startedAt + this.timeLimitMs : t)
    return Math.max(0, end - this.startedAt)
  }

  /** Cheap live numbers for the HUD. */
  live(t) {
    const ms = this.elapsedMs(t)
    if (ms <= 0) return { wpm: 0, raw: 0, accuracy: null, elapsedMs: 0 }
    const c = this.charCounts()
    const span = Math.max(ms, 1000) // avoid absurd spikes in the first second
    return {
      wpm: Math.round(wpmFromChars(c.correctWord, span)),
      raw: Math.round(wpmFromChars(c.typedTotal, span)),
      accuracy: accuracyPct(this.correctKeys, this.incorrectKeys),
      elapsedMs: ms,
    }
  }

  /** Full result once finished (or a snapshot of the current state). */
  summary(t = this.endedAt ?? 0) {
    const ms = this.elapsedMs(t)
    const c = this.charCounts()
    const wpm = wpmFromChars(c.correctWord, ms)
    const raw = wpmFromChars(c.typedTotal, ms)
    const acc = accuracyPct(this.correctKeys, this.incorrectKeys)

    // per-second raw burst (chars typed in each whole second, as WPM)
    const seconds = Math.floor(ms / 1000)
    const burst = new Array(Math.max(seconds, 0)).fill(0)
    for (const e of this.log) {
      if (e.type === 'b') continue
      const s = Math.floor(e.t / 1000)
      if (s < seconds) burst[s] += 1
    }
    const burstWpm = burst.map((n) => roundTo(wpmFromChars(n, 1000)))
    const intervals = []
    for (const e of this.log) if (e.dt != null && e.type !== 'b') intervals.push(e.dt)

    return {
      mode: this.mode,
      finishReason: this.finishReason,
      durationMs: Math.round(ms),
      wpm: roundTo(wpm),
      rawWpm: roundTo(raw),
      accuracy: acc == null ? null : roundTo(acc),
      consistency: consistencyOf(burstWpm),
      keyConsistency: consistencyOf(intervals.slice(0, -1)),
      meanKeyIntervalMs: roundTo(mean(intervals), 1),
      correctKeys: this.correctKeys,
      incorrectKeys: this.incorrectKeys,
      backspaces: this.backspaces,
      corrections: this.corrections,
      chars: c,
      wordsCompleted: this.committed.length,
      wordsCorrect: this.committed.filter(Boolean).length,
      wpmHistory: this.samples.map((s) => s.wpm),
      rawHistory: this.samples.map((s) => s.raw),
      burstHistory: burstWpm,
    }
  }
}
