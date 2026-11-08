// Structured touch-typing curriculum.
//
// Lessons are defined in terms of PHYSICAL keys (KeyboardEvent.code) so that the
// same curriculum works for QWERTY, Dvorak, Colemak, AZERTY and QWERTZ: "home
// row" always means the keys under the resting fingers, whatever they print.
//
// Progress is never granted for merely finishing a lesson: a lesson is passed
// by a run that meets its measured accuracy / speed / consistency targets.

import { HOME_ROW_CODES } from './keyboard.js'

const HOME = HOME_ROW_CODES // KeyA KeyS KeyD KeyF KeyJ KeyK KeyL Semicolon
const HOME_EXT = [...HOME, 'KeyG', 'KeyH']
const add = (base, ...more) => [...new Set([...base, ...more])]

const TOP_ROW = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP']
const BOTTOM_ROW = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM']
const NUMBER_ROW = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0']
const PUNCT = ['Comma', 'Period', 'Slash', 'Quote', 'Minus']

let acc = HOME_EXT
const step = (...codes) => (acc = add(acc, ...codes))
const k2 = step('KeyE', 'KeyI')
const k3 = step('KeyR', 'KeyU')
const k4 = step('KeyT', 'KeyO')
const k5 = step('KeyN', 'KeyC')
const k6 = step('KeyW', 'KeyM')
const k7 = step('KeyP', 'KeyB')
const allLetters = add(acc, ...TOP_ROW, ...BOTTOM_ROW)

export const STAGES = [
  { id: 1, title: 'Keyboard familiarity', blurb: 'Where your fingers rest and which finger owns which key.' },
  { id: 2, title: 'Basic touch typing', blurb: 'Home row first, then reach for neighbouring keys one pair at a time.' },
  { id: 3, title: 'Full keyboard', blurb: 'Upper and lower rows, capitals, numbers and punctuation.' },
  { id: 4, title: 'Accuracy', blurb: 'Clean, even typing: fewer repeated mistakes and fewer corrections.' },
  { id: 5, title: 'Speed', blurb: 'Build pace on common words without giving up accuracy.' },
  { id: 6, title: 'Real-world typing', blurb: 'Paragraphs, email, code and technical vocabulary.' },
]

/**
 * source:
 *  'keys'   - words/pseudo-words built only from `keys` (focus keys weighted up)
 *  'corpus' - prose / code from the corpus, optionally capitalised / punctuated
 */
