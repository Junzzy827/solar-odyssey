import * as THREE from 'three'
import type { SurfaceDef } from '../../data/surfaces'
import { fbm } from './terrain'
import type { Poi, PoiKind } from './pois'

// 火星以外の天体の見どころの地形（形・色・岩の決まり）。terrain.ts の poiRelief / colors / poiRocks から呼ぶ。
// 大きさは本物よりずっと小さいが（ローバーで走れる 3 km 四方に収まるように）、形の特徴は探査機の写真に合わせる。
//  crater   … 新しい大クレーター：盛り上がったふち・すり鉢の壁と平らな底・ふちの外の噴出物（明るい筋と岩）
//  rille    … くねくね曲がる溝状の谷（月のハドリー谷のような）。底は平ら、壁は 30° くらい
//  scarp    … 断崖（水星のディスカバリー断崖のような逆断層の崖）。片側は急な崖、反対側はゆるい坂
//  ridges   … 二重尾根（エウロパ）：2 本の平行な尾根と、あいだの谷。ふちは赤茶色
//  chaos    … カオス地形：割れて少し傾いた氷の板と、そのすき間の赤茶色の凸凹（氷の塊がごろごろ）
//  lava     … 溶岩流の野：黒っぽくざらざらした、ふちの切り立った舌状の流れが重なる
//  patera   … 火山の穴（イオのパテラ）：切り立った壁と平らな黒い底、まわりに黄色い硫黄と赤い輪
//  channel  … メタンの川の跡（タイタン）：浅く平らな底に丸い氷の小石
//  lakebed  … 干上がった湖（タイタン）：まっ平らで黒っぽく岩が無い。岸に白っぽい蒸発岩の輪
//  dome     … 溶岩ドーム（金星のパンケーキ・ドーム）：平らな頂き・急なふち・まん中の穴・放射状の割れ目
//  tessera  … テッセラ（金星）：2 方向に交わる尾根と谷
//  grooves  … 溝状地形（ガニメデなど）：平行な尾根と谷の列
//  polygons … 氷の多角形（冥王星のスプートニク平原）：盛り上がった多角形と、あいだの溝

export const FORM_KINDS: ReadonlySet<PoiKind> = new Set<PoiKind>(['crater', 'rille', 'scarp', 'ridges', 'chaos', 'lava', 'patera', 'channel', 'lakebed', 'dome', 'tessera', 'grooves', 'polygons'])

/** タイルの岩の数の倍率（見どころにかかるタイルだけ） */
export const FORM_ROCK_TILE: Partial<Record<PoiKind, number>> = { crater: 3, chaos: 4, lava: 2, channel: 3, patera: 2, rille: 2 }

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

function hash2(x: number, y: number, seed: number) {
  const v = Math.sin(x * 157.31 + y * 113.97 + seed * 41.3) * 24634.6345
  return v - Math.floor(v)
}

/** 見どころの中心からの、向き rot に沿った座標（u：長い向き、v：横） */
function local(p: Poi, x: number, z: number): [number, number] {
  const dx = x - p.x
  const dz = z - p.z
  const c = Math.cos(p.rot ?? 0)
  const s = Math.sin(p.rot ?? 0)
  return [dx * c + dz * s, -dx * s + dz * c]
}

/** 長い地形の両はしを細くする */
const taper = (p: Poi, u: number) => 1 - smooth(0.55, 0.95, Math.abs(u) / p.r)

/** ボロノイ（ます目 1 つに点 1 つ）：いちばん近い点・2 番目の点までの距離と、いちばん近い点の番号 */
function voronoi(x: number, y: number, seed: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  let f1 = 9
  let f2 = 9
  let id = 0
  let nx = 0
  let ny = 0
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i
      const cy = iy + j
      const px = cx + 0.15 + 0.7 * hash2(cx, cy, seed)
      const py = cy + 0.15 + 0.7 * hash2(cx, cy, seed + 1)
      const d = Math.hypot(x - px, y - py)
      if (d < f1) {
        f2 = f1
        f1 = d
        id = cx * 7919 + cy * 131
        nx = px
        ny = py
      } else if (d < f2) f2 = d
    }
  return { f1, f2, id, nx, ny }
}

const crater = (p: Poi, x: number, z: number, s: number) => {
  const rc = p.r / 2.6
  const dx = x - p.x
  const dz = z - p.z
  const a = Math.atan2(dz, dx)
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  // ふちを少し不ぞろいに
  const d = Math.hypot(dx, dz) / rc + (fbm(ca * 2.2 + 5, sa * 2.2, s + 90, 3) - 0.5) * 0.1
  return { d, ca, sa, rc }
}

