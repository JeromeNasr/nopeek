import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { generatePracticeTokens, practiceCategories } from '../data/wordLists'
import { SESSION_SAVED_EVENT } from '../hooks/useStreak'
import { supabase } from '../supabaseClient'

const TEST_DURATION_MS = 60_000

function countWordsTyped(input, words) {
  let count = 0
  let pos = 0

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    if (input.length < pos + word.length) break
    if (input.slice(pos, pos + word.length) !== word) break

    count++
    pos += word.length

    if (i < words.length - 1) {
      if (input.length < pos + 1) break
      if (input[pos] !== ' ') break
      pos += 1
    }
  }

  return count
}

function getCurrentWordIndex(input, words) {
  let pos = 0

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const hasSpace = i < words.length - 1

    if (input.length <= pos + word.length) return i

    if (input.slice(pos, pos + word.length) !== word) return i

    pos += word.length

    if (hasSpace) {
      if (input.length <= pos) return i
      if (input[pos] !== ' ') return i
      pos += 1
    }
  }

  return Math.max(0, words.length - 1)
}

function getWordCharClass(wordIndex, charIndex, currentWordIndex, input, word, globalOffset) {
  const absoluteIndex = globalOffset + charIndex

  if (wordIndex < currentWordIndex) {
    const typedWord = input.slice(globalOffset, globalOffset + word.length)
    return typedWord === word
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-red-600 dark:text-red-400'
  }

  if (wordIndex > currentWordIndex) return 'text-zinc-400 dark:text-zinc-500'

  if (absoluteIndex < input.length) {
    return input[absoluteIndex] === word[charIndex]
      ? 'text-emerald-600 dark:text-emerald-300'
      : 'text-red-600 dark:text-red-400'
  }

  return 'text-zinc-700 dark:text-zinc-300'
}

