import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { ShipModel, METERS_PER_UNIT } from '../ship/ShipModel'
import { WorkMech } from './WorkMech'
import { bodies } from '../../state/registry'
import { ship } from '../../state/flight'
import { useStore } from '../../state/store'
import { SF_TEXT, UNITS_PER_METER, YARD_ID, yardName } from '../../data/sf'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'
import { useSite } from './useSite'

// 月の軌道の造船所（オリジナルのデザイン）。骨組みのドック2つ：片方では姉妹艦 SV-03 を建造中、
// もう片方は空いていて、自機 SV-01 の母港の係留場所。管制塔と太陽電池の翼。形は m で決める。

const DOCK = { length: 1150, width: 560, height: 420 }
/** ドックの中心どうしの間隔 */
const GAP = 760
/** 作業機の表示の高さ（m）。本物の想定（約18m）の約3倍 */
const MECH_M = 55
/** これより近いと、建造中の船や作業機を描く（表示単位） */
const DRAW = 1.2

const rel = new THREE.Vector3()
const side = new THREE.Vector3()
const moonPos = new THREE.Vector3()
const earthPos = new THREE.Vector3()
const Y = new THREE.Vector3(0, 1, 0)
const at = new THREE.Vector3()

/** ドックの骨組み：長さ方向の4本の柱と、一定の間隔の四角い枠 */
function DockFrame({ parts, lights }: { parts: ReturnType<typeof makeParts>; lights: THREE.Material }) {
  const { length: Lm, width: W, height: H } = DOCK
  const rails = [
    [-W / 2, -H / 2],
    [W / 2, -H / 2],
    [-W / 2, H / 2],
    [W / 2, H / 2],
  ]
  const ribs = Array.from({ length: 11 }, (_, k) => -Lm / 2 + (k / 10) * Lm)
  return (
    <group>
      {rails.map(([x, y], i) => (
        <mesh key={`r${i}`} geometry={parts.beam} material={parts.frame} position={[x, y, 0]} scale={[1, 1, Lm]} />
      ))}
      {ribs.map((z) => (
        <group key={`b${z}`} position={[0, 0, z]}>
          <mesh geometry={parts.beam} material={parts.frame} position={[0, -H / 2, 0]} scale={[W, 1, 1]} />
          <mesh geometry={parts.beam} material={parts.frame} position={[0, H / 2, 0]} scale={[W, 1, 1]} />
          <mesh geometry={parts.beam} material={parts.frame} position={[-W / 2, 0, 0]} scale={[1, H, 1]} />
          <mesh geometry={parts.beam} material={parts.frame} position={[W / 2, 0, 0]} scale={[1, H, 1]} />
          {rails.map(([x, y], i) => (
            <mesh key={i} geometry={parts.light} material={lights} position={[x, y, 0]} />
          ))}
        </group>
      ))}
    </group>
  )
}

function makeParts() {
  return {
    beam: new THREE.BoxGeometry(1, 1, 1).scale(1, 1, 1),
    frame: new THREE.MeshStandardMaterial({ color: '#8d929b', metalness: 0.6, roughness: 0.45, emissive: '#2a2d33', emissiveIntensity: 0.6 }),
    light: new THREE.SphereGeometry(9, 8, 8),
    work: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.1, 1.4), toneMapped: false }),
    guide: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.4, 0.8), toneMapped: false }),
    tower: new THREE.CylinderGeometry(70, 90, 520, 24),
    towerTop: new THREE.CylinderGeometry(130, 70, 80, 24),
    panel: new THREE.BoxGeometry(700, 4, 160),
    panelMat: new THREE.MeshStandardMaterial({ color: '#1d2b4a', metalness: 0.4, roughness: 0.3, emissive: '#0c1630', emissiveIntensity: 0.5 }),
    spark: new THREE.SphereGeometry(10, 8, 8),
    sparkMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3.6), toneMapped: false }),
  }
}

