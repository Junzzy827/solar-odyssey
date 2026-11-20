import { seeded } from '../sf/batch'
import { currentLevel, lowMemory } from '../../state/quality'
import { isTouchDevice } from '../../state/input'

// 「本格的な森」の見本の一角（お試し）。URL に ?forest=sample を付けたときだけ、ラボの森の入口のすぐ先の
// 30 m 四方を、本物をスキャンした植物・写真の地面・木もれ日で作り直す（WalkForest.tsx）。付けなければ今までどおり。
// ここは「どこに何を置くか」だけを決める。jungle.ts から使うので、jungle.ts の値は使わない。

export const FOREST_SAMPLE_ON = typeof location !== 'undefined' && /[?&#]forest=sample\b/.test(location.search + location.hash)

/** 見本の一角の範囲（m）。まん中を南北の小道（s = 250）が通る */
export const SAMPLE = { s0: 235, s1: 265, y0: 11762, y1: 11792 }
export const SAMPLE_CENTER = { s: (SAMPLE.s0 + SAMPLE.s1) / 2, y: (SAMPLE.y0 + SAMPLE.y1) / 2 }
/** 小道のまん中の s と、幅の半分 m（jungle.ts の JUNGLE_GATE.s・TRAIL_W と同じ） */
export const SAMPLE_PATH = { s: 250, half: 1.5 }

export const inSample = (s: number, y: number, pad = 0) => s > SAMPLE.s0 - pad && s < SAMPLE.s1 + pad && y > SAMPLE.y0 - pad && y < SAMPLE.y1 + pad

/** 置き場所：(s, y)、向き、大きさの倍率、色などをずらすための 0〜1 の数 */
export type Spot = { s: number; y: number; yaw: number; k: number; v: number; /** 地面からの高さ m（着生の植物など） */ h?: number }
/** 高い木・細い木：幹の太さ（胸の高さの半径 m）、幹の高さ m、形の種 */
export type Tree = { s: number; y: number; r: number; h: number; seed: number }
/** 部品（public/models/forest-kit.glb の中の名前）ごとの置き場所 */
export type KitName = 'fern_a' | 'fern_b' | 'calathea_a' | 'calathea_b' | 'calathea_c' | 'anthurium_a' | 'anthurium_b' | 'anthurium_c' | 'pachira_a' | 'pachira_b' | 'roots' | 'stump' | 'log' | 'rock_a' | 'rock_b'
export type ForestSample = {
  tall: Tree[]
  poles: Tree[]
  kit: Record<KitName, Spot[]>
  /** 根元の暗がり（地面に落とす丸い影）：場所、半径 m、濃さ 0〜1 */
  shade: { s: number; y: number; r: number; a: number }[]
  obstacles: { s: number; y: number; r: number }[]
}

/** 部品の、置いたときのおおよその半径 m（倍率 1 のとき）と、地面からどれだけ浮かせる／沈めるか */
const KIT: Record<KitName, { r: number; lift: number }> = {
  fern_a: { r: 0.5, lift: 0 },
  fern_b: { r: 0.3, lift: 0 },
  calathea_a: { r: 0.3, lift: 0 },
  calathea_b: { r: 0.2, lift: 0 },
  calathea_c: { r: 0.12, lift: 0 },
  anthurium_a: { r: 0.5, lift: 0 },
  anthurium_b: { r: 0.32, lift: 0 },
  anthurium_c: { r: 0.16, lift: 0 },
  pachira_a: { r: 0.5, lift: -0.02 },
  pachira_b: { r: 0.48, lift: -0.02 },
  roots: { r: 1.6, lift: -0.06 },
  stump: { r: 0.7, lift: 0.1 },
  log: { r: 2, lift: 0.2 },
  rock_a: { r: 1.3, lift: 0.12 },
  rock_b: { r: 1, lift: 0.1 },
}
export const kitLift = (name: KitName) => KIT[name].lift

/** 数の倍率（スマホ・軽い画質は少なく） */
function density() {
  if (lowMemory() || currentLevel() === 'low') return 0.45
  if (isTouchDevice() || currentLevel() === 'medium') return 0.7
  return 1
}

let sample: ForestSample | null = null

export function forestSample(): ForestSample {
  if (sample) return sample
  const rand = seeded(7301)
  const k = density()
  const P = SAMPLE_PATH
  const kit = Object.fromEntries(Object.keys(KIT).map((n) => [n, [] as Spot[]])) as Record<KitName, Spot[]>
  const shade: ForestSample['shade'] = []
  const obstacles: ForestSample['obstacles'] = []
  /** もう置いた物（重ならないように）：場所と半径 */
  const taken: { s: number; y: number; r: number }[] = []
  const pathDist = (s: number) => Math.abs(s - P.s) - P.half
  const free = (s: number, y: number, r: number, gap = 0) => inSample(s, y, -0.6) && pathDist(s) > r * 0.55 + 0.25 && !taken.some((t) => Math.hypot(t.s - s, t.y - y) < (t.r + r) * 0.62 + gap)

  // 高い木（板根のある巨木）：場所は見え方を考えて決めておく。小道の左右に 1 本ずつと、奥に 1 本
  const tall: Tree[] = [
    { s: 243.4, y: 11769.6, r: 0.74, h: 17, seed: 11 },
    { s: 257.8, y: 11777.4, r: 0.86, h: 19.5, seed: 23 },
    { s: 241.2, y: 11786.2, r: 0.66, h: 16, seed: 37 },
  ]
  for (const t of tall) {
    taken.push({ s: t.s, y: t.y, r: t.r * 3.4 })
    obstacles.push({ s: t.s, y: t.y, r: t.r * 1.5 })
    shade.push({ s: t.s, y: t.y, r: t.r * 5.5, a: 0.8 })
  }

  /** 範囲の中で、空いている所を探す */
  const spot = (r: number, gap = 0, tries = 40) => {
    for (let i = 0; i < tries; i++) {
      const s = SAMPLE.s0 + 1 + rand() * (SAMPLE.s1 - SAMPLE.s0 - 2)
      const y = SAMPLE.y0 + 1 + rand() * (SAMPLE.y1 - SAMPLE.y0 - 2)
      if (free(s, y, r, gap)) return { s, y }
    }
    return null
  }
  const put = (name: KitName, s: number, y: number, scale: number, yaw = rand() * Math.PI * 2, solid = 0, shadeA = 0.5) => {
    const r = KIT[name].r * scale
    kit[name].push({ s, y, yaw, k: scale, v: rand() })
    taken.push({ s, y, r })
    shade.push({ s, y, r: r * 1.25, a: shadeA })
    if (solid > 0) obstacles.push({ s, y, r: solid })
  }

  // 地面の小物：倒木・切り株・根の盛り上がり・苔むした石（場所は決めておく）
  put('log', 254.6, 11770.3, 1.15, 0.5, 0, 0.55)
  for (const d of [-1.6, -0.5, 0.6, 1.7]) obstacles.push({ s: 254.6 + Math.cos(0.5) * d * 1.15, y: 11770.3 - Math.sin(0.5) * d * 1.15, r: 0.5 })
  put('log', 245.2, 11780.4, 0.95, 2.2, 0, 0.55)
  for (const d of [-1.4, -0.4, 0.5, 1.4]) obstacles.push({ s: 245.2 + Math.cos(2.2) * d * 0.95, y: 11780.4 - Math.sin(2.2) * d * 0.95, r: 0.45 })
  put('stump', 254.2, 11786.6, 1.1, 1.1, 0.75)
  put('roots', 260.3, 11780.6, 1.05, 0.7, 0, 0.35)
  put('roots', 238.6, 11775.8, 0.9, 3.6, 0, 0.35)
  put('rock_a', 247.1, 11774.6, 0.42, 0.9, 0.55)
  put('rock_b', 246.3, 11775.7, 0.36, 2.4, 0.4)
  put('rock_b', 253.4, 11779.9, 0.5, 5.1, 0.5)
  put('rock_a', 261.2, 11767.4, 0.5, 4.2, 0.65)
  put('rock_b', 239.4, 11765.6, 0.44, 1.7, 0.45)

  // 細い木（林の中の若木）：まっすぐな細い幹の上に、小さな樹冠
  const poles: Tree[] = []
  for (let i = 0; i < Math.round(12 * k); i++) {
    const p = spot(1.3, 0.6)
    if (!p) continue
    const t = { ...p, r: 0.09 + rand() * 0.07, h: 6.5 + rand() * 5.5, seed: 100 + i }
    poles.push(t)
    taken.push({ ...p, r: 0.9 })
    obstacles.push({ ...p, r: t.r + 0.12 })
    shade.push({ ...p, r: 1.1, a: 0.5 })
  }

  // 中くらいの木（パキラ）
  for (let i = 0; i < Math.round(8 * k); i++) {
    const name: KitName = i % 2 ? 'pachira_b' : 'pachira_a'
    const scale = name === 'pachira_a' ? 2.9 + rand() * 0.9 : 3.3 + rand() * 1.3
    const p = spot(KIT[name].r * scale * 0.8, 0.5)
    if (!p) continue
    put(name, p.s, p.y, scale, rand() * Math.PI * 2, 0.3, 0.6)
    // 木の下は開けておく（下草は入ってよいので、取った範囲を小さく戻す）
    taken[taken.length - 1].r = 0.5
  }

  // 下草：種類ごとにかたまって生える。かたまりのまん中に大きい株、まわりに小さい株
  const species: [KitName, KitName, KitName, [number, number]][] = [
    ['anthurium_a', 'anthurium_b', 'anthurium_c', [1.5, 2.5]],
    ['calathea_a', 'calathea_b', 'calathea_c', [2.1, 3.3]],
    ['fern_a', 'fern_b', 'fern_b', [1.6, 2.7]],
  ]
  // かたまりのまん中：小道のわき（歩くとすぐ目に入る）と、木の根元と、あとは空いた所
  const clumps: { s: number; y: number; sp: number }[] = []
  let n = 0
  for (const y of [11765.5, 11771.5, 11776.5, 11783, 11789]) for (const side of [-1, 1]) clumps.push({ s: P.s + side * (2.9 + rand() * 1.6), y: y + (rand() - 0.5) * 3 + side * 1.2, sp: n++ % 3 })
  for (const t of tall) for (let i = 0; i < 3; i++) clumps.push({ s: t.s + Math.cos(i * 2.1 + t.seed) * t.r * 4.2, y: t.y + Math.sin(i * 2.1 + t.seed) * t.r * 4.2, sp: n++ % 3 })
  for (let i = 0; i < 12; i++) clumps.push({ s: SAMPLE.s0 + 2 + rand() * 26, y: SAMPLE.y0 + 2 + rand() * 26, sp: n++ % 3 })
  for (const c of clumps) {
    const [big, mid, small, [k0, k1]] = species[c.sp]
    const count = Math.max(2, Math.round((5 + rand() * 4) * k))
    for (let i = 0; i < count; i++) {
      const name = i === 0 ? big : i < 3 ? mid : small
      const scale = (k0 + rand() * (k1 - k0)) * (i === 0 ? 1 : 0.9)
      // まん中から、だんだん外へ
      const d = i === 0 ? 0 : 0.5 + Math.sqrt(i) * 0.75 * (0.7 + rand() * 0.6)
      const a = rand() * Math.PI * 2
      const s = c.s + Math.cos(a) * d
      const y = c.y + Math.sin(a) * d
      if (!free(s, y, KIT[name].r * scale)) continue
      put(name, s, y, scale)
    }
  }
  // すき間を埋める小さい株
  for (let i = 0; i < Math.round(46 * k); i++) {
    const name = (['fern_b', 'calathea_c', 'anthurium_c', 'fern_b'] as KitName[])[i % 4]
    const scale = 1.5 + rand() * 1.2
    const p = spot(KIT[name].r * scale, 0.1, 12)
    if (p) put(name, p.s, p.y, scale)
  }

  // 高い木の幹に着生する植物（オオタニワタリは、本当に木の幹に付いて育つ）
  for (const t of tall) {
    for (let i = 0; i < 4; i++) {
      const a = rand() * Math.PI * 2
      const h = 3.2 + rand() * 7
      kit[i % 2 ? 'fern_b' : 'fern_a'].push({ s: t.s + Math.cos(a) * t.r * 0.82, y: t.y + Math.sin(a) * t.r * 0.82, yaw: rand() * Math.PI * 2, k: 0.9 + rand() * 0.7, v: rand(), h })
    }
  }
  sample = { tall, poles, kit, shade, obstacles }
  return sample
}
