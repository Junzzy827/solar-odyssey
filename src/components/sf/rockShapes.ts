import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { pointedRock, radialRock, roughen } from '../asteroidShape'

// SF の小惑星の基地に使う、形を決めた大きな岩（オリジナルのデザイン）。
// 金平糖形（十字の小惑星港）、コマ形（推進小惑星）、キノコ形（傘の小惑星基地）。
// 座標の1は ROCK_UNIT m。岩肌の細かい模様（asteroidMaterial）の大きさをほかの岩とそろえるため、
// InstancedMesh（1つだけ）に ROCK_UNIT 倍の大きさで置く。

export const ROCK_UNIT = 1300
const u = (m: number) => m / ROCK_UNIT

/** 岩を1つだけの InstancedMesh にする（asteroidMaterial が instanceMatrix を使うため） */
export function rockMesh(geometry: THREE.BufferGeometry, material: THREE.Material, color: string) {
  const mesh = new THREE.InstancedMesh(geometry, material, 1)
  mesh.setMatrixAt(0, new THREE.Matrix4().makeScale(ROCK_UNIT, ROCK_UNIT, ROCK_UNIT))
  mesh.setColorAt(0, new THREE.Color(color))
  mesh.castShadow = mesh.receiveShadow = true
  return mesh
}

/** 岩の表面に外から光線を当てる。from と to は m。当たった点（m）と外向きの法線を返す */
export function surfaceProbe(geometry: THREE.BufferGeometry) {
  const probe = new THREE.Mesh(geometry)
  const ray = new THREE.Raycaster()
  const dir = new THREE.Vector3()
  return (from: THREE.Vector3Like, to: THREE.Vector3Like) => {
    const start = new THREE.Vector3(u(from.x), u(from.y), u(from.z))
    dir.set(u(to.x), u(to.y), u(to.z)).sub(start).normalize()
    ray.set(start, dir)
    const hit = ray.intersectObject(probe)[0]
    if (!hit) return null
    const normal = hit.face!.normal.clone()
    if (normal.dot(dir) > 0) normal.negate()
    return { pos: hit.point.multiplyScalar(ROCK_UNIT), normal }
  }
}

// ---- 金平糖形：四方と上下に尖った角が出て、表面がでこぼこ ----

/** 角の長さ（m）：+x, -x, 上, 下, +z, -z */
const STAR_TIPS = [4500, 4200, 4800, 4300, 4300, 4500]
/** 小さいほど角が細く尖り、角と角のあいだがくぼむ */
const STAR_P = 0.8
/** 四方の角を上下の軸のまわりに回す（+Z から見て、角が斜めに出て見えるように） */
/** ふくらんだ芯の半径（m） */
const STAR_CORE = 2300
export const STAR_TURN = -Math.PI / 4 + 0.35
export const STAR_SIZE = Math.max(...STAR_TIPS)

export function starGeometry() {
  const tips = STAR_TIPS.map(u)
  // 角の星形に、ふくらんだ芯（半径 STAR_CORE の球）をなめらかに足す
  const core = u(STAR_CORE)
  const star = pointedRock(tips, STAR_P, 60)
  const pos = star.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const r = v.length()
    v.multiplyScalar((r ** 6 + core ** 6) ** (1 / 6) / r)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  const g = roughen(star, 0.8, 0.25, 1, Math.max(...tips))
  g.rotateY(STAR_TURN)
  g.computeVertexNormals()
  return g
}

// ---- コマ形：上は平たく広がり、下は細くすぼまる。上に尖った岩山 ----

/** 平らな上面の高さ・縁の下端・下の先までの深さ（m） */
export const TOP_UP = 350
const TOP_RIM = 100
const TOP_DEPTH = 5000
/** エンジンを並べる +Z 側の平らな面までの距離（m） */
export const TOP_ENGINE_FACE = 2500
/** 縁の張り出し（方位角 → m）。いくつかの尖った張り出しがある。+Z 側（エンジンの面）には出さない */
const TOP_POINTS: [number, number][] = [
  [0.1, 1.25],
  [1.0, 0.9],
  [2.3, 1.2],
  [3.4, 1.0],
  [4.3, 1.3],
  [5.3, 0.95],
]
function topRim(az: number) {
  let k = 0
  for (const [a, amp] of TOP_POINTS) k = Math.max(k, amp * Math.max(0, Math.cos(az - a)) ** 14)
  return 3800 * (0.85 + 0.38 * k)
}
/** 岩山の位置（m）。上面から高さ約2600m */
export const TOP_PEAK = new THREE.Vector3(-1100, TOP_UP, -700)
export const TOP_SIZE = 5200

/** 下側：縁から下の先へ、反りながら細くなる（ρ = R·((y+深さ)/(深さ-縁))^1.7）。光線に沿って境目を二分探索で探す */
function underside(d: THREE.Vector3, horiz: number, R: number) {
  const H = u(TOP_DEPTH), a = u(TOP_RIM)
  const inside = (r: number) => {
    const y = r * d.y
    if (y <= -H) return false
    return r * horiz <= R * Math.min(1, (y + H) / (H - a)) ** 1.7
  }
  let lo = 0, hi = H * 1.5
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (inside(mid)) lo = mid
    else hi = mid
  }
  return lo
}

