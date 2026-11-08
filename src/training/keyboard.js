// Keyboard model: physical key codes (KeyboardEvent.code), layouts that map a
// physical key to a character, standard touch-typing finger assignments and
// form factors.
//
// What the browser can and cannot tell us (documented in docs/KEYBOARDS.md):
//  * KeyboardEvent.code identifies the PHYSICAL key position, KeyboardEvent.key
//    the character the OS layout produced for it. Comparing them lets us infer
//    the active OS layout.
//  * navigator.keyboard.getLayoutMap() (Chromium, secure contexts) returns the
//    OS layout's code->character map. It does not reveal the keyboard model.
//  * JavaScript cannot identify the physical keyboard model, its size, or
//    which finger pressed a key. The form factor is therefore user-selected,
//    ISO is inferred only when an ISO-only key is actually pressed.

export const FINGERS = {
  lp: { id: 'lp', hand: 'left', label: 'Left pinky', short: 'L5' },
  lr: { id: 'lr', hand: 'left', label: 'Left ring', short: 'L4' },
  lm: { id: 'lm', hand: 'left', label: 'Left middle', short: 'L3' },
  li: { id: 'li', hand: 'left', label: 'Left index', short: 'L2' },
  lt: { id: 'lt', hand: 'left', label: 'Left thumb', short: 'L1' },
  rt: { id: 'rt', hand: 'right', label: 'Right thumb', short: 'R1' },
  ri: { id: 'ri', hand: 'right', label: 'Right index', short: 'R2' },
  rm: { id: 'rm', hand: 'right', label: 'Right middle', short: 'R3' },
  rr: { id: 'rr', hand: 'right', label: 'Right ring', short: 'R4' },
  rp: { id: 'rp', hand: 'right', label: 'Right pinky', short: 'R5' },
}
export const FINGER_ORDER = ['lp', 'lr', 'lm', 'li', 'lt', 'rt', 'ri', 'rm', 'rr', 'rp']

