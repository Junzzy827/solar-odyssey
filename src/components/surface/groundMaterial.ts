import * as THREE from 'three'
import type { SurfaceDef } from '../../data/surfaces'

// 地面の素材：砂・レゴリス（月の砂）・氷のいろいろ・火山岩。それぞれの細かい凹凸（法線）とざらつき（粗さ）を、
// その場で作る絵（つなぎ目の無い繰り返し模様）から描く。
// 近くは細かい模様、遠くは大きな模様に切り替えて、同じ模様の繰り返しが目立たないようにする。
// 斜面は岩肌（ごつごつした角ばった凹凸と、岩の色）に変える。どの天体も同じ仕組みで、違いは素材の種類と色だけ。

// 氷の天体は、探査機の写真から読みとれる地表の性質ごとに素材を分ける（どれも同じひび割れ模様にしない）。
//  snow       新雪：噴き出した氷の粒が積もった、ふわっとしたなめらかな雪（エンケラドス／カッシーニ）
//  frost      霜の砂：細かい氷の砂に、小さなくぼみと白い氷のかけら（土星の中くらいの衛星・アリエル・ミランダ・カロン）
//  darkLag    黒い砂：氷が昇華して残った黒っぽい砂に、白い霜のまだら（カリスト／ガリレオ、ウンブリエル・オベロン）
//  lineae     筋の入った氷：なめらかな明るい氷を、赤茶色の二重の筋が横切る（エウロパ／ガリレオ）
//  grooved    溝の地形：平行な溝と尾根の束（ガニメデの明るい地域／ガリレオ・ジュノー）
//  rubble     氷のがれき：断層の崖からくずれた角ばった氷の塊（ティタニア／ボイジャー2号）
//  dimpled    メロンの皮：丸いくぼみが並ぶでこぼこと、黒い噴出物のしみ（トリトン／ボイジャー2号）
//  nitrogen   窒素の氷：つるっとした氷に、昇華でできた丸い穴と赤茶色のソリン（冥王星／ニュー・ホライズンズ）
export type SurfaceKind = 'sand' | 'regolith' | 'volcanic' | 'snow' | 'frost' | 'darkLag' | 'lineae' | 'grooved' | 'rubble' | 'dimpled' | 'nitrogen'

const KIND: Record<string, SurfaceKind> = {
  earth: 'sand', mars: 'sand', titan: 'sand',
  venus: 'volcanic', io: 'volcanic',
  enceladus: 'snow',
  mimas: 'frost', tethys: 'frost', dione: 'frost', rhea: 'frost', iapetus: 'frost', ariel: 'frost', charon: 'frost', miranda: 'frost',
  callisto: 'darkLag', umbriel: 'darkLag', oberon: 'darkLag',
  europa: 'lineae',
  ganymede: 'grooved',
  titania: 'rubble',
  triton: 'dimpled',
  pluto: 'nitrogen',
}

/**
 * 模様のしみの色：R（明るいしみ：霜・氷のかけら）と G（暗いしみ：筋・ソリン・噴出物）に塗る色と強さ。
 * 無い天体は、明るいしみ＝噴出物の色（無ければ地面を明るく）、暗いしみ＝なし
 */
const STAIN: Record<string, { bright?: [string, number]; dark?: [string, number] }> = {
  europa: { bright: ['#f1ede4', 0.35], dark: ['#7d4e2c', 0.7] },
  ganymede: { bright: ['#e2dccf', 0.6], dark: ['#5d554b', 0.35] },
  callisto: { bright: ['#e8e5df', 0.65] },
  umbriel: { bright: ['#a9a49b', 0.45] },
  oberon: { bright: ['#d2c6b8', 0.5], dark: ['#3b2f27', 0.35] },
  titania: { bright: ['#e6e2db', 0.55] },
  miranda: { bright: ['#d6d3cd', 0.35] },
  ariel: { bright: ['#f0efec', 0.5] },
  triton: { bright: ['#f4ebe4', 0.3], dark: ['#4f4440', 0.6] },
  pluto: { bright: ['#f3ece0', 0.3], dark: ['#7a432a', 0.7] },
  charon: { bright: ['#d0cbc4', 0.35], dark: ['#6b4a3a', 0.3] },
  enceladus: { bright: ['#ffffff', 0.2] },
}
export const kindFor = (def: SurfaceDef): SurfaceKind => KIND[def.id] ?? 'regolith'

