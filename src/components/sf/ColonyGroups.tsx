import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { bodies, colliders } from '../../state/registry'
import { ship } from '../../state/flight'
import { useStore } from '../../state/store'
import { COLONY_LENGTH, COLONY_ZOOM } from '../../data/sf'
import { COLONY_GROUPS, colonyGroupFound, colonyGroupName, type ColonyGroup } from '../../data/sfSides'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'
import { earthMoonNormal, earthMoonPoint } from './lagrange'
import { useSite } from './useSite'
import { ColonyModel } from './ColonyModel'
import { Colony } from './Colony'
import { ApproachLights } from './ApproachLights'

// 地球と月のラグランジュ点の、第2〜第7コロニー群（第1コロニー群は ColonyCluster）。
// 円筒は第1コロニー群の半分の長さ（約16km）で、同じ縮尺。中へは入れない（光源も足さない）。
// 近くでは第1コロニーと同じ形（ColonyModel の外側）を、材質ごとに 1 つの形へ焼き固めて InstancedMesh で描く。
// 遠くでは軽い形（liteColonyGeometry）に切り替える（群が遠いと細部は見えないので、スマホでも軽く）。
// 回転軸（+Y）は群ごと太陽へ向け、1G になる速さ（半径2kmで約1分半に1回転）で回す。

const L = COLONY_LENGTH / 2
const R = L / 8
const DEG = Math.PI / 180
const SPIN_SECONDS = 2 * Math.PI * Math.sqrt(2000 / 9.8)
/** 群の中の置き場所（群の座標。+Y が太陽向き）。円筒の鏡が回ってきても届かない間隔 */
const SLOTS: [number, number, number][] = [
  [0, 0, 0],
  [-0.6, 0.06, 0.03],
  [-0.22, -0.05, 0.6],
  [0.38, 0.04, -0.5],
]
const Y = new THREE.Vector3(0, 1, 0)
/** この距離（群の中心から）より近いと、第1コロニーと同じ細かい形で描く */
const DETAIL_DISTANCE = 6
/**
 * 自機がこの距離まで来たら、群の円筒を第1コロニーと同じ Colony（中へ入れる・中に大地と雲・同じ当たり判定と操作感）に
 * 差し替える。離れたら（OPEN_OFF）元に戻す（行き来の境目でちらつかないよう、戻す距離は少し遠く）
 */
const OPEN_ON = 2.2
const OPEN_OFF = 3.2

type Baked = { geometry: THREE.BufferGeometry; material: THREE.Material; renderOrder: number }[]

/**
 * 隠して置いた第1コロニーの模型（外側だけ）を、材質ごとに 1 つの形へ焼き固める（大きさは半分に）。
 * 形を写すだけなので、第1コロニーを作り込めば、ほかの群も同じ見た目になる
 */
function bakeColony(src: THREE.Object3D): Baked | null {
  src.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(src.matrixWorld).invert()
  const half = new THREE.Matrix4().makeScale(0.5, 0.5, 0.5)
  const byMat = new Map<THREE.Material, { parts: THREE.BufferGeometry[]; renderOrder: number }>()
  src.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || Array.isArray(mesh.material)) return
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name)
    if (!g.attributes.normal) g.computeVertexNormals()
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(half, inv).multiply(mesh.matrixWorld))
    const entry = byMat.get(mesh.material) ?? { parts: [], renderOrder: mesh.renderOrder }
    entry.parts.push(g)
    byMat.set(mesh.material, entry)
  })
  if (!byMat.size) return null
  return [...byMat].map(([material, { parts, renderOrder }]) => {
    const geometry = mergeGeometries(parts)
    parts.forEach((p) => p.dispose())
    geometry.computeBoundingSphere()
    return { geometry, material, renderOrder }
  })
}

