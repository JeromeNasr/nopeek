import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../data/useAuth'

export default function Login() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  const isSignIn = mode === 'signin'

  function switchMode(nextMode) {
    setMode(nextMode)
    setError(null)
    setMessage(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      if (!supabase) throw new Error('Accounts are not configured for this deployment. Your progress is saved on this device.')
      if (isSignIn) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (signInError) throw signInError
        navigate('/analyze')
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        })
        if (signUpError) throw signUpError

        if (data.session) {
          navigate('/analyze')
        } else {
          setMessage('Check your email to confirm your account.')
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (user) {
    return (
      <div className="mx-auto flex max-w-md flex-col px-6 py-16">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-white">You&apos;re signed in</h1>
          <p className="mt-2 text-sm text-zinc-400">{user.email}</p>
          <p className="mt-2 text-sm text-zinc-500">Sessions and your keyboard setup sync to your account. Eye-tracking calibration and the camera stay on this device.</p>
          <div className="mt-6 flex gap-3">
            <button type="button" onClick={() => navigate('/analyze')} className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400">View analytics</button>
            <button type="button" onClick={async () => { await supabase.auth.signOut(); navigate('/') }} className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-300 hover:border-zinc-500">Sign out</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-6 py-16">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 shadow-xl shadow-black/20">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          {isSignIn ? 'Welcome back' : 'Create an account'}
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          {isSignIn
            ? 'Sign in to sync your progress across devices.'
            : 'Sign up to keep your sessions and keyboard setup across devices.'}
        </p>

        <div className="mt-6 flex rounded-lg bg-zinc-950 p-1">
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className={[
              'flex-1 rounded-md px-3 py-2 text-sm font-medium transition',
              isSignIn
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200',
            ].join(' ')}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => switchMode('signup')}
            className={[
              'flex-1 rounded-md px-3 py-2 text-sm font-medium transition',
              !isSignIn
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200',
            ].join(' ')}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-300">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-white placeholder-zinc-500 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-zinc-300">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={isSignIn ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-white placeholder-zinc-500 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-red-900/50 bg-red-950/50 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          {message && (
            <p className="rounded-lg border border-emerald-900/50 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-400">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Please wait…' : isSignIn ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}