/** 氷らしさ（0〜1）：日の光をきらっと返す氷の粒と、くぼみの青白い影（氷は光を少し中に通して、青以外を吸う） */
const ICE: Partial<Record<SurfaceKind, number>> = { snow: 1, frost: 0.85, darkLag: 0.3, lineae: 1, grooved: 0.65, rubble: 0.85, dimpled: 0.75, nitrogen: 1 }
const ICE_KINDS = new Set(Object.keys(ICE) as SurfaceKind[])

function stainFor(def: SurfaceDef, kind: SurfaceKind): { bright: [string, number]; dark: [string, number] } {
  const s = STAIN[def.id] ?? {}
  const light = '#' + new THREE.Color(def.ejecta ?? def.ground).multiplyScalar(1.25).getHexString()
  return {
    bright: s.bright ?? [light, ICE_KINDS.has(kind) ? 0.35 : 0],
    dark: s.dark ?? ['#000000', 0],
  }
}

/** 素材ごとの見え方：模様の大きさ（m）、凹凸の強さ、粗さ */
const LOOK: Record<SurfaceKind | 'rock', { tileNear: number; tileFar: number; normal: number; rough: number }> = {
  sand: { tileNear: 1.9, tileFar: 17, normal: 0.55, rough: 0.95 },
  regolith: { tileNear: 1.2, tileFar: 11, normal: 1.1, rough: 0.97 },
  snow: { tileNear: 2.6, tileFar: 23, normal: 0.45, rough: 0.92 },
  frost: { tileNear: 1.5, tileFar: 13, normal: 0.9, rough: 0.85 },
  darkLag: { tileNear: 1.3, tileFar: 31, normal: 1.0, rough: 0.98 },
  lineae: { tileNear: 3.2, tileFar: 28, normal: 0.65, rough: 0.55 },
  grooved: { tileNear: 2.4, tileFar: 23, normal: 0.7, rough: 0.86 },
  rubble: { tileNear: 1.7, tileFar: 15, normal: 1.25, rough: 0.8 },
  dimpled: { tileNear: 2.2, tileFar: 18, normal: 0.85, rough: 0.72 },
  nitrogen: { tileNear: 2.8, tileFar: 24, normal: 0.8, rough: 0.45 },
  volcanic: { tileNear: 1.4, tileFar: 12, normal: 1.3, rough: 0.9 },
  rock: { tileNear: 2.2, tileFar: 2.2, normal: 1.6, rough: 0.85 },
}

// ---- つなぎ目の無いノイズ ----------------------------------------------------------------------