/** 円筒コロニーの外見：大地の帯3本（外板）・窓の帯3本・両端・窓の外の鏡3枚。色は頂点に持たせる */
function liteColonyGeometry() {
  const paint = (g: THREE.BufferGeometry, color: string) => {
    const c = new THREE.Color(color)
    const n = g.getAttribute('position').count
    const colors = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) c.toArray(colors, i * 3)
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return g
  }
  const sector = (i: number, color: string) => paint(new THREE.CylinderGeometry(R, R, L, 10, 1, true, i * 60 * DEG - 30 * DEG, 60 * DEG), color)
  const parts: THREE.BufferGeometry[] = []
  /** 部品ごとの材質（0 外板、1 窓、2 鏡） */
  const kinds: number[] = []
  const add = (g: THREE.BufferGeometry, kind: number) => {
    parts.push(g)
    kinds.push(kind)
  }
  for (const i of [0, 2, 4]) add(sector(i, '#7a7f88'), 0)
  for (const i of [1, 3, 5]) add(sector(i, '#ffffff'), 1)
  // 太陽側の端と港側の端
  add(paint(new THREE.CircleGeometry(R, 24).rotateX(-Math.PI / 2).translate(0, L / 2, 0), '#9aa0a8'), 0)
  add(paint(new THREE.CircleGeometry(R, 24).rotateX(Math.PI / 2).translate(0, -L / 2, 0), '#8a9098'), 0)
  add(paint(new THREE.CylinderGeometry(R * 0.3, R * 0.3, L * 0.06, 12).translate(0, -L * 0.52, 0), '#c8ccd2'), 0)
  // 鏡：港側の端を支点に、窓の帯の外へ25度開く
  for (const i of [1, 3, 5]) {
    const m = new THREE.PlaneGeometry(R * 1.05, L)
      .translate(0, L / 2, 0)
      .rotateX(25 * DEG)
      .translate(0, -L / 2, R * 1.02)
      .rotateY(i * 60 * DEG)
    add(paint(m, '#ffffff'), 2)
  }
  // uv は使わないので、まとめる前にそろえて外す
  parts.forEach((g) => g.deleteAttribute('uv'))
  // 同じ材質の部品を続けて並べてからまとめ、描く回数を材質の数（3回）にする
  const order = parts.map((g, i) => ({ g: g.index ? g.toNonIndexed() : g, kind: kinds[i] })).sort((x, y) => x.kind - y.kind)
  const merged = mergeGeometries(order.map((o) => o.g), true)!
  const ranges = merged.groups.map((g, i) => ({ start: g.start, count: g.count, kind: order[i].kind }))
  merged.clearGroups()
  for (const kind of [0, 1, 2]) {
    const mine = ranges.filter((r) => r.kind === kind)
    merged.addGroup(mine[0].start, mine.reduce((n, r) => n + r.count, 0), kind)
  }
  return merged
}

/** 建設中の円筒の骨組み：輪と縦の梁 */
function frameGeometry() {
  const pts: number[] = []
  const rings = 7
  const seg = 24
  for (let k = 0; k <= rings; k++) {
    const y = -L / 2 + (L * k) / rings
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2
      const a1 = ((i + 1) / seg) * Math.PI * 2
      pts.push(R * Math.sin(a0), y, R * Math.cos(a0), R * Math.sin(a1), y, R * Math.cos(a1))
    }
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    // 太陽側の上のほうは、まだ梁が届いていない
    const top = i % 2 ? L * 0.15 : L / 2
    pts.push(R * Math.sin(a), -L / 2, R * Math.cos(a), R * Math.sin(a), top, R * Math.cos(a))
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
}

type Shared = { colony: THREE.BufferGeometry; material: THREE.Material[]; frame: THREE.BufferGeometry; frameMat: THREE.Material }
const camLocal = new THREE.Vector3()

const earthPos = new THREE.Vector3()
const radial = new THREE.Vector3()
const up = new THREE.Vector3()
const along = new THREE.Vector3()
const toSun = new THREE.Vector3()
const m4 = new THREE.Matrix4()
const spinQ = new THREE.Quaternion()
const slotPos = new THREE.Vector3()
const one = new THREE.Vector3(1, 1, 1)
const local = new THREE.Vector3()
const inverse = new THREE.Matrix4()

