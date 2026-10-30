import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { asteroidMaterial } from '../asteroidShape'
import { MUSHROOM_SIZE, MUSHROOM_STEM_TIP, STAR_SIZE, STAR_TURN, mushroomGeometry, rockMesh, scatterLights, starGeometry, surfaceProbe } from './rockShapes'
import { bodies } from '../../state/registry'
import { useStore } from '../../state/store'
import { SF_TEXT, UNITS_PER_METER, sfEntry } from '../../data/sf'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'
import { earthMoonPoint, type LagrangePoint } from './lagrange'
import { useSite } from './useSite'

// 小惑星を運んできて、中をくりぬいた宇宙港（オリジナルのデザイン）。戦いの場面はなく、船が出入りする港として描く。
// cross：四方と上下に尖った角が出た、金平糖のような形。umbrella：厚い傘の下に段が重なり、ねじれた柄が伸びるキノコ形。
// 岩の形は rockShapes.ts。
// 形は m（メートル）で決め、UNITS_PER_METER で表示単位にする（そばでは自機が本物の比率になる）

export type BaseShape = 'cross' | 'umbrella'

type Bay = { pos: [number, number, number]; normal: [number, number, number]; size: number }
type Spot = { pos: THREE.Vector3; normal: THREE.Vector3 }

const FAR = 20000
const bay = (hit: Spot | null, size: number): Bay[] => (hit ? [{ pos: hit.pos.clone().addScaledVector(hit.normal, 60).toArray(), normal: hit.normal.toArray(), size }] : [])
const lift = (hit: Spot | null, by: number) => (hit ? (hit.pos.clone().addScaledVector(hit.normal, by).toArray() as [number, number, number]) : null)

/** 金平糖形：角と角のあいだのくぼみに港の口、6本の角の先に灯 */
function starLayout(geometry: THREE.BufferGeometry) {
  const probe = surfaceProbe(geometry)
  // 回す前の向き（x, y, z）から、表面へ光線を当てる
  const hitAt = (x: number, y: number, z: number) => {
    const dir = new THREE.Vector3(x, y, z).normalize().applyAxisAngle(Y, STAR_TURN).multiplyScalar(FAR)
    return probe(dir, { x: 0, y: 0, z: 0 })
  }
  const bays: Bay[] = []
  // 地球に向いたくぼみ（k = 0）に大きな口
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2
    bays.push(...bay(hitAt(Math.cos(a), k === 0 ? -0.05 : 0.3, Math.sin(a)), k === 0 ? 420 : 260))
  }
  bays.push(...bay(hitAt(Math.cos(Math.PI / 4), -0.45, Math.sin(Math.PI / 4)), 260))
  const axes: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
  const beacons = axes.map((a) => lift(hitAt(...a), 60)).filter((p) => p !== null)
  const ant = hitAt(Math.cos(Math.PI / 4), 0.75, Math.sin(Math.PI / 4))
  return { bays, beacons, antenna: ant, lights: [] as THREE.Vector3[] }
}

/** キノコ形：傘の裏と柄の先に港の口、傘の縁に灯、表面に暖色の窓明かり */
function mushroomLayout(geometry: THREE.BufferGeometry) {
  const probe = surfaceProbe(geometry)
  const bays: Bay[] = []
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4
    const x = Math.cos(a) * 2500
    const z = Math.sin(a) * 2500
    bays.push(...bay(probe({ x, y: -FAR, z }, { x, y: FAR, z }), 260))
  }
  const tip = MUSHROOM_STEM_TIP
  bays.push(...bay(probe({ x: tip.x, y: -FAR, z: tip.z }, { x: tip.x, y: 0, z: tip.z }), 380))
  const beacons: [number, number, number][] = []
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2
    const p = lift(probe({ x: Math.cos(a) * FAR, y: 0, z: Math.sin(a) * FAR }, { x: 0, y: 0, z: 0 }), 60)
    if (p) beacons.push(p)
  }
  const ant = probe({ x: 600, y: FAR, z: 400 }, { x: 600, y: -FAR, z: 400 })
  return { bays, beacons, antenna: ant, lights: scatterLights(geometry, 90, 77, [-5200, 1200]) }
}

const Y = new THREE.Vector3(0, 1, 0)
const Z = new THREE.Vector3(0, 0, 1)
const normal = new THREE.Vector3()
const toEarth = new THREE.Vector3()
const shuttlePos = new THREE.Vector3()