function makeNoise(seed: number) {
  const hash = (x: number, y: number, p: number) => {
    x = ((x % p) + p) % p
    y = ((y % p) + p) % p
    const v = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
    return v - Math.floor(v)
  }
  /** 周期 p の値ノイズ（0〜1） */
  const vnoise = (x: number, y: number, p: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const u = xf * xf * (3 - 2 * xf)
    const v = yf * yf * (3 - 2 * yf)
    const a = hash(xi, yi, p)
    const b = hash(xi + 1, yi, p)
    const c = hash(xi, yi + 1, p)
    const d = hash(xi + 1, yi + 1, p)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
  /** 0〜1 の座標で、端と端がつながる fbm */
  const fbm = (x: number, y: number, base: number, oct: number) => {
    let s = 0
    let a = 0.5
    let p = base
    let n = 0
    for (let o = 0; o < oct; o++) {
      s += a * vnoise(x * p, y * p, p)
      n += a
      a *= 0.5
      p *= 2
    }
    return s / n
  }
  /** 周期 p のセル（ボロノイ）：いちばん近い点と 2 番目の点までの距離 */
  const cells = (x: number, y: number, p: number) => {
    const gx = x * p
    const gy = y * p
    const xi = Math.floor(gx)
    const yi = Math.floor(gy)
    let d1 = 9
    let d2 = 9
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const cx = xi + i + hash(xi + i, yi + j, p)
        const cy = yi + j + hash(xi + i + 31, yi + j + 17, p)
        const d = Math.hypot(gx - cx, gy - cy)
        if (d < d1) {
          d2 = d1
          d1 = d
        } else if (d < d2) d2 = d
      }
    return [d1, d2]
  }
  return { fbm, cells, hash }
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const frac = (x: number) => x - Math.floor(x)

/** 素材ごとの高さの模様（0〜1、つなぎ目無し）と、しみ（明るい・暗い、0〜1） */
function heightField(kind: SurfaceKind | 'rock', N: number): { h: Float32Array; m: Uint8Array } {
  // もとからある素材は前と同じ種（模様を変えない）。氷の素材は名前から種を作る
  let seed = kind.length * 13 + 7
  if (!['sand', 'regolith', 'volcanic', 'rock'].includes(kind)) for (const ch of kind) seed = (seed * 31 + ch.charCodeAt(0)) % 997
  const { fbm, cells } = makeNoise(seed)
  const h = new Float32Array(N * N)
  const m = new Uint8Array(N * N * 2)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = x / N
      const v = y / N
      let z = 0
      let bright = 0
      let dark = 0
      if (kind === 'sand') {
        // 風の作るさざ波（少しうねる）＋細かい砂
        // さざ波は場所によって強さが変わる（どこも同じ縞にしない）
        const warp = fbm(u, v, 4, 3) * 2.5
        const rip = Math.sin((u * 2 + v * 0.35) * Math.PI * 2 * 9 + warp * 3)
        const amt = 0.35 + 0.65 * fbm(u + 0.3, v + 0.7, 2, 2)
        z = 0.5 + 0.16 * amt * (rip > 0 ? rip : rip * 0.55) + 0.24 * (fbm(u, v, 32, 4) - 0.5) + 0.14 * (fbm(u, v, 4, 3) - 0.5)
      } else if (kind === 'regolith') {
        // 細かい砂の上に、小さなくぼみ（微小クレーター）と小石
        z = 0.5 + 0.3 * (fbm(u, v, 16, 5) - 0.5)
        const [d1] = cells(u, v, 9)
        if (d1 < 0.35) z -= 0.18 * (1 - d1 / 0.35) ** 2
        const [p1] = cells(u + 0.31, v + 0.17, 28)
        if (p1 < 0.18) z += 0.22 * (1 - p1 / 0.18)
      } else if (kind === 'snow') {
        // 新雪：大きくゆるい吹きだまりと、丸くふくらんだ雪のかたまり。割れ目は無い
        z = 0.5 + 0.26 * (fbm(u, v, 3, 4) - 0.5) + 0.06 * (fbm(u, v, 40, 3) - 0.5)
        const [d1] = cells(u + 0.2, v + 0.6, 5)
        z += 0.1 * (1 - smooth(0, 0.55, d1))
        bright = smooth(0.62, 0.8, fbm(u + 0.4, v, 6, 3)) * 0.6
      } else if (kind === 'frost') {
        // 霜の砂：細かい氷の砂に、浅いお椀形のくぼみ（ふちが少し盛り上がる）と、白い氷のかけら
        z = 0.5 + 0.22 * (fbm(u, v, 12, 5) - 0.5)
        const [d1] = cells(u, v, 7)
        if (d1 < 0.42) z -= 0.15 * (1 - d1 / 0.42) ** 2
        else if (d1 < 0.55) z += 0.04 * Math.sin(((d1 - 0.42) / 0.13) * Math.PI)
        const [p1] = cells(u + 0.31, v + 0.17, 22)
        if (p1 < 0.15) {
          z += 0.26 * (1 - p1 / 0.15)
          bright = 1 - smooth(0.08, 0.15, p1)
        }
        bright = Math.max(bright, smooth(0.66, 0.8, fbm(u + 0.5, v + 0.1, 4, 4)) * 0.5)
      } else if (kind === 'darkLag') {
        // 黒い砂：なめらかな細かい砂、小さなくぼみと黒い小石。高いところに白い霜のまだら
        const big = fbm(u, v, 3, 4)
        z = 0.5 + 0.16 * (big - 0.5) + 0.12 * (fbm(u, v, 18, 4) - 0.5)
        const [d1] = cells(u, v, 6)
        if (d1 < 0.3) z -= 0.12 * (1 - d1 / 0.3) ** 2
        const [p1] = cells(u + 0.31, v + 0.17, 26)
        if (p1 < 0.12) {
          z += 0.18 * (1 - p1 / 0.12)
          dark = 0.5 * (1 - p1 / 0.12)
        }
        const f = smooth(0.6, 0.7, fbm(u + 0.6, v + 0.3, 4, 4) + 0.25 * (fbm(u + 0.2, v + 0.9, 24, 3) - 0.5))
        bright = f
        z += 0.05 * f
      } else if (kind === 'lineae') {
        // なめらかな明るい氷。うすい霜の吹きだまりと、ところどころ小さな段（筋そのものは地形の側で、繰り返さないように描く）
        z = 0.56 + 0.14 * (fbm(u, v, 4, 4) - 0.5) + 0.05 * (fbm(u, v, 32, 3) - 0.5)
        bright = smooth(0.58, 0.74, fbm(u + 0.7, v + 0.3, 5, 3)) * 0.7
        dark = smooth(0.68, 0.82, fbm(u + 0.2, v + 0.9, 3, 4)) * 0.35
      } else if (kind === 'grooved') {
        // 溝の地形：平行な溝と尾根（尾根はとがり、溝は丸い）。場所によって溝の強さが変わる。尾根の肩に明るい氷
        const warp = fbm(u, v, 3, 3) * 3
        const ph = frac(u + v * 3 + warp * 0.3)
        const prof = 1 - Math.abs(ph - 0.5) * 2
        const amt = 0.35 + 0.65 * smooth(0.3, 0.7, fbm(u + 0.4, v + 0.2, 2, 3))
        z = 0.42 + 0.2 * amt * prof ** 1.6 + 0.16 * (fbm(u, v, 20, 4) - 0.5)
        const [d1] = cells(u, v, 8)
        if (d1 < 0.3) z -= 0.1 * (1 - d1 / 0.3) ** 2
        bright = smooth(0.7, 0.95, prof) * amt
        dark = smooth(0.25, 0.0, prof) * amt * 0.8
      } else if (kind === 'rubble') {
        // 氷のがれき：細かい霜の砂に、角ばった氷のかけらが場所によって集まる（大きさはまちまち）。かけらの頭は白い
        z = 0.44 + 0.2 * (fbm(u, v, 12, 5) - 0.5)
        const patch = smooth(0.55, 0.68, fbm(u + 0.13, v + 0.77, 3, 3))
        const [d1, d2] = cells(u, v, 7)
        const r = 0.1 + 0.2 * fbm(u + 0.5, v + 0.5, 14, 2) * patch
        const blk = smooth(r, r * 0.55, d1) * smooth(0.0, 0.06, d2 - d1) * patch
        z += 0.12 * blk + 0.08 * blk * (fbm(u, v, 40, 2) - 0.5)
        bright = Math.max(blk * 0.9, smooth(0.62, 0.78, fbm(u + 0.4, v, 5, 3)) * 0.45)
        const [p1] = cells(u + 0.31, v + 0.17, 26)
        if (p1 < 0.1) z += 0.12 * (1 - p1 / 0.1)
      } else if (kind === 'dimpled') {
        // メロンの皮：丸いくぼみと、そのあいだの丸い盛り上がり。ところどころ黒い噴出物のしみ（風下へ少し流れる）
        const [d1] = cells(u, v, 5)
        z = 0.62 - 0.3 * (1 - smooth(0.0, 0.62, d1)) ** 1.5 + 0.1 * (fbm(u, v, 24, 4) - 0.5)
        const [e1] = cells(u + 0.5, v + 0.5, 13)
        z -= 0.06 * (1 - smooth(0, 0.4, e1))
        const streak = 0.5 + 0.5 * Math.sin(Math.PI * 2 * (u + 4 * v) + fbm(u, v, 3, 3) * 5)
        dark = smooth(0.62, 0.78, fbm(u + 0.3, v + 0.8, 3, 4)) * (0.55 + 0.45 * streak)
        bright = smooth(0.55, 0.7, d1) * 0.5 // 盛り上がりの上は明るい霜
      } else if (kind === 'nitrogen') {
        // 窒素の氷：つるっとした氷に、昇華でできた丸い穴（底に赤茶色のソリンがたまる）
        z = 0.62 + 0.1 * (fbm(u, v, 4, 4) - 0.5) + 0.03 * (fbm(u, v, 32, 2) - 0.5)
        const [d1] = cells(u, v, 9)
        const r = 0.18 + 0.14 * fbm(u + 0.6, v, 9, 2)
        if (d1 < r) {
          const k = 1 - d1 / r
          z -= 0.42 * Math.min(1, k * 2.2) ** 1.4
          dark = Math.min(1, k * 1.8)
        }
        bright = smooth(0.62, 0.78, fbm(u + 0.1, v + 0.4, 6, 3)) * 0.6
      } else if (kind === 'volcanic') {
        // ざらざらした溶岩に、泡の抜けた小さな穴
        z = 0.5 + 0.35 * (fbm(u, v, 12, 5) - 0.5)
        const [d1] = cells(u, v, 22)
        if (d1 < 0.25) z -= 0.25 * (1 - d1 / 0.25)
      } else {
        // 岩肌：角ばった割れ目と段
        const [d1, d2] = cells(u, v, 5)
        z = 0.35 + 0.5 * Math.min(1, (d2 - d1) * 2.2) + 0.2 * (fbm(u, v, 16, 4) - 0.5)
      }
      h[y * N + x] = Math.min(1, Math.max(0, z))
      m[(y * N + x) * 2] = Math.round(Math.min(1, Math.max(0, bright)) * 255)
      m[(y * N + x) * 2 + 1] = Math.round(Math.min(1, Math.max(0, dark)) * 255)
    }
  return { h, m }
}