export const LESSONS = [
  // ---- Stage 1 ----
  {
    id: '1.1', stage: 1, title: 'Home position',
    summary: 'Rest your fingers on A S D F and J K L ; and learn to return there.',
    teach: [
      'Left hand: little finger on A, then ring, middle and index on S, D, F. Right hand: index on J, then middle, ring and little finger on K, L and ;.',
      'Feel the small bumps on F and J – they let you find home without looking.',
      'Thumbs rest lightly over the space bar. Wrists stay relaxed and floating, not resting on the desk edge.',
    ],
    source: 'keys', keys: HOME, focus: HOME, words: 28, wordLen: [2, 4],
    pass: { minAccuracy: 90, minWpm: 6 }, showKeyboard: true, guided: true,
  },
  {
    id: '1.2', stage: 1, title: 'Index fingers reach G and H',
    summary: 'Your index fingers each own a second column in the middle.',
    teach: [
      'Left index covers F and G; right index covers J and H. Reach, press, and return to F / J.',
      'Keep the other fingers anchored on the home row while one finger reaches.',
    ],
    source: 'keys', keys: HOME_EXT, focus: ['KeyG', 'KeyH'], words: 30, wordLen: [2, 5],
    pass: { minAccuracy: 92, minWpm: 8 }, showKeyboard: true, guided: true,
  },
  // ---- Stage 2 ----
  {
    id: '2.1', stage: 2, title: 'Home row words',
    summary: 'Real words using only the home row.',
    teach: ['Type from muscle memory. If you have to search for a key, slow down rather than look down.'],
    source: 'keys', keys: HOME_EXT, focus: HOME_EXT, words: 30, wordLen: [3, 6],
    pass: { minAccuracy: 93, minWpm: 12 }, showKeyboard: true,
  },
  {
    id: '2.2', stage: 2, title: 'Add E and I', summary: 'Middle fingers reach up.',
    teach: ['E is the left middle finger reaching up from D. I is the right middle finger reaching up from K.'],
    source: 'keys', keys: k2, focus: ['KeyE', 'KeyI'], words: 32, wordLen: [3, 6],
    pass: { minAccuracy: 94, minWpm: 14 }, showKeyboard: true,
  },
  {
    id: '2.3', stage: 2, title: 'Add R and U', summary: 'Index fingers reach up.',
    teach: ['R is the left index above F. U is the right index above J.'],
    source: 'keys', keys: k3, focus: ['KeyR', 'KeyU'], words: 32, wordLen: [3, 6],
    pass: { minAccuracy: 94, minWpm: 15 }, showKeyboard: true,
  },
  {
    id: '2.4', stage: 2, title: 'Add T and O', summary: 'Index reaches T; ring finger reaches O.',
    teach: ['T belongs to the left index (up and right of F). O belongs to the right ring finger.'],
    source: 'keys', keys: k4, focus: ['KeyT', 'KeyO'], words: 34, wordLen: [3, 6],
    pass: { minAccuracy: 94, minWpm: 16 }, showKeyboard: true,
  },
  {
    id: '2.5', stage: 2, title: 'Add N and C', summary: 'Index N below-right of J; middle C below D.',
    teach: ['N is the right index dropping down from J. C is the left middle finger dropping down from D.'],
    source: 'keys', keys: k5, focus: ['KeyN', 'KeyC'], words: 34, wordLen: [3, 6],
    pass: { minAccuracy: 94, minWpm: 17 }, showKeyboard: true,
  },
  {
    id: '2.6', stage: 2, title: 'Add W and M', summary: 'Ring finger up for W; right index across for M.',
    teach: ['W is the left ring finger above S. M is the right index below and right of J.'],
    source: 'keys', keys: k6, focus: ['KeyW', 'KeyM'], words: 36, wordLen: [3, 7],
    pass: { minAccuracy: 94, minWpm: 18 }, showKeyboard: true,
  },
  {
    id: '2.7', stage: 2, title: 'Add P and B', summary: 'Little finger P; left index B.',
    teach: ['P is the right little finger above ;. B is the left index reaching down and right of F.'],
    source: 'keys', keys: k7, focus: ['KeyP', 'KeyB'], words: 36, wordLen: [3, 7],
    pass: { minAccuracy: 94, minWpm: 18 }, showKeyboard: true,
  },
  {
    id: '2.8', stage: 2, title: 'Common letter combinations',
    summary: 'Frequent pairs and triples such as th, he, in, er, ing, ion.',
    teach: ['Common combinations become single "chunks" in your fingers. Aim for an even beat, not bursts.'],
    source: 'ngrams', keys: allLetters, focus: [], words: 36,
    ngrams: ['th', 'he', 'in', 'er', 'an', 're', 'on', 'at', 'en', 'nd', 'ti', 'es', 'or', 'te', 'of', 'ed', 'is', 'it', 'al', 'ar', 'st', 'to', 'nt', 'ng', 'the', 'ing', 'and', 'ion', 'ent', 'for', 'ter', 'ere'],
    pass: { minAccuracy: 94, minWpm: 20 }, showKeyboard: true,
  },
  // ---- Stage 3 ----
  {
    id: '3.1', stage: 3, title: 'Upper row',
    summary: 'Every letter on the QWERTY row.',
    teach: ['Reach up without lifting your wrists. Return the finger to its home key after each press.'],
    source: 'keys', keys: add(acc, ...TOP_ROW), focus: TOP_ROW, words: 40, wordLen: [3, 7],
    pass: { minAccuracy: 94, minWpm: 20 }, showKeyboard: true,
  },
  {
    id: '3.2', stage: 3, title: 'Lower row',
    summary: 'Every letter on the ZXCV row.',
    teach: ['Curl the finger back toward your palm to reach down; keep the hand shape stable.'],
    source: 'keys', keys: add(acc, ...BOTTOM_ROW), focus: BOTTOM_ROW, words: 40, wordLen: [3, 7],
    pass: { minAccuracy: 94, minWpm: 20 }, showKeyboard: true,
  },
  {
    id: '3.3', stage: 3, title: 'All letters',
    summary: 'The full alphabet in real words.',
    teach: ['Alternate hands where you can – it is faster and easier on the fingers.'],
    source: 'keys', keys: allLetters, focus: [], words: 45, wordLen: [3, 8], preferReal: true,
    pass: { minAccuracy: 95, minWpm: 22 }, showKeyboard: true,
  },
  {
    id: '3.4', stage: 3, title: 'Capital letters',
    summary: 'Shift with the pinky on the OPPOSITE hand.',
    teach: ['For a left-hand letter use the right Shift; for a right-hand letter use the left Shift. Hold, press, release.'],
    source: 'corpus', corpus: 'capitalized', keys: allLetters, focus: [], words: 40,
    pass: { minAccuracy: 94, minWpm: 20 }, showKeyboard: true,
  },
  {
    id: '3.5', stage: 3, title: 'Numbers',
    summary: 'The number row with the correct finger for each digit.',
    teach: ['1 is left pinky, 2 ring, 3 middle, 4–5 left index, 6–7 right index, 8 middle, 9 ring, 0 pinky.'],
    source: 'digits', keys: NUMBER_ROW, focus: NUMBER_ROW, words: 30,
    pass: { minAccuracy: 93, minWpm: 14 }, showKeyboard: true,
  },
  {
    id: '3.6', stage: 3, title: 'Punctuation',
    summary: 'Commas, full stops, apostrophes, hyphens and slashes.',
    teach: ['Comma is right middle, full stop right ring, / and ; and \' are the right pinky.'],
    source: 'corpus', corpus: 'punctuated', keys: add(allLetters, ...PUNCT), focus: PUNCT, words: 40,
    pass: { minAccuracy: 94, minWpm: 20 }, showKeyboard: true,
  },
  // ---- Stage 4 ----
  {
    id: '4.1', stage: 4, title: 'Clean typing',
    summary: 'Slow down until you type almost perfectly.',
    teach: ['Speed comes from accuracy. Target 97% or better; ignore the WPM number.'],
    source: 'corpus', corpus: 'common', words: 40,
    pass: { minAccuracy: 97, minWpm: 20 },
  },
  {
    id: '4.2', stage: 4, title: 'Fewer corrections',
    summary: 'Resist the urge to backspace; learn to feel an error as it happens.',
    teach: ['Frequent backspacing hides the real problem. This lesson requires a low correction rate.'],
    source: 'corpus', corpus: 'common', words: 40,
    pass: { minAccuracy: 96, minWpm: 22, maxBackspaceRate: 0.05 },
  },
  {
    id: '4.3', stage: 4, title: 'Steady rhythm',
    summary: 'Even key intervals beat uneven bursts.',
    teach: ['Imagine a metronome. Keep the gap between keys as constant as you can – including between words.'],
    source: 'corpus', corpus: 'common', words: 45,
    pass: { minAccuracy: 95, minWpm: 25, minKeyConsistency: 55 },
  },
  // ---- Stage 5 ----
  {
    id: '5.1', stage: 5, title: 'Speed: 30 WPM', summary: 'Push pace on the 200 most common words.',
    teach: ['Look ahead to the next word while typing the current one.'],
    source: 'corpus', corpus: 'common', words: 50,
    pass: { minAccuracy: 95, minWpm: 30 },
  },
  {
    id: '5.2', stage: 5, title: 'Speed: 40 WPM', summary: 'Common words and frequent patterns.',
    teach: ['Think in whole words, not letters.'],
    source: 'corpus', corpus: 'common', words: 60,
    pass: { minAccuracy: 95, minWpm: 40 },
  },
  {
    id: '5.3', stage: 5, title: 'Longer passages', summary: 'Sustain your speed for a full minute and more.',
    teach: ['Consistency across the whole test matters more than a fast first ten seconds.'],
    source: 'corpus', corpus: 'common', words: 90, timeLimit: 60,
    pass: { minAccuracy: 95, minWpm: 40, minConsistency: 60 },
  },
  {
    id: '5.4', stage: 5, title: 'Speed: 50 WPM', summary: 'Beyond average.',
    teach: ['Relax your shoulders and hands; tension slows you down.'],
    source: 'corpus', corpus: 'common', words: 80,
    pass: { minAccuracy: 95, minWpm: 50 },
  },
  // ---- Stage 6 ----
  {
    id: '6.1', stage: 6, title: 'Paragraphs', summary: 'Full sentences with capitals and punctuation.',
    teach: ['Real text has capitals, commas and stops. Keep your rhythm through them.'],
    source: 'corpus', corpus: 'prose', words: 60,
    pass: { minAccuracy: 95, minWpm: 35 },
  },
  {
    id: '6.2', stage: 6, title: 'Emails and messages', summary: 'Everyday written communication.',
    teach: ['Greetings, sign-offs, numbers, and names.'],
    source: 'corpus', corpus: 'email', words: 60,
    pass: { minAccuracy: 95, minWpm: 35 },
  },
  {
    id: '6.3', stage: 6, title: 'Programming', summary: 'Brackets, operators and camelCase.',
    teach: ['Symbols live on the number row and punctuation keys – practise reaching them by feel.'],
    source: 'corpus', corpus: 'code', words: 70,
    pass: { minAccuracy: 94, minWpm: 25 },
  },
  {
    id: '6.4', stage: 6, title: 'Technical vocabulary', summary: 'Longer, less common words.',
    teach: ['Long words are just more chunks – keep the rhythm.'],
    source: 'corpus', corpus: 'technical', words: 50,
    pass: { minAccuracy: 94, minWpm: 30 },
  },
]

