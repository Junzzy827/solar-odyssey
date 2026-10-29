import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { PLANETS } from './data/bodies'
import { useStore } from './state/store'
import { Sun } from './components/Sun'
import { PlanetBody } from './components/PlanetBody'
import { Sky } from './components/Sky'
import { SimClock } from './components/SimClock'
import { Ship } from './components/Ship'
import { WarpStreaks } from './components/WarpStreaks'
import { TargetMarker } from './components/TargetMarker'
import { Hud, useGlobalKeys } from './ui/Hud'
import { NavPanel } from './ui/NavPanel'

export default function App() {
  const mode = useStore((s) => s.mode)
  useGlobalKeys()

  return (
    <>
      <Canvas camera={{ position: [0, 120, 220], fov: 50, near: 0.01, far: 5000 }} gl={{ logarithmicDepthBuffer: true }}>
        <SimClock />
        <ambientLight intensity={0.08} />
        <Sky />
        <Sun />
        {PLANETS.map((planet, i) => (
          <PlanetBody key={planet.id} planet={planet} startAngle={i * 2.39} />
        ))}
        <Ship />
        <WarpStreaks />
        <TargetMarker />
        {mode === 'map' && <OrbitControls enablePan maxDistance={1200} />}
      </Canvas>
      <Hud />
      <NavPanel />
      <div className="credit">
        Planet textures: <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noreferrer">Solar System Scope</a> (CC BY 4.0)
      </div>
    </>
  )
}