const cache = new Map<string, THREE.DataTexture>()
const fields = new Map<string, { h: Float32Array; m: Uint8Array }>()
const field = (kind: SurfaceKind | 'rock', N: number) => {
  const key = `${kind}-${N}`
  let f = fields.get(key)
  if (!f) {
    f = heightField(kind, N)
    fields.set(key, f)
  }
  return f
}

const dataTexture = (data: Uint8Array, N: number) => {
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.anisotropy = 4
  t.needsUpdate = true
  return t
}

/** しみの模様：R = 明るいしみ、G = 暗いしみ。detailTexture と同じ繰り返し */
export function stainTexture(kind: SurfaceKind | 'rock', small = false) {
  const key = `stain-${kind}-${small ? 's' : 'l'}`
  const hit = cache.get(key)
  if (hit) return hit
  const N = small ? 256 : 512
  const { m } = field(kind, N)
  const data = new Uint8Array(N * N * 4)
  for (let i = 0; i < N * N; i++) {
    data[i * 4] = m[i * 2]
    data[i * 4 + 1] = m[i * 2 + 1]
    data[i * 4 + 3] = 255
  }
  const t = dataTexture(data, N)
  cache.set(key, t)
  return t
}

/** RGB = 法線（接空間）、A = 高さ。つなぎ目無しで繰り返す */
export function detailTexture(kind: SurfaceKind | 'rock', small = false) {
  const key = `${kind}-${small ? 's' : 'l'}`
  const hit = cache.get(key)
  if (hit) return hit
  const N = small ? 256 : 512
  const { h } = field(kind, N)
  const data = new Uint8Array(N * N * 4)
  const k = (N / 64) * 1.2
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const at = (i: number, j: number) => h[((j + N) % N) * N + ((i + N) % N)]
      const dx = (at(x + 1, y) - at(x - 1, y)) * k
      const dy = (at(x, y + 1) - at(x, y - 1)) * k
      const l = Math.hypot(dx, dy, 1)
      const o = (y * N + x) * 4
      data[o] = Math.round(((-dx / l) * 0.5 + 0.5) * 255)
      data[o + 1] = Math.round(((-dy / l) * 0.5 + 0.5) * 255)
      data[o + 2] = Math.round(((1 / l) * 0.5 + 0.5) * 255)
      data[o + 3] = Math.round(h[y * N + x] * 255)
    }
  const t = dataTexture(data, N)
  cache.set(key, t)
  return t
}

