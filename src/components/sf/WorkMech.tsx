import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

// 人型の作業機（オリジナルのデザイン）。宇宙で建物を組み立てる、武器を持たない工事用の機械。
// 胸に乗りこむ丸い窓（キャノピー）、横長の橙色の視界窓、背中の推進器。白と橙と灰の工事用の塗り分け。
// 高さ 1 で作り、使う側で大きさを決める。前は +Z。

export type MechPose = 'weld' | 'carry' | 'float'

let shared: ReturnType<typeof makeParts> | null = null

function makeParts() {
  const box = (w: number, h: number, d: number, r = 0.02) => new RoundedBoxGeometry(w, h, d, 2, r)
  return {
    torso: box(0.36, 0.3, 0.26, 0.05),
    belly: box(0.26, 0.1, 0.2, 0.03),
    hip: box(0.32, 0.1, 0.22, 0.03),
    head: box(0.15, 0.11, 0.14, 0.04),
    visor: box(0.13, 0.03, 0.02, 0.01),
    canopy: new THREE.SphereGeometry(0.085, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    shoulder: box(0.14, 0.12, 0.16, 0.04),
    upper: new THREE.CylinderGeometry(0.035, 0.035, 0.17, 10),
    fore: box(0.09, 0.17, 0.1, 0.025),
    hand: box(0.07, 0.06, 0.08, 0.015),
    thigh: new THREE.CylinderGeometry(0.05, 0.045, 0.2, 10),
    shin: box(0.12, 0.22, 0.14, 0.035),
    knee: box(0.09, 0.06, 0.05, 0.015),
    foot: box(0.12, 0.05, 0.2, 0.02),
    pack: box(0.28, 0.28, 0.12, 0.03),
    tank: new THREE.CylinderGeometry(0.035, 0.035, 0.24, 12),
    nozzle: new THREE.CylinderGeometry(0.03, 0.045, 0.06, 12, 1, true),
    flame: new THREE.ConeGeometry(0.03, 0.16, 10, 1, true),
    antenna: new THREE.CylinderGeometry(0.004, 0.004, 0.12, 4),
    torch: new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8),
    spark: new THREE.SphereGeometry(0.03, 8, 8),
    panel: box(0.5, 0.04, 0.34, 0.01),
    // 工事現場の作業灯に照らされているよう、影の側も少し明るく
    white: new THREE.MeshStandardMaterial({ color: '#e7e4dc', metalness: 0.2, roughness: 0.55, emissive: '#e7e4dc', emissiveIntensity: 0.18 }),
    orange: new THREE.MeshStandardMaterial({ color: '#ee8a2a', metalness: 0.2, roughness: 0.5, emissive: '#ee8a2a', emissiveIntensity: 0.18 }),
    grey: new THREE.MeshStandardMaterial({ color: '#4a4e57', metalness: 0.6, roughness: 0.45, emissive: '#4a4e57', emissiveIntensity: 0.2 }),
    glass: new THREE.MeshStandardMaterial({ color: '#5fb3c8', metalness: 0.8, roughness: 0.08, emissive: '#1a4a58', emissiveIntensity: 0.6 }),
    visorMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.1, 0.25), toneMapped: false }),
    flameMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.2, 2.6), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    sparkMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3.6), toneMapped: false }),
    panelMat: new THREE.MeshStandardMaterial({ color: '#a7abb3', metalness: 0.5, roughness: 0.5 }),
  }
}

const parts = () => (shared ??= makeParts())

/** 腕（肩から下）。swing で前後に振る */
function Arm({ side, armRef }: { side: 1 | -1; armRef: React.RefObject<THREE.Group> }) {
  const p = parts()
  return (
    <group position={[side * 0.26, 0.72, 0]}>
      <mesh geometry={p.shoulder} material={p.orange} />
      <group ref={armRef}>
        <mesh geometry={p.upper} material={p.grey} position={[side * 0.02, -0.13, 0]} />
        <mesh geometry={p.fore} material={p.white} position={[side * 0.02, -0.29, 0.01]} />
        <mesh geometry={p.hand} material={p.grey} position={[side * 0.02, -0.41, 0.02]} />
      </group>
    </group>
  )
}

function Leg({ side }: { side: 1 | -1 }) {
  const p = parts()
  return (
    <group position={[side * 0.1, 0.4, 0]} rotation={[0.25, 0, side * 0.05]}>
      <mesh geometry={p.thigh} material={p.grey} position={[0, -0.08, 0]} />
      <group position={[0, -0.2, 0]} rotation={[-0.45, 0, 0]}>
        <mesh geometry={p.knee} material={p.orange} position={[0, 0, 0.07]} />
        <mesh geometry={p.shin} material={p.white} position={[0, -0.12, 0]} />
        <mesh geometry={p.foot} material={p.grey} position={[0, -0.24, 0.03]} />
      </group>
    </group>
  )
}

