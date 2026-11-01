import { CubeShip } from '../cube/CubeShip'
import { Gate } from './Gate'
import { BlackHole } from './BlackHole'
import { Swarm } from './Swarm'
import { SolarPlant } from './SolarPlant'
import { SailLauncher } from './SailLauncher'
import { ColonyCluster } from './ColonyCluster'
import { ColonyGroups } from './ColonyGroups'
import { AsteroidBase } from './AsteroidBase'
import { Fleet } from './Fleet'
import { Shipyard } from './Shipyard'
import { SpaceDock } from './SpaceDock'
import { SpaceElevator } from './SpaceElevator'
import { CROSS_ID, UMBRELLA_ID } from '../../data/sf'
import { RadioMoon } from './RadioMoon'
import { OreCarrier } from './OreCarrier'
import { DiscFreighter } from './DiscFreighter'
import { DysonSwarm } from './DysonSwarm'
import { GenerationShip } from './GenerationShip'
import { EuropaBeacon } from './EuropaBeacon'
import { DebrisCollector } from './DebrisCollector'
import { DesertPlanet, IcePlanet } from './Exoplanet'
import { HourglassColonies } from './HourglassColonies'
import { EngineAsteroid } from './EngineAsteroid'
import { GalacticRailway } from './GalacticRailway'
import { MoonCity } from './MoonCity'

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
      <HourglassColonies />
      <ColonyGroups />
      <Shipyard />
      <SpaceDock />
      <SpaceElevator />
      <AsteroidBase id={CROSS_ID} shape="cross" point="L4" />
      <AsteroidBase id={UMBRELLA_ID} shape="umbrella" point="L2" />
      <Fleet />
      <RadioMoon />
      <OreCarrier />
      <DiscFreighter />
      <DysonSwarm />
      <GenerationShip />
      <EuropaBeacon />
      <DebrisCollector />
      <DesertPlanet />
      <IcePlanet />
      <EngineAsteroid />
      <GalacticRailway />
      <MoonCity />
    </>
  )
}