// ---- 材質 ------------------------------------------------------------------------------------

/**
 * 模様の貼り方（GLSL）。世界の法線（xyz）と模様の高さ（w）を返す。
 *  tri = false：上から（x, z）貼る。急な斜面では模様が縦に伸びる
 *  tri = true ：トライプラナー。3 方向から貼って面の向きで混ぜる（崖でも模様が伸びない）
 * 地形ラボ（components/terrainLab）と着陸地表で同じものを使う
 */
export const TRIPLANAR_GLSL = /* glsl */ `
vec3 labPlanar(vec3 tn, vec3 n) {
  vec3 T = normalize(vec3(1.0, 0.0, 0.0) - n * n.x);
  vec3 B = normalize(cross(T, n));
  return normalize(T * tn.x + B * tn.y + n * tn.z);
}
vec4 labSample(sampler2D t, vec3 p, vec3 n, float tile, float k, bool tri) {
  if (!tri) {
    vec4 s = texture2D(t, p.xz / tile);
    vec3 tn = s.xyz * 2.0 - 1.0;
    tn.xy *= k;
    return vec4(labPlanar(normalize(tn), n), s.a);
  }
  vec3 w = pow(abs(n), vec3(4.0));
  w /= (w.x + w.y + w.z);
  vec4 sx = texture2D(t, p.zy / tile);
  vec4 sy = texture2D(t, p.xz / tile);
  vec4 sz = texture2D(t, p.xy / tile);
  vec3 tx = sx.xyz * 2.0 - 1.0; tx.xy *= k;
  vec3 ty = sy.xyz * 2.0 - 1.0; ty.xy *= k;
  vec3 tz = sz.xyz * 2.0 - 1.0; tz.xy *= k;
  // whiteout 合成：それぞれの面の凹凸を、世界の向きに直して重ねる
  tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x);
  ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y);
  tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
  vec3 wn = normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
  return vec4(wn, sx.a * w.x + sy.a * w.y + sz.a * w.z);
}
`

