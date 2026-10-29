import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { cellMaterial, darkMaterial, foilMaterial, foilTexture, roomEnvironment, solarCellTexture, whiteMaterial } from './parts'

// ハッブル宇宙望遠鏡（全長 1、筒の先 +Z が観測の向き）。
// 銀色の筒、開いたふた、左右の太陽電池パネル、上下の通信アンテナ。

const R = 0.16
const HALF_PI = Math.PI / 2

const world = new THREE.Vector3()
const sun = new THREE.Vector3()
const inverse = new THREE.Matrix4()

export function HubbleModel() {
  const { gl } = useThree()
  const root = useRef<THREE.Group>(null!)
  const wings = useRef<THREE.Group[]>([])

  const m = useMemo(() => {
    const env = roomEnvironment(gl)
    const foilMap = foilTexture()
    foilMap.wrapS = THREE.RepeatWrapping
    foilMap.repeat.set(2, 1)
    const cellMap = solarCellTexture()
    const foil = foilMaterial(env, foilMap)
    const dark = darkMaterial(env)
    const white = whiteMaterial(env)
    const cells = cellMaterial(env, cellMap)
    const inside = new THREE.MeshBasicMaterial({ color: '#050507', side: THREE.BackSide })
    const dish = white.clone()
    dish.side = THREE.DoubleSide
    const bay = foil.clone()
    bay.flatShading = true
    bay.color.set('#e2e2e6')
    return { env, foil, dark, white, cells, inside, bay, dish, panel: [white, white, cells, white, white, white], textures: [foilMap, cellMap] }
  }, [gl])

  useEffect(
    () => () => {
      for (const mat of [m.foil, m.dark, m.white, m.cells, m.inside, m.bay, m.dish]) mat.dispose()
      for (const t of m.textures) t.dispose()
    },
    [m],
  )

  // 太陽電池パネルを、腕のまわりに回して太陽に向ける（太陽は原点）
  useFrame(() => {
    root.current.getWorldPosition(world)
    inverse.copy(root.current.matrixWorld).invert()
    sun.copy(world).negate().transformDirection(inverse)
    if (sun.lengthSq() < 0.5) return
    const angle = Math.atan2(sun.z, sun.y)
    for (const wing of wings.current) wing.rotation.x = angle
  })

  return (
    <group ref={root}>
      {/* 後ろの部分と、機器を入れる多角形の区画 */}
      <mesh material={m.foil} position={[0, 0, -0.39]} rotation={[HALF_PI, 0, 0]}>
        <cylinderGeometry args={[R, R, 0.22, 48, 1]} />
      </mesh>
      <mesh material={m.bay} position={[0, 0, -0.2]} rotation={[HALF_PI, 0, 0]}>
        <cylinderGeometry args={[R * 1.07, R * 1.07, 0.16, 12, 1]} />
      </mesh>
      <mesh material={m.dark} position={[0, 0, -0.5]} rotation={[-HALF_PI, 0, 0]}>
        <circleGeometry args={[R * 0.98, 40]} />
      </mesh>

      {/* 鏡を収めた筒と、光をさえぎる前の筒（中は黒い） */}
      <mesh material={m.foil} position={[0, 0, 0.19]} rotation={[HALF_PI, 0, 0]}>
        <cylinderGeometry args={[R * 0.97, R * 0.97, 0.62, 48, 1, true]} />
      </mesh>
      <mesh material={m.inside} position={[0, 0, 0.2]} rotation={[HALF_PI, 0, 0]}>
        <cylinderGeometry args={[R * 0.95, R * 0.95, 0.6, 40, 1, true]} />
      </mesh>
      <mesh position={[0, 0, -0.08]}>
        <circleGeometry args={[R * 0.96, 40]} />
        <meshBasicMaterial color="#020203" />
      </mesh>
      {[-0.28, -0.12, 0.2, 0.5].map((z) => (
        <mesh key={z} material={m.dark} position={[0, 0, z]}>
          <torusGeometry args={[R * (z < -0.1 ? 1.0 : 0.975), 0.005, 6, 48]} />
        </mesh>
      ))}

      {/* 開いたふた（上のちょうつがいで前に開く） */}
      <group position={[0, R * 0.97, 0.5]} rotation={[-1.8, 0, 0]}>
        <mesh material={[m.foil, m.foil, m.white]} position={[0, -R * 0.97, 0]} rotation={[HALF_PI, 0, 0]}>
          <cylinderGeometry args={[R, R, 0.012, 40]} />
        </mesh>
      </group>

      {/* 太陽電池パネル（左右）。腕は機器の区画から横に出る */}
      {[1, -1].map((side) => (
        <group key={side}>
          <mesh material={m.dark} position={[side * 0.23, 0, -0.2]} rotation={[0, 0, HALF_PI]}>
            <cylinderGeometry args={[0.008, 0.008, 0.12, 8]} />
          </mesh>
          <group
            position={[side * 0.39, 0, -0.2]}
            ref={(g) => {
              if (g) wings.current[side > 0 ? 0 : 1] = g
            }}
          >
            <mesh material={m.panel} position={[0, 0, 0.02]}>
              <boxGeometry args={[0.2, 0.004, 0.56]} />
            </mesh>
            <mesh material={m.dark} rotation={[HALF_PI, 0, 0]} position={[0, 0, 0.02]}>
              <cylinderGeometry args={[0.005, 0.005, 0.58, 6]} />
            </mesh>
          </group>
        </group>
      ))}

      {/* 通信アンテナ（上下の腕の先の皿） */}
      {[1, -1].map((side) => (
        <group key={side} position={[0, side * R, -0.16]} rotation={[0, 0, side > 0 ? 0 : Math.PI]}>
          <mesh material={m.dark} position={[0, 0.09, 0]}>
            <cylinderGeometry args={[0.006, 0.006, 0.18, 6]} />
          </mesh>
          <mesh material={m.dish} position={[0, 0.2, 0]} scale={[1, 0.45, 1]}>
            <sphereGeometry args={[0.07, 24, 6, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38]} />
          </mesh>
          <mesh material={m.dark} position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.004, 0.004, 0.05, 6]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
