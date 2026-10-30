import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { asteroidGeometry, asteroidMaterial } from '../asteroidShape'
import { bodies } from '../../state/registry'
import { useStore } from '../../state/store'
import { SF_TEXT, UNITS_PER_METER, sfEntry } from '../../data/sf'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'
import { earthMoonPoint, type LagrangePoint } from './lagrange'
import { useSite } from './useSite'

// 小惑星を運んできて、中をくりぬいた宇宙港（オリジナルのデザイン）。戦いの場面はなく、船が出入りする港として描く。
// cross：4本の腕が十字に伸びた形。umbrella：広い傘の下に柱が伸びた形。
// 形は m（メートル）で決め、UNITS_PER_METER で表示単位にする（そばでは自機が本物の比率になる）

export type BaseShape = 'cross' | 'umbrella'

/** rot：岩の向き。細長い向き（x）を腕や傘の広がりにそろえる */
type Rock = { pos: [number, number, number]; scale: [number, number, number]; color: string; rot: [number, number, number] }
type Bay = { pos: [number, number, number]; normal: [number, number, number]; size: number }

const rng = (seed: number) => {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

/** 岩の並べ方・港の口・灯の位置（m） */
function layout(shape: BaseShape) {
  const rand = rng(shape === 'cross' ? 101 : 202)
  const rocks: Rock[] = []
  const bays: Bay[] = []
  const beacons: [number, number, number][] = []
  const tone = () => ['#7a7068', '#8a8178', '#6b645e', '#958a7c'][Math.floor(rand() * 4)]
  if (shape === 'cross') {
    rocks.push({ pos: [0, 0, 0], scale: [1700, 1500, 1600], color: tone(), rot: [0.3, 0.2, 0.7] })
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.12 * (rand() - 0.5)
      const dir = [Math.cos(a), Math.sin(a)]
      for (let i = 1; i <= 3; i++) {
        const d = 700 + i * 800 + rand() * 150
        const r = 1150 - i * 200
        rocks.push({ pos: [dir[0] * d, dir[1] * d, (rand() - 0.5) * 300], scale: [r * 1.4, r, r], color: tone(), rot: [(rand() - 0.5) * 0.4, (rand() - 0.5) * 0.4, a] })
      }
      beacons.push([dir[0] * 3900, dir[1] * 3900, 0])
      // 腕の付け根の前面に港の口
      bays.push({ pos: [dir[0] * 1300, dir[1] * 1300, 1150], normal: [0, 0, 1], size: 260 })
    }
    bays.push({ pos: [0, 0, 1550], normal: [0, 0, 1], size: 420 })
  } else {
    // 傘：平たく広い岩をいくつか重ね、下に柱を伸ばす
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2
      const d = k === 0 ? 0 : 1500
      rocks.push({ pos: [Math.cos(a) * d, (rand() - 0.5) * 150, Math.sin(a) * d], scale: [1600, 450, 1500], color: tone(), rot: [(rand() - 0.5) * 0.15, rand() * 6, (rand() - 0.5) * 0.15] })
    }
    for (let i = 1; i <= 3; i++) rocks.push({ pos: [(rand() - 0.5) * 200, -i * 1000, (rand() - 0.5) * 200], scale: [1000, 800 - i * 90, 800 - i * 90], color: tone(), rot: [rand() * 0.3, rand() * 6, Math.PI / 2] })
    // 傘の縁の灯と、傘の裏・柱の港の口
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2
      beacons.push([Math.cos(a) * 2900, -100, Math.sin(a) * 2900])
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4
      bays.push({ pos: [Math.cos(a) * 1600, -420, Math.sin(a) * 1600], normal: [0, -1, 0], size: 260 })
    }
    bays.push({ pos: [0, -3900, 0], normal: [0, -1, 0], size: 380 })
  }
  return { rocks, bays, beacons }
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
  const size = (shape === 'cross' ? 4200 : 4100) * UNITS_PER_METER
  const moved = useSite(group, {
    id,
    radius: size,
    zoom: { start: size * 5, full: size * 2.2 },
    notice: { distance: size * 4, text: shape === 'cross' ? SF_TEXT.crossFound : SF_TEXT.umbrellaFound },
  })

  const { rocks, bays, beacons } = useMemo(() => layout(shape), [shape])
  const parts = useMemo(() => {
    const rand = rng(shape === 'cross' ? 7 : 9)
    const geometry = asteroidGeometry(rand, 5)
    const mesh = new THREE.InstancedMesh(geometry, asteroidMaterial(), rocks.length)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    rocks.forEach((r, i) => {
      q.setFromEuler(new THREE.Euler(...r.rot))
      m.compose(new THREE.Vector3(...r.pos), q, new THREE.Vector3(...r.scale))
      mesh.setMatrixAt(i, m)
      mesh.setColorAt(i, new THREE.Color(r.color))
    })
    mesh.castShadow = mesh.receiveShadow = true
    return {
      mesh,
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
    }
  }, [rocks, shape])
  useEffect(
    () => () => {
      parts.mesh.geometry.dispose()
      ;(parts.mesh.material as THREE.Material).dispose()
      parts.mesh.dispose()
    },
    [parts],
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
        <primitive object={parts.mesh} />
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
        <group position={shape === 'cross' ? [0, 1500, 600] : [0, 450, 0]}>
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