/**
 * 地面の材質（頂点の色はそのまま。凹凸と粗さと岩肌を足す）。
 * small：スマホなどメモリの少ないときは模様を小さく
 */
export function groundMaterial(def: SurfaceDef, small: boolean) {
  const kind = kindFor(def)
  const look = LOOK[kind]
  const rock = LOOK.rock
  const stain = stainFor(def, kind)
  const uniforms = {
    uDetail: { value: detailTexture(kind, small) },
    uRockDetail: { value: detailTexture('rock', small) },
    uTile: { value: new THREE.Vector3(look.tileNear, look.tileFar, rock.tileNear) },
    uNormalK: { value: new THREE.Vector2(look.normal, rock.normal) },
    uRough: { value: new THREE.Vector2(def.groundRough ?? look.rough, rock.rough) },
    uRockColor: { value: new THREE.Color(def.rock) },
    uStain: { value: stainTexture(kind, small) },
    uStainBright: { value: new THREE.Color(stain.bright[0]) },
    uStainDark: { value: new THREE.Color(stain.dark[0]) },
    uStainK: { value: new THREE.Vector2(stain.bright[1], stain.dark[1]) },
    uIce: { value: ICE[kind] ?? 0 },
    // 黒い砂の霜のまだらは、近くの細かい繰り返しが目立つので遠くの大きな模様だけで塗る
    uStainNear: { value: kind === 'darkLag' ? 0 : 1 },
    // 斜面の傾き（1 - 法線の上向き成分）で岩肌に変わる範囲（真ん中＝約 37°）
    uSlope: { value: new THREE.Vector2(0.13, 0.27) },
  }
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: def.groundRough ?? look.rough, metalness: 0 })
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGWorld;\nvarying vec3 vGNormal;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vGWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vGNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uDetail;
        uniform sampler2D uRockDetail;
        uniform vec3 uTile;
        uniform vec2 uNormalK;
        uniform vec2 uRough;
        uniform vec3 uRockColor;
        uniform sampler2D uStain;
        uniform vec3 uStainBright;
        uniform vec3 uStainDark;
        uniform vec2 uStainK;
        uniform float uIce;
        uniform float uStainNear;
        vec4 gGlint;
        uniform vec2 uSlope;
        varying vec3 vGWorld;
        varying vec3 vGNormal;
        vec4 gNear; vec4 gFar; vec4 gRock; float gFarK; float gRockK; vec3 gWN;
        ${TRIPLANAR_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 p = vGWorld;
          vec3 n = normalize(vGNormal);
          float dist = length(p - cameraPosition);
          // 斜面は 3 方向から貼る（スマホなど軽くするときは上からだけ）
          bool tri = ${small ? 'false' : 'true'};
          float fade = 1.0 - 0.6 * smoothstep(40.0, 220.0, dist);
          gNear = labSample(uDetail, p, n, uTile.x, uNormalK.x * fade, tri);
          gFar = labSample(uDetail, p + 0.37, n, uTile.y, uNormalK.x * fade, tri);
          gRock = labSample(uRockDetail, p, n, uTile.z, uNormalK.y, tri);
          gFarK = smoothstep(5.0, 30.0, dist);
          float slope = 1.0 - clamp(n.y, 0.0, 1.0);
          float hgt = mix(gNear.w, gFar.w, gFarK);
          // 砂と岩肌の境目：傾きで決まる割合に模様の高さを足して比べる（ぼかさず、岩の凹凸に沿ってくっきり）
          float r = clamp((slope - (uSlope.x + uSlope.y) * 0.5) / (uSlope.y - uSlope.x) + 0.5, 0.0, 1.0);
          float a1 = hgt + (1.0 - r);
          float a2 = gRock.w + r;
          float ma = max(a1, a2) - 0.08;
          float b1 = max(a1 - ma, 0.0);
          float b2 = max(a2 - ma, 0.0);
          gRockK = b2 / (b1 + b2 + 1e-5);
          // くぼみは少し暗く、出っ張りは少し明るく（細かい影の代わり）
          diffuseColor.rgb *= mix(0.82, 1.12, hgt);
          // しみ（霜・氷のかけら・筋・ソリン）：上から貼る。岩肌の上には塗らない
          vec2 st = mix(texture2D(uStain, p.xz / uTile.x).rg, texture2D(uStain, (p.xz + 0.37) / uTile.y).rg * mix(1.0, 0.6, uStainNear), max(gFarK, 1.0 - uStainNear));
          // 繰り返しが目立たないように、しみの濃さを、ななめに大きく貼った模様の高さで場所ごとに変える
          float macro = texture2D(uDetail, mat2(0.8, -0.6, 0.6, 0.8) * p.xz / (uTile.y * 4.3) + 0.21).a;
          macro = 0.5 * macro + 0.5 * texture2D(uDetail, mat2(0.28, 0.96, -0.96, 0.28) * p.xz / (uTile.y * 9.7) + 0.63).a;
          st *= vec2(smoothstep(0.42, 0.62, macro) * 1.4, 0.4 + 1.0 * smoothstep(0.38, 0.62, macro));
          diffuseColor.rgb = mix(diffuseColor.rgb, uStainBright, st.r * uStainK.x * (1.0 - gRockK));
          diffuseColor.rgb = mix(diffuseColor.rgb, uStainDark, st.g * uStainK.y * (1.0 - gRockK));
          // 氷：くぼみは青白く、明るいしみ（霜・氷のかけら）の上には、日を返す小さな氷の粒
          gGlint = vec4(0.0);
          if (uIce > 0.0) {
            float ice = uIce * (1.0 - gRockK * 0.7);
            diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(0.74, 0.86, 1.04), vec3(1.0), smoothstep(0.25, 0.62, hgt)), ice);
            // 1 cm ほどの氷の粒：ます目ごとに向きのちがう小さな鏡。ます目の真ん中の点だけ
            vec2 gq = p.xz * 70.0;
            vec2 gc = floor(gq);
            vec3 rnd = fract(sin(vec3(dot(gc, vec2(127.1, 311.7)), dot(gc, vec2(269.5, 183.3)), dot(gc, vec2(419.2, 371.9)))) * 43758.5453);
            float dot0 = 1.0 - smoothstep(0.18, 0.32, length(fract(gq) - 0.5 - (rnd.xy - 0.5) * 0.3));
            float near = 1.0 - smoothstep(2.5, 11.0, dist);
            float dens = 0.25 + 0.5 * st.r;
            float on = step(1.0 - dens, rnd.z) * near * ice * dot0;
            gGlint = vec4(normalize(vec3((rnd.x - 0.5) * 2.2, 1.0, (rnd.y - 0.5) * 2.2)), on);
          }
          vec3 rockCol = uRockColor * mix(0.7, 1.15, gRock.w);
          diffuseColor.rgb = mix(diffuseColor.rgb, rockCol, gRockK * 0.85);
          gWN = normalize(mix(mix(gNear.xyz, gFar.xyz, gFarK), gRock.xyz, gRockK));
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(mix(uRough.x, uRough.y, gRockK) + (0.5 - mix(gNear.w, gFar.w, gFarK)) * 0.12, 0.05, 1.0);
`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(gWN, 0.0)).xyz);`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        // 氷の粒のきらめき：粒の面が、太陽の光をちょうど目のほうへ返したときだけ光る（ふつうの光の計算とは別に足す）
        #if NUM_DIR_LIGHTS > 0
        if (gGlint.w > 0.0) {
          vec3 fn = normalize((viewMatrix * vec4(gGlint.xyz, 0.0)).xyz);
          vec3 L = directionalLights[0].direction;
          vec3 V = normalize(vViewPosition);
          vec3 H = normalize(L + V);
          float sp = pow(max(dot(fn, H), 0.0), 140.0) * step(0.0, dot(normal, L));
          reflectedLight.directSpecular += directionalLights[0].color * sp * gGlint.w * 6.0;
        }
        #endif`,
      )
  }
  m.customProgramCacheKey = () => `ground-${kind}-${small ? 'flat' : 'tri'}`
  return m
}

