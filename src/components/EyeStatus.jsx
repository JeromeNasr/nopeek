import { describeEye } from '../eye/describe.js'
import { useEye } from '../eye/useEye.js'
import { cx } from '../lib/cx.js'

const DOT = { good: 'bg-emerald-400', bad: 'bg-amber-400', info: 'bg-sky-400', warn: 'bg-zinc-500', off: 'border border-zinc-600' }

export default function EyeStatus({ compact = false, className }) {
  const eye = useEye()
  const d = describeEye(eye)
  return (
    <span className={cx('inline-flex items-center gap-2 text-xs text-zinc-400', className)} title={d.detail || undefined}>
      <span className={cx('h-2.5 w-2.5 rounded-full transition-colors', DOT[d.tone])} aria-hidden="true" />
      {!compact && <span aria-live="off">{d.text}</span>}
      {compact && <span className="sr-only">{d.text}</span>}
    </span>
  )
}
