export function toLocalDateString(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function calculateStreak(sessions) {
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
