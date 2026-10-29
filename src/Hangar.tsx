import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { ShipModel } from './components/ship/ShipModel'

/** 自機だけを眺める格納庫ビュー（URL の末尾に #hangar） */
export default function Hangar() {
  return (
    <>
      <Canvas camera={{ position: [0.9, 0.35, -0.9], fov: 40, near: 0.01, far: 100 }}>
        <Stars radius={50} depth={20} count={3000} factor={2} fade />
        <directionalLight position={[3, 2, -2]} intensity={2.4} />
        <directionalLight position={[-2, -1, 2]} intensity={0.25} color="#8fa8ff" />
        <ambientLight intensity={0.05} />
        <ShipModel />
        <OrbitControls autoRotate autoRotateSpeed={0.6} minDistance={0.4} maxDistance={4} />
        <EffectComposer>
          <Bloom intensity={1.1} luminanceThreshold={1} luminanceSmoothing={0.2} mipmapBlur />
        </EffectComposer>
      </Canvas>
      <div className="hud">
        <h1>HANGAR</h1>
        <div>SV-01 ソーラーボイジャー（ドラッグで回転）</div>
      </div>
    </>
  )
}
