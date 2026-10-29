import { computeLayout } from '../data/layout'
import { useStore } from './store'
import { useRace } from './race'

/** 距離のスライダーに合わせた天体の並べ方（レース中は見やすい距離にもどす） */
export function useLayout() {
  const distance = useStore((s) => s.settings.distance)
  const racing = useRace((r) => r.phase !== 'idle')
  return computeLayout(racing ? 0 : distance)
}
