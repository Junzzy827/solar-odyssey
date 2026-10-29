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
import { Race } from './components/race/Race'
import { RacePanel } from './ui/RacePanel'
import { Hud, useGlobalKeys } from './ui/Hud'
import { NavPanel } from './ui/NavPanel'
import { LogPanel } from './ui/LogPanel'

export default function App() {
  const mode = useStore((s) => s.mode)
  useGlobalKeys()

  return (
    <>
      <Canvas shadows camera={{ position: [0, 120, 220], fov: 50, near: 0.01, far: 5000 }} gl={{ logarithmicDepthBuffer: true }}>
        <SimClock />
        <ambientLight intensity={0.08} />
        <Sky />
        <Sun />
        {PLANETS.map((planet, i) => (
          <PlanetBody key={planet.id} planet={planet} startAngle={i * 2.39} />
        ))}
        <AsteroidBelt />
        <CubeShip />
        <Race />
        <Ship />
        <CloudWake />
        <WarpStreaks />
        <TargetMarker />
        <Phaser />
        {mode === 'map' && <OrbitControls enablePan maxDistance={1200} />}
        <EffectComposer>
          <Bloom intensity={1.2} luminanceThreshold={1} luminanceSmoothing={0.2} mipmapBlur />
        </EffectComposer>
      </Canvas>
      <Hud />
      <NavPanel />
      <RacePanel />
      <LogPanel />
      <div className="credit">
        Planet textures: <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noreferrer">Solar System Scope</a> (CC BY 4.0)
      </div>
    </>
  )
}
