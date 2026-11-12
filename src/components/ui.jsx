import { Component, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { cx } from '../lib/cx.js'

const BUTTON = {
  primary: 'btn-primary',
  secondary: 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700',
  ghost: 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800',
  danger: 'text-[#e0605b] hover:bg-zinc-800',
}

export function Button({ variant = 'primary', size = 'md', className, as, to, ...props }) {
  const cls = cx(
    'btn inline-flex items-center justify-center gap-2 rounded-lg disabled:cursor-not-allowed disabled:opacity-40',
    size === 'sm' ? 'px-3 py-1.5 text-sm' : size === 'lg' ? 'px-6 py-3 text-[0.95rem]' : 'px-4 py-2 text-sm',
    BUTTON[variant],
    className,
  )
  if (to) return <Link to={to} className={cls} {...props} />
  const Tag = as ?? 'button'
  return <Tag type={Tag === 'button' ? 'button' : undefined} className={cls} {...props} />
}

export function Card({ className, children, as: Tag = 'section', hover = false, ...props }) {
  const rest = { ...props }
  delete rest.i // legacy stagger index, no longer used
  return <Tag className={cx('card p-5', hover && 'card-hover', className)} {...rest}>{children}</Tag>
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-xl text-zinc-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

/** Section heading: small, quiet, with a hairline. */
export function SectionTitle({ children, aside, className }) {
  return (
    <div className={cx('mb-4 flex items-baseline justify-between gap-3 border-b border-zinc-800 pb-2', className)}>
      <h2 className="text-sm font-medium text-zinc-300">{children}</h2>
      {aside && <span className="text-xs text-zinc-500">{aside}</span>}
    </div>
  )
}

/** Animates a number toward `value` (transform-free: text only, one element). */
export function CountUp({ value, decimals = 0, duration = 500 }) {
  const [shown, setShown] = useState(value)
  const from = useRef(0)
  useEffect(() => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      from.current = value
      return undefined
    }
    const start = from.current
    const t0 = performance.now()
    let raf
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration)
      setShown(start + (value - start) * (1 - (1 - p) ** 3))
      if (p < 1) raf = requestAnimationFrame(step)
      else from.current = value
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  if (typeof value !== 'number' || !Number.isFinite(value)) return <>{value ?? '–'}</>
  return <>{shown.toFixed(decimals)}</>
}

/** A number with a label. Flat: no box. */
export function Stat({ label, value, unit, hint, tone, className, decimals }) {
  const toneCls = { good: 'text-emerald-400', warn: 'text-zinc-100', bad: 'text-[#e0605b]' }[tone] ?? 'text-zinc-100'
  const numeric = typeof value === 'number' && Number.isFinite(value)
  return (
    <div className={className}>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={cx('mt-0.5 font-mono text-2xl font-medium tabular-nums', toneCls)}>
        {numeric ? (decimals ?? (Number.isInteger(value) ? 0 : 1)) === 0 ? Math.round(value) : value.toFixed(decimals ?? 1) : (value ?? '–')}
        {value != null && unit && <span className="ml-0.5 text-sm text-zinc-500">{unit}</span>}
      </p>
      {hint && <p className="mt-0.5 text-xs text-zinc-600">{hint}</p>}
    </div>
  )
}

const BADGE = { neutral: 'text-zinc-400', good: 'text-emerald-400', warn: 'text-[#d9a441]', bad: 'text-[#e0605b]', info: 'text-zinc-300' }
export function Badge({ tone = 'neutral', children, className }) {
  return <span className={cx('inline-flex items-center rounded-md bg-zinc-800 px-2 py-0.5 text-xs', BADGE[tone], className)}>{children}</span>
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div role="status" aria-label={label} className="space-y-3 py-6">
      <div className="skeleton h-6 w-48" />
      <div className="skeleton h-24" />
      <div className="skeleton h-40" />
    </div>
  )
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="py-10">
      <p className="font-medium text-zinc-100">{title}</p>
      {children && <p className="mt-1.5 max-w-md text-sm text-zinc-500">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Notice({ tone = 'info', title, children, className }) {
  const bar = { info: 'border-zinc-600', warn: 'border-[#d9a441]', bad: 'border-[#e0605b]', good: 'border-emerald-500' }[tone]
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={cx('border-l-2 bg-zinc-900 px-4 py-3 text-sm text-zinc-300', bar, className)}>
      {title && <p className="font-medium text-zinc-100">{title}</p>}
      {children && <div className={title ? 'mt-0.5 text-zinc-400' : ''}>{children}</div>}
    </div>
  )
}

export function Tip({ text, children }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-max max-w-[16rem] -translate-x-1/2 rounded-md bg-zinc-700 px-2.5 py-1.5 text-xs text-zinc-100 opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100">
        {text}
      </span>
    </span>
  )
}

export function ProgressBar({ value, max = 100, tone = 'brand', label }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const color = { brand: 'var(--accent)', warn: '#d9a441', bad: '#e0605b', info: 'var(--n-400)' }[tone]
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} className="h-0.5 overflow-hidden bg-zinc-800">
      <div className="h-full origin-left transition-transform duration-300 ease-out" style={{ transform: `scaleX(${pct / 100})`, background: color }} />
    </div>
  )
}

/** Segmented control (radio group): plain text options, the selected one takes the accent. */
export function Seg({ options, value, onChange, label, format = (v) => v }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap items-center rounded-lg bg-zinc-900 p-0.5">
      {options.map((o) => {
        const v = typeof o === 'object' ? o.id : o
        const text = typeof o === 'object' ? o.label : format(o)
        return (
          <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
            className={cx('btn rounded-md px-2.5 py-1 text-sm', value === v ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-500 hover:text-zinc-200')}>
            {text}
          </button>
        )
      })}
    </div>
  )
}

export function Toggle({ label, checked, onChange, hint }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} title={hint}
      className={cx('btn rounded-md px-2.5 py-1 text-sm', checked ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-200')}>
      {label}
    </button>
  )
}

export class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto max-w-xl px-6 py-20">
        <h1 className="text-xl font-semibold text-white">Something went wrong</h1>
        <p className="mt-2 text-zinc-400">This page hit an unexpected error. Your saved sessions are safe.</p>
        <pre className="mt-4 overflow-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-500">{String(this.state.error?.message ?? this.state.error)}</pre>
        <Button className="mt-6" onClick={() => this.setState({ error: null })}>Try again</Button>
      </div>
    )
  }
}
