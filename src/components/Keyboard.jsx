import { memo } from 'react'
import { FINGERS, FORM_FACTORS, HOME_ROW_CODES, codeLabel, profileFingerOfCode } from '../training/keyboard.js'

import { FINGER_COLORS } from '../training/fingerColors.js'

const ROW_NUM = ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal']
const ROW_TOP = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight']
const ROW_HOME = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote']
const ROW_BOTTOM = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash']

function mainRows(iso) {
  const num = [...ROW_NUM.map((c) => ({ code: c })), { code: 'Backspace', w: 2, label: '⌫' }]
  const top = iso
    ? [{ code: 'Tab', w: 1.5, label: 'Tab' }, ...ROW_TOP.map((c) => ({ code: c })), { code: 'Enter', w: 1.5, label: '↵' }]
    : [{ code: 'Tab', w: 1.5, label: 'Tab' }, ...ROW_TOP.map((c) => ({ code: c })), { code: 'Backslash', w: 1.5 }]
  const home = iso
    ? [{ code: 'CapsLock', w: 1.75, label: 'Caps' }, ...ROW_HOME.map((c) => ({ code: c })), { code: 'Backslash', w: 1 }]
    : [{ code: 'CapsLock', w: 1.75, label: 'Caps' }, ...ROW_HOME.map((c) => ({ code: c })), { code: 'Enter', w: 2.25, label: 'Enter' }]
  const bottom = iso
    ? [{ code: 'ShiftLeft', w: 1.25, label: 'Shift' }, { code: 'IntlBackslash' }, ...ROW_BOTTOM.map((c) => ({ code: c })), { code: 'ShiftRight', w: 2.75, label: 'Shift' }]
    : [{ code: 'ShiftLeft', w: 2.25, label: 'Shift' }, ...ROW_BOTTOM.map((c) => ({ code: c })), { code: 'ShiftRight', w: 2.75, label: 'Shift' }]
  const space = [{ spacer: 4 }, { code: 'Space', w: 6.25, label: '' }]
  return [num, top, home, bottom, space]
}

const FN_ROW = [{ code: 'Escape', label: 'Esc' }, { spacer: 1 }, ...Array.from({ length: 12 }, (_, i) => ({ code: `F${i + 1}`, label: `F${i + 1}`, w: 1 }))]

/**
 * Visual keyboard.
 * @param {object} props
 * @param {object} props.profile  keyboard profile (layout, ISO/ANSI, form factor, finger overrides)
 * @param {string[]} [props.highlight]  codes to emphasise (others dim)
 * @param {string|string[]|null} [props.target]  the key(s) to press next
 * @param {boolean} [props.showFingers]  colour keys by finger
 * @param {string|null} [props.focusFinger]  emphasise a single finger's keys
 */
function KeyboardView({ profile, highlight = null, target = null, showFingers = true, focusFinger = null, pressed = null, onKeyClick = null }) {
  const ff = FORM_FACTORS[profile.formFactor] ?? FORM_FACTORS.full
  const iso = profile.physical === 'iso'
  const rows = mainRows(iso)
  const home = new Set(HOME_ROW_CODES)

  const renderKey = (k, i) => {
    if (k.spacer) return <div key={`s${i}`} style={{ width: `calc(var(--u) * ${k.spacer} + 0.2rem * ${Math.max(0, k.spacer - 1)})` }} />
    const w = k.w ?? 1
    const finger = profileFingerOfCode(profile, k.code)
    const label = k.label ?? codeLabel(profile.layout, k.code)
    const inHighlight = !highlight || highlight.includes(k.code)
    const inFinger = !focusFinger || finger === focusFinger
    const dim = !(inHighlight && inFinger)
    const color = showFingers && finger ? FINGER_COLORS[finger] : null
    const isTarget = Array.isArray(target) ? target.includes(k.code) : target === k.code
    const Tag = onKeyClick && finger ? 'button' : 'div'
    return (
      <Tag
        key={`${k.code}-${i}`}
        data-code={k.code}
        type={Tag === 'button' ? 'button' : undefined}
        onClick={Tag === 'button' ? () => onKeyClick(k.code) : undefined}
        className={['kb-key', dim ? 'dim' : '', isTarget ? 'target' : '', pressed === k.code ? 'pressed' : '', Tag === 'button' ? 'cursor-pointer hover:brightness-125' : ''].join(' ')}
        style={{
          width: `calc(var(--u) * ${w} + 0.2rem * ${Math.max(0, w - 1)})`,
          background: color && !dim ? `${color}26` : undefined,
          borderColor: color && !dim ? `${color}66` : undefined,
        }}
        title={finger ? `${label} – ${FINGERS[finger].label}` : label}
      >
        {label}
        {home.has(k.code) && (k.code === 'KeyF' || k.code === 'KeyJ') && <span className="bump" />}
        {showFingers && finger && w <= 1.1 && <span className="badge">{FINGERS[finger].short}</span>}
      </Tag>
    )
  }

  return (
    <div className="flex flex-wrap items-start gap-x-6 gap-y-3 overflow-x-auto pb-1" role="group" aria-label={`Keyboard map, ${profile.layout}, ${profile.formFactor}`}>
      <div className="kb">
        {ff.fnRow && <div className="kb-row">{FN_ROW.map(renderKey)}</div>}
        {rows.map((row, r) => (
          <div className="kb-row" key={r}>{row.map(renderKey)}</div>
        ))}
      </div>
      {ff.arrows && (
        <div className="kb self-end">
          <div className="kb-row"><div style={{ width: 'var(--u)' }} /><div className="kb-key" style={{ width: 'var(--u)' }}>↑</div></div>
          <div className="kb-row">
            {['←', '↓', '→'].map((a) => <div key={a} className="kb-key" style={{ width: 'var(--u)' }}>{a}</div>)}
          </div>
        </div>
      )}
      {ff.numpad && (
        <div className="kb self-end" aria-label="Numpad">
          {[['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3']].map((r) => (
            <div className="kb-row" key={r.join('')}>{r.map((d) => <div key={d} className="kb-key" style={{ width: 'var(--u)' }}>{d}</div>)}</div>
          ))}
          <div className="kb-row"><div className="kb-key" style={{ width: 'calc(var(--u) * 2 + 0.2rem)' }}>0</div><div className="kb-key" style={{ width: 'var(--u)' }}>.</div></div>
        </div>
      )}
    </div>
  )
}

export default memo(KeyboardView)

export function FingerLegend({ focusFinger, onFocus }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Finger legend">
      {['lp', 'lr', 'lm', 'li', 'ri', 'rm', 'rr', 'rp'].map((f) => (
        <li key={f}>
          <button
            type="button"
            onClick={() => onFocus?.(focusFinger === f ? null : f)}
            aria-pressed={focusFinger === f}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition ${focusFinger === f ? 'border-white/60 bg-zinc-800 text-white' : 'border-zinc-800 text-zinc-400 hover:border-zinc-600'}`}
          >
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: FINGER_COLORS[f] }} aria-hidden="true" />
            {FINGERS[f].label} <span className="text-zinc-600">{FINGERS[f].short}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
