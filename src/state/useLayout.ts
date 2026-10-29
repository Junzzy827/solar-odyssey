import { computeLayout } from '../data/layout'
import { useStore } from './store'
import { useRace } from './race'

/** 距離と大きさのスライダーに合わせた天体の並べ方（レース中は見やすい距離と大きさにもどす） */
export function useLayout() {
  const distance = useStore((s) => s.settings.distance)
  const size = useStore((s) => s.settings.size)
  const racing = useRace((r) => r.phase !== 'idle')
  return computeLayout(racing ? 0 : distance, racing ? 0 : size)
}
