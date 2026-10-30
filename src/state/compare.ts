import { create } from 'zustand'

/** 大きさくらべ：いま近くにいる天体の横に、本当の大きさの比で地球などを並べる */
export const useCompare = create<{ on: boolean; toggle: () => void }>((set) => ({
  on: false,
  toggle: () => set((s) => ({ on: !s.on })),
}))

/** 並べる天体。地球のそばでは月と火星、太陽のそばでは地球と木星、ほかは地球（小さな天体には月も） */
export function compareWith(id: string): string[] {
  if (id === 'sun') return ['earth', 'jupiter']
  if (id === 'earth') return ['moon', 'mars']
  if (['jupiter', 'saturn', 'uranus', 'neptune'].includes(id)) return ['earth']
  if (id === 'moon') return ['earth']
  return ['earth', 'moon']
}