/** くねくね曲がる溝：中心線からの横の近さ q（1 で壁の上）と、長さ方向の細り */
function sinuous(p: Poi, x: number, z: number, s: number, hw: number, amp: number, wl: number) {
  const [u, v] = local(p, x, z)
  const v0 = amp * Math.sin(u / wl + 1.3) + amp * 0.3 * Math.sin(u / (wl * 0.5) + 0.4) + (fbm(u / 200, 0.5, s + 91, 2) - 0.5) * amp * 0.6
  const q = Math.abs(v - v0) / (hw * (0.8 + 0.4 * fbm(u / 150, 3.3, s + 92, 2)))
  return { q, t: taper(p, u) }
}

function scarp(p: Poi, x: number, z: number, s: number) {
  const [u, v] = local(p, x, z)
  // 崖は前（v の小さい側）へ張り出した弧。ふちはでこぼこ（舌状に張り出す）
  const vb = v + (u * u) / (2.4 * p.r) + (fbm(u / 140, 1.7, s + 93, 3) - 0.5) * 40 + (fbm(u / 35, 4.1, s + 89, 2) - 0.5) * 10
  // 両はしでは崖が低くなって消える
  const t = 1 - smooth(0.55 * p.r, 0.95 * p.r, Math.abs(u))
  // 崖の面（幅 45 m ほど）と、その上のゆるく下っていく台地
  const rise = smooth(-45, 0, vb)
  const fall = 1 - 0.55 * smooth(0, 0.8 * p.r, vb)
  return { rise, fall, t, vb }
}

function ridges(p: Poi, x: number, z: number, s: number) {
  const [u, v] = local(p, x, z)
  const v0 = 70 * Math.sin(u / 260 + 0.7) + (fbm(u / 180, 2.2, s + 94, 2) - 0.5) * 50
  const q = Math.abs(v - v0)
  const tt = (q - 38) / 34
  const bump = Math.abs(tt) < 1 ? (1 - tt * tt) ** 2 : 0
  return { q, bump, t: taper(p, u), u }
}

function chaos(x: number, z: number, s: number, w: number) {
  const cell = 42
  const vo = voronoi(x / cell, z / cell, s + 120)
  const edge = ((vo.f2 - vo.f1) * cell) / 2
  const plate = hash2(vo.id, 1, s) < 0.62 && w > 0.3
  const e = plate ? smooth(4, 13, edge) * smooth(0.3, 0.65, w) : 0
  return { e, id: vo.id, cx: vo.nx * cell, cz: vo.ny * cell }
}

function lava(x: number, z: number, s: number) {
  const f = fbm(x / 130, z / 130, s + 97, 3) + (fbm(x / 30, z / 30, s + 98, 2) - 0.5) * 0.18
  return { lobe: smooth(0.47, 0.5, f), lobe2: smooth(0.56, 0.59, f) }
}

function patera(p: Poi, x: number, z: number, s: number) {
  const rp = p.r * 0.42
  const dx = x - p.x
  const dz = z - p.z
  const a = Math.atan2(dz, dx)
  const d = Math.hypot(dx, dz) / rp + (fbm(Math.cos(a) * 3 + 2, Math.sin(a) * 3, s + 102, 3) - 0.5) * 0.14
  return { d, a }
}

function dome(p: Poi, x: number, z: number, s: number) {
  const rd = p.r * 0.5
  const dx = x - p.x
  const dz = z - p.z
  const a = Math.atan2(dz, dx)
  const d = Math.hypot(dx, dz) / rd + (fbm(Math.cos(a) * 2 + 7, Math.sin(a) * 2, s + 103, 2) - 0.5) * 0.06
  // 放射状と同心円の割れ目
  const ra = Math.abs(Math.sin(a * 7 + (fbm(x / 60, z / 60, s + 104, 2) - 0.5) * 2.5))
  const crack = Math.max((1 - smooth(0, 0.05, ra)) * smooth(0.2, 0.45, d), 1 - smooth(0, 0.025, Math.abs(d - 0.62))) * (1 - smooth(0.78, 0.86, d))
  return { d, crack }
}

const tri = (t: number) => 1 - 2 * Math.abs(t - Math.floor(t) - 0.5)

function grooves(p: Poi, x: number, z: number, s: number) {
  const [u, v] = local(p, x, z)
  const warp = (fbm(x / 250, z / 250, s + 101, 2) - 0.5) * 120
  const r1 = tri((v + warp) / 110) ** 1.6 * (0.7 + 0.3 * fbm(u / 150, 4.4, s + 105, 2))
  return r1
}

