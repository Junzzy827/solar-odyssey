import { rockGeometry, seeded } from '../surface/terrain'
import { blurGrid, CELL, type Field, heightAt, N, normalAt, SIZE, slopeGrid } from './heightfield'

// 岩の置き方を 2 通り作る。
//  ばらまき：どこにでも同じ確率・同じくらいの大きさで、地面の上にのせるだけ（よくある不自然な置き方）
//  決まりどおり：
//   1. 岩は崖（急な斜面）から落ちてくるので、崖の上と、崖のふもと（少し下った所）に多い
//   2. 群れで置く：大きな岩のまわりに、割れたかけらが下り坂の方へ散らばる
//   3. 大きさはべき分布：大岩は少しだけ、小石はたくさん
//   4. 3〜5 割を地面に埋め、地面の傾きに沿わせて寝かせる（平たい岩は平たく）

/** kind：0＝岩のかたまり（暗い玄武岩）、1＝岩盤の板（明るい砂岩。砂からのぞく） */
export type Rock = { x: number; y: number; z: number; s: number; sy: number; yaw: number; nx: number; nz: number; v: number; tone: number; kind?: 0 | 1 }

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
  while (clusters < 1500 && tries < 1200000) {
    tries++
    const x = (rnd() * 2 - 1) * AREA
    const z = (rnd() * 2 - 1) * AREA
    if (rnd() > pAt(x, z)) continue
    clusters++
    // 親の岩：べき分布（0.25〜2.6 m、ほとんどは小さい）
    const big = 0.2 + 2.2 * rnd() ** 2.6
    const flat = rnd() < 0.5 ? 0.45 + rnd() * 0.2 : 0.7 + rnd() * 0.25 // 板状の岩と、塊の岩
    place(x, z, big, flat)
    // かけら：親が大きいほど多く、下り坂の方へ
    const n = normalAt(f, x, z)
    const downX = n.x
    const downZ = n.z
    const kids = 4 + Math.floor(rnd() * 8 + big * 9)
    for (let c = 0; c < kids; c++) {
      const r = (0.6 + big * 1.6) * Math.sqrt(-2 * Math.log(1 - rnd() * 0.98)) * 0.8
      const a = rnd() * 6.28
      const cx = x + Math.cos(a) * r + downX * r * 1.5
      const cz = z + Math.sin(a) * r + downZ * r * 1.5
      if (rnd() > 0.4 + pAt(cx, cz)) continue
      const s = big * (0.12 + 0.45 * rnd() ** 1.8)
      place(cx, cz, Math.max(0.06, s), flat * (0.9 + rnd() * 0.2))
    }
  }
  // 小石：岩の出やすい所に細かく
  let pebbles = 0
  tries = 0
  while (pebbles < 14000 && tries < 1400000) {
    tries++
    const x = (rnd() * 2 - 1) * AREA
    const z = (rnd() * 2 - 1) * AREA
    if (rnd() > pAt(x, z) * 0.9 + 0.02) continue
    pebbles++
    place(x, z, 0.05 + 0.18 * rnd() ** 2, 0.6 + rnd() * 0.3)
  }
  // 岩盤の板：平らな所のところどころで、割れた板状の岩盤が砂からのぞく（タイルを敷いたように並ぶ）
  const fbmMask = (x: number, z: number) => Math.sin(x * 0.031 + Math.sin(z * 0.023) * 2) * Math.sin(z * 0.027 + Math.sin(x * 0.019) * 2)
  let patches = 0
  tries = 0
  while (patches < 70 && tries < 20000) {
    tries++
    const cx = (rnd() * 2 - 1) * AREA
    const cz = (rnd() * 2 - 1) * AREA
    if (fbmMask(cx, cz) < 0.25 || normalAt(f, cx, cz).y < 0.97 || blocked(avoid, cx, cz)) continue
    patches++
    const R = 4 + rnd() * 9
    const cell = 1.3 + rnd() * 0.9
    const yaw = rnd() * 6.28
    const ca = Math.cos(yaw)
    const sa = Math.sin(yaw)
    for (let gx = -R; gx <= R; gx += cell)
      for (let gz = -R; gz <= R; gz += cell) {
        const fall = Math.hypot(gx, gz) / R
        if (fall > 1 || rnd() < fall * 0.8) continue
        const lx = gx + (rnd() - 0.5) * cell * 0.3
        const lz = gz + (rnd() - 0.5) * cell * 0.3
        const x = cx + lx * ca - lz * sa
        const z = cz + lx * sa + lz * ca
        if (Math.abs(x) > AREA || Math.abs(z) > AREA || blocked(avoid, x, z)) continue
        const n = normalAt(f, x, z)
        const s = cell * (0.42 + rnd() * 0.12)
        const sy = 0.22 + rnd() * 0.12
        out.push({ x, y: heightAt(f, x, z) - s * sy * (0.45 + fall * 0.4), z, s, sy, yaw: yaw + (rnd() - 0.5) * 0.25, nx: n.x * 0.8 + (rnd() - 0.5) * 0.08, nz: n.z * 0.8 + (rnd() - 0.5) * 0.08, v: 1, tone: 0.85 + rnd() * 0.3, kind: 1 })
      }
  }
  return out
}

/** 岩のまわりの地面：根元の暗さ（接地の影）と、風下にできる砂の尾。格子ごとに 0〜1 */
export function rockContact(rocks: Rock[]) {
  const occ = new Float32Array(N * N)
  const tail = new Float32Array(N * N)
  const WX = 0.8
  const WZ = 0.6 // 風の向き（風下）
  for (const r of rocks) {
    if (r.s < 0.12) continue
    const reach = r.s * 1.5
    const len = r.kind === 1 ? 0 : r.s * 4.5
    const ext = Math.max(reach, len) + CELL
    const i0 = Math.max(0, Math.floor((r.x - ext + HALF) / CELL))
    const i1 = Math.min(N - 1, Math.ceil((r.x + ext + HALF) / CELL))
    const j0 = Math.max(0, Math.floor((r.z - ext + HALF) / CELL))
    const j1 = Math.min(N - 1, Math.ceil((r.z + ext + HALF) / CELL))
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const dx = i * CELL - HALF - r.x
        const dz = j * CELL - HALF - r.z
        const d = Math.hypot(dx, dz) / reach
        const k = j * N + i
        if (d < 1) occ[k] = Math.min(1, occ[k] + (1 - d) * (1 - d) * (r.kind === 1 ? 0.5 : 1))
        if (len > 0) {
          const along = dx * WX + dz * WZ
          const side = Math.abs(-dx * WZ + dz * WX)
          if (along > 0 && along < len) {
            const wdt = r.s * 0.7 * (1 - along / len)
            if (side < wdt) tail[k] = Math.max(tail[k], (1 - side / wdt) * (1 - along / len) * 1.2)
          }
        }
      }
  }
  return { occ, tail }
}

/** 岩の形（着陸地表と同じもの） */
export const labRockGeometry = (seed: number, slab: boolean) => {
  const g = rockGeometry(seed, false)
  if (slab) g.scale(1, 0.55, 1)
  return g
}
