import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { PLANETS } from './data/bodies'
import { Sun } from './components/Sun'
import { PlanetBody } from './components/PlanetBody'
import { Sky } from './components/Sky'

export default function App() {
  return (
    <>
      <Canvas camera={{ position: [0, 120, 220], fov: 50, near: 0.1, far: 5000 }}>
        <ambientLight intensity={0.08} />
        <Sky />
        <Sun />
        {PLANETS.map((planet, i) => (
          <PlanetBody key={planet.id} planet={planet} startAngle={i * 2.39} />
        ))}
        <OrbitControls enablePan maxDistance={1200} />
      </Canvas>
      <div className="hud">
        <h1>SOLAR VOYAGER</h1>
        <div>ドラッグで回転・ホイールで拡大縮小</div>
      </div>
      <div className="credit">
        Planet textures: <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noreferrer">Solar System Scope</a> (CC BY 4.0)
      </div>
    </>
  )
}
