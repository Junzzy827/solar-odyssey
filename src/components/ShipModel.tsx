import { forwardRef } from 'react'
import * as THREE from 'three'

// 仮の自機。円盤部・副船体・2本のナセルという構成だけを借りたオリジナル形状で、
// M4 で Blender のモデル（glTF）に差し替える。長さ1、前方は -Z。

// 太陽の反対側でも形が分かるよう、わずかに自己発光させる
const hull = new THREE.MeshStandardMaterial({ color: '#c9ccd2', metalness: 0.35, roughness: 0.45, emissive: '#2a2e36' })
const trim = new THREE.MeshStandardMaterial({ color: '#8d939c', metalness: 0.4, roughness: 0.5, emissive: '#1e2128' })

export const ShipModel = forwardRef<THREE.MeshBasicMaterial>(function ShipModel(_, nacelleGlow) {
  return (
    <group>
      {/* 円盤部 */}
      <mesh position={[0, 0.06, -0.22]} scale={[1, 0.16, 1.15]} material={hull}>
        <sphereGeometry args={[0.3, 48, 24]} />
      </mesh>
      <mesh position={[0, 0.12, -0.22]} material={trim}>
        <cylinderGeometry args={[0.06, 0.09, 0.03, 24]} />
      </mesh>
      {/* 首と副船体 */}
      <mesh position={[0, -0.03, 0.06]} rotation={[0.5, 0, 0]} material={hull}>
        <boxGeometry args={[0.07, 0.14, 0.12]} />
      </mesh>
      <mesh position={[0, -0.09, 0.2]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.75]} material={hull}>
        <capsuleGeometry args={[0.07, 0.24, 8, 24]} />
      </mesh>
      <mesh position={[0, -0.09, 0.06]}>
        <sphereGeometry args={[0.035, 16, 16]} />
        <meshBasicMaterial color="#ffb070" />
      </mesh>
      {/* パイロンとナセル */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 0.11, -0.02, 0.3]} rotation={[0, 0, side * -0.9]} material={trim}>
            <boxGeometry args={[0.02, 0.2, 0.08]} />
          </mesh>
          <mesh position={[side * 0.2, 0.05, 0.32]} rotation={[Math.PI / 2, 0, 0]} material={hull}>
            <capsuleGeometry args={[0.035, 0.34, 6, 16]} />
          </mesh>
          <mesh position={[side * 0.2, 0.05, 0.32]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.85, 0.45]}>
            <capsuleGeometry args={[0.037, 0.3, 6, 16]} />
            <meshBasicMaterial ref={nacelleGlow} color="#3d7bff" transparent opacity={0.5} />
          </mesh>
          <mesh position={[side * 0.2, 0.05, 0.13]}>
            <sphereGeometry args={[0.03, 12, 12]} />
            <meshBasicMaterial color="#ff4a3a" />
          </mesh>
        </group>
      ))}
    </group>
  )
})