export function topGeometry() {
  const body = radialRock((d) => {
    const horiz = Math.hypot(d.x, d.z)
    const R = u(topRim(Math.atan2(d.z, d.x)))
    let r = horiz > 1e-6 ? R / horiz : Infinity
    if (d.y > 0) r = Math.min(r, u(TOP_UP) / d.y)
    if (d.y < 0) r = Math.min(r, underside(d, horiz, R))
    if (d.z > 0) r = Math.min(r, u(TOP_ENGINE_FACE) / d.z)
    return r
  }, 56)
  roughen(body, 0.6, 0.2, 2)
  const peak = roughen(pointedRock([u(1300), u(1100), u(2800), u(500), u(1000), u(1200)], 1.05, 24), 0.3, 0.1, 3, u(2800))
  peak.rotateY(0.6)
  peak.translate(u(TOP_PEAK.x), u(TOP_PEAK.y), u(TOP_PEAK.z))
  const g = mergeGeometries([body, peak])
  body.dispose()
  peak.dispose()
  return g
}

// ---- キノコ形：厚みのある大きな傘、その下に小さめの段、細くねじれた柄 ----

/** 傘と段：中心の高さ・横の半径・上と下の厚み（m） */
const SHELVES = [
  { y: 0, radius: 3100, up: 1000, down: 650, wave: 260, seed: 4, off: [0, 0] },
  { y: -1500, radius: 1900, up: 450, down: 300, wave: 160, seed: 5, off: [250, -150] },
  { y: -2500, radius: 1350, up: 350, down: 250, wave: 120, seed: 6, off: [-200, 250] },
]
/** 柄の上端と下端の高さ（m） */
const STEM_TOP = -200
const STEM_BOTTOM = -5600
export const MUSHROOM_SIZE = 5600

/** 柄の中心線（t：下 0 → 上 1）。下のほうで横に曲がる */
function stemCenter(t: number) {
  const s = 1 - t
  return new THREE.Vector3(450 * Math.sin(t * 2.6) - 1100 * s ** 3, STEM_BOTTOM + (STEM_TOP - STEM_BOTTOM) * t, 300 * Math.cos(t * 2.1) - 300)
}
export const MUSHROOM_STEM_TIP = stemCenter(0)
export const MUSHROOM_SHELVES = SHELVES.map((s) => ({ y: s.y, radius: s.radius, off: s.off }))

function shelfGeometry({ y, radius, up, down, wave, seed, off }: (typeof SHELVES)[number]) {
  const ph = seed * 1.7
  const g = radialRock((d) => {
    const az = Math.atan2(d.z, d.x)
    const R = u(radius * (1 + 0.1 * Math.sin(3 * az + ph) + 0.07 * Math.sin(5 * az + 2 * ph)))
    const b = u(d.y > 0 ? up : down)
    return 1 / Math.sqrt((d.x * d.x + d.z * d.z) / (R * R) + (d.y * d.y) / (b * b))
  }, 40)
  // 縁を波打たせる（ところどころ反り上がる）
  const pos = g.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const rho = Math.hypot(v.x, v.z) / u(radius)
    v.y += u(wave) * rho * rho * (Math.sin(2 * Math.atan2(v.z, v.x) + ph) + 0.4)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  roughen(g, 0.35, 0.12, seed)
  g.translate(u(off[0]), u(y), u(off[1]))
  return g
}

function stemGeometry() {
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 24, 48, false)
  cyl.deleteAttribute('normal')
  cyl.deleteAttribute('uv')
  const g = mergeVertices(cyl)
  cyl.dispose()
  const pos = g.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const t = v.y + 0.5
    // 平たい断面をねじりながら、下へ細くする
    const twist = 2.8 * (1 - t)
    const r = u(260 + 1250 * t ** 1.3)
    const x = v.x * r * 1.25
    const z = v.z * r * 0.7
    const c = stemCenter(t)
    pos.setXYZ(i, u(c.x) + x * Math.cos(twist) - z * Math.sin(twist), u(c.y), u(c.z) + x * Math.sin(twist) + z * Math.cos(twist))
  }
  return roughen(g, 0.5, 0.15, 7)
}

export function mushroomGeometry() {
  const parts = [...SHELVES.map(shelfGeometry), stemGeometry()]
  const g = mergeGeometries(parts)
  parts.forEach((p) => p.dispose())
  return g
}

/** 岩の表面に散らばる灯の位置（m）。外から中心の軸に向けて光線を当てる */
export function scatterLights(geometry: THREE.BufferGeometry, count: number, seed: number, yRange: [number, number], reach: number) {
  const probe = surfaceProbe(geometry)
  let s = seed
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  const lights: THREE.Vector3[] = []
  for (let i = 0; i < count * 3 && lights.length < count; i++) {
    const a = rand() * Math.PI * 2
    const y = yRange[0] + (yRange[1] - yRange[0]) * rand()
    // 上から下ろす光線と横からの光線をまぜる（傘の上面にも、側面にも灯を置く）
    const fromAbove = rand() < 0.4
    const rho = reach * Math.sqrt(rand())
    const hit = fromAbove
      ? probe({ x: Math.cos(a) * rho, y: 20000, z: Math.sin(a) * rho }, { x: Math.cos(a) * rho, y: -20000, z: Math.sin(a) * rho })
      : probe({ x: Math.cos(a) * 20000, y, z: Math.sin(a) * 20000 }, { x: 0, y, z: 0 })
    if (hit) lights.push(hit.pos.addScaledVector(hit.normal, 25))
  }
  return lights
}