export const LESSON_BY_ID = Object.fromEntries(LESSONS.map((l) => [l.id, l]))

export function lessonsOfStage(stageId) {
  return LESSONS.filter((l) => l.stage === stageId)
}

/** Evaluates a finished run against a lesson's targets; returns each check. */
export function evaluateRun(lesson, result) {
  const p = lesson.pass
  const checks = []
  const add = (id, label, actual, target, ok, unit = '') =>
    checks.push({ id, label, actual, target, ok, unit })
  add('accuracy', 'Accuracy', result.accuracy, p.minAccuracy, (result.accuracy ?? 0) >= p.minAccuracy, '%')
  add('wpm', 'Speed', result.wpm, p.minWpm, result.wpm >= p.minWpm, ' WPM')
  if (p.minConsistency != null) {
    add('consistency', 'Consistency', result.consistency, p.minConsistency, (result.consistency ?? 0) >= p.minConsistency, '')
  }
  if (p.minKeyConsistency != null) {
    add('keyConsistency', 'Rhythm', result.keyConsistency, p.minKeyConsistency, (result.keyConsistency ?? 0) >= p.minKeyConsistency, '')
  }
  if (p.maxBackspaceRate != null) {
    const keys = result.correctKeys + result.incorrectKeys
    const rate = keys ? result.backspaces / keys : 0
    add('backspace', 'Correction rate', Math.round(rate * 100), Math.round(p.maxBackspaceRate * 100), rate <= p.maxBackspaceRate, '%')
  }
  return { passed: checks.every((c) => c.ok), checks }
}

