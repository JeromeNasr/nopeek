import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import useTheme from '../hooks/useTheme'
import { calculateStreak } from '../lib/streak'
import { supabase } from '../supabaseClient'

function formatDateTime(isoString) {
  return new Date(isoString).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatChartLabel(isoString, index, total) {
  const date = new Date(isoString)
  if (total <= 8) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  return index % Math.ceil(total / 8) === 0 || index === total - 1
    ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : ''
}

function average(values) {
  if (values.length === 0) return 0
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function StatCard({ label, value, suffix = '' }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900 sm:text-3xl dark:text-white">
        {value}
        {suffix && <span className="text-lg text-zinc-500 dark:text-zinc-400">{suffix}</span>}
      </p>
    </div>
  )
}

export default function Dashboard() {
  const { theme } = useTheme()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [authenticated, setAuthenticated] = useState(true)

  useEffect(() => {
    async function loadSessions() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setAuthenticated(false)
        setLoading(false)
        return
      }

      const { data, error: fetchError } = await supabase
        .from('sessions')
        .select('id, wpm, accuracy, peeks, eye_discipline, duration_seconds, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })

      if (fetchError) {
        setError(fetchError.message)
      } else {
        setSessions(data ?? [])
      }

      setLoading(false)
    }

    loadSessions()
  }, [])

  const stats = useMemo(() => {
    return {
      total: sessions.length,
      avgWpm: average(sessions.map((session) => session.wpm)),
      avgAccuracy: average(sessions.map((session) => session.accuracy)),
      avgEyeDiscipline: average(sessions.map((session) => session.eye_discipline)),
      streak: calculateStreak(sessions),
    }
  }, [sessions])

  const chartData = useMemo(
    () =>
      sessions.map((session, index) => ({
        label: formatChartLabel(session.created_at, index, sessions.length),
        wpm: session.wpm,
        eyeDiscipline: session.eye_discipline,
      })),
    [sessions],
  )

  const recentSessions = useMemo(
    () => [...sessions].reverse().slice(0, 10),
    [sessions],
  )

  const chartColors =
    theme === 'dark'
      ? { grid: '#3f3f46', axis: '#52525b', tick: '#a1a1aa', wpmTick: '#34d399', disciplineTick: '#60a5fa', tooltipBg: '#18181b', tooltipText: '#fafafa', legend: '#d4d4d8' }
      : { grid: '#e4e4e7', axis: '#d4d4d8', tick: '#52525b', wpmTick: '#059669', disciplineTick: '#2563eb', tooltipBg: '#ffffff', tooltipText: '#18181b', legend: '#3f3f46' }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="text-zinc-600 dark:text-zinc-400">Loading dashboard…</p>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-white">Dashboard</h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">Sign in to view your typing progress.</p>
        <Link
          to="/login"
          className="mt-6 inline-flex rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          Go to login
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">Dashboard</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">Track your WPM, accuracy, and eye discipline over time.</p>
      </div>

      {error && (
        <p className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total sessions" value={stats.total} />
        <StatCard label="Average WPM" value={stats.avgWpm} />
        <StatCard label="Average accuracy" value={stats.avgAccuracy} suffix="%" />
        <StatCard label="Average eye discipline" value={stats.avgEyeDiscipline} suffix="%" />
        <StatCard label="Current streak" value={stats.streak} suffix={stats.streak === 1 ? ' day' : ' days'} />
      </div>

      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Progress over time</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">WPM and eye discipline across your sessions.</p>

        {sessions.length === 0 ? (
          <p className="mt-8 text-sm text-zinc-500">
            No sessions yet. Complete a typing test to see your stats here.
          </p>
        ) : (
          <div className="mt-6 h-64 w-full sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: chartColors.tick, fontSize: 12 }}
                  axisLine={{ stroke: chartColors.axis }}
                  tickLine={{ stroke: chartColors.axis }}
                />
                <YAxis
                  yAxisId="wpm"
                  orientation="left"
                  tick={{ fill: chartColors.wpmTick, fontSize: 12 }}
                  axisLine={{ stroke: chartColors.axis }}
                  tickLine={{ stroke: chartColors.axis }}
                />
                <YAxis
                  yAxisId="discipline"
                  orientation="right"
                  domain={[0, 100]}
                  tick={{ fill: chartColors.disciplineTick, fontSize: 12 }}
                  axisLine={{ stroke: chartColors.axis }}
                  tickLine={{ stroke: chartColors.axis }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartColors.tooltipBg,
                    border: `1px solid ${chartColors.grid}`,
                    borderRadius: '0.5rem',
                    color: chartColors.tooltipText,
                  }}
                  labelStyle={{ color: chartColors.tick }}
                />
                <Legend wrapperStyle={{ color: chartColors.legend, paddingTop: '12px' }} />
                <Line
                  type="monotone"
                  dataKey="wpm"
                  name="WPM"
                  yAxisId="wpm"
                  stroke="#34d399"
                  strokeWidth={2}
                  dot={{ fill: '#34d399', r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="eyeDiscipline"
                  name="Eye discipline"
                  yAxisId="discipline"
                  stroke="#60a5fa"
                  strokeWidth={2}
                  dot={{ fill: '#60a5fa', r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="mt-8 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="border-b border-zinc-200 px-4 py-4 sm:px-6 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Recent sessions</h2>
        </div>

        {recentSessions.length === 0 ? (
          <p className="px-4 py-8 text-sm text-zinc-500 sm:px-6">No sessions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-950/60">
                <tr>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">WPM</th>
                  <th className="px-6 py-3 font-medium">Accuracy</th>
                  <th className="px-6 py-3 font-medium">Peeks</th>
                  <th className="px-6 py-3 font-medium">Eye discipline</th>
                  <th className="px-6 py-3 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {recentSessions.map((session) => (
                  <tr
                    key={session.id}
                    className="text-zinc-700 transition hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-950/40"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">{formatDateTime(session.created_at)}</td>
                    <td className="px-6 py-4 tabular-nums">{session.wpm}</td>
                    <td className="px-6 py-4 tabular-nums">{session.accuracy}%</td>
                    <td className="px-6 py-4 tabular-nums">{session.peeks}</td>
                    <td className="px-6 py-4 tabular-nums">{session.eye_discipline}%</td>
                    <td className="px-6 py-4 tabular-nums">{session.duration_seconds}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
