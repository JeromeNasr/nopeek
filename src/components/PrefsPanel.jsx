import { Seg } from './ui.jsx'
import { ACCENTS, THEMES, setPrefs, usePrefs } from '../lib/prefs.js'
import { playKey } from '../lib/sound.js'
import { cx } from '../lib/cx.js'

function Row({ title, hint, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-zinc-800 py-3.5 first:border-t-0">
      <div className="min-w-0">
        <p className="text-sm text-zinc-100">{title}</p>
        {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

/** Typing-experience preferences. Stored on this device and applied instantly. */
export default function PrefsPanel({ className }) {
  const p = usePrefs()
  return (
    <section className={className} aria-label="Preferences">
      <Row title="Theme">
        <Seg label="Theme" value={p.theme} onChange={(v) => setPrefs({ theme: v })} options={Object.entries(THEMES).map(([id, label]) => ({ id, label }))} />
      </Row>
      <Row title="Accent">
        <div className="flex gap-2" role="radiogroup" aria-label="Accent colour">
          {Object.entries(ACCENTS).map(([id, a]) => (
            <button key={id} type="button" role="radio" aria-checked={p.accent === id} aria-label={a.label} title={a.label} onClick={() => setPrefs({ accent: id })}
              className={cx('h-6 w-6 rounded-full outline-offset-2', p.accent === id && 'outline outline-2 outline-zinc-300')} style={{ background: a.color }} />
          ))}
        </div>
      </Row>
      <Row title="Caret">
        <Seg label="Caret style" value={p.caret} onChange={(v) => setPrefs({ caret: v })} options={[{ id: 'line', label: 'line' }, { id: 'block', label: 'block' }, { id: 'underline', label: 'underline' }]} />
      </Row>
      <Row title="Text size">
        <Seg label="Text size" value={p.fontScale} onChange={(v) => setPrefs({ fontScale: v })} options={[{ id: 0.85, label: 'small' }, { id: 1, label: 'medium' }, { id: 1.2, label: 'large' }]} />
      </Row>
      <Row title="Key sounds" hint="Generated in your browser, nothing is downloaded.">
        <Seg label="Key sounds" value={p.sound} onChange={(v) => { setPrefs({ sound: v }); playKey(v) }} options={[{ id: 'off', label: 'off' }, { id: 'soft', label: 'soft' }, { id: 'mechanical', label: 'clicky' }]} />
      </Row>
      <Row title="Pace marker" hint="A second, faint caret that moves at your own average or best speed.">
        <Seg label="Pace marker" value={p.ghost} onChange={(v) => setPrefs({ ghost: v })} options={[{ id: 'off', label: 'off' }, { id: 'average', label: 'average' }, { id: 'best', label: 'best' }]} />
      </Row>
      <Row title="Keyboard hints" hint="In lessons and drills: show the next key always, or only when you pause.">
        <Seg label="Keyboard hints" value={p.guide} onChange={(v) => setPrefs({ guide: v })} options={[{ id: 'smart', label: 'when I pause' }, { id: 'always', label: 'always' }]} />
      </Row>
      <Row title="Hide menus while typing">
        <Seg label="Focus mode" value={p.focusMode} onChange={(v) => setPrefs({ focusMode: v })} options={[{ id: true, label: 'on' }, { id: false, label: 'off' }]} />
      </Row>
    </section>
  )
}
