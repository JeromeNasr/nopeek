import { Component, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { cx } from '../lib/cx.js'

const BUTTON = {
  primary: 'btn-primary',
  secondary: 'border border-white/10 bg-white/[0.03] text-zinc-100 hover:border-white/25 hover:bg-white/[0.07]',
  ghost: 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]',
  danger: 'border border-red-500/25 text-red-300 hover:bg-red-500/10',
}

export function Button({ variant = 'primary', size = 'md', className, as, to, ...props }) {
  const cls = cx(
    'btn inline-flex items-center justify-center gap-2 rounded-xl disabled:cursor-not-allowed disabled:opacity-45',
    size === 'sm' ? 'px-3 py-1.5 text-sm' : size === 'lg' ? 'px-7 py-3.5 text-base' : 'px-5 py-2.5 text-sm',
    BUTTON[variant],
    className,
  )
  if (to) return <Link to={to} className={cls} {...props} />
  const Tag = as ?? 'button'
  return <Tag type={Tag === 'button' ? 'button' : undefined} className={cls} {...props} />
}

export function Card({ className, children, as: Tag = 'section', hover = false, i = 0, style, ...props }) {
  return (
    <Tag className={cx('card p-5', hover && 'card-hover', className)} style={{ '--i': i, ...style }} {...props}>
      {children}
    </Tag>
  )
}

export function PageHeader({ title, subtitle, eyebrow, children }) {
  return (
    <div className="mb-8 flex animate-fade-up flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">{eyebrow}</p>}
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2.5 max-w-2xl text-[0.95rem] leading-relaxed text-zinc-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

/** Animates a number from 0 (or its previous value) to `value`. */
export function CountUp({ value, decimals = 0, duration = 700 }) {
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
      const eased = 1 - (1 - p) ** 3
      setShown(start + (value - start) * eased)
      if (p < 1) raf = requestAnimationFrame(step)
      else from.current = value
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  if (typeof value !== 'number' || !Number.isFinite(value)) return <>{value ?? '—'}</>
  return <>{shown.toFixed(decimals)}</>
}

export function Stat({ label, value, unit, hint, tone, className, i = 0, decimals }) {
  const toneCls = { good: 'text-emerald-300', warn: 'text-amber-300', bad: 'text-rose-300' }[tone] ?? 'text-white'
  const numeric = typeof value === 'number' && Number.isFinite(value)
  return (
    <div className={cx('card p-4', className)} style={{ '--i': i }}>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className={cx('mt-1.5 text-[1.7rem] font-semibold leading-none tabular-nums tracking-tight', toneCls)}>
        {numeric ? <CountUp value={value} decimals={decimals ?? (Number.isInteger(value) ? 0 : 1)} /> : (value ?? '—')}
        {value != null && unit && <span className="ml-0.5 text-sm font-medium text-zinc-500">{unit}</span>}
      </p>
      {hint && <p className="mt-2 text-xs text-zinc-500">{hint}</p>}
    </div>
  )
}

const BADGE = {
  neutral: 'bg-white/[0.06] text-zinc-300',
  good: 'bg-emerald-500/15 text-emerald-300',
  warn: 'bg-amber-500/15 text-amber-300',
  bad: 'bg-rose-500/15 text-rose-300',
  info: 'bg-sky-500/15 text-sky-300',
}
export function Badge({ tone = 'neutral', children, className }) {
  return <span className={cx('inline-flex animate-pop items-center rounded-full px-2.5 py-0.5 text-xs font-medium', BADGE[tone], className)}>{children}</span>
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div role="status" aria-label={label} className="space-y-3 py-6">
      <div className="skeleton h-8 w-56" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((k) => <div key={k} className="skeleton h-24" />)}</div>
      <div className="skeleton h-40" />
      <span className="sr-only">{label}</span>
    </div>
  )
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="animate-fade-up rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
      <p className="text-lg font-medium text-zinc-100">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-500">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function Notice({ tone = 'info', title, children, className }) {
  const t = {
    info: 'border-sky-500/20 bg-sky-500/[0.06] text-sky-100',
    warn: 'border-amber-500/20 bg-amber-500/[0.06] text-amber-100',
    bad: 'border-rose-500/25 bg-rose-500/[0.07] text-rose-100',
    good: 'border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-100',
  }[tone]
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={cx('animate-fade-up rounded-xl border px-4 py-3 text-sm', t, className)}>
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={title ? 'mt-1 opacity-85' : 'opacity-90'}>{children}</div>}
    </div>
  )
}

/** Small CSS tooltip. Keyboard accessible: shown on focus too. */
export function Tip({ text, children }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-max max-w-[16rem] -translate-x-1/2 translate-y-1 rounded-lg border border-white/10 bg-zinc-800 px-2.5 py-1.5 text-xs font-normal normal-case tracking-normal text-zinc-200 opacity-0 shadow-xl transition duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
        {text}
      </span>
    </span>
  )
}

export function ProgressBar({ value, max = 100, tone = 'brand', label }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const color = { brand: 'linear-gradient(90deg, var(--accent), var(--accent-2))', warn: '#fbbf24', bad: '#fb7185', info: '#38bdf8' }[tone]
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
      <div className="h-full rounded-full transition-[width] duration-300 ease-out" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

/** Segmented control (radio group). */
export function Seg({ options, value, onChange, label, format = (v) => v }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-white/[0.08] bg-white/[0.03] p-0.5">
      {options.map((o) => {
        const v = typeof o === 'object' ? o.id : o
        const text = typeof o === 'object' ? o.label : format(o)
        return (
          <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
            className={cx('btn rounded-[0.6rem] px-3 py-1.5 text-sm', value === v ? 'bg-white/[0.09] font-semibold text-emerald-300 shadow-sm' : 'text-zinc-400 hover:text-zinc-100')}>
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
      className={cx('btn rounded-xl border px-3 py-1.5 text-sm', checked ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:text-zinc-100')}>
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
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <h1 className="text-2xl font-semibold text-white">Something went wrong</h1>
        <p className="mt-3 text-zinc-400">This page hit an unexpected error. Your saved sessions are safe.</p>
        <pre className="mt-4 overflow-auto rounded-lg bg-zinc-900 p-3 text-left text-xs text-zinc-500">{String(this.state.error?.message ?? this.state.error)}</pre>
        <Button className="mt-6" onClick={() => this.setState({ error: null })}>Try again</Button>
      </div>
    )
  }
}