/** 作業機1機。phase で動きをずらす */
export function WorkMech({ pose, phase = 0 }: { pose: MechPose; phase?: number }) {
  const p = parts()
  const left = useRef<THREE.Group>(null!)
  const right = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const spark = useRef<THREE.Mesh>(null)
  const flames = useRef<THREE.Mesh[]>([])
  const flameRef = (m: THREE.Mesh | null) => {
    if (m && !flames.current.includes(m)) flames.current.push(m)
  }
  // 溶接の火花の明るさは機体ごとに別の色の材質で
  const sparkMat = useMemo(() => p.sparkMat.clone(), [p])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + phase
    body.current.position.y = Math.sin(t * 0.7) * 0.03
    body.current.rotation.z = Math.sin(t * 0.4) * 0.04
    if (pose === 'weld') {
      if (right.current) right.current.rotation.x = -1.3 + Math.sin(t * 1.3) * 0.12
      if (left.current) left.current.rotation.x = -0.3 + Math.sin(t * 0.8) * 0.1
      const on = Math.sin(t * 9) + Math.sin(t * 23) > 0.2
      sparkMat.color.setScalar(on ? 3.2 + Math.random() * 2 : 0.2)
      if (spark.current) spark.current.scale.setScalar(on ? 0.7 + Math.random() * 0.6 : 0.3)
    } else if (pose === 'carry') {
      if (right.current) right.current.rotation.x = -1.1
      if (left.current) left.current.rotation.x = -1.1
    } else {
      if (right.current) right.current.rotation.x = Math.sin(t * 0.6) * 0.3
      if (left.current) left.current.rotation.x = -Math.sin(t * 0.6) * 0.3
    }
    const k = 0.75 + 0.25 * Math.sin(t * 17)
    flames.current.forEach((m) => m.scale.set(1, pose === 'weld' ? 0.4 * k : k, 1))
  })

  return (
    <group ref={body}>
      <mesh geometry={p.torso} material={p.white} position={[0, 0.7, 0]} />
      {/* 胸の乗りこみ窓 */}
      <mesh geometry={p.canopy} material={p.glass} position={[0, 0.7, 0.12]} rotation={[Math.PI / 2, 0, 0]} />
      <mesh geometry={p.belly} material={p.grey} position={[0, 0.52, 0]} />
      <mesh geometry={p.hip} material={p.orange} position={[0, 0.44, 0]} />
      <mesh geometry={p.head} material={p.white} position={[0, 0.92, 0.01]} />
      <mesh geometry={p.visor} material={p.visorMat} position={[0, 0.93, 0.08]} />
      <mesh geometry={p.antenna} material={p.grey} position={[0.06, 1.02, -0.02]} rotation={[0, 0, -0.3]} />
      <Arm side={1} armRef={right} />
      <Arm side={-1} armRef={left} />
      <Leg side={1} />
      <Leg side={-1} />
      {/* 背中の推進器と、左右の推進剤タンク */}
      <mesh geometry={p.pack} material={p.grey} position={[0, 0.72, -0.19]} />
      {[1, -1].map((s) => (
        <group key={s}>
          <mesh geometry={p.tank} material={p.orange} position={[s * 0.17, 0.72, -0.2]} />
          <mesh geometry={p.nozzle} material={p.grey} position={[s * 0.07, 0.55, -0.22]} />
          <mesh ref={flameRef} geometry={p.flame} material={p.flameMat} position={[s * 0.07, 0.44, -0.22]} rotation={[Math.PI, 0, 0]} />
        </group>
      ))}
      {pose === 'weld' && (
        <group position={[0.3, 0.6, 0]}>
          {/* 腕の先の溶接の道具と火花（腕と一緒には動かさず、手の先あたりに置く） */}
          <mesh geometry={p.torch} material={p.grey} position={[0, 0, 0.44]} rotation={[Math.PI / 2, 0, 0]} />
          <mesh ref={spark} geometry={p.spark} material={sparkMat} position={[0, 0, 0.52]} scale={0.6} />
        </group>
      )}
      {pose === 'carry' && <mesh geometry={p.panel} material={p.panelMat} position={[0, 0.72, 0.5]} rotation={[Math.PI / 2, 0, 0]} />}
    </group>
  )
}
