import { useMemo, useState } from 'react'
import Keyboard, { FingerLegend } from './Keyboard.jsx'
import { Badge, Button, Card, Notice, Seg } from './ui.jsx'
import { removeKey } from '../data/localStore.js'
import { readLayoutObservations } from '../data/repo.js'
import { useTraining } from '../data/trainingContext.js'
import { FINGERS, FINGER_ORDER, FORM_FACTORS, LAYOUTS, LAYOUT_IDS, codeLabel, fingerOfCode, layoutFromLayoutMap, normalizeProfile, scoreLayouts, suggestLayout } from '../training/keyboard.js'

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

  const select = 'mt-1.5 block w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-600'
  return (
    <Card className="p-6">
      <h3 className="text-lg font-medium text-white">Keyboard</h3>
      <p className="mt-1 max-w-xl text-sm text-zinc-400">Lessons, the on-screen map and finger hints follow the keyboard you choose here. Browsers can&apos;t detect your keyboard&apos;s size or shape, so pick them once.</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <label className="text-sm text-zinc-400">Layout
          <select className={select} value={draft.layout} onChange={(e) => set({ layout: e.target.value, physical: LAYOUTS[e.target.value].defaultPhysical })}>
            {LAYOUT_IDS.map((id) => <option key={id} value={id}>{LAYOUTS[id].label}</option>)}
          </select>
        </label>
        <label className="text-sm text-zinc-400">Size
          <select className={select} value={draft.formFactor} onChange={(e) => set({ formFactor: e.target.value })}>
            {Object.entries(FORM_FACTORS).map(([id, f]) => <option key={id} value={id}>{f.label}</option>)}
          </select>
        </label>
        <div className="text-sm text-zinc-400">
          <span id="shape-label">Shape</span>
          <div className="mt-1.5"><Seg label="ANSI or ISO" value={draft.physical} onChange={(v) => set({ physical: v })} options={[{ id: 'ansi', label: 'ANSI' }, { id: 'iso', label: 'ISO' }]} /></div>
          <p className="mt-1 text-xs text-zinc-500">ISO: tall Enter, extra key left of Z.</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="-ml-3" onClick={detect}>Detect my layout</Button>
        {detected && <Button size="sm" onClick={() => { set({ layout: detected, physical: LAYOUTS[detected].defaultPhysical }); setDetected(null) }}>Use {LAYOUTS[detected].label}</Button>}
        {detectMsg && <p className="w-full text-xs text-zinc-500">{detectMsg}</p>}
      </div>
      {observed && <Notice className="mt-3" tone="info" title={`Your typing looks like ${LAYOUTS[observed.id].label}`}>
        <div className="flex flex-wrap items-center gap-2"><span>{Math.round(observed.score * 100)}% of {observed.total} key presses match.</span><Button size="sm" variant="secondary" onClick={() => set({ layout: observed.id })}>Switch</Button></div></Notice>}
      {obs.isoSeen && draft.physical !== 'iso' && <Notice className="mt-3" tone="info" title="ISO key detected">You pressed the extra ISO key next to left Shift. <Button size="sm" variant="secondary" onClick={() => set({ physical: 'iso' })}>Use ISO</Button></Notice>}

      <div className="mt-5 flex min-h-9 flex-wrap items-center gap-3">
        {dirty && <Button onClick={save}>{profile.setupComplete ? 'Save changes' : 'This is my keyboard'}</Button>}
        {dirty && edits && <Button variant="ghost" onClick={() => setEdits(null)}>Discard</Button>}
        {!dirty && <Badge tone="good">Saved</Badge>}
        {saveMsg && <span className="text-sm text-zinc-400">{saveMsg}</span>}
      </div>

      <details className="group mt-6 border-t border-zinc-800 pt-4">
        <summary className="cursor-pointer text-sm text-zinc-300 hover:text-white">Preview, finger assignments and key tester</summary>
        <div className="mt-4">
          <div className="mb-3"><FingerLegend focusFinger={focusFinger} onFocus={setFocusFinger} /></div>
          <Keyboard profile={normalizeProfile(draft)} focusFinger={focusFinger} onKeyClick={setPickKey} />
          <p className="mt-3 text-xs text-zinc-500">Click a key to give it to a different finger, only if you deliberately use a non-standard technique.</p>
          {pickKey && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-zinc-950 p-3 text-sm">
              <span className="text-zinc-300">Key <strong>{codeLabel(draft.layout, pickKey)}</strong> →</span>
              <select value={draft.fingerOverrides?.[pickKey] ?? fingerOfCode(pickKey) ?? ''} onChange={(e) => set({ fingerOverrides: { ...draft.fingerOverrides, [pickKey]: e.target.value } })} className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1">
                {FINGER_ORDER.map((f) => <option key={f} value={f}>{FINGERS[f].label}</option>)}
              </select>
              <Button size="sm" variant="ghost" onClick={() => { const o = { ...draft.fingerOverrides }; delete o[pickKey]; set({ fingerOverrides: o }); setPickKey(null) }}>Reset key</Button>
              <Button size="sm" variant="ghost" onClick={() => setPickKey(null)}>Close</Button>
            </div>
          )}
          {Object.keys(draft.fingerOverrides ?? {}).length > 0 && <p className="mt-2 text-xs text-zinc-500">{Object.keys(draft.fingerOverrides).length} custom assignment(s). <button type="button" className="underline" onClick={() => set({ fingerOverrides: {} })}>Reset all</button></p>}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-zinc-300">Key tester</p>
              <p className="text-xs text-zinc-500">Press any key to see what your browser reports.</p>
              <input aria-label="Press keys here to test" readOnly placeholder="Click here, then press a key" onKeyDown={(e) => { e.preventDefault(); setTester({ code: e.code, key: e.key }) }}
                className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600" />
            </div>
            {tester && (
              <dl className="space-y-1 self-end text-sm">
                <div className="flex justify-between"><dt className="text-zinc-500">Physical key</dt><dd className="font-mono text-zinc-200">{tester.code}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-500">Character</dt><dd className="font-mono text-zinc-200">{tester.key === ' ' ? 'Space' : tester.key}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-500">Finger</dt><dd className="text-zinc-200">{FINGERS[fingerOfCode(tester.code)]?.label ?? '–'}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-500">Matches</dt><dd className="text-zinc-200">{tester.key.length === 1 && testerScore?.total ? (testerScore.score === 1 ? LAYOUTS[testerScore.id].label : 'a different layout') : '–'}</dd></div>
              </dl>
            )}
          </div>
          {obs.pairs && Object.keys(obs.pairs).length > 0 && (
            <button type="button" className="mt-4 text-xs text-zinc-500 underline" onClick={() => { removeKey('layoutObs.v1'); setObs({ pairs: {}, isoSeen: false }) }}>Clear typing-based layout hints</button>
          )}
        </div>
      </details>
    </Card>
  )
}
