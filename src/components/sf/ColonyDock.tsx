import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COLONY_LENGTH as L, COLONY_PORT as PORT } from '../../data/sf'
import { Batch, place, seeded } from './batch'
import { M } from './colonyCity'

// コロニーの港の中（港側の端の、回転軸の上の筒の中）。回らない「無重力ドック」。
// 実際の円筒型コロニーの構想でも、船は回る円筒の中へは入らず、重さのない軸の上の港につなぐ。
// 筒は回っているので、船をつなぐ骨組みは軸受け（ハブの輪）で切り離して回さない。
// 人と荷物は、ハブの輪からエレベーターで端の壁を降りて地面の駅へ（ColonyInterior）。
// 軸のまわりは通り道として空けてあり、自機はそこを通って中へ入る。

const DEG = Math.PI / 180
const H = L / 2
const CAP = 0.03
/** 筒（港）の内側：y の範囲（コロニーの座標） */
const TOP = -H - CAP
const BOTTOM = -H - CAP - 0.1
/** 骨組みの輪の半径と、船をつなぐ半径 */
const FRAME_R = PORT * 0.82
const BERTH_R = PORT * 0.58
const SHIP_K = 1.6

/** 面の向きで明るさを変えた色を頂点に焼く（中まで日が届かないので、投光器に照らされた感じ） */
function bake(geometry: THREE.BufferGeometry, base: THREE.ColorRepresentation) {
  const c = new THREE.Color(base)
  const pos = geometry.attributes.position
  const nor = geometry.attributes.normal
  const col = new Float32Array(pos.count * 3)
  const toAxis = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    toAxis.set(-pos.getX(i), 0, -pos.getZ(i)).normalize()
    n.fromBufferAttribute(nor, i)
    const v = 0.4 + 0.5 * Math.max(0, n.dot(toAxis)) + 0.25 * Math.max(0, -n.y)
    col[i * 3] = c.r * v
    col[i * 3 + 1] = c.g * v
    col[i * 3 + 2] = c.b * v
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return geometry
}

type DockParts = { hull: THREE.BufferGeometry; cargo: THREE.BufferGeometry; frame: THREE.BufferGeometry; lights: THREE.BufferGeometry; windows: THREE.BufferGeometry }
let cached: DockParts | null = null

