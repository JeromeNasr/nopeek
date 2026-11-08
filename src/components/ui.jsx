import { Component } from 'react'
import { Link } from 'react-router-dom'

import { cx } from '../lib/cx.js'

const BUTTON = {
  primary: 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold shadow-lg shadow-emerald-950/30',
  secondary: 'border border-zinc-700 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800/60',
  ghost: 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60',
  danger: 'border border-red-900/60 text-red-300 hover:bg-red-950/40',
}

export function Button({ variant = 'primary', size = 'md', className, as, to, ...props }) {
  const cls = cx(
    'inline-flex items-center justify-center gap-2 rounded-lg transition disabled:cursor-not-allowed disabled:opacity-50',
    size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-5 py-2.5 text-sm',
    BUTTON[variant],
    className,
  )
  if (to) return <Link to={to} className={cls} {...props} />
  const Tag = as ?? 'button'
  return <Tag type={Tag === 'button' ? 'button' : undefined} className={cls} {...props} />
}

export function Card({ className, children, as: Tag = 'section', ...props }) {
  return (
    <Tag className={cx('rounded-xl border border-zinc-800 bg-zinc-900/50 p-5', className)} {...props}>
      {children}
    </Tag>
  )
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-zinc-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

export function Stat({ label, value, unit, hint, tone, className }) {
  const toneCls = { good: 'text-emerald-300', warn: 'text-amber-300', bad: 'text-red-300' }[tone] ?? 'text-white'
  return (
    <div className={cx('rounded-xl border border-zinc-800 bg-zinc-900/50 p-4', className)}>
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={cx('mt-1.5 text-2xl font-semibold tabular-nums', toneCls)}>
        {value ?? '—'}
        {value != null && unit && <span className="ml-0.5 text-base text-zinc-500">{unit}</span>}
      </p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  )
}

const BADGE = {
  neutral: 'bg-zinc-800 text-zinc-300',
  good: 'bg-emerald-500/15 text-emerald-300',
  warn: 'bg-amber-500/15 text-amber-300',
  bad: 'bg-red-500/15 text-red-300',
  info: 'bg-sky-500/15 text-sky-300',
}
export function Badge({ tone = 'neutral', children, className }) {
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', BADGE[tone], className)}>{children}</span>
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div role="status" className="flex items-center gap-3 py-12 text-zinc-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-400" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-10 text-center">
      <p className="font-medium text-zinc-200">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Notice({ tone = 'info', title, children, className }) {
  const t = {
    info: 'border-sky-900/60 bg-sky-950/30 text-sky-200',
    warn: 'border-amber-900/60 bg-amber-950/30 text-amber-200',
    bad: 'border-red-900/60 bg-red-950/30 text-red-200',
    good: 'border-emerald-900/60 bg-emerald-950/30 text-emerald-200',
  }[tone]
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={cx('rounded-lg border px-4 py-3 text-sm', t, className)}>
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={title ? 'mt-1 opacity-90' : ''}>{children}</div>}
    </div>
  )
}

/** Small CSS tooltip. Keyboard accessible: shown on focus too. */
export function Tip({ text, children }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-max max-w-[16rem] -translate-x-1/2 rounded-md bg-zinc-800 px-2.5 py-1.5 text-xs font-normal normal-case tracking-normal text-zinc-200 opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  )
}

export function ProgressBar({ value, max = 100, tone = 'brand', label }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const color = { brand: 'bg-emerald-500', warn: 'bg-amber-400', bad: 'bg-red-400', info: 'bg-sky-400' }[tone]
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
      <div className={cx('h-full rounded-full transition-all duration-300', color)} style={{ width: `${pct}%` }} />
    </div>
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
