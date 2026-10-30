import { CubeShip } from '../cube/CubeShip'
import { Colony } from './Colony'
import { Gate } from './Gate'
import { BlackHole } from './BlackHole'
import { Swarm } from './Swarm'
import { SolarPlant } from './SolarPlant'
import { SailLauncher } from './SailLauncher'

/** SF モードだけに出す、架空の船や構造物（data/sf.ts の SF_OBJECTS と対になる） */
export function SFWorld() {
  return (
    <>
      <CubeShip />
      <Colony />
      <Gate />
      <BlackHole />
      <Swarm />
      <SolarPlant />
      <SailLauncher />
    </>
  )
}