function dockParts(): DockParts {
  if (cached) return cached
  const box = new THREE.BoxGeometry(1, 1, 1)
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 16)
  const cone = new THREE.CylinderGeometry(0, 1, 1, 16)
  const bell = new THREE.CylinderGeometry(1, 0.55, 1, 12, 1, true)
  const ball = new THREE.SphereGeometry(1, 14, 10)
  const lamp = new THREE.SphereGeometry(1, 6, 4)
  const hull = new Batch()
  const cargo = new Batch()
  const frame = new Batch()
  const lights = new Batch()
  const windows = new Batch()
  const rand = seeded(77)
  const m = (v: number) => v * M

  // 回らない骨組み：4 本の輪と 8 本の縦の桁、ハブ側の軸受けの太い輪
  const ring = new THREE.TorusGeometry(FRAME_R, m(14), 6, 72)
  for (const y of [TOP - 0.012, TOP - 0.036, TOP - 0.062, TOP - 0.088]) frame.add(ring, place([0, y, 0], [Math.PI / 2, 0, 0]))
  frame.add(new THREE.TorusGeometry(PORT * 0.95, m(45), 8, 72), place([0, TOP - 0.003, 0], [Math.PI / 2, 0, 0]))
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    frame.add(box, place([Math.sin(a) * FRAME_R, (TOP - 0.003 + TOP - 0.088) / 2, Math.cos(a) * FRAME_R], [0, a, 0], [m(20), 0.085, m(20)]))
  }
  // 骨組みの灯り（輪に沿って）
  for (const y of [TOP - 0.012, TOP - 0.036, TOP - 0.062, TOP - 0.088])
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2
      lights.add(lamp, place([Math.sin(a) * (FRAME_R - m(20)), y, Math.cos(a) * (FRAME_R - m(20))], [0, 0, 0], m(9)))
    }

  // 6 つの桟橋と、つないである船（船首を港の出口 -Y へ向ける）
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 30 * DEG
    const cx = Math.sin(a) * BERTH_R
    const cz = Math.cos(a) * BERTH_R
    const yc = (TOP + BOTTOM) / 2 + 0.004
    const kind = k % 3
    // 船の大きさ（長さ 500〜800 m ほど）
    const shipFrame = place([cx, yc, cz], [0, a, 0], SHIP_K)
    const len = kind === 0 ? 480 : kind === 1 ? 380 : 300
    // 桟橋の腕（船から骨組みの輪まで、外向き）と、乗り降りの通路
    for (const dy of [-0.3, 0.3]) {
      const y = yc + m(len * SHIP_K * dy)
      const mid = (BERTH_R + FRAME_R) / 2
      frame.add(box, place([Math.sin(a) * mid, y, Math.cos(a) * mid], [0, a, 0], [m(26), m(26), FRAME_R - BERTH_R]))
      lights.add(lamp, place([Math.sin(a) * (BERTH_R + m(70)), y + m(20), Math.cos(a) * (BERTH_R + m(70))], [0, 0, 0], m(10)))
    }
    windows.add(box, place([Math.sin(a) * ((BERTH_R + FRAME_R) / 2), yc, Math.cos(a) * ((BERTH_R + FRAME_R) / 2)], [0, a, 0], [m(14), m(6), FRAME_R - BERTH_R - m(80)]))
    // 船の座標：y が長さ（-Y が船首）、外向きが z
    const ship = (pos: [number, number, number], size: [number, number, number], geo: THREE.BufferGeometry = box, b: Batch = hull, rot: [number, number, number] = [0, 0, 0]) =>
      b.add(geo, new THREE.Matrix4().multiplyMatrices(shipFrame, place([m(pos[0]), m(pos[1]), m(pos[2])], rot, [m(size[0]), m(size[1]), m(size[2])])))
    if (kind === 0) {
      // 貨物船：背骨にコンテナを並べ、前に船橋、後ろにエンジン
      ship([0, 0, 0], [24, len, 24])
      for (let y = -len / 2 + 90; y < len / 2 - 70; y += 46)
        for (const [x, z] of [[-32, 0], [32, 0], [0, -32], [0, 32]]) if (rand() < 0.85) ship([x, y, z], [36, 40, 36], box, cargo)
      ship([0, -len / 2 + 40, 0], [70, 60, 50])
      windows.add(box, new THREE.Matrix4().multiplyMatrices(shipFrame, place([0, m(-len / 2 + 10), m(26)], [0, 0, 0], [m(56), m(6), m(1)])))
      for (const x of [-26, 26]) ship([x, len / 2 + 25, 0], [22, 50, 22], bell)
    } else if (kind === 1) {
      // 客船：丸い胴、とがった船首、窓の列、3 基のエンジン
      ship([0, 0, 0], [46, len * 0.8, 46], cyl)
      ship([0, -len * 0.4 - 45, 0], [46, 90, 46], cone, hull, [Math.PI, 0, 0])
      ship([0, len * 0.4 + 20, 0], [56, 40, 56], cyl)
      for (let y = -len * 0.35; y < len * 0.35; y += 14)
        for (const s of [-1, 1]) windows.add(box, new THREE.Matrix4().multiplyMatrices(shipFrame, place([m(s * 33), m(y), m(33)], [0, s * 45 * DEG, 0], [m(4), m(7), m(2)])))
      for (let i = 0; i < 3; i++) {
        const ea = (i / 3) * Math.PI * 2
        ship([Math.sin(ea) * 30, len * 0.4 + 60, Math.cos(ea) * 30], [18, 40, 18], bell)
      }
      ship([0, -len * 0.1, 0], [130, 18, 130], cyl, cargo)
    } else {
      // 液体の運搬船：背骨に丸いタンク
      ship([0, 0, 0], [16, len, 16])
      for (let i = 0; i < 4; i++) ship([0, -len / 2 + 70 + i * 58, 0], [27, 27, 27], ball, cargo)
      ship([0, -len / 2 + 15, 0], [40, 30, 34])
      ship([0, len / 2 + 20, 0], [20, 40, 20], bell)
    }
    // 船の航行灯
    lights.add(lamp, new THREE.Matrix4().multiplyMatrices(shipFrame, place([0, m(-len / 2), m(30)], [0, 0, 0], m(7))))
  }
  cached = {
    hull: bake(hull.build(), '#c3c7cd'),
    cargo: bake(cargo.build(), '#c98a4a'),
    frame: bake(frame.build(), '#8b9099'),
    lights: lights.build(),
    windows: windows.build(),
  }
  return cached
}

const mats = {
  hull: new THREE.MeshBasicMaterial({ vertexColors: true }),
  lights: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.1, 1.4), toneMapped: false }),
  windows: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.6, 1.05), toneMapped: false }),
}
const local = new THREE.Vector3()

/** 港の中の回らないドック（Colony の回らないほうの group に置く） */
export function ColonyDock() {
  const group = useRef<THREE.Group>(null!)
  const parts = useMemo(dockParts, [])
  useFrame(({ camera }) => {
    const g = group.current
    local.copy(camera.position)
    g.worldToLocal(local)
    g.visible = local.length() < 1
  })
  return (
    <group ref={group}>
      <mesh geometry={parts.hull} material={mats.hull} />
      <mesh geometry={parts.cargo} material={mats.hull} />
      <mesh geometry={parts.frame} material={mats.hull} />
      <mesh geometry={parts.lights} material={mats.lights} />
      <mesh geometry={parts.windows} material={mats.windows} />
    </group>
  )
}
