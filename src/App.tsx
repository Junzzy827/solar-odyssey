import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { PLANETS } from './data/bodies'
import { useStore } from './state/store'
import { Sun } from './components/Sun'
import { PlanetBody } from './components/PlanetBody'
import { Sky } from './components/Sky'
import { SimClock } from './components/SimClock'
import { Ship } from './components/Ship'
import { CloudWake } from './components/CloudWake'
import { AsteroidBelt } from './components/AsteroidBelt'
import { WarpStreaks } from './components/WarpStreaks'
import { TargetMarker } from './components/TargetMarker'
import { Phaser } from './components/Phaser'
import { CubeShip } from './components/cube/CubeShip'
import { Telescopes } from './components/telescope/Telescopes'
import { Race } from './components/race/Race'
import { RacePanel } from './ui/RacePanel'
import { Hud, useGlobalKeys } from './ui/Hud'
import { NavPanel } from './ui/NavPanel'
import { LogPanel } from './ui/LogPanel'
import { TelescopeView } from './ui/TelescopeView'
import { useLayout } from './state/useLayout'

/** 全体マップの視点。距離のスライダーで太陽系を広げたら、そのぶん遠くまで引ける */
function MapControls() {
  const layout = useLayout()
  return <OrbitControls enablePan maxDistance={Math.max(1200, Math.max(...layout.orbit.values()) * 3)} />
}

export default function App() {
  const mode = useStore((s) => s.mode)
  useGlobalKeys()

  return (
    <>
      <Canvas shadows camera={{ position: [0, 120, 220], fov: 50, near: 0.01, far: 200_000 }} gl={{ logarithmicDepthBuffer: true }}>
        <SimClock />
        <ambientLight intensity={0.08} />
        <Sky />
        <Sun />
        {PLANETS.map((planet, i) => (
          <PlanetBody key={planet.id} planet={planet} startAngle={i * 2.39} />
        ))}
        <AsteroidBelt />
        <CubeShip />
        <Telescopes />
        <Race />
        <Ship />
        <CloudWake />
        <WarpStreaks />
        <TargetMarker />
        <Phaser />
        {mode === 'map' && <MapControls />}
        <EffectComposer>
          <Bloom intensity={1.2} luminanceThreshold={1} luminanceSmoothing={0.2} mipmapBlur />
        </EffectComposer>
      </Canvas>
      <Hud />
      <NavPanel />
      <RacePanel />
      <LogPanel />
      <TelescopeView />
      <div className="credit">
        Planet textures: <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noreferrer">Solar System Scope</a> (CC BY 4.0) · Hubble 3D model:{' '}
        <a href="https://science.nasa.gov/resource/hubble-space-telescope-3d-model/" target="_blank" rel="noreferrer">NASA VTAD</a>
      </div>
    </>
  )
}