function tessera(p: Poi, x: number, z: number, s: number) {
  const [u, v] = local(p, x, z)
  const warp = (fbm(x / 200, z / 200, s + 106, 2) - 0.5) * 70
  const r1 = tri((v + warp) / 70) ** 2.4
  const c = Math.cos(1.15)
  const sn = Math.sin(1.15)
  const v2 = -u * sn + v * c
  const r2 = tri((v2 - warp * 0.5) / 150) ** 3
  return { r1, r2 }
}

function polygons(x: number, z: number, s: number) {
  const cell = 70
  const vo = voronoi(x / cell, z / cell, s + 130)
  return ((vo.f2 - vo.f1) * cell) / 2
}

/** 高さ（m）。w は見どころの中心からの近さ（poiWeight） */
export function formRelief(p: Poi, x: number, z: number, s: number, w: number) {
  switch (p.kind) {
    case 'crater': {
      const { d, rc } = crater(p, x, z, s)
      const rim = rc * 0.065
      const depth = rc * 0.22
      let h: number
      if (d < 1) h = Math.max(rim + (rim + depth) * (d * d - 1), -depth * 0.82 + (fbm(x / 12, z / 12, s + 107, 2) - 0.5) * 1.2)
      else h = rim * d ** -3 + (fbm(x / 15, z / 15, s + 108, 2) - 0.5) * 2.2 * Math.exp(-(d - 1) * 1.5)
      return h * w
    }
    case 'rille':
    case 'channel': {
      const ch = p.kind === 'channel'
      const { q, t } = ch ? sinuous(p, x, z, s, 42, 70, 130) : sinuous(p, x, z, s, 60, 60, 120)
      if (q >= 1.8) return 0
      const depth = ch ? 5 : 18
      const cut = -depth * (1 - smooth(ch ? 0.3 : 0.35, ch ? 1.3 : 1, q)) + depth * 0.08 * Math.exp(-(((q - 1.15) / 0.25) ** 2))
      return cut * t * w
    }
    case 'scarp': {
      const { rise, fall, t } = scarp(p, x, z, s)
      return 30 * rise * fall * t * w
    }
    case 'ridges': {
      const { q, bump, t, u } = ridges(p, x, z, s)
      const hh = 13 * (0.85 + 0.3 * fbm(u / 120, 5.1, s + 95, 2))
      return (hh * bump - 1.5 * Math.max(0, 1 - (q / 14) ** 2)) * t * w
    }
    case 'chaos': {
      const { e, id, cx, cz } = chaos(x, z, s, w)
      // 板：高さ 4〜9 m、少し傾いた平らな頂き。すき間：凸凹の低い所
      const raise = 4 + 5 * hash2(id, 2, s)
      const ta = hash2(id, 3, s) * 6.28
      const tilt = ((x - cx) * Math.cos(ta) + (z - cz) * Math.sin(ta)) * 0.07 * hash2(id, 4, s)
      const matrix = -1.5 + (fbm(x / 8, z / 8, s + 96, 2) - 0.5) * 2.5
      return (matrix * (1 - e) + (raise + tilt) * e) * w
    }
    case 'lava': {
      const { lobe, lobe2 } = lava(x, z, s)
      if (lobe <= 0) return 0
      return (lobe * (3 + 1.5 * fbm(x / 70, z / 70, s + 109, 2)) + lobe2 * 2.2 + lobe * (fbm(x / 5, z / 5, s + 99, 2) - 0.5) * 1.4) * w
    }
    case 'patera': {
      const { d } = patera(p, x, z, s)
      const pit = 1 - smooth(0.86, 1, d)
      return (-13 * pit + pit * (fbm(x / 20, z / 20, s + 110, 2) - 0.5) * 1.0 + 2.5 * Math.exp(-(((d - 1.05) / 0.12) ** 2))) * w
    }
    case 'dome': {
      const { d, crack } = dome(p, x, z, s)
      const body = 1 - smooth(0.82, 1.05, d)
      return (17 * body + 2.5 * Math.max(0, 1 - d * d) * body - 4 * (1 - smooth(0, 0.12, d)) - 1.2 * crack) * w
    }
    case 'tessera': {
      const { r1, r2 } = tessera(p, x, z, s)
      return (13 * r1 + 9 * r2 + 1.5 * (fbm(x / 14, z / 14, s + 114, 2) - 0.5) * (r1 + r2)) * w
    }
    case 'grooves':
      return 16 * grooves(p, x, z, s) * w
    case 'polygons': {
      const edge = polygons(x, z, s)
      return (2.5 * smooth(0, 25, edge) - 1.2 * (1 - smooth(0, 4, edge))) * w
    }
    default:
      return 0
  }
}

