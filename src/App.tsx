import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { PLANETS } from './data/bodies'
import { Sun } from './components/Sun'
import { PlanetBody } from './components/PlanetBody'

export default function App() {
  return (
    <>
      <Canvas camera={{ position: [0, 120, 220], fov: 50, near: 0.1, far: 5000 }}>
        <ambientLight intensity={0.08} />
        <Stars radius={1500} depth={200} count={8000} factor={6} fade />
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
    </>
  )
}
