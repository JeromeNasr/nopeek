import { Link } from 'react-router-dom'
import { describeEye } from '../eye/describe.js'
import { useEyeValue } from '../eye/useEye.js'
import { cx } from '../lib/cx.js'

const DOT = { good: 'bg-emerald-400', bad: 'bg-[color:var(--warn)]', info: 'bg-zinc-400', warn: 'bg-zinc-500', off: 'border border-zinc-600' }
const SEP = '\u0000'

/**
 * Live eye-tracking status. Subscribes to one derived string, so it re-renders only when
 * the visible status changes (not on every camera frame).
 * - `compact`: dot only (text for screen readers)
 * - `hideWhenOff`: render nothing while tracking is switched off
 * - `actionable`: when off or not calibrated, show a link to set it up instead
 */
export default function EyeStatus({ compact = false, hideWhenOff = false, actionable = false, className }) {
  const key = useEyeValue((e) => {
    const d = describeEye(e)
    const setup = !e.settings.enabled ? (e.calibrated ? 'enable' : 'setup') : !e.calibrated ? 'setup' : ''
    return [d.tone, d.text, d.detail, setup].join(SEP)
  })
  const [tone, text, detail, setup] = key.split(SEP)
  if (hideWhenOff && setup) return null
  if (actionable && setup) {
    return (
      <Link to="/setup#eye" className={cx('inline-flex items-center gap-2 rounded-md text-xs text-zinc-500 hover:text-zinc-200', className)}>
        <span className={cx('h-2.5 w-2.5 rounded-full', DOT.off)} aria-hidden="true" />
        {setup === 'enable' ? 'Eye tracking off · turn on' : 'Eye tracking · set up'}
      </Link>
    )
  }
  return (
    <span className={cx('inline-flex items-center gap-2 text-xs text-zinc-400', className)} title={detail || undefined}>
      <span className={cx('h-2.5 w-2.5 rounded-full transition-colors duration-200', DOT[tone])} aria-hidden="true" />
      {compact ? <span className="sr-only">{text}</span> : <span>{text}</span>}
    </span>
  )
}
