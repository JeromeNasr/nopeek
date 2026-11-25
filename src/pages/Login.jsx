import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSupabase } from '../supabaseClient'
import { useAuth } from '../data/useAuth'
import { Button, Notice, Seg } from '../components/ui.jsx'
import { SITE } from '../lib/site.js'

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

  if (!SITE.accounts) {
    return (
      <div className="mx-auto max-w-sm px-6 py-16">
        <h1 className="text-4xl font-medium tracking-tight text-white">No account needed</h1>
        <p className="mt-3 text-zinc-300">Accounts are switched off on this site. Everything you do here – your sessions, settings and eye calibration – is saved in this browser only and is never sent anywhere.</p>
        <p className="mt-3 text-sm text-zinc-500">Clearing this site&apos;s data in your browser deletes it.</p>
        <Button className="mt-8" to="/">Start typing</Button>
      </div>
    )
  }

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
      const supabase = await getSupabase()
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
      setError(/failed to fetch|networkerror|load failed/i.test(err.message) ? "Can't reach the account server right now. Your progress is still saved on this device." : err.message)
    } finally {
      setLoading(false)
    }
  }

  if (user) {
    return (
      <div className="mx-auto max-w-sm px-6 py-16">
        <h1 className="text-4xl font-medium tracking-tight text-white">Your account</h1>
        <p className="mt-2 text-zinc-300">{user.email}</p>
        <p className="mt-3 text-sm text-zinc-500">Sessions and your keyboard setup sync to this account. Eye-tracking calibration and the camera stay on this device.</p>
        <div className="mt-8 flex gap-3">
          <Button onClick={() => navigate('/analyze')}>View progress</Button>
          <Button variant="ghost" onClick={async () => { const supabase = await getSupabase(); await supabase?.auth.signOut(); navigate('/') }}>Sign out</Button>
        </div>
      </div>
    )
  }

  const field = 'mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-white placeholder-zinc-600 outline-none transition-colors focus:border-emerald-500'
  return (
    <div className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-4xl font-medium tracking-tight text-white">{isSignIn ? 'Sign in' : 'Create an account'}</h1>
      <p className="mt-2 text-sm text-zinc-400">
        {isSignIn ? 'Sync your progress across devices. You can also use TouchType without an account – everything is saved on this device.' : 'Keep your sessions and keyboard setup across devices.'}
      </p>

      <div className="mt-8"><Seg label="Account action" value={mode} onChange={switchMode} options={[{ id: 'signin', label: 'Sign in' }, { id: 'signup', label: 'Sign up' }]} /></div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm text-zinc-400">Email</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="you@example.com" />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm text-zinc-400">Password</label>
          <input id="password" type="password" autoComplete={isSignIn ? 'current-password' : 'new-password'} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={field} placeholder={isSignIn ? '' : 'at least 6 characters'} />
        </div>
        {error && <Notice tone="bad">{error}</Notice>}
        {message && <Notice tone="good">{message}</Notice>}
        <Button type="submit" size="lg" className="w-full" disabled={loading}>{loading ? 'Please wait…' : isSignIn ? 'Sign in' : 'Create account'}</Button>
      </form>
    </div>
  )
}
