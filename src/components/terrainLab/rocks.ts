import * as THREE from 'three'
import { seeded } from '../surface/terrain'
import { blurGrid, CELL, type Field, heightAt, N, normalAt, SIZE, slopeGrid } from './heightfield'

// 岩の置き方を 2 通り作る。
//  ばらまき：どこにでも同じ確率・同じくらいの大きさで、地面の上にのせるだけ（よくある不自然な置き方）
//  決まりどおり：
//   1. 岩は崖（急な斜面）から落ちてくるので、崖の上と、崖のふもと（少し下った所）に多い
//   2. 群れで置く：大きな岩のまわりに、割れたかけらが下り坂の方へ散らばる
//   3. 大きさはべき分布：大岩は少しだけ、小石はたくさん
//   4. 3〜5 割を地面に埋め、地面の傾きに沿わせて寝かせる（平たい岩は平たく）

export type Rock = { x: number; y: number; z: number; s: number; sy: number; yaw: number; nx: number; nz: number; v: number; tone: number }

const HALF = SIZE / 2
const AREA = HALF - 6

export type Spot = { x: number; z: number }
/** カメラを置く場所のすぐそばには置かない（目の前が岩でふさがらないように） */
const blocked = (avoid: Spot[], x: number, z: number) => avoid.some((a) => Math.hypot(a.x - x, a.z - z) < 4)

export function scatterRocks(f: Field, avoid: Spot[] = [], seed = 9): Rock[] {
  const rnd = seeded(seed)
  const out: Rock[] = []
  for (let n = 0; n < 1100; n++) {
    const x = (rnd() * 2 - 1) * AREA
    const z = (rnd() * 2 - 1) * AREA
    const s = 0.25 + rnd() * 0.9
    if (blocked(avoid, x, z)) continue
    out.push({ x, y: heightAt(f, x, z) + s * 0.15, z, s, sy: 0.85 + rnd() * 0.3, yaw: rnd() * 6.28, nx: 0, nz: 0, v: n % 4, tone: 0.9 + rnd() * 0.2 })
  }
  return out
}

/** 岩が出やすい場所の地図（0〜1）：崖そのもの＋崖のふもと */
export function rockiness(f: Field) {
  const slope = slopeGrid(f)
  const steep = new Float32Array(N * N)
  for (let k = 0; k < N * N; k++) steep[k] = Math.min(1, Math.max(0, (slope[k] - 0.16) / 0.2))
  const near = blurGrid(steep, 6) // 崖から 5 m ほどの範囲
  const p = new Float32Array(N * N)
  for (let k = 0; k < N * N; k++) {
    // ふもと：近くに崖があるが、その場所は急でない
    const foot = near[k] * (1 - steep[k] * 0.6)
    p[k] = Math.min(1, 0.025 + 1.6 * foot + 0.35 * steep[k])
  }
  return p
}

