import { useFrame } from '@react-three/fiber'
import { sim } from '../state/registry'
import { useStore } from '../state/store'

/** 天体より先に時間を進める（priority を負にして最初に実行） */
export function SimClock() {
  useFrame((_, delta) => {
    sim.time += delta * useStore.getState().timeScale
  }, -1)
  return null
}
