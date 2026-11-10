// "Today's plan": a short, personalised routine built from the same evidence as the
// recommendations. Steps are ticked off by real sessions recorded today.

import { dayKey } from './goals.js'

/**
 * @returns {{steps: Array<{id,title,detail,minutes,action,done}>, doneCount:number}}
 */
export function buildDailyPlan({ sessions, rec, progress, now = new Date() }) {
  const today = dayKey(now)
  const todays = sessions.filter((s) => dayKey(s.created_at) === today)
  const isTest = (s) => typeof s.mode === 'string' && (s.mode.startsWith('time-') || s.mode.startsWith('words-'))
  const isFocus = (s) => Boolean(s.lesson_id || s.practice_kind)

  const drill = rec?.recs?.find((r) => r.action?.type === 'practice')
  const nextLesson = progress?.nextLessonId ?? null
  const newcomer = sessions.length < 3

  const steps = [
    {
      id: 'warmup', title: 'Warm up', minutes: 1,
      detail: 'One easy run to wake your fingers up. Accuracy over speed.',
      action: { type: 'practice', spec: { kind: 'accuracy' } },
      done: todays.length >= 1,
    },
    newcomer || !drill
      ? {
          id: 'focus', title: nextLesson ? `Lesson ${nextLesson}` : 'Free practice', minutes: 3,
          detail: nextLesson ? 'Continue the structured path.' : 'Pick any focus drill.',
          action: nextLesson ? { type: 'lesson', lessonId: nextLesson } : { type: 'route', to: '/practice' },
          done: todays.filter(isFocus).length >= (todays.length >= 1 && isFocus(todays[0]) ? 2 : 1),
        }
      : {
          id: 'focus', title: drill.title, minutes: 3,
          detail: drill.reason,
          action: drill.action,
          done: todays.filter(isFocus).length >= (todays.length >= 1 && isFocus(todays[0]) ? 2 : 1),
        },
    {
      id: 'benchmark', title: 'Benchmark test', minutes: 1,
      detail: 'A 30-second test so today has a number to compare with tomorrow.',
      action: { type: 'route', to: '/test' },
      done: todays.some(isTest),
    },
  ]
  return { steps, doneCount: steps.filter((s) => s.done).length }
}