function Group({ g, shared, baked }: { g: ColonyGroup; shared: Shared; baked: Baked | null }) {
  useLang()
  const group = useRef<THREE.Group>(null!)
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const detail = useRef<THREE.Group>(null!)
  const label = useRef<HTMLSpanElement>(null)
  const spin = useRef(g.n * 0.7)
  const [open, setOpen] = useState(false)
  const openRef = useRef(false)
  openRef.current = open
  useHideBehindSun(label, group)
  const moved = useSite(group, {
    id: g.id,
    radius: 0.55,
    zoom: { start: 1.6, full: 0.6, factor: COLONY_ZOOM },
    notice: { distance: 1.1, text: () => colonyGroupFound(g) },
  })

  // 外から円筒の中へは入れない（外板の少し外へ押し出す）
  useEffect(() => {
    const collide = () => {
      const grp = group.current
      // 中へ入れる Colony に差し替えているあいだは、それぞれが自分で判定する
      if (!grp || openRef.current) return
      inverse.copy(grp.matrixWorld).invert()
      local.copy(ship.position).applyMatrix4(inverse)
      for (let i = 0; i < g.count; i++) {
        const [x, y, z] = SLOTS[i]
        const dx = local.x - x
        const dy = local.y - y
        const dz = local.z - z
        const r = Math.hypot(dx, dz)
        if (Math.abs(dy) > L / 2 + 0.01 || r > R * 1.08) continue
        const k = (R * 1.08) / Math.max(r, 1e-6)
        local.set(x + dx * k, local.y, z + dz * k)
        ship.position.copy(local.applyMatrix4(grp.matrixWorld))
        return
      }
    }
    colliders.add(collide)
    return () => {
      colliders.delete(collide)
    }
  }, [g])

  useFrame(({ camera }, rawDelta) => {
    const grp = group.current
    if (!earthMoonPoint(g.point, grp.position)) return
    const e = bodies.get('earth')
    if (!e) return
    e.object.getWorldPosition(earthPos)
    radial.copy(grp.position).sub(earthPos).normalize()
    earthMoonNormal(up)
    along.crossVectors(up, radial).normalize()
    const o = g.offset
    grp.position.addScaledVector(radial, o.radial ?? 0).addScaledVector(along, o.along ?? 0).addScaledVector(up, o.up ?? 0)
    toSun.copy(grp.position).negate().normalize()
    grp.quaternion.setFromUnitVectors(Y, toSun)
    if (useStore.getState().timeScale > 0) spin.current += (Math.min(rawDelta, 0.05) * Math.PI * 2) / SPIN_SECONDS
    // 自機がすぐ近くなら中へ入れる Colony に、近ければ細かい形、遠ければ軽い形
    grp.updateMatrixWorld()
    const shipDist = ship.position.distanceTo(grp.getWorldPosition(camLocal))
    if (!open && shipDist < OPEN_ON) setOpen(true)
    else if (open && shipDist > OPEN_OFF) setOpen(false)
    camLocal.copy(camera.position).applyMatrix4(inverse.copy(grp.matrixWorld).invert())
    const near = !!baked && camLocal.length() < DETAIL_DISTANCE
    mesh.current.visible = !near && !open
    if (detail.current) detail.current.visible = near && !open
    const targets = near ? (detail.current.children as THREE.InstancedMesh[]) : [mesh.current]
    for (let i = 0; i < g.count; i++) {
      spinQ.setFromAxisAngle(Y, spin.current + i * 1.3)
      m4.compose(slotPos.set(...SLOTS[i]), spinQ, one)
      for (const t of targets) t.setMatrixAt(i, m4)
    }
    for (const t of targets) t.instanceMatrix.needsUpdate = true
    moved()
  })

  return (
    <group ref={group}>
      <instancedMesh ref={mesh} args={[shared.colony, shared.material, g.count]} frustumCulled={false} />
      {baked && (
        <group ref={detail} visible={false}>
          {baked.map((b, i) => (
            <instancedMesh key={i} args={[b.geometry, b.material, g.count]} renderOrder={b.renderOrder} frustumCulled={false} />
          ))}
        </group>
      )}
      {/* 港の誘導灯（中へ入れるコロニーに差し替えたら、そちらが自分で持つ） */}
      {!open &&
        SLOTS.slice(0, g.count).map((p, i) => (
          <group key={`a${i}`} position={p} scale={0.5}>
            <ApproachLights />
          </group>
        ))}
      {open &&
        SLOTS.slice(0, g.count).map((p, i) => (
          <Colony
            key={i}
            id={`${g.id}-${i + 1}`}
            name={() => colonyGroupName(g.n, g.point)}
            position={p}
            phase={spin.current + i * 1.3}
            scale={0.5}
            body={false}
          />
        ))}
      {g.building && <lineSegments geometry={shared.frame} material={shared.frameMat} position={SLOTS[g.count]} />}
      <Html position={[0, L * 0.9, 0]} center className="label" zIndexRange={LABEL_Z}>
        <span ref={label} onClick={() => useStore.getState().setTarget(g.id)}>
          {colonyGroupName(g.n, g.point)}
        </span>
      </Html>
    </group>
  )
}

/** 第2〜第7コロニー群 */
export function ColonyGroups() {
  const shared = useMemo<Shared>(
    () => ({
      colony: liteColonyGeometry(),
      material: [
        // 外板：太陽の当たらない側も真っ黒にならないよう、少しだけ自分で光らせる
        new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.4, roughness: 0.55, emissive: '#1e2127', side: THREE.DoubleSide }),
        // 窓：中の明かりが透けて見える、青みのあるガラス
        new THREE.MeshBasicMaterial({ color: '#1f2c40' }),
        new THREE.MeshStandardMaterial({ color: '#8d9ab0', metalness: 0.85, roughness: 0.2, emissive: '#1c2230', side: THREE.DoubleSide }),
      ],
      frame: frameGeometry(),
      frameMat: new THREE.LineBasicMaterial({ color: '#c9a35a', transparent: true, opacity: 0.85 }),
    }),
    [],
  )
  // 第1コロニーの模型を隠して置き、できたら焼き固める（ばらばらの部品のまま描くと、描く回数が群ごとに数十回になる）
  const src = useRef<THREE.Group>(null!)
  const [baked, setBaked] = useState<Baked | null>(null)
  useFrame(() => {
    if (baked || !src.current) return
    const b = bakeColony(src.current)
    if (b) setBaked(b)
  })
  useEffect(() => () => baked?.forEach((b) => b.geometry.dispose()), [baked])
  return (
    <>
      {/* 隠したまま残す（材質と環境マップは焼いた形と共有。外すと一緒に捨てられてしまう） */}
      <group ref={src} visible={false}>
        <ColonyModel interior={false} />
      </group>
      {COLONY_GROUPS.map((g) => (
        <Group key={g.id} g={g} shared={shared} baked={baked} />
      ))}
    </>
  )
}
