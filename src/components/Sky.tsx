import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import * as THREE from 'three'
import { textureUrl } from '../data/textures'
import { useOptionalTexture } from '../hooks/useOptionalTexture'

/** 天の川の全天画像。無ければ点の星空。遠くの星なので、どこへ行ってもカメラと一緒に動かす */
export function Sky() {
  const map = useOptionalTexture(textureUrl('milkyWay'))
  const group = useRef<THREE.Group>(null!)
  useFrame(({ camera }) => group.current.position.copy(camera.position))
  return (
    <group ref={group}>
      {map ? (
        <mesh renderOrder={-1}>
          <sphereGeometry args={[2000, 64, 64]} />
          <meshBasicMaterial map={map} side={THREE.BackSide} color="#9a9a9a" depthWrite={false} />
        </mesh>
      ) : (
        <Stars radius={1500} depth={200} count={8000} factor={6} fade />
      )}
    </group>
  )
}
