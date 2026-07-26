import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const WEBGAZER_CDN = 'https://webgazer.cs.brown.edu/webgazer.js'
const SCRIPT_ID = 'webgazer-script'

const CALIBRATION_POINTS = [
  [10, 10],
  [50, 10],
  [90, 10],
  [10, 50],
  [50, 50],
  [90, 50],
  [10, 90],
  [50, 90],
  [90, 90],
]

function recordCalibrationPoint(x, y) {
  if (window.webgazer?.recordScreenPosition) {
    window.webgazer.recordScreenPosition(x, y, 'click')
  }
}

export default function Calibration() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [clicked, setClicked] = useState(() => new Set())
  const complete = clicked.size >= CALIBRATION_POINTS.length

  useEffect(() => {
    if (!complete) return

    const timer = setTimeout(() => navigate('/type'), 2000)
    return () => clearTimeout(timer)
  }, [complete, navigate])

  useEffect(() => {
    let cancelled = false

    function startWebGazer() {
      if (!window.webgazer) {
        setError('WebGazer failed to load.')
        setLoading(false)
        return
      }

      const result = window.webgazer
        .setRegression('ridge')
        .setTracker('TFFacemesh')
        .showVideoPreview(true)
        .showPredictionPoints(false)
        .begin()

      Promise.resolve(result)
        .then(() => {
          if (!cancelled) setLoading(false)
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err.message ?? 'Camera access was denied.')
            setLoading(false)
          }
        })
    }

    const existingScript = document.getElementById(SCRIPT_ID)

    if (existingScript) {
      startWebGazer()
    } else {
      const script = document.createElement('script')
      script.id = SCRIPT_ID
      script.src = WEBGAZER_CDN
      script.async = true
      script.onload = startWebGazer
      script.onerror = () => {
        if (!cancelled) {
          setError('Could not load WebGazer from CDN.')
          setLoading(false)
        }
      }
      document.body.appendChild(script)
    }

    return () => {
      cancelled = true
      if (window.webgazer?.end) {
        window.webgazer.end()
      }
    }
  }, [])

  function handleDotClick(index, event) {
    if (complete || clicked.has(index)) return

    const dot = event.currentTarget
    const rect = dot.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2

    recordCalibrationPoint(x, y)
    setClicked((prev) => new Set(prev).add(index))
  }

  return (
    <div className="relative flex flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <div className="pointer-events-none z-10 px-4 pt-8 text-center sm:px-6">
        {complete ? (
          <p className="text-xl font-semibold text-emerald-600 dark:text-emerald-400">Calibration complete</p>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">Eye tracking calibration</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Look at each red dot and click it. Click all 9 dots to continue.
            </p>
            {loading && (
              <p className="mt-3 text-sm text-zinc-500">Loading WebGazer and requesting camera access…</p>
            )}
            {error && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
            {!loading && !error && (
              <p className="mt-3 text-sm text-zinc-500">
                {clicked.size} / {CALIBRATION_POINTS.length} points calibrated
              </p>
            )}
          </>
        )}
      </div>

      {!loading && !error && (
        <div className="relative min-h-[60vh] w-full flex-1">
          {CALIBRATION_POINTS.map(([x, y], index) => {
            const isClicked = clicked.has(index)

            return (
              <button
                key={index}
                type="button"
                aria-label={`Calibration point ${index + 1}`}
                disabled={isClicked || complete}
                onClick={(event) => handleDotClick(index, event)}
                style={{ left: `${x}%`, top: `${y}%` }}
                className={[
                  'absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full transition',
                  'ring-4 ring-offset-2 ring-offset-zinc-50 focus:outline-none dark:ring-offset-zinc-950',
                  isClicked
                    ? 'cursor-default bg-emerald-500/40 ring-emerald-500/20'
                    : 'cursor-pointer bg-red-500 ring-red-500/30 hover:scale-110 hover:bg-red-400',
                ].join(' ')}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
