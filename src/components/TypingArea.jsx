import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { TypingSurface } from '../engine/surface.js'

/**
 * Mount point for the imperative typing renderer. React renders this once per test;
 * keystrokes call `ref.current.update()` and never re-render any component.
 */
const TypingArea = forwardRef(function TypingArea(
  { engine, focused, onFocusRequest, ghostWpm = null, ghostLabel = 'your pace', blurLabel = 'Click here or start typing to focus' },
  ref,
) {
  const viewportRef = useRef(null)
  const surface = useRef(null)

  useEffect(() => {
    const s = new TypingSurface(viewportRef.current, engine, { ghostWpm, ghostLabel })
    surface.current = s
    return () => {
      s.destroy()
      surface.current = null
    }
  }, [engine, ghostWpm, ghostLabel])

  useImperativeHandle(ref, () => ({ update: () => surface.current?.update() }), [])

  return (
    <div className="relative" onMouseDown={(e) => { e.preventDefault(); onFocusRequest?.() }}>
      <div ref={viewportRef} className={'typing-viewport ' + (focused ? '' : 'typing-blur')} role="img" aria-label="Typing text. Type the words shown." />
      {!focused && (
        <button type="button" onClick={onFocusRequest} className="absolute inset-0 flex items-center justify-center text-sm font-medium text-zinc-200">
          {blurLabel}
        </button>
      )}
    </div>
  )
})

export default TypingArea