export function Shipyard() {
  useLang()
  const group = useRef<THREE.Group>(null!)
  const label = useRef<HTMLSpanElement>(null)
  useHideBehindSun(label, group)
  const size = (DOCK.length / 2 + 200) * UNITS_PER_METER
  const moved = useSite(group, {
    id: YARD_ID,
    radius: size * 1.4,
    zoom: { start: size * 8, full: size * 3 },
    notice: { distance: size * 5, text: SF_TEXT.yardFound },
  })
  const parts = useMemo(makeParts, [])
  const sparks = useRef<THREE.Mesh[]>([])
  // 建造中の船（大きなテクスチャを使うので、近くに来てから作る）
  const [detail, setDetail] = useState(false)

  useFrame(({ clock }) => {
    const m = bodies.get('moon')
    const e = bodies.get('earth')
    if (!m || !e) return
    const g = group.current
    m.object.getWorldPosition(moonPos)
    e.object.getWorldPosition(earthPos)
    // 月の、地球から見て横（公転の向きと直角）の上空。ドックは月を向く
    rel.copy(moonPos).sub(earthPos).normalize()
    side.crossVectors(rel, Y).normalize()
    g.position.copy(moonPos).addScaledVector(side, m.radius * 1.9).addScaledVector(Y, m.radius * 0.4)
    g.lookAt(moonPos)
    moved()
    const near = ship.position.distanceTo(g.getWorldPosition(at)) < DRAW
    if (near && !detail) setDetail(true)
    // 溶接の火花
    const t = clock.getElapsedTime()
    sparks.current.forEach((s, i) => s.scale.setScalar(Math.sin(t * (7 + i) + i * 2) + Math.sin(t * 19 + i) > 0.4 ? 1 + Math.random() : 0.01))
  })

  const shipScale = METERS_PER_UNIT
  const sparkSpots: [number, number, number][] = [
    [120, 60, -200],
    [-140, 20, 80],
    [60, -90, 260],
    [-60, 120, -60],
    [200, 0, 120],
  ]
  return (
    <group ref={group}>
      <group scale={UNITS_PER_METER}>
        {/* 左：建造中の SV-03。右：空いている SV-01 の係留場所 */}
        <group position={[-GAP / 2, 0, 0]}>
          <DockFrame parts={parts} lights={parts.work} />
          {detail && (
            <>
              <group scale={shipScale} rotation={[0, Math.PI, 0]}>
                <ShipModel registry="SV-03" shipName="SOLAR DAWN" tint="#9a9ea4" unitScale={shipScale * UNITS_PER_METER} />
              </group>
              {sparkSpots.map((p, i) => (
                <mesh
                  key={i}
                  ref={(m: THREE.Mesh | null) => {
                    if (m) sparks.current[i] = m
                  }}
                  geometry={parts.spark}
                  material={parts.sparkMat}
                  position={p}
                />
              ))}
              {sparkSpots.map((p, i) => (
                <group key={`m${i}`} position={[p[0] + 40, p[1] + 30, p[2]]} rotation={[0, i * 1.3, 0]} scale={MECH_M}>
                  <WorkMech pose={i % 2 ? 'carry' : 'weld'} phase={i * 1.4} />
                </group>
              ))}
            </>
          )}
        </group>
        <group position={[GAP / 2, 0, 0]}>
          <DockFrame parts={parts} lights={parts.guide} />
        </group>
        {/* 管制塔と太陽電池の翼 */}
        <group position={[0, -DOCK.height / 2 - 260, 0]}>
          <mesh geometry={parts.tower} material={parts.frame} />
          <mesh geometry={parts.towerTop} material={parts.frame} position={[0, -300, 0]} />
          <mesh geometry={parts.panel} material={parts.panelMat} position={[-420, 0, 0]} />
          <mesh geometry={parts.panel} material={parts.panelMat} position={[420, 0, 0]} />
        </group>
      </group>
      <Html position={[0, size * 1.1, 0]} center className="label" zIndexRange={LABEL_Z}>
        <span ref={label} onClick={() => useStore.getState().setTarget(YARD_ID)}>
          {yardName()}
        </span>
      </Html>
    </group>
  )
}