export default function TypingTest({ peeks = 0, eyeDiscipline = 100, isLookingDown = false }) {
  const [category, setCategory] = useState('common')
  const [words, setWords] = useState(() => generatePracticeTokens('common'))
  const [input, setInput] = useState('')
  const [started, setStarted] = useState(false)
  const [finished, setFinished] = useState(false)
  const [startTime, setStartTime] = useState(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [correctKeystrokes, setCorrectKeystrokes] = useState(0)
  const [totalKeystrokes, setTotalKeystrokes] = useState(0)
  const [saveStatus, setSaveStatus] = useState(null)

  const containerRef = useRef(null)
  const savedRef = useRef(false)

  const expectedText = useMemo(() => words.join(' '), [words])
  const wordStarts = useMemo(() => {
    const starts = new Array(words.length)
    for (let i = 0; i < words.length; i++) {
      starts[i] = i === 0 ? 0 : starts[i - 1] + words[i - 1].length + 1
    }
    return starts
  }, [words])
  const currentWordIndex = useMemo(() => getCurrentWordIndex(input, words), [input, words])

  const wordsTyped = useMemo(() => countWordsTyped(input, words), [input, words])
  const elapsedMinutes = Math.max(elapsedMs / 60_000, 1 / 60)
  const liveWpm = Math.round(wordsTyped / elapsedMinutes)
  const liveAccuracy =
    totalKeystrokes === 0 ? 100 : Math.round((correctKeystrokes / totalKeystrokes) * 100)

  const finalWpm = liveWpm
  const finalAccuracy = liveAccuracy
  const timeRemaining = Math.max(0, Math.ceil((TEST_DURATION_MS - elapsedMs) / 1000))
  const progress = Math.min((elapsedMs / TEST_DURATION_MS) * 100, 100)

  const restart = useCallback(() => {
    setWords(generatePracticeTokens(category))
    setInput('')
    setStarted(false)
    setFinished(false)
    setStartTime(null)
    setElapsedMs(0)
    setCorrectKeystrokes(0)
    setTotalKeystrokes(0)
    setSaveStatus(null)
    savedRef.current = false
    containerRef.current?.focus()
  }, [category])

  function handleCategoryChange(nextCategory) {
    if (started || finished) return
    setCategory(nextCategory)
    setWords(generatePracticeTokens(nextCategory))
    setInput('')
    containerRef.current?.focus()
  }

  useEffect(() => {
    if (!started || finished || startTime === null) return

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      setElapsedMs(elapsed)

      if (elapsed >= TEST_DURATION_MS) {
        setFinished(true)
      }
    }, 50)

    return () => clearInterval(interval)
  }, [started, finished, startTime])

  useEffect(() => {
    if (!finished || savedRef.current) return

    savedRef.current = true

    async function saveSession() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const { error } = await supabase.from('sessions').insert({
        user_id: user.id,
        wpm: finalWpm,
        accuracy: finalAccuracy,
        peeks,
        eye_discipline: eyeDiscipline,
        duration_seconds: TEST_DURATION_MS / 1000,
      })

      if (!error) window.dispatchEvent(new Event(SESSION_SAVED_EVENT))
      setSaveStatus(error ? 'Could not save session.' : 'Session saved to your dashboard.')
    }

    saveSession()
  }, [finished, finalWpm, finalAccuracy, peeks, eyeDiscipline])

  function handleKeyDown(e) {
    if (finished) return

    if (e.key === 'Tab' || e.key === 'Escape') return
    e.preventDefault()

    if (!started) {
      setStarted(true)
      setStartTime(Date.now())
    }

    if (e.key === 'Backspace') {
      if (input.length === 0) return

      const removedIndex = input.length - 1
      const wasCorrect = input[removedIndex] === expectedText[removedIndex]

      setInput((prev) => prev.slice(0, -1))
      setTotalKeystrokes((prev) => prev - 1)
      if (wasCorrect) setCorrectKeystrokes((prev) => prev - 1)
      return
    }

    if (e.key.length !== 1 || input.length >= expectedText.length) return

    const expectedChar = expectedText[input.length]
    const isCorrect = e.key === expectedChar

    setInput((prev) => prev + e.key)
    setTotalKeystrokes((prev) => prev + 1)
    if (isCorrect) setCorrectKeystrokes((prev) => prev + 1)
  }

  if (finished) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-xl shadow-black/5 sm:p-8 dark:border-zinc-800 dark:bg-zinc-900/50 dark:shadow-black/20">
          <p className="text-sm font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Time&apos;s up</p>
          <h1 className="mt-2 text-3xl font-semibold text-zinc-900 dark:text-white">Results</h1>

          <dl className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'WPM', value: finalWpm },
              { label: 'Accuracy', value: `${finalAccuracy}%` },
              { label: 'Peeks', value: peeks },
              { label: 'Eye discipline', value: `${eyeDiscipline}%` },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/60"
              >
                <dt className="text-xs uppercase tracking-wider text-zinc-500">{label}</dt>
                <dd className="mt-1 text-2xl font-bold text-zinc-900 sm:text-3xl dark:text-white">{value}</dd>
              </div>
            ))}
          </dl>

          {saveStatus && (
            <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">{saveStatus}</p>
          )}

          <button
            type="button"
            onClick={restart}
            className="mt-8 rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            Restart
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {isLookingDown && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-40 animate-pulse border-4 border-red-500/50 shadow-[inset_0_0_80px_rgba(239,68,68,0.15)]"
          />
          <div
            role="alert"
            className="pointer-events-none fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-lg border border-red-500/40 bg-red-600/95 px-4 py-2 text-sm font-semibold text-red-50 dark:bg-red-950/90 dark:text-red-200 shadow-lg shadow-red-950/50"
          >
            Eyes up!
          </div>
        </>
      )}

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Category</p>
        <div className="flex flex-wrap gap-2">
          {practiceCategories.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              disabled={started}
              onClick={() => handleCategoryChange(id)}
              className={[
                'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                category === id
                  ? 'bg-emerald-600 text-white'
                  : 'border border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-200',
                started ? 'cursor-not-allowed opacity-50' : '',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">Typing Test</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {started ? 'Keep your eyes on the screen.' : 'Start typing to begin the 60-second test.'}
          </p>
        </div>

        <div className="flex w-full gap-6 text-sm sm:w-auto">
          <div>
            <span className="text-zinc-500">WPM</span>
            <p className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-white">
              {started ? liveWpm : '—'}
            </p>
          </div>
          <div>
            <span className="text-zinc-500">Accuracy</span>
            <p className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-white">
              {started ? `${liveAccuracy}%` : '—'}
            </p>
          </div>
          <div>
            <span className="text-zinc-500">Time</span>
            <p className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-white">
              {started ? `${timeRemaining}s` : '60s'}
            </p>
          </div>
        </div>
      </div>

      <div className="mb-4 h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full bg-emerald-500 transition-all duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="rounded-xl border border-zinc-200 bg-white p-4 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 sm:p-8 dark:border-zinc-800 dark:bg-zinc-900/50"
      >
        <p className="text-xl leading-relaxed sm:text-2xl">
          {words.map((word, wordIndex) => {
            const wordStart = wordStarts[wordIndex]

            return (
              <span key={`${word}-${wordIndex}`}>
                <span
                  className={
                    wordIndex === currentWordIndex
                      ? 'rounded bg-yellow-400/40 px-0.5 dark:bg-yellow-400/25'
                      : undefined
                  }
                >
                  {word.split('').map((char, charIndex) => (
                    <span
                      key={charIndex}
                      className={getWordCharClass(
                        wordIndex,
                        charIndex,
                        currentWordIndex,
                        input,
                        word,
                        wordStart,
                      )}
                    >
                      {char}
                    </span>
                  ))}
                </span>
                {wordIndex < words.length - 1 && (
                  <span
                    className={
                      wordIndex < currentWordIndex
                        ? input[wordStart + word.length] === ' '
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                        : wordIndex === currentWordIndex && input.length === wordStart + word.length
                          ? 'text-yellow-600 dark:text-yellow-300'
                          : 'text-zinc-400 dark:text-zinc-500'
                    }
                  >
                    {' '}
                  </span>
                )}
              </span>
            )
          })}
        </p>
      </div>

      <p className="mt-4 text-center text-xs text-zinc-500">
        Click the text area and type. Backspace is supported.
      </p>
      </div>
    </>
  )
}
