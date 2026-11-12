// TouchType typing engine.
//
// Input rules are ported from Monkeytype's input handlers
// (frontend/src/ts/input/handlers/{before-insert-text,insert-text,before-delete,delete}.ts and
// input/helpers/{validation,fail-or-finish}.ts) with Monkeytype's default settings
// (difficulty normal, no stop/delete on error, confidence off, quick end off):
//   * each word's target is the word plus its commit character (a space), except the last word
//   * a leading space on an empty word is ignored; any other space commits the word
//   * at most 20 characters beyond the target
//   * backspace on an empty word steps back only if the previous word is not correct
//   * a fixed-length test ends when the last word is typed correctly, or on space
// Every keystroke is recorded in Monkeytype's EVENT LOG format and all statistics are
// computed by Monkeytype's own, unmodified code in src/vendor/monkeytype (GPL-3.0).
//
// Times are supplied by the caller (ms, monotonic), which keeps the engine deterministic.

import * as MT from '../vendor/monkeytype/frontend/src/ts/test/events/stats.ts'
import { calculateWpm } from '../vendor/monkeytype/frontend/src/ts/utils/numbers.ts'
import { isSpace } from '../vendor/monkeytype/frontend/src/ts/utils/strings.ts'
import { kogasa, mean, roundTo2, stdDev } from '../vendor/monkeytype/packages/util/src/numbers.ts'

export const MAX_EXTRA_CHARS = 20

const consistencyOf = (arr) => {
  const c = roundTo2(kogasa(stdDev(arr) / mean(arr)))
  return !c || Number.isNaN(c) ? 0 : c
}

export class TypingEngine {
  /**
   * @param {object} o
   * @param {string[]} o.words
   * @param {'time'|'words'|'custom'|'lesson'|'practice'} [o.mode]
   * @param {number|null} [o.timeLimitMs]   end automatically after this long
   * @param {boolean} [o.fixedLength]       end when the last word is typed
   * @param {(n:number)=>string[]} [o.supplier] extend words for timed tests
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
    this.inputs = [''] // per word, including the commit space once committed (Monkeytype's inputValue)
    this.typed = [''] // same without the commit space, for rendering
    this.committed = []
    this.wi = 0
    this.events = [] // Monkeytype event log
    this.log = [] // compact keystroke records for TouchType's mistake analysis
    this.startedAt = null
    this.startDate = null
    this.endedAt = null
    this.finished = false
    this.finishReason = null
    this.backspaces = 0
    this.corrections = 0
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

  get correctKeys() {
    return MT.getAccuracy(this.eventLog()).correct
  }

  get incorrectKeys() {
    return MT.getAccuracy(this.eventLog()).incorrect
  }

  /** The word plus its commit character (Monkeytype: textWithCommit). */
  target(i) {
    const w = this.words[i]
    if (w === undefined) return ''
    return this.fixedLength && i === this.words.length - 1 ? w : w + ' '
  }

  _ms(t) {
    return t - this.startedAt
  }

  _start(t) {
    this.startedAt = t
    this.startDate = Date.now()
    this.events.push({ type: 'timer', testMs: 0, data: { event: 'start', timer: 0, date: this.startDate } })
  }

  // ---- input -------------------------------------------------------------