const fingerKeys = {
  lp: ['Backquote', 'Digit1', 'Tab', 'KeyQ', 'CapsLock', 'KeyA', 'ShiftLeft', 'IntlBackslash', 'KeyZ'],
  lr: ['Digit2', 'KeyW', 'KeyS', 'KeyX'],
  lm: ['Digit3', 'KeyE', 'KeyD', 'KeyC'],
  li: ['Digit4', 'Digit5', 'KeyR', 'KeyT', 'KeyF', 'KeyG', 'KeyV', 'KeyB'],
  lt: [],
  rt: ['Space'],
  ri: ['Digit6', 'Digit7', 'KeyY', 'KeyU', 'KeyH', 'KeyJ', 'KeyN', 'KeyM'],
  rm: ['Digit8', 'KeyI', 'KeyK', 'Comma'],
  rr: ['Digit9', 'KeyO', 'KeyL', 'Period'],
  rp: ['Digit0', 'Minus', 'Equal', 'Backspace', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash', 'Semicolon', 'Quote', 'Enter', 'Slash', 'ShiftRight'],
}

export const FINGER_OF_CODE = {}
for (const [f, codes] of Object.entries(fingerKeys)) for (const c of codes) FINGER_OF_CODE[c] = f

export const HOME_CODES = { lp: 'KeyA', lr: 'KeyS', lm: 'KeyD', li: 'KeyF', ri: 'KeyJ', rm: 'KeyK', rr: 'KeyL', rp: 'Semicolon' }
export const HOME_ROW_CODES = Object.values(HOME_CODES)

export const handOfFinger = (f) => FINGERS[f]?.hand ?? null

// ---- layouts ---------------------------------------------------------------

const ROW_CODES = {
  num: ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'],
  top: ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash'],
  home: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'],
  bottom: ['IntlBackslash', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'],
}

/** Build a code -> [unshifted, shifted] map from row strings (space-separated tokens). */
function buildMap(rows) {
  const map = {}
  for (const [row, spec] of Object.entries(rows)) {
    const [lo, hi] = spec
    const los = lo.split(' ')
    const his = hi.split(' ')
    ROW_CODES[row].forEach((code, i) => {
      if (los[i] !== undefined && los[i] !== '_') map[code] = [los[i], his[i]]
    })
  }
  map.Space = [' ', ' ']
  return map
}

const US_NUM = ['` 1 2 3 4 5 6 7 8 9 0 - =', '~ ! @ # $ % ^ & * ( ) _ +']

export const LAYOUTS = {
  'qwerty-us': {
    label: 'QWERTY (US)', family: 'qwerty', defaultPhysical: 'ansi',
    map: buildMap({
      num: US_NUM,
      top: ['q w e r t y u i o p [ ] \\', 'Q W E R T Y U I O P { } |'],
      home: ['a s d f g h j k l ; \'', 'A S D F G H J K L : "'],
      bottom: ['_ z x c v b n m , . /', '_ Z X C V B N M < > ?'],
    }),
  },
  'qwerty-uk': {
    label: 'QWERTY (UK)', family: 'qwerty', defaultPhysical: 'iso',
    map: buildMap({
      num: ['` 1 2 3 4 5 6 7 8 9 0 - =', '¬ ! " £ $ % ^ & * ( ) _ +'],
      top: ['q w e r t y u i o p [ ] #', 'Q W E R T Y U I O P { } ~'],
      home: ['a s d f g h j k l ; \'', 'A S D F G H J K L : @'],
      bottom: ['\\ z x c v b n m , . /', '| Z X C V B N M < > ?'],
    }),
  },
  dvorak: {
    label: 'Dvorak (US)', family: 'dvorak', defaultPhysical: 'ansi',
    map: buildMap({
      num: ['` 1 2 3 4 5 6 7 8 9 0 [ ]', '~ ! @ # $ % ^ & * ( ) { }'],
      top: ['\' , . p y f g c r l / = \\', '" < > P Y F G C R L ? + |'],
      home: ['a o e u i d h t n s -', 'A O E U I D H T N S _'],
      bottom: ['_ ; q j k x b m w v z', '_ : Q J K X B M W V Z'],
    }),
  },
  colemak: {
    label: 'Colemak (US)', family: 'colemak', defaultPhysical: 'ansi',
    map: buildMap({
      num: US_NUM,
      top: ['q w f p g j l u y ; [ ] \\', 'Q W F P G J L U Y : { } |'],
      home: ['a r s t d h n e i o \'', 'A R S T D H N E I O "'],
      bottom: ['_ z x c v b k m , . /', '_ Z X C V B K M < > ?'],
    }),
  },
  'azerty-fr': {
    label: 'AZERTY (French)', family: 'azerty', defaultPhysical: 'iso',
    map: buildMap({
      num: ['² & é " \' ( - è _ ç à ) =', '_ 1 2 3 4 5 6 7 8 9 0 ° +'],
      top: ['a z e r t y u i o p ^ $ *', 'A Z E R T Y U I O P ¨ £ µ'],
      home: ['q s d f g h j k l m ù', 'Q S D F G H J K L M %'],
      bottom: ['< w x c v b n , ; : !', '> W X C V B N ? . / §'],
    }),
  },
  'qwertz-de': {
    label: 'QWERTZ (German)', family: 'qwertz', defaultPhysical: 'iso',
    map: buildMap({
      num: ['^ 1 2 3 4 5 6 7 8 9 0 ß ´', '° ! " § $ % & / ( ) = ? `'],
      top: ['q w e r t z u i o p ü + #', 'Q W E R T Z U I O P Ü * \''],
      home: ['a s d f g h j k l ö ä', 'A S D F G H J K L Ö Ä'],
      bottom: ['< y x c v b n m , . -', '> Y X C V B N M ; : _'],
    }),
  },
}
export const LAYOUT_IDS = Object.keys(LAYOUTS)

const reverseCache = new Map()
/** char -> { code, shift } for a layout. */
export function reverseMap(layoutId) {
  if (reverseCache.has(layoutId)) return reverseCache.get(layoutId)
  const layout = LAYOUTS[layoutId] ?? LAYOUTS['qwerty-us']
  const rev = new Map()
  for (const [code, [lo, hi]] of Object.entries(layout.map)) {
    if (!rev.has(lo)) rev.set(lo, { code, shift: false })
    if (hi !== lo && !rev.has(hi)) rev.set(hi, { code, shift: true })
  }
  reverseCache.set(layoutId, rev)
  return rev
}

export function charToKey(layoutId, ch) {
  return reverseMap(layoutId).get(ch) ?? null
}

export function codeToChar(layoutId, code, shift = false) {
  const entry = (LAYOUTS[layoutId] ?? LAYOUTS['qwerty-us']).map[code]
  return entry ? entry[shift ? 1 : 0] : null
}

export function fingerOfCode(code) {
  return FINGER_OF_CODE[code] ?? null
}

/** The finger that owns the key producing `ch`, plus the shift finger if needed. */
export function fingerForChar(layoutId, ch) {
  const key = charToKey(layoutId, ch)
  if (!key) return null
  const finger = fingerOfCode(key.code)
  let shiftFinger = null
  if (key.shift && finger) shiftFinger = handOfFinger(finger) === 'left' ? 'rp' : 'lp'
  return { ...key, finger, shiftFinger }
}

// ---- form factors / profiles ----------------------------------------------

export const FORM_FACTORS = {
  full: { label: 'Full-size (100%)', fnRow: true, nav: true, numpad: true, arrows: true, dedicatedNumberRow: true },
  tkl: { label: 'Tenkeyless (80%)', fnRow: true, nav: true, numpad: false, arrows: true, dedicatedNumberRow: true },
  '75': { label: '75%', fnRow: true, nav: false, numpad: false, arrows: true, dedicatedNumberRow: true },
  '65': { label: '65%', fnRow: false, nav: false, numpad: false, arrows: true, dedicatedNumberRow: true },
  '60': { label: '60%', fnRow: false, nav: false, numpad: false, arrows: false, dedicatedNumberRow: true },
  laptop: { label: 'Laptop', fnRow: true, nav: false, numpad: false, arrows: true, dedicatedNumberRow: true },
}

export const DEFAULT_KEYBOARD_PROFILE = {
  version: 1,
  layout: 'qwerty-us',
  physical: 'ansi', // 'ansi' | 'iso'
  formFactor: 'full',
  numpad: null, // null = follow form factor
  // Optional per-key finger overrides for people who use a non-standard assignment
  fingerOverrides: {},
  setupComplete: false,
}

export function normalizeProfile(p) {
  const base = { ...DEFAULT_KEYBOARD_PROFILE, ...(p ?? {}) }
  if (!LAYOUTS[base.layout]) base.layout = DEFAULT_KEYBOARD_PROFILE.layout
  if (!FORM_FACTORS[base.formFactor]) base.formFactor = 'full'
  if (base.physical !== 'iso' && base.physical !== 'ansi') base.physical = 'ansi'
  base.fingerOverrides = base.fingerOverrides && typeof base.fingerOverrides === 'object' ? base.fingerOverrides : {}
  return base
}

/** Finger for a code, honouring the user's manual overrides. */
export function profileFingerOfCode(profile, code) {
  return profile?.fingerOverrides?.[code] ?? fingerOfCode(code)
}

export function profileFingerForChar(profile, ch) {
  const key = charToKey(profile.layout, ch)
  if (!key) return null
  const finger = profileFingerOfCode(profile, key.code)
  let shiftFinger = null
  if (key.shift && finger) shiftFinger = handOfFinger(finger) === 'left' ? 'rp' : 'lp'
  return { ...key, finger, shiftFinger }
}

// ---- inference from observed behaviour ------------------------------------

/**
 * Score how well each layout explains observed (code, key) pairs from real
 * keydown events. Returns layouts sorted by agreement. Only printable single
 * characters from non-modified key presses should be fed in.
 */
export function scoreLayouts(observations) {
  const entries = Object.entries(observations)
  const out = []
  for (const id of LAYOUT_IDS) {
    let agree = 0
    let total = 0
    for (const [pair, n] of entries) {
      const sep = pair.indexOf('|')
      const code = pair.slice(0, sep)
      const key = pair.slice(sep + 1)
      const entry = LAYOUTS[id].map[code]
      if (!entry) continue
      total += n
      if (entry[0] === key || entry[1] === key || entry[0].toLowerCase() === key.toLowerCase()) agree += n
    }
    out.push({ id, agree, total, score: total ? agree / total : 0 })
  }
  return out.sort((a, b) => b.score - a.score || b.agree - a.agree)
}

/** Suggest a layout only when evidence is strong and differs from the current choice. */
export function suggestLayout(observations, currentLayout, minSamples = 40) {
  const ranked = scoreLayouts(observations)
  const best = ranked[0]
  const current = ranked.find((r) => r.id === currentLayout)
  if (!best || best.total < minSamples) return null
  // layouts of the same family (us/uk) are indistinguishable on letters; ignore ties
  if (current && best.score - current.score < 0.08) return null
  if (best.id === currentLayout) return null
  return best
}

/** Which family of layouts is closest to a navigator.keyboard layout map. */
export function layoutFromLayoutMap(map) {
  const obs = {}
  for (const [code, key] of map.entries()) {
    if (typeof key === 'string' && key.length === 1) obs[`${code}|${key}`] = 1
  }
  const ranked = scoreLayouts(obs)
  return ranked[0]?.score >= 0.9 ? ranked[0] : null
}

export const ISO_ONLY_CODES = new Set(['IntlBackslash', 'IntlRo', 'IntlYen'])

const SPECIAL_LABELS = { Space: 'Space', Enter: 'Enter', Backspace: '⌫', Tab: 'Tab', CapsLock: 'Caps', ShiftLeft: 'Shift', ShiftRight: 'Shift', Semicolon: ';', Quote: "'" }

/** Human label for a physical key under a layout (what the key prints). */
export function codeLabel(layoutId, code) {
  const ch = codeToChar(layoutId, code, false)
  if (ch && ch !== ' ') return ch.length === 1 && /[a-z]/.test(ch) ? ch.toUpperCase() : ch
  return SPECIAL_LABELS[code] ?? code.replace(/^Key|^Digit/, '')
}