/**
 * Progress from stored attempts: [{ lessonId, passed, wpm, accuracy, at }].
 * A lesson is "unlocked" when the previous lesson is passed; a stage opens when
 * the previous stage has no unpassed lessons. Locked lessons can still be
 * attempted as a test-out (passing one passes it, and counts as proof).
 */
export function computeProgress(attempts) {
  const byLesson = {}
  for (const a of attempts) {
    const e = (byLesson[a.lessonId] ??= { attempts: 0, passed: false, bestWpm: 0, bestAccuracy: 0, lastAt: null })
    e.attempts++
    if (a.passed) e.passed = true
    e.bestWpm = Math.max(e.bestWpm, a.wpm ?? 0)
    e.bestAccuracy = Math.max(e.bestAccuracy, a.accuracy ?? 0)
    e.lastAt = !e.lastAt || a.at > e.lastAt ? a.at : e.lastAt
  }
  let prevPassed = true
  let next = null
  const lessons = LESSONS.map((l) => {
    const e = byLesson[l.id] ?? { attempts: 0, passed: false, bestWpm: 0, bestAccuracy: 0, lastAt: null }
    const unlocked = prevPassed || e.attempts > 0
    if (!e.passed && next == null && unlocked) next = l.id
    prevPassed = prevPassed && e.passed
    return { id: l.id, ...e, unlocked: unlocked || e.passed }
  })
  const passedCount = lessons.filter((l) => l.passed).length
  return { lessons, passedCount, total: LESSONS.length, nextLessonId: next, byLesson: Object.fromEntries(lessons.map((l) => [l.id, l])) }
}
