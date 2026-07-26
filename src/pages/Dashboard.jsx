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
import { supabase } from '../supabaseClient'

function toLocalDateString(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

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

function calculateStreak(sessions) {
  if (sessions.length === 0) return 0

  const sessionDates = new Set(
    sessions.map((session) => toLocalDateString(new Date(session.created_at))),
  )

  let streak = 0
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)

  const today = toLocalDateString(cursor)
  if (!sessionDates.has(today)) {
    cursor.setDate(cursor.getDate() - 1)
  }

  while (sessionDates.has(toLocalDateString(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }

  return streak
}

function StatCard({ label, value, suffix = '' }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-white">
        {value}
        {suffix && <span className="text-lg text-zinc-400">{suffix}</span>}
      </p>
    </div>
  )
}

export default function Dashboard() {
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

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-zinc-400">Loading dashboard…</p>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16 text-center">
        <h1 className="text-3xl font-semibold text-white">Dashboard</h1>
        <p className="mt-3 text-zinc-400">Sign in to view your typing progress.</p>
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
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Dashboard</h1>
        <p className="mt-2 text-zinc-400">Track your WPM, accuracy, and eye discipline over time.</p>
      </div>

      {error && (
        <p className="mb-6 rounded-lg border border-red-900/50 bg-red-950/50 px-4 py-3 text-sm text-red-400">
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

      <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="text-lg font-semibold text-white">Progress over time</h2>
        <p className="mt-1 text-sm text-zinc-400">WPM and eye discipline across your sessions.</p>

        {sessions.length === 0 ? (
          <p className="mt-8 text-sm text-zinc-500">
            No sessions yet. Complete a typing test to see your stats here.
          </p>
        ) : (
          <div className="mt-6 h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#3f3f46" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#a1a1aa', fontSize: 12 }}
                  axisLine={{ stroke: '#52525b' }}
                  tickLine={{ stroke: '#52525b' }}
                />
                <YAxis
                  yAxisId="wpm"
                  orientation="left"
                  tick={{ fill: '#34d399', fontSize: 12 }}
                  axisLine={{ stroke: '#52525b' }}
                  tickLine={{ stroke: '#52525b' }}
                />
                <YAxis
                  yAxisId="discipline"
                  orientation="right"
                  domain={[0, 100]}
                  tick={{ fill: '#60a5fa', fontSize: 12 }}
                  axisLine={{ stroke: '#52525b' }}
                  tickLine={{ stroke: '#52525b' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: '1px solid #3f3f46',
                    borderRadius: '0.5rem',
                    color: '#fafafa',
                  }}
                  labelStyle={{ color: '#a1a1aa' }}
                />
                <Legend wrapperStyle={{ color: '#d4d4d8', paddingTop: '12px' }} />
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

      <section className="mt-8 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
        <div className="border-b border-zinc-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Recent sessions</h2>
        </div>

        {recentSessions.length === 0 ? (
          <p className="px-6 py-8 text-sm text-zinc-500">No sessions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-zinc-950/60 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">WPM</th>
                  <th className="px-6 py-3 font-medium">Accuracy</th>
                  <th className="px-6 py-3 font-medium">Peeks</th>
                  <th className="px-6 py-3 font-medium">Eye discipline</th>
                  <th className="px-6 py-3 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {recentSessions.map((session) => (
                  <tr key={session.id} className="text-zinc-300 transition hover:bg-zinc-950/40">
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
