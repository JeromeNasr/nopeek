import { useCallback, useEffect, useState } from 'react'
import SessionRunner from '../components/SessionRunner.jsx'
import PrefsPanel from '../components/PrefsPanel.jsx'
import { Button, Card, Seg, Toggle } from '../components/ui.jsx'
import { readJSON, writeJSON } from '../data/localStore.js'
import { english } from '../data/english.js'
import { TIME_OPTIONS, WORD_OPTIONS, codeWords, generateWords, makeSupplier, parseCustomText, quoteWords } from '../engine/textSources.js'

const DEFAULTS = { mode: 'time', time: 30, words: 25, source: 'words', punctuation: false, numbers: false, keyboard: false, customText: '' }

export default function Test() {
  const [cfg, setCfg] = useState(() => ({ ...DEFAULTS, ...(readJSON('test.settings') ?? {}) }))
  const [draft, setDraft] = useState(cfg.customText)
  const [showPrefs, setShowPrefs] = useState(false)
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
      if (cfg.mode === 'custom') return { words: customWords.length ? customWords : ['Paste', 'some', 'text', 'to', 'practise'] }
      if (cfg.mode === 'words') return { words: base(cfg.words, s) }
      const supplier = cfg.source === 'words' ? makeSupplier(opts, s) : (n) => base(n, `${s}:${Math.random()}`)
      return { words: base(60, s), timeLimitMs: cfg.time * 1000, supplier }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfg.mode, cfg.time, cfg.words, cfg.source, cfg.punctuation, cfg.numbers, cfg.customText],
  )

  const modeKey = cfg.mode === 'time' ? `time-${cfg.time}` : cfg.mode === 'words' ? `words-${cfg.words}` : 'custom'

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="chrome mb-8 flex flex-wrap items-center justify-center gap-2.5" aria-label="Test options">
        <Seg label="Mode" value={cfg.mode} onChange={(v) => set({ mode: v })} options={[{ id: 'time', label: 'Time' }, { id: 'words', label: 'Words' }, { id: 'custom', label: 'Custom' }]} />
        {cfg.mode === 'time' && <Seg label="Duration" value={cfg.time} onChange={(v) => set({ time: v })} options={TIME_OPTIONS} format={(v) => `${v}s`} />}
        {cfg.mode === 'words' && <Seg label="Word count" value={cfg.words} onChange={(v) => set({ words: v })} options={WORD_OPTIONS} />}
        {cfg.mode !== 'custom' && <Seg label="Text source" value={cfg.source} onChange={(v) => set({ source: v })} options={[{ id: 'words', label: 'Words' }, { id: 'quotes', label: 'Quotes' }, { id: 'code', label: 'Code' }]} />}
        {cfg.mode !== 'custom' && cfg.source === 'words' && (
          <>
            <Toggle label="@ punctuation" checked={cfg.punctuation} onChange={(v) => set({ punctuation: v })} hint="Capitals, commas, full stops, quotes, brackets" />
            <Toggle label="# numbers" checked={cfg.numbers} onChange={(v) => set({ numbers: v })} hint="Mix numbers into the text" />
          </>
        )}
        <Toggle label="Keyboard hints" checked={cfg.keyboard} onChange={(v) => set({ keyboard: v })} hint="Show the on-screen keyboard with the next key highlighted" />
        <Toggle label="Preferences" checked={showPrefs} onChange={setShowPrefs} hint="Caret, sounds, pace ghost, colours" />
      </div>

      {showPrefs && <PrefsPanel className="mx-auto mb-8 max-w-2xl" />}

      {cfg.mode === 'custom' && (
        <Card className="mb-6">
          <label htmlFor="custom-text" className="text-sm font-medium text-zinc-200">Your text</label>
          <textarea
            id="custom-text" value={draft} onChange={(e) => setDraft(e.target.value)} rows={4}
            className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950/60 p-3 font-mono text-sm text-zinc-200 outline-none focus:border-emerald-600"
            placeholder="Paste or write the text you want to practise. Smart quotes and dashes are converted to keys you can type."
          />
          <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
            <span>{parseCustomText(draft).length} words (max 1000)</span>
            <Button size="sm" disabled={!parseCustomText(draft).length} onClick={() => set({ customText: draft })}>Use this text</Button>
          </div>
        </Card>
      )}

      {cfg.mode === 'custom' && !customWords.length ? null : (
        <SessionRunner
          makeRun={makeRun}
          meta={{ mode: cfg.mode === 'custom' ? 'custom' : cfg.mode, modeKey, title: 'Test results' }}
          showKeyboard={cfg.keyboard}
        />
      )}
    </div>
  )
}