/** 天体ごとの見どころの色 */
export type FormPalette = ReturnType<typeof formPalette>
export function formPalette(def: SurfaceDef) {
  const g1 = new THREE.Color(def.ground)
  const g2 = new THREE.Color(def.ground2)
  const bright = def.ejecta ? new THREE.Color(def.ejecta) : g1.clone().multiplyScalar(1.3)
  const reddish = def.id === 'europa' ? new THREE.Color('#7a4a2e') : def.id === 'pluto' ? new THREE.Color('#8a5a40') : g2.clone().multiplyScalar(0.7)
  const lavaCol = def.id === 'io' ? new THREE.Color('#3a3029') : def.id === 'venus' ? new THREE.Color('#3f342a') : new THREE.Color(def.rock).multiplyScalar(0.8)
  return {
    bright,
    dark: g2.clone().multiplyScalar(0.8),
    reddish,
    lava: lavaCol,
    sulfur: new THREE.Color('#ece08e'),
    red: new THREE.Color('#b4532e'),
    pitFloor: new THREE.Color('#2e2824'),
    lake: g2.clone().multiplyScalar(0.62),
    evaporite: new THREE.Color(def.id === 'titan' ? '#cdb184' : def.rock),
    // 川底：流れに洗われた白っぽい砂と小石（暗い砂丘の中で目立つ）
    sediment: def.id === 'titan' ? new THREE.Color('#cdb08a') : g2.clone().multiplyScalar(0.78),
    ice: new THREE.Color(def.id === 'pluto' ? '#f1e9da' : '#e8e4da'),
  }
}

/** 地面の色を見どころに合わせて変える。w：poiWeight（ふちでぼかしたもの） */
export function formTint(c: THREE.Color, P: FormPalette, p: Poi, x: number, z: number, s: number, w: number) {
  switch (p.kind) {
    case 'crater': {
      const { d, ca, sa } = crater(p, x, z, s)
      // 明るい噴出物の筋（放射状）。壁も新しいので明るい
      const rays = smooth(0.42, 0.7, fbm(ca * 4 + d * 0.35, sa * 4 - d * 0.2, s + 111, 3))
      const b = d < 1 ? 0.35 + 0.25 * smooth(0.6, 0.95, d) : Math.exp(-(d - 1) * 1.4) * (0.55 + 0.45 * rays) + rays * 0.25 * smooth(2.6, 1.2, d)
      c.lerp(P.bright, Math.min(1, b) * 0.75 * w)
      break
    }
    case 'rille': {
      const { q, t } = sinuous(p, x, z, s, 60, 60, 120)
      if (q < 1.3) c.lerp(P.bright, 0.25 * smooth(0.3, 0.8, q) * (1 - smooth(1.0, 1.3, q)) * t * w)
      break
    }
    case 'channel': {
      const { q, t } = sinuous(p, x, z, s, 42, 70, 130)
      if (q < 1.4) c.lerp(P.sediment, 0.65 * (1 - smooth(0.7, 1.3, q)) * t * w)
      break
    }
    case 'scarp': {
      const { rise, t } = scarp(p, x, z, s)
      c.lerp(P.bright, 0.22 * 4 * rise * (1 - rise) * t * w)
      break
    }
    case 'ridges': {
      const { q, bump, t } = ridges(p, x, z, s)
      // 尾根は明るい氷、谷とふちの外は赤茶色（エウロパの「三重の帯」）
      const margin = smooth(60, 75, q) * (1 - smooth(100, 150, q)) + (1 - smooth(8, 20, q))
      c.lerp(P.bright, 0.4 * bump * t * w)
      c.lerp(P.reddish, 0.55 * margin * t * w)
      break
    }
    case 'chaos': {
      const { e } = chaos(x, z, s, w)
      c.lerp(P.ice, 0.35 * e * w)
      c.lerp(P.reddish, 0.6 * (1 - e) * w)
      break
    }
    case 'lava': {
      const { lobe, lobe2 } = lava(x, z, s)
      c.lerp(P.lava, (0.7 * lobe + 0.15 * lobe2) * w)
      break
    }
    case 'patera': {
      const { d, a } = patera(p, x, z, s)
      const pit = 1 - smooth(0.9, 1.02, d)
      const patchy = 0.6 + 0.4 * fbm(Math.cos(a) * 4, Math.sin(a) * 4 + d, s + 112, 2)
      c.lerp(P.sulfur, 0.75 * smooth(0.95, 1.08, d) * (1 - smooth(1.5, 1.8, d)) * patchy * w)
      c.lerp(P.red, 0.6 * smooth(1.6, 1.85, d) * (1 - smooth(2.1, 2.4, d)) * patchy * w)
      c.lerp(P.pitFloor, 0.85 * pit * w)
      break
    }
    case 'lakebed': {
      c.lerp(P.lake, 0.8 * w)
      c.lerp(P.evaporite, 0.5 * Math.exp(-(((w - 0.25) / 0.14) ** 2)))
      break
    }
    case 'dome': {
      const { d, crack } = dome(p, x, z, s)
      c.lerp(P.bright, 0.18 * (1 - smooth(0.85, 1.0, d)) * w)
      c.lerp(P.dark, 0.6 * crack * w)
      break
    }
    case 'tessera': {
      const { r1, r2 } = tessera(p, x, z, s)
      const m = Math.max(r1, r2)
      c.lerp(P.bright, 0.4 * smooth(0.25, 0.8, m) * w)
      c.lerp(P.dark, 0.5 * (1 - smooth(0.05, 0.35, m)) * w)
      break
    }
    case 'grooves': {
      const r1 = grooves(p, x, z, s)
      c.lerp(P.bright, 0.35 * r1 * w)
      c.lerp(P.dark, 0.2 * (1 - r1) * w)
      break
    }
    case 'polygons': {
      const edge = polygons(x, z, s)
      c.lerp(P.ice, 0.55 * w)
      c.lerp(P.reddish, 0.55 * (1 - smooth(0, 7, edge)) * w)
      break
    }
  }
}

