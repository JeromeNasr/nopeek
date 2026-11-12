import { useMemo, useState } from 'react'
import Keyboard, { FingerLegend } from './Keyboard.jsx'
import { Badge, Button, Card, Notice } from './ui.jsx'
import { cx } from '../lib/cx.js'
import { removeKey } from '../data/localStore.js'
import { readLayoutObservations } from '../data/repo.js'
import { useTraining } from '../data/trainingContext.js'
import { FINGERS, FINGER_ORDER, FORM_FACTORS, LAYOUTS, LAYOUT_IDS, charToKey, codeLabel, fingerOfCode, layoutFromLayoutMap, normalizeProfile, scoreLayouts, suggestLayout } from '../training/keyboard.js'

export default function KeyboardSetup() {
  const { profile, setProfile } = useTraining()
  const [edits, setEdits] = useState(null) // unsaved changes; null = show saved profile
  const draft = edits ?? profile
  const [saveMsg, setSaveMsg] = useState(null)
  const [detected, setDetected] = useState(null)
  const [detectMsg, setDetectMsg] = useState(null)
  const [tester, setTester] = useState(null)
  const [pickKey, setPickKey] = useState(null)
  const [focusFinger, setFocusFinger] = useState(null)
  const [obs, setObs] = useState(readLayoutObservations)

  const dirty = JSON.stringify(normalizeProfile(draft)) !== JSON.stringify(profile) || !profile.setupComplete
  const set = (patch) => setEdits((e) => ({ ...(e ?? profile), ...patch }))

  const observed = useMemo(() => suggestLayout(obs.pairs, draft.layout), [obs, draft.layout])
  const testerScore = tester ? scoreLayouts({ [`${tester.code}|${tester.key}`]: 1 })[0] : null

  async function detect() {
    setDetectMsg(null)
    if (!navigator.keyboard?.getLayoutMap) {
      setDetectMsg('This browser cannot report your OS keyboard layout (only Chromium-based browsers can). Choose it manually, or just type in a lesson – TouchType will suggest a layout if your key presses clearly match a different one.')
      return
    }
    try {
      const map = await navigator.keyboard.getLayoutMap()
      const match = layoutFromLayoutMap(map)
      if (match) setDetected(match.id)
      else setDetectMsg('Your OS layout did not closely match any layout TouchType knows. Pick the nearest one, or use the key tester below.')
    } catch {
      setDetectMsg('The browser refused to report the keyboard layout.')
    }
  }

  async function save() {
    const res = await setProfile({ ...draft, setupComplete: true })
    setEdits(null)
    setSaveMsg(res.cloud === 'saved' ? 'Saved to your account.' : res.cloud === 'error' ? 'Saved on this device (account sync failed).' : 'Saved on this device.')
  }

  return (
    <Card>
      <h3 className="text-lg font-semibold text-white">Keyboard</h3>
      <p className="mt-1 max-w-2xl text-sm text-zinc-400">Browsers can tell which <em>key</em> you press but not which keyboard model you own, how big it is, or which finger you used. So you choose your keyboard here; TouchType uses it for the on-screen map, lesson keys and finger assignments, and checks it against what you actually type.</p>

      <div className="mt-5 grid gap-6 lg:grid-cols-3">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-zinc-300">Layout</legend>
          <div className="space-y-1.5">
            {LAYOUT_IDS.map((id) => (
              <label key={id} className={cx('flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition', draft.layout === id ? 'border-emerald-600/70 bg-emerald-500/5 text-white' : 'border-zinc-800 text-zinc-400 hover:border-zinc-600')}>
                <input type="radio" name="layout" checked={draft.layout === id} onChange={() => set({ layout: id, physical: LAYOUTS[id].defaultPhysical })} />
                {LAYOUTS[id].label}
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={detect}>Detect from my system</Button>
            {detected && <Button size="sm" onClick={() => { set({ layout: detected, physical: LAYOUTS[detected].defaultPhysical }); setDetected(null) }}>Use {LAYOUTS[detected].label}</Button>}
          </div>
          {detectMsg && <p className="mt-2 text-xs text-zinc-500">{detectMsg}</p>}
          {observed && <Notice className="mt-3" tone="info" title={`Your typing looks like ${LAYOUTS[observed.id].label}`}>
            <div className="flex items-center gap-2"><span>{Math.round(observed.score * 100)}% of {observed.total} key presses match.</span><Button size="sm" variant="secondary" onClick={() => set({ layout: observed.id })}>Switch</Button></div></Notice>}
          {obs.isoSeen && draft.physical !== 'iso' && <Notice className="mt-3" tone="info" title="ISO key detected">You pressed the extra ISO key next to left Shift. <Button size="sm" variant="secondary" onClick={() => set({ physical: 'iso' })}>Use ISO</Button></Notice>}
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-zinc-300">Physical shape</legend>
          <div className="mb-3 inline-flex overflow-hidden rounded-lg border border-zinc-800" role="radiogroup" aria-label="ANSI or ISO">
            {['ansi', 'iso'].map((p) => <button key={p} type="button" role="radio" aria-checked={draft.physical === p} onClick={() => set({ physical: p })} className={cx('px-4 py-1.5 text-sm uppercase', draft.physical === p ? 'bg-emerald-500/15 font-semibold text-emerald-400' : 'text-zinc-400')}>{p}</button>)}
          </div>
          <p className="mb-3 text-xs text-zinc-500">ISO has a taller Enter and an extra key left of Z (common in the UK and Europe).</p>
          <div className="space-y-1.5">
            {Object.entries(FORM_FACTORS).map(([id, f]) => (
              <label key={id} className={cx('flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition', draft.formFactor === id ? 'border-emerald-600/70 bg-emerald-500/5 text-white' : 'border-zinc-800 text-zinc-400 hover:border-zinc-600')}>
                <input type="radio" name="ff" checked={draft.formFactor === id} onChange={() => set({ formFactor: id })} /> {f.label}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-500">Smaller boards (60–75%) drop the function row, arrows or numpad – the map and lessons only show keys you have.</p>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-zinc-300">Key tester</legend>
          <p className="text-xs text-zinc-500">Press any key to see what your browser reports.</p>
          <input aria-label="Press keys here to test" readOnly placeholder="Click here, then press a key" onKeyDown={(e) => { e.preventDefault(); setTester({ code: e.code, key: e.key }) }}
            className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-emerald-600" />
          {tester && (
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-zinc-500">Physical key</dt><dd className="font-mono text-zinc-200">{tester.code}</dd></div>
              <div className="flex justify-between"><dt className="text-zinc-500">Character</dt><dd className="font-mono text-zinc-200">{tester.key === ' ' ? 'Space' : tester.key}</dd></div>
              <div className="flex justify-between"><dt className="text-zinc-500">Assigned finger</dt><dd className="text-zinc-200">{FINGERS[fingerOfCode(tester.code)]?.label ?? '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-zinc-500">Matches</dt><dd className="text-zinc-200">{tester.key.length === 1 && testerScore?.total ? (testerScore.score === 1 ? LAYOUTS[testerScore.id].label : 'a different layout') : '—'}</dd></div>
            </dl>
          )}
          <p className="mt-2 text-xs text-zinc-600">{charToKey(draft.layout, 'a') ? `On ${LAYOUTS[draft.layout].label}, the key labelled "${codeLabel(draft.layout, 'KeyA')}" sits at physical A.` : ''}</p>
        </fieldset>
      </div>

      <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-zinc-300">Preview &amp; finger assignments</p>
          <FingerLegend focusFinger={focusFinger} onFocus={setFocusFinger} />
        </div>
        <Keyboard profile={normalizeProfile(draft)} focusFinger={focusFinger} onKeyClick={setPickKey} />
        <p className="mt-3 text-xs text-zinc-500">Optional: click a key to assign it to a different finger if you use a non-standard technique. Standard touch-typing assignments are used otherwise.</p>
        {pickKey && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-zinc-900 p-3 text-sm">
            <span className="text-zinc-300">Key <strong>{codeLabel(draft.layout, pickKey)}</strong> →</span>
            <select value={draft.fingerOverrides?.[pickKey] ?? fingerOfCode(pickKey) ?? ''} onChange={(e) => set({ fingerOverrides: { ...draft.fingerOverrides, [pickKey]: e.target.value } })} className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1">
              {FINGER_ORDER.map((f) => <option key={f} value={f}>{FINGERS[f].label}</option>)}
            </select>
            <Button size="sm" variant="ghost" onClick={() => { const o = { ...draft.fingerOverrides }; delete o[pickKey]; set({ fingerOverrides: o }); setPickKey(null) }}>Reset key</Button>
            <Button size="sm" variant="ghost" onClick={() => setPickKey(null)}>Close</Button>
          </div>
        )}
        {Object.keys(draft.fingerOverrides ?? {}).length > 0 && <p className="mt-2 text-xs text-zinc-500">{Object.keys(draft.fingerOverrides).length} custom assignment(s). <button type="button" className="underline" onClick={() => set({ fingerOverrides: {} })}>Reset all</button></p>}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={!dirty}>{profile.setupComplete ? 'Save changes' : 'Save keyboard'}</Button>
        {profile.setupComplete && !dirty && <Badge tone="good">Saved</Badge>}
        {saveMsg && <span className="text-sm text-zinc-400">{saveMsg}</span>}
        {obs.pairs && Object.keys(obs.pairs).length > 0 && (
          <button type="button" className="text-xs text-zinc-600 underline" onClick={() => { removeKey('layoutObs.v1'); setObs({ pairs: {}, isoSeen: false }) }}>Clear typing-based layout hints</button>
        )}
      </div>
    </Card>
  )
}