export function ruleRocks(f: Field, avoid: Spot[] = [], seed = 9): Rock[] {
  const rnd = seeded(seed + 1)
  const P = rockiness(f)
  const pAt = (x: number, z: number) => {
    const i = Math.round((x + HALF) / CELL)
    const j = Math.round((z + HALF) / CELL)
    if (i < 0 || j < 0 || i >= N || j >= N) return 0
    return P[j * N + i]
  }
  const out: Rock[] = []
  const place = (x: number, z: number, s: number, flat: number) => {
    if (Math.abs(x) > AREA || Math.abs(z) > AREA) return
    // 急な斜面には大きな岩ほど留まれない：留まれる傾きまで下り坂を転がす（崖のふもとにたまる）
    const holdY = s > 0.45 ? 0.86 : s > 0.2 ? 0.76 : 0.6
    let n = normalAt(f, x, z)
    for (let step = 0; step < 40 && n.y < holdY; step++) {
      const l = Math.hypot(n.x, n.z) || 1
      x += (n.x / l) * 0.8
      z += (n.z / l) * 0.8
      n = normalAt(f, x, z)
    }
    if (n.y < holdY || Math.abs(x) > AREA || Math.abs(z) > AREA || blocked(avoid, x, z)) return
    const sy = flat * (0.75 + rnd() * 0.35)
    const bury = 0.3 + rnd() * 0.25 // 高さの 3〜5 割を埋める
    out.push({ x, y: heightAt(f, x, z) - s * sy * bury * 0.9, z, s, sy, yaw: rnd() * 6.28, nx: n.x * 0.8, nz: n.z * 0.8, v: Math.floor(rnd() * 4), tone: 0.85 + rnd() * 0.3 })
  }
  // 群れの中心：岩の出やすさに比例して選ぶ
  let clusters = 0
  let tries = 0
  while (clusters < 750 && tries < 600000) {
    tries++
    const x = (rnd() * 2 - 1) * AREA
    const z = (rnd() * 2 - 1) * AREA
    if (rnd() > pAt(x, z)) continue
    clusters++
    // 親の岩：べき分布（0.25〜2.6 m、ほとんどは小さい）
    const big = 0.25 + 2.4 * rnd() ** 3.2
    const flat = rnd() < 0.5 ? 0.45 + rnd() * 0.2 : 0.7 + rnd() * 0.25 // 板状の岩と、塊の岩
    place(x, z, big, flat)
    // かけら：親が大きいほど多く、下り坂の方へ
    const n = normalAt(f, x, z)
    const downX = n.x
    const downZ = n.z
    const kids = 3 + Math.floor(rnd() * 6 + big * 5)
    for (let c = 0; c < kids; c++) {
      const r = (0.6 + big * 1.6) * Math.sqrt(-2 * Math.log(1 - rnd() * 0.98)) * 0.8
      const a = rnd() * 6.28
      const cx = x + Math.cos(a) * r + downX * r * 1.5
      const cz = z + Math.sin(a) * r + downZ * r * 1.5
      if (rnd() > 0.25 + pAt(cx, cz)) continue
      const s = big * (0.12 + 0.45 * rnd() ** 1.8)
      place(cx, cz, Math.max(0.06, s), flat * (0.9 + rnd() * 0.2))
    }
  }
  // 小石：岩の出やすい所に細かく
  let pebbles = 0
  tries = 0
  while (pebbles < 9000 && tries < 900000) {
    tries++
    const x = (rnd() * 2 - 1) * AREA
    const z = (rnd() * 2 - 1) * AREA
    if (rnd() > pAt(x, z) * 0.9 + 0.02) continue
    pebbles++
    place(x, z, 0.05 + 0.18 * rnd() ** 2, 0.6 + rnd() * 0.3)
  }
  return out
}

/** 岩の形：細かく分けた多面体を、大小の凹凸で崩す。底は平たく（地面に埋まる側） */
export function labRockGeometry(seed: number, slab: boolean) {
  const geo = new THREE.IcosahedronGeometry(1, 3)
  const p = geo.attributes.position as THREE.BufferAttribute
  const rnd = seeded(seed)
  // ランダムな向きの平面で何回か削って、割れた面を作る
  const cuts = Array.from({ length: 7 }, () => {
    const v = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize()
    return { v, d: 0.62 + rnd() * 0.3 }
  })
  const v = new THREE.Vector3()
  const ph = [rnd() * 10, rnd() * 10, rnd() * 10]
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    // 大きなゆがみ＋小さなでこぼこ
    const bump = 1 + 0.16 * Math.sin(v.x * 2.1 + ph[0]) * Math.sin(v.y * 2.7 + ph[1]) + 0.05 * Math.sin(v.z * 7.3 + ph[2]) * Math.sin(v.x * 6.1)
    v.multiplyScalar(bump)
    for (const c of cuts) {
      const d = v.dot(c.v)
      if (d > c.d) v.addScaledVector(c.v, c.d - d)
    }
    if (slab) v.y *= 0.55
    if (v.y < -0.25) v.y = -0.25 - (v.y + 0.25) * 0.25
    p.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()
  return geo
}