/** 岩の決まり：more（出やすさの倍率）、big（大岩の多さ 0〜1）、pebble（小石の川原 0〜1）、k（明るさ。変えないなら undefined） */
export function formRocks(p: Poi, x: number, z: number, s: number, w: number): { more: number; big: number; pebble?: number; k?: number } {
  switch (p.kind) {
    case 'crater': {
      const { d } = crater(p, x, z, s)
      // ふちとそのすぐ外に、掘り出された大岩
      const band = Math.exp(-(((d - 1.08) / 0.22) ** 2))
      return { more: 1 + 7 * band * w + 1.5 * (d < 1 ? smooth(0.5, 0.95, d) : 0) * w, big: band * w }
    }
    case 'rille': {
      const { q, t } = sinuous(p, x, z, s, 60, 60, 120)
      return { more: 1 + 2 * smooth(0.3, 0.8, q) * (1 - smooth(1.0, 1.3, q)) * t * w, big: 0 }
    }
    case 'channel': {
      // 川底は丸い小石だらけ
      const { q, t } = sinuous(p, x, z, s, 42, 70, 130)
      const bed = (1 - smooth(0.7, 1.2, q)) * t * w
      return { more: 1 + 6 * bed, big: 0, pebble: bed }
    }
    case 'scarp': {
      const { rise, t } = scarp(p, x, z, s)
      const face = 4 * rise * (1 - rise) * t
      return { more: 1 + 1.5 * face * w, big: 0.5 * face * w }
    }
    case 'ridges': {
      const { bump, t } = ridges(p, x, z, s)
      return { more: 1 + 1.5 * bump * t * w, big: 0 }
    }
    case 'chaos': {
      // すき間は割れた氷の塊だらけ（明るい）
      const { e } = chaos(x, z, s, w)
      return { more: (1 + 6 * (1 - e) * w) * (1 - 0.5 * e), big: (1 - e) * w, k: 1 + 0.25 * w }
    }
    case 'lava': {
      const { lobe } = lava(x, z, s)
      return { more: 1 + 2 * lobe * w, big: 0, k: 1 - 0.25 * lobe * w }
    }
    case 'patera': {
      const { d } = patera(p, x, z, s)
      const pit = 1 - smooth(0.85, 1, d)
      return { more: (1 + 3 * Math.exp(-(((d - 1.05) / 0.15) ** 2)) * w) * (1 - 0.9 * pit * w), big: 0 }
    }
    case 'lakebed':
      return { more: 1 - w, big: 0 }
    case 'polygons':
      return { more: 1 - 0.85 * w, big: 0 }
    case 'grooves':
      return { more: 1 + grooves(p, x, z, s) * w, big: 0 }
    default:
      return { more: 1, big: 0 }
  }
}
