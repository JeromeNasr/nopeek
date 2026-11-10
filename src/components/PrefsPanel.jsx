import { Card, Seg, Toggle } from './ui.jsx'
import { ACCENTS, setPrefs, usePrefs } from '../lib/prefs.js'
import { playKey } from '../lib/sound.js'
import { cx } from '../lib/cx.js'

/** Typing-experience preferences. Stored on this device and applied instantly. */
export default function PrefsPanel({ className }) {
  const p = usePrefs()
  const row = 'flex flex-wrap items-center justify-between gap-3 py-2.5'
  return (
    <Card className={className}>
      <h3 className="text-lg font-semibold text-white">Typing experience</h3>
      <p className="mt-1 text-sm text-zinc-400">Changes apply immediately and are saved on this device.</p>
      <div className="mt-3 divide-y divide-white/[0.06]">
        <div className={row}>
          <div><p className="text-sm font-medium text-zinc-200">Accent colour</p><p className="text-xs text-zinc-500">Re-themes the whole app.</p></div>
          <div className="flex gap-2" role="radiogroup" aria-label="Accent colour">
            {Object.entries(ACCENTS).map(([id, a]) => (
              <button key={id} type="button" role="radio" aria-checked={p.accent === id} aria-label={a.label} title={a.label} onClick={() => setPrefs({ accent: id })}
                className={cx('btn h-8 w-8 rounded-full ring-offset-2 ring-offset-zinc-950', p.accent === id && 'ring-2 ring-white/80')}
                style={{ background: `linear-gradient(135deg, ${a.a}, ${a.b})` }} />
            ))}
          </div>
        </div>
        <div className={row}>
          <div><p className="text-sm font-medium text-zinc-200">Caret</p><p className="text-xs text-zinc-500">Always glides smoothly between characters.</p></div>
          <Seg label="Caret style" value={p.caret} onChange={(v) => setPrefs({ caret: v })} options={[{ id: 'line', label: 'Line' }, { id: 'block', label: 'Block' }, { id: 'underline', label: 'Underline' }]} />
        </div>
        <div className={row}>
          <div><p className="text-sm font-medium text-zinc-200">Text size</p></div>
          <Seg label="Text size" value={p.fontScale} onChange={(v) => setPrefs({ fontScale: v })} options={[{ id: 0.85, label: 'S' }, { id: 1, label: 'M' }, { id: 1.2, label: 'L' }]} />
        </div>
        <div className={row}>
          <div><p className="text-sm font-medium text-zinc-200">Key sounds</p><p className="text-xs text-zinc-500">Synthesised in your browser; nothing is downloaded.</p></div>
          <Seg label="Key sounds" value={p.sound} onChange={(v) => { setPrefs({ sound: v }); playKey(v) }} options={[{ id: 'off', label: 'Off' }, { id: 'soft', label: 'Soft' }, { id: 'mechanical', label: 'Clicky' }]} />
        </div>
        <div className={row}>
          <div><p className="text-sm font-medium text-zinc-200">Pace ghost</p><p className="text-xs text-zinc-500">A faint marker that moves at your own average or best speed (needs 3 saved runs).</p></div>
          <Seg label="Pace ghost" value={p.ghost} onChange={(v) => setPrefs({ ghost: v })} options={[{ id: 'off', label: 'Off' }, { id: 'average', label: 'Average' }, { id: 'best', label: 'Best' }]} />
        </div>
        <div className={row}>
          <div><p className="text-sm font-medium text-zinc-200">Keyboard hints</p><p className="text-xs text-zinc-500">Smart shows the next key only when you pause for a second.</p></div>
          <Seg label="Keyboard hints" value={p.guide} onChange={(v) => setPrefs({ guide: v })} options={[{ id: 'smart', label: 'Smart' }, { id: 'always', label: 'Always' }]} />
        </div>
        <div className={row}>
          <div><p className="text-sm font-medium text-zinc-200">Focus mode</p><p className="text-xs text-zinc-500">Menus fade away while you type and return when you move the mouse.</p></div>
          <Toggle label={p.focusMode ? 'On' : 'Off'} checked={p.focusMode} onChange={(v) => setPrefs({ focusMode: v })} />
        </div>
      </div>
    </Card>
  )
}
