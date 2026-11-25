import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import SessionRunner from '../components/SessionRunner.jsx'
import { Button, Seg, Toggle } from '../components/ui.jsx'
import { english } from '../data/english.js'
import { readJSON, writeJSON } from '../data/localStore.js'
import { useTraining } from '../data/trainingContext.js'
import { TIME_OPTIONS, WORD_OPTIONS, codeWords, generateWords, makeSupplier, parseCustomText, quoteWords } from '../engine/textSources.js'
import { cx } from '../lib/cx.js'
import { buildDailyPlan } from '../training/dailyPlan.js'
import { specToParams } from '../training/practiceSpec.js'

const DEFAULTS = { mode: 'time', time: 30, words: 25, source: 'words', punctuation: false, numbers: false, keyboard: false, customText: '' }

const actionTo = (a) => (a.type === 'lesson' ? `/learn/${a.lessonId}` : a.type === 'practice' ? `/practice?${specToParams(a.spec)}` : a.to)

/** Below the test: a first-visit pointer, or today's short plan for returning users. */
function Below() {
  const { sessions, progress, rec, loading } = useTraining()
  const plan = useMemo(() => buildDailyPlan({ sessions, rec, progress }), [sessions, rec, progress])
  if (loading) return null
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        New to touch typing? <Link className="text-zinc-200 underline decoration-zinc-600 underline-offset-4 hover:decoration-emerald-400" to="/learn/1.1">Start with lesson 1</Link> — it takes two minutes and teaches where your fingers rest.
      </p>
    )
  }
  return (
    <div>
      <p className="mb-2 text-xs text-zinc-500">today · {plan.doneCount} of {plan.steps.length} done</p>
      <ol className="grid gap-x-8 gap-y-1 sm:grid-cols-3">
        {plan.steps.map((s, i) => (
          <li key={s.id}>
            <Link to={actionTo(s.action)} className="group flex items-baseline gap-2 py-1 text-sm">
              <span className={cx('font-mono text-xs', s.done ? 'text-emerald-400' : 'text-zinc-600')}>{s.done ? '✓' : i + 1}</span>
              <span className={cx('truncate', s.done ? 'text-zinc-600 line-through' : 'text-zinc-300 group-hover:text-white')}>{s.title}</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default function Test() {
  const [cfg, setCfg] = useState(() => ({ ...DEFAULTS, ...(readJSON('test.settings') ?? {}) }))
  const [draft, setDraft] = useState(cfg.customText)
  const [showOptions, setShowOptions] = useState(false)
  const [seed] = useState(() => Math.random().toString(36).slice(2))
  useEffect(() => { writeJSON('test.settings', cfg) }, [cfg])
  const set = (patch) => setCfg((c) => ({ ...c, ...patch }))

  const customWords = cfg.mode === 'custom' ? parseCustomText(cfg.customText) : []

  const makeRun = useCallback(
    (attempt) => {
      const s = `${seed}:${attempt}`
      const opts = { pool: english.slice(0, 1000), punctuation: cfg.punctuation, numbers: cfg.numbers }
      const base = (n, sd) => {
        if (cfg.source === 'quotes') return quoteWords(sd).slice(0, n)
        if (cfg.source === 'code') return codeWords(sd, n)
        return generateWords({ ...opts, count: n, seed: sd })
      }
      if (cfg.mode === 'custom') return { words: customWords.length ? customWords : ['paste', 'some', 'text'] }
      if (cfg.mode === 'words') return { words: base(cfg.words, s) }
      const supplier = cfg.source === 'words' ? makeSupplier(opts, s) : (n) => base(n, `${s}:${Math.random()}`)
      return { words: base(60, s), timeLimitMs: cfg.time * 1000, supplier }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfg.mode, cfg.time, cfg.words, cfg.source, cfg.punctuation, cfg.numbers, cfg.customText, seed],
  )

  const modeKey = cfg.mode === 'time' ? `time-${cfg.time}` : cfg.mode === 'words' ? `words-${cfg.words}` : 'custom'

  // one compact selector: durations, word counts and custom text in a single row
  const lengthId = cfg.mode === 'time' ? `t${cfg.time}` : cfg.mode === 'words' ? `w${cfg.words}` : 'custom'
  const pickLength = (id) => {
    if (id === 'custom') set({ mode: 'custom' })
    else if (id[0] === 't') set({ mode: 'time', time: Number(id.slice(1)) })
    else set({ mode: 'words', words: Number(id.slice(1)) })
  }
  const lengthOptions = [
    ...TIME_OPTIONS.map((t) => ({ id: `t${t}`, label: `${t}s` })),
    ...WORD_OPTIONS.filter((w) => w !== 10 && w !== 100).map((w) => ({ id: `w${w}`, label: `${w} words` })),
    { id: 'custom', label: 'custom' },
  ]
  const nonDefault = cfg.source !== 'words' || cfg.punctuation || cfg.numbers || cfg.keyboard

  return (
    <div className="mx-auto max-w-4xl px-6 pb-16 pt-4 sm:pt-10">
      <div className="chrome mb-14 flex flex-col items-center gap-3" aria-label="Test options">
        <div className="flex max-w-full flex-wrap items-center justify-center gap-2">
          <Seg label="Test length" value={lengthId} onChange={pickLength} options={lengthOptions} wrap={false} />
          <button type="button" aria-expanded={showOptions} onClick={() => setShowOptions((v) => !v)}
            className={cx('btn flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm', showOptions || nonDefault ? 'bg-zinc-900 text-emerald-400' : 'text-zinc-500 hover:text-zinc-100')}>
            options
            <svg viewBox="0 0 24 24" className={cx('h-3.5 w-3.5 transition-transform', showOptions && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
        </div>
        {showOptions && (
          <div className="flex animate-fade-up flex-wrap items-center justify-center gap-2">
            <Seg label="Text" value={cfg.source} onChange={(v) => set({ source: v })} options={[{ id: 'words', label: 'common words' }, { id: 'quotes', label: 'quotes' }, { id: 'code', label: 'code' }]} />
            {cfg.source === 'words' && (
              <span className="inline-flex rounded-full bg-zinc-900 p-0.5">
                <Toggle label="punctuation" checked={cfg.punctuation} onChange={(v) => set({ punctuation: v })} hint="Capitals, commas, full stops, quotes, brackets" />
                <Toggle label="numbers" checked={cfg.numbers} onChange={(v) => set({ numbers: v })} hint="Mix numbers into the text" />
              </span>
            )}
            <span className="inline-flex rounded-full bg-zinc-900 p-0.5">
              <Toggle label="keyboard hints" checked={cfg.keyboard} onChange={(v) => set({ keyboard: v })} hint="Show an on-screen keyboard with the next key" />
            </span>
          </div>
        )}
      </div>

      {cfg.mode === 'custom' && (
        <div className="chrome mx-auto mb-10 max-w-2xl">
          <label htmlFor="custom-text" className="text-sm text-zinc-300">Your text</label>
          <textarea id="custom-text" value={draft} onChange={(e) => setDraft(e.target.value)} rows={4}
            className="mt-2 w-full rounded-xl bg-zinc-900 p-3 font-serif text-base text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-1 focus:ring-emerald-500"
            placeholder="Paste or write anything. Curly quotes and long dashes are converted to keys you can type." />
          <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
            <span>{parseCustomText(draft).length} words</span>
            <Button size="sm" disabled={!parseCustomText(draft).length} onClick={() => set({ customText: draft })}>Use this text</Button>
          </div>
        </div>
      )}

      {cfg.mode === 'custom' && !customWords.length ? null : (
        <SessionRunner makeRun={makeRun} meta={{ mode: cfg.mode, modeKey, title: 'result' }} showKeyboard={cfg.keyboard} />
      )}

      <div className="chrome mt-20 border-t border-zinc-800 pt-6"><Below /></div>
    </div>
  )
}
