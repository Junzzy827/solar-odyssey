import { useEffect, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { Bloom, EffectComposer, N8AO, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import { ShipModel } from './components/ship/ShipModel'

/** 太陽光：影を落とす平行光。影の範囲は船の大きさに絞って解像度を稼ぐ */
function SunLight() {
  const light = useRef<THREE.DirectionalLight>(null!)
  const { scene } = useThree()
  useEffect(() => {
    const cam = light.current.shadow.camera
    cam.left = cam.bottom = -0.8
    cam.right = cam.top = 0.8
    cam.near = 0.1
    cam.far = 10
    cam.updateProjectionMatrix()
    light.current.target.position.set(0, 0, 0)
    scene.add(light.current.target)
  }, [scene])
  return (
    <directionalLight
      ref={light}
      position={[2.5, 1.6, -1.5]}
      intensity={3.2}
      color="#fff4e6"
      castShadow
      shadow-mapSize={[4096, 4096]}
      shadow-bias={-0.0004}
      shadow-normalBias={0.004}
    />
  )
}

/**
 * 自機だけを眺める格納庫ビュー（URL の末尾に #hangar）。
 * 望遠気味の画角で低い位置から見上げると、模型ではなく巨大な船に見える。
 */
export default function Hangar() {
  return (
    <>
      <Canvas shadows camera={{ position: [1.05, -0.2, -1.45], fov: 26, near: 0.05, far: 100 }}>
        <color attach="background" args={['#000']} />
        <Stars radius={50} depth={20} count={3000} factor={2} fade />
        <SunLight />
        <directionalLight position={[-2, -1, 2]} intensity={0.12} color="#8fa8ff" />
        <ShipModel />
        <OrbitControls autoRotate autoRotateSpeed={0.35} minDistance={0.6} maxDistance={6} target={[0, 0, 0.05]} />
        <EffectComposer>
          <N8AO aoRadius={0.08} distanceFalloff={0.5} intensity={2.5} quality="high" />
          <Bloom intensity={1.1} luminanceThreshold={1} luminanceSmoothing={0.2} mipmapBlur />
          <Vignette offset={0.25} darkness={0.6} />
        </EffectComposer>
      </Canvas>
      <div className="hud">
        <h1>HANGAR</h1>
        <div>SV-01 ソーラーボイジャー（ドラッグで回転）</div>
      </div>
    </>
  )
}
