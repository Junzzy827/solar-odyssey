import { useFrame } from '@react-three/fiber'
import { sim } from '../state/registry'
import { useStore } from '../state/store'
import { advanceProbe } from '../state/probes'

/** 天体より先に時間を進める（priority を負にして最初に実行）。探査機の旅の再生中は、その日の時間にする */
export function SimClock() {
  useFrame((_, delta) => {
    const replay = advanceProbe(Math.min(delta, 0.25))
    sim.time = replay ?? sim.time + delta * useStore.getState().timeScale
  }, -1)
  return null
}