/**
 * 岩の質感：岩肌の模様（角ばった割れ目と段）の凹凸を、岩の形に沿って 3 方向から貼る。
 * 割れ目は暗く、出っ張りは明るく。上を向いた面のくぼみには砂がたまる（dust の色、境目はくっきり）。
 * 模様は岩そのものの座標で貼るので、岩を動かしても（採集で持ち上げても）模様がずれない。
 * 地面の岩・採集する岩・地形ラボの岩で共通。ほかの onBeforeCompile（空気・雲の影）より先に呼ぶ
 */
export function withRockDetail<T extends THREE.MeshStandardMaterial>(
  m: T,
  opts: { dust?: THREE.Color | null; dustOn?: { value: number }; tile?: number; strength?: number } = {},
): T {
  const uniforms = {
    uRockT: { value: detailTexture('rock') },
    uRockTile: { value: opts.tile ?? 0.9 },
    uRockK: { value: opts.strength ?? 1.4 },
    uRockDust: { value: opts.dust ?? new THREE.Color(0, 0, 0) },
    uRockDustOn: opts.dustOn ?? { value: opts.dust ? 1 : 0 },
  }
  const prev = m.onBeforeCompile
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer)
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRkP;\nvarying vec3 vRkN;\nvarying mat3 vRkM;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vRkP = position;
        vRkN = normal;
        #ifdef USE_INSTANCING
          vRkM = mat3(viewMatrix) * mat3(modelMatrix) * mat3(instanceMatrix);
        #else
          vRkM = mat3(viewMatrix) * mat3(modelMatrix);
        #endif`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uRockT; uniform float uRockTile; uniform float uRockK; uniform vec3 uRockDust; uniform float uRockDustOn;
        varying vec3 vRkP; varying vec3 vRkN; varying mat3 vRkM;
        vec3 gRkN; float gRkDust;
        ${TRIPLANAR_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 on = normalize(vRkN);
          vec4 a = labSample(uRockT, vRkP, on, uRockTile, uRockK, true);
          vec4 b = labSample(uRockT, vRkP * 2.7 + 1.3, on, uRockTile, uRockK * 0.6, true);
          float h = a.w * 0.65 + b.w * 0.35;
          vec3 objN = normalize(a.xyz + b.xyz * 0.5);
          gRkN = normalize(vRkM * objN);
          // 割れ目は暗く、出っ張りは明るく（細かい影の代わり）
          diffuseColor.rgb *= mix(0.55, 1.18, h);
          gRkDust = 0.0;
          if (uRockDustOn > 0.5) {
            float up = (vec4(gRkN, 0.0) * viewMatrix).y;
            gRkDust = smoothstep(-0.15, 0.15, smoothstep(0.45, 0.9, up) * 0.8 - h);
            diffuseColor.rgb = mix(diffuseColor.rgb, uRockDust, gRkDust * 0.45);
          }
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = normalize(mix(gRkN, normal, gRkDust * 0.6));
        #ifdef DOUBLE_SIDED
          normal *= faceDirection;
        #endif`,
      )
  }
  const key = m.customProgramCacheKey.bind(m)
  m.customProgramCacheKey = () => key() + '|rock-detail'
  return m
}
