import { Link } from 'react-router-dom'

const features = [
  {
    title: 'Real-time WPM tracking',
    description:
      'Measure words per minute and accuracy as you type, with live feedback on every keystroke.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
      </svg>
    ),
  },
  {
    title: 'Webcam eye detection',
    description:
      'Your webcam watches where you look. Glance down at the keys and the app knows instantly.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
  },
  {
    title: 'Peek penalty system',
    description:
      'Every peek costs you. Penalties keep you honest and build the habit of true touch typing.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
      </svg>
    ),
  },
  {
    title: 'Progress dashboard',
    description:
      'Track WPM trends, peek counts, and session history to see how your discipline improves over time.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v.008H9v-.008Zm6 0v.008h-.008V11.25Zm-3 0v.008h-.008V11.25Z" />
      </svg>
    ),
  },
]

export default function Home() {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute top-1/2 right-0 h-64 w-64 rounded-full bg-emerald-600/5 blur-3xl" />
      </div>

      <section className="relative mx-auto max-w-5xl px-4 pb-16 pt-14 text-center sm:px-6 sm:pb-20 sm:pt-28">
        <p className="mb-4 inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
          Touch typing trainer
        </p>

        <h1 className="mx-auto max-w-3xl text-3xl font-bold tracking-tight text-zinc-900 sm:text-6xl dark:text-white">
          Type faster.{' '}
          <span className="text-emerald-600 dark:text-emerald-400">Stop peeking.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg dark:text-zinc-400">
          NoPeek uses your webcam to detect when you look at the keyboard and penalizes
          you for every glance. Build real touch typing muscle memory — no cheating.
        </p>

        <div className="mt-10 flex flex-col items-stretch justify-center gap-4 sm:flex-row sm:items-center">
          <Link
            to="/calibrate"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-500"
          >
            Start Typing
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:text-white"
          >
            View dashboard
          </Link>
        </div>
      </section>

      <section className="relative border-t border-zinc-200 bg-zinc-100/60 px-4 py-16 sm:px-6 sm:py-20 dark:border-zinc-800/80 dark:bg-zinc-900/30">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
              How NoPeek keeps you honest
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-zinc-600 dark:text-zinc-400">
              Everything you need to break the peek habit and track real progress.
            </p>
          </div>

          <ul className="mt-10 grid gap-6 sm:mt-14 sm:grid-cols-2">
            {features.map((feature) => (
              <li
                key={feature.title}
                className="rounded-xl border border-zinc-200 bg-white p-6 transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950/60 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/40"
              >
                <div className="mb-4 inline-flex rounded-lg bg-emerald-500/10 p-2.5 text-emerald-600 dark:text-emerald-400">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {feature.description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
