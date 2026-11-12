// Imperative renderer for the typing text. Like Monkeytype, a keystroke never goes
// through the UI framework: it touches only the letter elements that changed and
// moves the caret with a compositor-only transform.

const AHEAD = 100 // words rendered beyond the active one

export class TypingSurface {
  /**
   * @param {HTMLElement} viewport  element with class "typing-viewport"
   * @param {import('./typingEngine.js').TypingEngine} engine
   */
  constructor(viewport, engine, { ghostWpm = null, ghostLabel = '' } = {}) {
    this.viewport = viewport
    this.engine = engine
    this.wordsEl = document.createElement('div')
    this.wordsEl.className = 'typing-words'
    this.caret = document.createElement('span')
    this.caret.className = 'caret idle snap'
    this.caret.setAttribute('aria-hidden', 'true')
    this.wordEls = []
    this.rendered = [] // last rendered typed string per word
    this.states = [] // 'future' | 'done'
    this.lastWi = 0
    this.scroll = 0
    this.lineH = 0
    this.idleTimer = null
    this.viewport.replaceChildren(this.wordsEl)
    this.wordsEl.append(this.caret)
    if (ghostWpm) {
      this.ghost = document.createElement('span')
      this.ghost.className = 'ghost'
      this.ghost.dataset.label = ghostLabel
      this.ghost.style.opacity = '0'
      this.ghost.setAttribute('aria-hidden', 'true')
      this.wordsEl.append(this.ghost)
      this.ghostCps = (ghostWpm * 5) / 60
      this.ghostWi = 0
      this.ghostConsumed = 0
      this._ghostLoop = this._ghostLoop.bind(this)
      this.ghostRaf = requestAnimationFrame(this._ghostLoop)
    }
    this._ensureWords()
    this._measure()
    this.ro = new ResizeObserver(() => {
      this._measure()
      this._placeCaret(true)
    })
    this.ro.observe(viewport)
    this._placeCaret(true)
    requestAnimationFrame(() => this.caret.classList.remove('snap'))
  }

  _measure() {
    this.lineH = parseFloat(getComputedStyle(this.viewport).lineHeight) || 44
  }

  _ensureWords() {
    const e = this.engine
    const want = Math.min(e.words.length, e.wi + AHEAD)
    if (this.wordEls.length >= want) return
    const frag = document.createDocumentFragment()
    for (let i = this.wordEls.length; i < want; i++) {
      const w = document.createElement('span')
      w.className = 'typing-word'
      const text = e.words[i]
      for (let k = 0; k < text.length; k++) {
        const l = document.createElement('span')
        l.className = 'l'
        l.textContent = text[k]
        w.append(l)
      }
      this.wordEls.push(w)
      this.rendered.push('')
      this.states.push('future')
      frag.append(w)
    }
    this.wordsEl.insertBefore(frag, this.caret)
  }

  /** Bring one word's letters in line with what was typed. */
  _renderWord(i) {
    const el = this.wordEls[i]
    if (!el) return
    const e = this.engine
    const word = e.words[i]
    const typed = e.typed[i] ?? ''
    const done = i < e.wi
    const prev = this.rendered[i]
    const state = done ? 'done' : 'future'
    if (prev === typed && this.states[i] === state) return
    const kids = el.children
    const len = Math.max(word.length, typed.length)
    // extra letters beyond the word
    while (kids.length > len) el.lastChild.remove()
    while (kids.length < len) {
      const l = document.createElement('span')
      el.append(l)
    }
    // only letters from the first difference onward can have changed
    let from = 0
    if (this.states[i] === state) while (from < prev.length && from < typed.length && prev[from] === typed[from]) from++
    for (let k = from; k < len; k++) {
      const l = kids[k]
      let cls
      if (k >= word.length) {
        cls = 'l x'
        if (l.textContent !== typed[k]) l.textContent = typed[k]
      } else if (k < typed.length) cls = typed[k] === word[k] ? 'l c' : 'l w'
      else cls = done ? 'l m' : 'l'
      if (l.className !== cls) l.className = cls
    }
    const wrong = done && typed !== word
    if (el.classList.contains('word-error') !== wrong) el.classList.toggle('word-error', wrong)
    this.rendered[i] = typed
    this.states[i] = state
  }

  /** Call after every engine mutation. */
  update() {
    const e = this.engine
    this._ensureWords()
    const wi = e.wi
    if (wi !== this.lastWi) {
      const lo = Math.min(wi, this.lastWi)
      const hi = Math.max(wi, this.lastWi)
      for (let i = lo; i <= hi; i++) this._renderWord(i)
      this.lastWi = wi
    } else {
      this._renderWord(wi)
    }
    this._placeCaret(false)
    this.caret.classList.remove('idle')
    clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => this.caret.classList.add('idle'), 700)
  }

  _placeCaret(snap) {
    const e = this.engine
    const el = this.wordEls[e.wi]
    if (!el) return
    const n = e.currentTyped.length
    const kids = el.children
    let x
    let y
    if (n < kids.length) {
      const k = kids[n]
      x = el.offsetLeft + k.offsetLeft
      y = el.offsetTop + k.offsetTop
    } else {
      const k = kids[kids.length - 1]
      x = el.offsetLeft + (k ? k.offsetLeft + k.offsetWidth : 0)
      y = el.offsetTop + (k ? k.offsetTop : 0)
    }
    const line = Math.round(y / this.lineH)
    const scroll = Math.max(0, line - 1) * this.lineH
    if (scroll !== this.scroll) {
      this.scroll = scroll
      this.wordsEl.style.transform = `translate3d(0, ${-scroll}px, 0)`
    }
    if (snap) {
      this.caret.classList.add('snap')
      requestAnimationFrame(() => this.caret.classList.remove('snap'))
    }
    this.caret.style.transform = `translate3d(${x - 1}px, ${y}px, 0)`
  }

  _ghostLoop() {
    this.ghostRaf = requestAnimationFrame(this._ghostLoop)
    const e = this.engine
    if (e.startedAt == null || e.finished) {
      if (this.ghost.style.opacity !== '0') this.ghost.style.opacity = '0'
      return
    }
    const pos = ((performance.now() - e.startedAt) / 1000) * this.ghostCps
    while (this.ghostWi < e.words.length && pos >= this.ghostConsumed + e.words[this.ghostWi].length + 1) {
      this.ghostConsumed += e.words[this.ghostWi].length + 1
      this.ghostWi++
    }
    const el = this.wordEls[this.ghostWi]
    if (!el) {
      this.ghost.style.opacity = '0'
      return
    }
    const within = pos - this.ghostConsumed
    const idx = Math.min(Math.floor(within), el.children.length - 1)
    const k = el.children[Math.max(0, idx)]
    if (!k) return
    const frac = Math.min(1, within - idx)
    if (this.ghost.style.opacity !== '') this.ghost.style.opacity = ''
    this.ghost.style.transform = `translate3d(${el.offsetLeft + k.offsetLeft + frac * k.offsetWidth}px, ${el.offsetTop + k.offsetTop}px, 0)`
  }

  destroy() {
    this.ro.disconnect()
    clearTimeout(this.idleTimer)
    if (this.ghostRaf) cancelAnimationFrame(this.ghostRaf)
    this.viewport.replaceChildren()
  }
}