  /** Type one character. Returns true if it changed state. */
  insertChar(ch, { t, code = null } = {}) {
    if (this.finished || typeof ch !== 'string' || ch.length === 0) return false
    const space = isSpace(ch)
    if (space) ch = ' '
    const input = this.inputs[this.wi]
    // before-insert-text: a separator on an empty word does nothing
    if (space && input === '') return false
    const target = this.target(this.wi)
    const goingToNextWord = space // shouldGoToNextWord with default settings
    if (input.length >= target.length + MAX_EXTRA_CHARS && !goingToNextWord) return false

    if (this.startedAt === null) this._start(t)
    if (this._timedOut(t)) return false
    const testMs = this._ms(t)
    const isLast = this.wi === this.words.length - 1
    const correct = ch === target[input.length] // isCharCorrect
    const after = input + ch

    this.events.push({ type: 'keydown', testMs, data: { code: code || 'NoCode' } })
    const data = { inputType: 'insertText', data: ch, correct, wordIndex: this.wi, charIndex: input.length, inputValue: after }
    if (goingToNextWord) data.commitsWord = true
    if (isLast && this.fixedLength) data.lastWord = true
    this.events.push({ type: 'input', testMs, data })

    const word = this.words[this.wi]
    const pos = input.length
    this.log.push({
      t: testMs,
      type: space ? 's' : 'c',
      ch,
      exp: pos < word.length ? word[pos] : space ? ' ' : null,
      code,
      ok: correct,
      wi: this.wi,
      pos,
      pexp: pos > 0 && pos <= word.length ? word[pos - 1] : null,
      prevCode: this._lastCode,
      dt: this._lastKeyAt == null ? null : t - this._lastKeyAt,
      prevOk: this._lastOk,
    })
    this._lastKeyAt = t
    this._lastCode = code
    this._lastOk = correct

    this.inputs[this.wi] = after
    if (!space) this.typed[this.wi] = after

    // fail-or-finish: all words typed and (last word correct, or committing it)
    if (this.fixedLength && isLast && (after === target || goingToNextWord)) {
      this.committed[this.wi] = this.typed[this.wi] === word
      this._finish('completed', t)
    } else if (goingToNextWord) {
      this.committed[this.wi] = after === target
      this.wi++
      this.inputs[this.wi] = ''
      this.typed[this.wi] = ''
      if (this.wi >= this.words.length - 3 && this.supplier) this.words.push(...this.supplier(40))
    }
    this.version++
    return true
  }

  /** Backspace; `word` deletes back a whole word (ctrl/alt+backspace). */
  backspace({ t, word = false } = {}) {
    if (this.finished || this.startedAt === null) return false
    if (this._timedOut(t)) return false
    const input = this.inputs[this.wi]
    const testMs = this._ms(t)
    const inputType = word ? 'deleteWordBackward' : 'deleteContentBackward'

    if (input === '') {
      // before-delete: nothing before the first word, and a correct previous word is locked
      if (this.wi === 0) return false
      const prev = this.inputs[this.wi - 1]
      if (prev === this.target(this.wi - 1)) return false
      this.inputs.pop()
      this.typed.pop()
      this.committed.pop()
      this.wi--
      // the backspace removes the commit space (or the whole word for a word-delete)
      const after = word ? '' : prev.endsWith(' ') ? prev.slice(0, -1) : prev
      this.inputs[this.wi] = after
      this.typed[this.wi] = after
      this.events.push({ type: 'keydown', testMs, data: { code: 'Backspace' } })
      this.events.push({ type: 'input', testMs, data: { inputType, wordIndex: this.wi, charIndex: prev.length, inputValue: after } })
    } else {
      const target = this.target(this.wi)
      const after = word ? input.replace(/(?:\S+\s*|\s+)$/, '') : input.slice(0, -1)
      for (let i = after.length; i < input.length; i++) if (input[i] !== target[i]) this.corrections++
      this.inputs[this.wi] = after
      this.typed[this.wi] = after
      this.events.push({ type: 'keydown', testMs, data: { code: 'Backspace' } })
      this.events.push({ type: 'input', testMs, data: { inputType, wordIndex: this.wi, charIndex: input.length, inputValue: after } })
    }
    this.backspaces++
    this._lastOk = false
    this._lastKeyAt = t
    this.log.push({ t: testMs, type: 'b', ok: false, wi: this.wi })
    this.version++
    return true
  }

  /** Call from a timer; ends timed tests. */
  tick(t) {
    if (this.finished || this.startedAt === null) return false
    return this._timedOut(t)
  }

  finishNow(t) {
    if (this.finished || this.startedAt === null) return
    this._finish('manual', t)
    this.version++
  }

