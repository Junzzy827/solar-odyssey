import { useFrame } from '@react-three/fiber'
import { sim } from '../state/registry'
import { useStore } from '../state/store'
import { advanceProbe } from '../state/probes'
import { advanceEclipse } from '../state/eclipse'
import { SIM_SECONDS_PER_HOUR } from '../data/ephemeris'

/** 天体より先に時間を進める（priority を負にして最初に実行）。探査機の旅や日食・月食の再生中は、その日の時間にする */
export function SimClock() {
  useFrame((_, delta) => {
    const replay = advanceProbe(Math.min(delta, 0.25)) ?? advanceEclipse(Math.min(delta, 0.25))
    // 時間の速さは「1秒に何時間」（1時間・1日・1か月）
    sim.time = replay ?? sim.time + delta * useStore.getState().timeScale * SIM_SECONDS_PER_HOUR
  }, -1)
  return null
}
