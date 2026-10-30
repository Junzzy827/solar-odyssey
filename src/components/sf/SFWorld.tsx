import { CubeShip } from '../cube/CubeShip'
import { Gate } from './Gate'
import { BlackHole } from './BlackHole'
import { Swarm } from './Swarm'
import { SolarPlant } from './SolarPlant'
import { SailLauncher } from './SailLauncher'
import { ColonyCluster } from './ColonyCluster'
import { AsteroidBase } from './AsteroidBase'
import { Shipyard } from './Shipyard'
import { SpaceElevator } from './SpaceElevator'
import { CROSS_ID, UMBRELLA_ID } from '../../data/sf'

/** SF モードだけに出す、架空の船や構造物（data/sf.ts の SF_OBJECTS と対になる） */
export function SFWorld() {
  return (
    <>
      <CubeShip />
      <Gate />
      <BlackHole />
      <Swarm />
      <SolarPlant />
      <SailLauncher />
      <ColonyCluster />
      <Shipyard />
      <SpaceElevator />
      <AsteroidBase id={CROSS_ID} shape="cross" point="L4" />
      <AsteroidBase id={UMBRELLA_ID} shape="umbrella" point="L3" />
    </>
  )
}