/** 地球と月のラグランジュ点に置く、くりぬいた小惑星の宇宙港 */
export function AsteroidBase({ id, shape, point }: { id: string; shape: BaseShape; point: LagrangePoint }) {
  useLang()
  const group = useRef<THREE.Group>(null!)
  const label = useRef<HTMLSpanElement>(null)
  useHideBehindSun(label, group)
  const size = (shape === 'cross' ? STAR_SIZE : MUSHROOM_SIZE) * UNITS_PER_METER
  const moved = useSite(group, {
    id,
    radius: size,
    zoom: { start: size * 5, full: size * 2.2 },
    notice: { distance: size * 4, text: shape === 'cross' ? SF_TEXT.crossFound : SF_TEXT.umbrellaFound },
  })

  const { mesh, bays, beacons, antenna, glow } = useMemo(() => {
    const geometry = shape === 'cross' ? starGeometry() : mushroomGeometry()
    const mesh = rockMesh(geometry, asteroidMaterial(), shape === 'cross' ? '#857b72' : '#8a8279')
    const { antenna: ant, lights, ...rest } = shape === 'cross' ? starLayout(geometry) : mushroomLayout(geometry)
    const antenna = { pos: (ant?.pos.toArray() ?? [0, 0, 0]) as [number, number, number], quat: new THREE.Quaternion().setFromUnitVectors(Y, ant?.normal ?? Y) }
    // 窓明かり：小さな暖色の点を1つの InstancedMesh で描く
    const glow = new THREE.InstancedMesh(new THREE.SphereGeometry(32, 6, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.5, 0.6), toneMapped: false }), Math.max(1, lights.length))
    glow.count = lights.length
    lights.forEach((p, i) => glow.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p)))
    return { mesh, antenna, glow, ...rest }
  }, [shape])
  const parts = useMemo(
    () => ({
      bay: new THREE.PlaneGeometry(1, 0.6),
      bayMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.25, 0.7), toneMapped: false, side: THREE.DoubleSide }),
      frame: new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.15, 0.72)),
      frameMat: new THREE.LineBasicMaterial({ color: '#d8dde6' }),
      beacon: new THREE.SphereGeometry(40, 8, 8),
      beaconMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.4, 0.3), toneMapped: false }),
      dish: new THREE.SphereGeometry(260, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3),
      mast: new THREE.CylinderGeometry(20, 20, 700, 6),
      metal: new THREE.MeshStandardMaterial({ color: '#c4c8d0', metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide }),
      shuttle: new THREE.BoxGeometry(60, 40, 160),
      shuttleLight: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.6), toneMapped: false }),
    }),
    [],
  )
  useEffect(
    () => () => {
      for (const m of [mesh, glow]) {
        m.geometry.dispose()
        ;(m.material as THREE.Material).dispose()
        m.dispose()
      }
    },
    [mesh, glow],
  )

  const beaconMat = useRef(parts.beaconMat)
  const shuttles = useRef<THREE.Mesh[]>([])
  useFrame(({ clock }) => {
    const g = group.current
    if (!earthMoonPoint(point, g.position)) return
    // 港の口（+Z または -Y）がおおよそ地球のほうを向くように
    const e = bodies.get('earth')
    if (e) {
      e.object.getWorldPosition(toEarth).sub(g.position).normalize()
      if (shape === 'cross') g.lookAt(e.object.getWorldPosition(shuttlePos))
      else g.quaternion.setFromUnitVectors(Y, toEarth.negate())
    }
    moved()
    // 灯はゆっくり2回ずつ点滅
    const t = clock.getElapsedTime()
    const on = t % 2.4 < 0.15 || (t % 2.4 > 0.4 && t % 2.4 < 0.55)
    beaconMat.current.color.setRGB(on ? 2.6 : 0.25, on ? 0.4 : 0.04, on ? 0.3 : 0.03)
    // 連絡船：港の口から出て、少し離れて戻る
    shuttles.current.forEach((s, i) => {
      const bay = bays[i % bays.length]
      const k = 0.5 - 0.5 * Math.cos(t * 0.15 + i * 1.9)
      shuttlePos.set(...bay.pos).addScaledVector(new THREE.Vector3(...bay.normal), 200 + k * 2600)
      s.position.copy(shuttlePos)
      s.quaternion.setFromUnitVectors(Z, normal.set(...bay.normal))
    })
  })

  const entry = sfEntry(id)
  return (
    <group ref={group}>
      <group scale={UNITS_PER_METER}>
        <primitive object={mesh} />
        <primitive object={glow} />
        {bays.map((b, i) => {
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...b.normal))
          return (
            <group key={i} position={b.pos} quaternion={q} scale={b.size}>
              <mesh geometry={parts.bay} material={parts.bayMat} />
              <lineSegments geometry={parts.frame} material={parts.frameMat} />
            </group>
          )
        })}
        {beacons.map((p, i) => (
          <mesh key={i} geometry={parts.beacon} material={parts.beaconMat} position={p} />
        ))}
        {/* アンテナ */}
        <group position={antenna.pos} quaternion={antenna.quat}>
          <mesh geometry={parts.mast} material={parts.metal} position={[0, 350, 0]} />
          <mesh geometry={parts.dish} material={parts.metal} position={[0, 700, 0]} rotation={[0.5, 0, 0]} />
        </group>
        {Array.from({ length: 4 }, (_, i) => (
          <mesh
            key={i}
            ref={(m: THREE.Mesh | null) => {
              if (m) shuttles.current[i] = m
            }}
            geometry={parts.shuttle}
            material={parts.metal}
          >
            <mesh geometry={parts.beacon} material={parts.shuttleLight} position={[0, 0, -90]} scale={0.6} />
          </mesh>
        ))}
      </group>
      <Html position={[0, size * 1.3, 0]} center className="label" zIndexRange={LABEL_Z}>
        <span ref={label} onClick={() => useStore.getState().setTarget(id)}>
          {entry?.name()}
        </span>
      </Html>
    </group>
  )
}
