import { useEffect, useRef, useState } from 'react'

const PEEK_THRESHOLD_RATIO = 0.6
const PEEK_DURATION_MS = 400

export default function useEyeTracking() {
  const [peekCount, setPeekCount] = useState(0)
  const [eyeDiscipline, setEyeDiscipline] = useState(100)
  const [isLookingDown, setIsLookingDown] = useState(false)

  const lookingDownStartRef = useRef(null)
  const peekRegisteredRef = useRef(false)
  const lastElapsedRef = useRef(null)
  const upperTimeRef = useRef(0)
  const totalTimeRef = useRef(0)

  useEffect(() => {
    if (!window.webgazer?.setGazeListener) return

    const listener = (data, elapsedTime) => {
      if (data == null) return

      const thresholdY = window.innerHeight * PEEK_THRESHOLD_RATIO
      const lookingDown = data.y > thresholdY

      setIsLookingDown(lookingDown)

      if (lastElapsedRef.current !== null) {
        const delta = elapsedTime - lastElapsedRef.current
        if (delta > 0) {
          totalTimeRef.current += delta
          if (!lookingDown) {
            upperTimeRef.current += delta
          }
          setEyeDiscipline(
            Math.round((upperTimeRef.current / totalTimeRef.current) * 100),
          )
        }
      }
      lastElapsedRef.current = elapsedTime

      if (lookingDown) {
        if (lookingDownStartRef.current === null) {
          lookingDownStartRef.current = Date.now()
          peekRegisteredRef.current = false
        } else if (
          !peekRegisteredRef.current &&
          Date.now() - lookingDownStartRef.current >= PEEK_DURATION_MS
        ) {
          peekRegisteredRef.current = true
          setPeekCount((count) => count + 1)
        }
      } else {
        lookingDownStartRef.current = null
        peekRegisteredRef.current = false
      }
    }

    window.webgazer.setGazeListener(listener)

    return () => {
      window.webgazer.setGazeListener(null)
    }
  }, [])

  return { peekCount, eyeDiscipline, isLookingDown }
}
