import { createContext, useContext } from 'react'

export const TrainingCtx = createContext(null)

export function useTraining() {
  const v = useContext(TrainingCtx)
  if (!v) throw new Error('useTraining must be used inside <TrainingProvider>')
  return v
}
