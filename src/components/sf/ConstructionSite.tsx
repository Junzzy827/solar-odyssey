import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { COLONY_LENGTH as L, COLONY_RADIUS as R } from '../../data/sf'
import { WorkMech } from './WorkMech'

// 建設中の2号基：骨組みだけの円筒に、作業機が外板を1枚ずつ取りつけている。
// オニールの構想では、コロニーは2本1組で逆向きに回して、回転のくせ（こまのように向きを保とうとする力）を打ち消す。

/** 作業機の高さ（表示単位）。本物は約18mの想定だが、自機（640m）のそばでも見えるよう約10倍に描く */
export const MECH_SIZE = 0.0056
/** 外板を張り終えたところ（長さに対する割合） */
const BUILT = 0.35

const H = L / 2
const front = -H + L * BUILT

export function ConstructionSite() {
  const { gl } = useThree()
  const parts = useMemo(() => {
    // 横から光が当たらなくても形がわかるよう、映り込みの環境を入れる
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    return {
      ring: new THREE.TorusGeometry(R, 0.0016, 6, 96),
      girder: new THREE.BoxGeometry(0.0026, L, 0.0026),
      plating: new THREE.CylinderGeometry(R * 1.002, R * 1.002, L * BUILT, 48, 1, true),
      endCap: new THREE.RingGeometry(R * 0.3, R, 48),
      light: new THREE.SphereGeometry(0.0012, 8, 8),
      pallet: new THREE.BoxGeometry(0.004, 0.0006, 0.003),
      frameMat: new THREE.MeshStandardMaterial({ color: '#7d828b', metalness: 0.6, roughness: 0.45, envMap: env, envMapIntensity: 0.5 }),
      plateMat: new THREE.MeshStandardMaterial({ color: '#a3a7ae', metalness: 0.45, roughness: 0.55, side: THREE.DoubleSide, envMap: env, envMapIntensity: 0.4 }),
      lightMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.2, 1.4), toneMapped: false }),
      warnMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.9, 0.2), toneMapped: false }),
    }
  }, [gl])
  const warn = useRef(parts.warnMat)
  useFrame(({ clock }) => {
    // 工事の場所を知らせる、ゆっくり点滅する橙色の灯
    const k = Math.sin(clock.getElapsedTime() * 3) > 0 ? 1 : 0.12
    warn.current.color.setRGB(2.6 * k, 0.9 * k, 0.2 * k)
  })

  const rings = Array.from({ length: 15 }, (_, k) => -H + (k / 14) * L)
  const girders = Array.from({ length: 12 }, (_, k) => (k / 12) * Math.PI * 2)
  const at = (a: number, r: number, y: number) => [Math.sin(a) * r, y, Math.cos(a) * r] as [number, number, number]

  // 外板を張る作業機（外板の端に並ぶ）と、外板を運ぶ作業機
  const welders = [0.3, 1.5, 2.6, 3.9, 5.1].map((a, i) => ({ a, y: front - MECH_SIZE * 0.8 + (i % 2) * MECH_SIZE * 0.5 }))

  return (
    <group>
      {rings.map((y) => (
        <mesh key={`r${y}`} geometry={parts.ring} material={parts.frameMat} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} />
      ))}
      {girders.map((a) => (
        <mesh key={`g${a}`} geometry={parts.girder} material={parts.frameMat} position={at(a, R, 0)} />
      ))}
      <mesh geometry={parts.plating} material={parts.plateMat} position={[0, -H + (L * BUILT) / 2, 0]} />
      <mesh geometry={parts.endCap} material={parts.plateMat} position={[0, -H, 0]} rotation={[Math.PI / 2, 0, 0]} />
      {/* 作業灯：外板の端の輪と、その先の輪の上 */}
      {girders.map((a) => (
        <group key={`l${a}`}>
          <mesh geometry={parts.light} material={parts.lightMat} position={at(a, R * 1.02, front)} />
          <mesh geometry={parts.light} material={parts.warnMat} position={at(a + 0.26, R * 1.02, front + L / 14)} />
        </group>
      ))}
      {welders.map((w, i) => (
        <group key={`w${i}`} position={at(w.a, R + MECH_SIZE * 0.6, w.y)} rotation={[0, w.a, 0]}>
          {/* 頭を長さの向き（+Y）に、前を円筒の外板に向けて取りつく */}
          <group rotation={[0, Math.PI, 0]} scale={MECH_SIZE}>
            <WorkMech pose="weld" phase={i * 1.7} />
          </group>
        </group>
      ))}
      <Carrier phase={0} angle={0.9} />
      <Carrier phase={3.1} angle={3.3} />
      {/* 外板を積んだ置き場 */}
      {[0.9, 3.3].map((a) => (
        <group key={`p${a}`} position={at(a, R + 0.025, front + 0.03)} rotation={[0, a, 0]}>
          {[0, 1, 2, 3].map((k) => (
            <mesh key={k} geometry={parts.pallet} material={parts.plateMat} position={[0, k * 0.0009, 0]} />
          ))}
          <mesh geometry={parts.light} material={parts.warnMat} position={[0.003, 0.004, 0]} />
        </group>
      ))}
    </group>
  )
}

/** 置き場から外板の端まで、外板を抱えて行き来する作業機 */
function Carrier({ phase, angle }: { phase: number; angle: number }) {
  const ref = useRef<THREE.Group>(null!)
  const from = new THREE.Vector3(Math.sin(angle) * (R + 0.025), front + 0.03, Math.cos(angle) * (R + 0.025))
  const to = new THREE.Vector3(Math.sin(angle + 0.25) * (R + 0.008), front + 0.002, Math.cos(angle + 0.25) * (R + 0.008))
  const p = new THREE.Vector3()
  const look = new THREE.Vector3()
  useFrame(({ clock }) => {
    // 往復（端でひと休み）
    const a = (clock.getElapsedTime() + phase) * 0.25
    const k = THREE.MathUtils.smoothstep(0.5 - 0.5 * Math.cos(a), 0.1, 0.9)
    p.lerpVectors(from, to, k)
    ref.current.position.copy(p)
    // 進む向きを向く（行きは外板の端、帰りは置き場）
    ref.current.lookAt(ref.current.parent!.localToWorld(look.copy(Math.sin(a) > 0 ? to : from)))
  })
  return (
    <group ref={ref}>
      <group scale={MECH_SIZE} rotation={[0, 0, 0]}>
        <WorkMech pose="carry" phase={phase} />
      </group>
    </group>
  )
}