  _timedOut(t) {
    if (this.timeLimitMs == null || this.startedAt === null) return false
    if (t - this.startedAt >= this.timeLimitMs) {
      this._finish('time', this.startedAt + this.timeLimitMs)
      this.version++
      return true
    }
    return false
  }

  _finish(reason, t) {
    this.finished = true
    this.finishReason = reason
    this.endedAt = Math.max(t, this.startedAt)
    const testMs = this._ms(this.endedAt)
    this.events.push({ type: 'timer', testMs, data: { event: 'end', timer: Math.floor(testMs / 1000), date: this.startDate + testMs } })
  }

  // ---- statistics (Monkeytype) ---------------------------------------------

  /** Monkeytype EventLog for the vendored statistics code. */
  eventLog() {
    const timed = this.timeLimitMs != null
    return {
      version: 1,
      events: this.events,
      context: {
        targetWords: this.words.map((_, i) => this.target(i)),
        mode: timed ? 'time' : 'words',
        mode2: timed ? String(this.timeLimitMs / 1000) : String(this.words.length),
        bailedOut: this.finishReason === 'manual',
        hasKorean: false,
      },
    }
  }

  /** Monkeytype character counts ({allCorrect, correctWord, incorrect, extra, missed}). */
  charCounts(testMs) {
    return MT.getChars(this.eventLog(), !this.finished, testMs)
  }

  elapsedMs(t) {
    if (this.startedAt === null) return 0
    const end = this.finished ? this.endedAt : Math.min(t, this.timeLimitMs != null ? this.startedAt + this.timeLimitMs : t)
    return Math.max(0, end - this.startedAt)
  }

  /** Live numbers for the HUD. */
  live(t) {
    const ms = this.elapsedMs(t)
    if (ms <= 0) return { wpm: 0, raw: 0, accuracy: null, elapsedMs: 0 }
    const log = this.eventLog()
    const c = MT.getChars(log, true)
    const sec = Math.max(ms, 1000) / 1000 // avoid absurd spikes in the first second
    return {
      wpm: Math.round(calculateWpm(c.correctWord, sec)),
      raw: Math.round(calculateWpm(c.allCorrect + c.incorrect + c.extra, sec)),
      accuracy: MT.getAccuracy(log).percentage,
      elapsedMs: ms,
    }
  }

  /** Full result, mirroring Monkeytype's buildCompletedEvent. */
  summary() {
    const log = this.eventLog()
    if (!this.finished) log.events = [...this.events, { type: 'timer', testMs: this._lastKeyAt != null ? this._ms(this._lastKeyAt) : 0, data: { event: 'end', timer: 0, date: 0 } }]
    const chars = MT.getChars(log)
    const duration = MT.getTestDurationMs(log) / 1000
    const acc = MT.getAccuracy(log)
    const burst = MT.getBurstHistory(log)
    const spacing = MT.getKeypressSpacing(log)
    return {
      mode: this.mode,
      finishReason: this.finishReason,
      durationMs: Math.round(duration * 1000),
      wpm: roundTo2(calculateWpm(chars.correctWord, duration)),
      rawWpm: roundTo2(calculateWpm(chars.allCorrect + chars.incorrect + chars.extra, duration)),
      accuracy: acc.percentage == null ? null : roundTo2(acc.percentage),
      consistency: burst.length >= 2 ? consistencyOf(burst) : null,
      keyConsistency: spacing.length >= 3 ? consistencyOf(spacing.slice(0, -1)) : null,
      meanKeyIntervalMs: spacing.length ? roundTo2(mean(spacing)) : 0,
      correctKeys: acc.correct,
      incorrectKeys: acc.incorrect,
      backspaces: this.backspaces,
      corrections: this.corrections,
      chars,
      wordsCompleted: this.committed.length,
      wordsCorrect: this.committed.filter(Boolean).length,
      wpmHistory: MT.getWpmHistory(log),
      rawHistory: MT.getRawHistory(log),
      burstHistory: burst,
      errorHistory: MT.getErrorCountHistory(log),
    }
  }
}
