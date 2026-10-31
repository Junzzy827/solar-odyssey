import * as THREE from 'three'
import type { SurfaceDef } from '../../data/surfaces'

// 地表の地形：なだらかな起伏・クレーター・砂丘・遠くの山並み・天体の丸み（小さな星ほど地平線が近い）。
// 立つ場所（原点）と着陸船の場所は平らにならす。

export const LANDER_POS = new THREE.Vector2(4, -30) // (x, z) m
export const FAR = 3200

/** 決まった種から同じ並びの乱数を出す */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 1_000_000) / 1_000_000
  }
}

function hash(x: number, y: number, seed: number) {
  const v = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
  return v - Math.floor(v)
}

function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy, seed)
  const b = hash(ix + 1, iy, seed)
  const c = hash(ix, iy + 1, seed)
  const d = hash(ix + 1, iy + 1, seed)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}

export function fbm(x: number, y: number, seed: number, octaves = 5) {
  let v = 0
  let a = 0.5
  let f = 1
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    v += a * noise(x * f, y * f, seed + i * 13)
    norm += a
    a *= 0.5
    f *= 2.03
  }
  return v / norm
}

type Crater = { x: number; z: number; r: number }

const CELL = 200

function idSeed(id: string) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return (h >>> 0) % 100000
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

export class Terrain {
  readonly seed: number
  readonly craters: Crater[] = []
  readonly radiusM: number
  /** クレーターを 200 m 四方のます目に分けて、近いものだけ調べる */
  private grid = new Map<string, Crater[]>()
  /** ならした場所（立つ場所・着陸船）の高さ：まわりの地面の高さにそろえる */
  private baseEye = 0
  private baseLander = 0

  constructor(readonly def: SurfaceDef) {
    this.seed = idSeed(def.id)
    this.radiusM = def.radiusKm * 1000
    const rnd = seeded(this.seed + 7)
    const n = Math.round(def.relief.craters * 260)
    for (let i = 0; i < n; i++) {
      // 小さいクレーターほど多い（べき分布）
      const r = Math.max(2.5, def.relief.craterMax * rnd() ** 3.2)
      const ang = rnd() * Math.PI * 2
      const dist = Math.sqrt(rnd()) * 2200
      const x = Math.cos(ang) * dist
      const z = Math.sin(ang) * dist
      // 立つ場所と着陸船の下には大きなクレーターを置かない
      const clear = Math.min(Math.hypot(x, z), Math.hypot(x - LANDER_POS.x, z - LANDER_POS.y))
      if (clear < r * 1.6 + 20) continue
      const c = { x, z, r }
      this.craters.push(c)
      const reach = r * 3
      for (let gx = Math.floor((x - reach) / CELL); gx <= Math.floor((x + reach) / CELL); gx++) {
        for (let gz = Math.floor((z - reach) / CELL); gz <= Math.floor((z + reach) / CELL); gz++) {
          const key = `${gx},${gz}`
          const list = this.grid.get(key)
          if (list) list.push(c)
          else this.grid.set(key, [c])
        }
      }
    }
    this.settle()
  }

  /** 穴の底や丘の上に立たないよう、ならした場所はまわり 40 m の平均の高さにする */
  private settle() {
    const avg = (cx: number, cz: number) => {
      let sum = 0
      let n = 0
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2
        for (const d of [15, 28, 40]) {
          sum += this.sample(cx + Math.cos(a) * d, cz + Math.sin(a) * d, true).h
          n++
        }
      }
      return sum / n
    }
    this.baseEye = avg(0, 0)
    this.baseLander = avg(LANDER_POS.x, LANDER_POS.y)
  }

  /** 平らにならす重み（0：ならさない〜1：完全に平ら） */
  flat(x: number, z: number) {
    const a = 1 - smooth(4, 12, Math.hypot(x, z))
    const b = 1 - smooth(14, 30, Math.hypot(x - LANDER_POS.x, z - LANDER_POS.y))
    return Math.max(a, b)
  }

  /** 地形の高さ（丸みを除く）と、クレーターのふちの噴出物・割れ目の重み */
  sample(x: number, z: number, raw = false) {
    const R = this.def.relief
    const s = this.seed
    let h = (fbm(x / R.hillScale, z / R.hillScale, s) - 0.5) * 2 * R.hills
    h += (fbm(x / 22, z / 22, s + 50, 3) - 0.5) * 0.9 // 足もとの細かいでこぼこ
    if (R.dunes) {
      // 風下にゆるく、風上に急な砂丘の列
      const w = x * 0.82 + z * 0.57 + fbm(x / 300, z / 300, s + 9) * 140
      const ph = (w / 95) % 1
      const p = ph < 0 ? ph + 1 : ph
      h += R.dunes * (p < 0.7 ? p / 0.7 : (1 - p) / 0.3) * (0.6 + 0.4 * fbm(x / 400, z / 400, s + 3))
    }
    let ejecta = 0
    for (const c of this.grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? []) {
      const dx = x - c.x
      const dz = z - c.z
      const d2 = (dx * dx + dz * dz) / (c.r * c.r)
      if (d2 > 9) continue
      const d = Math.sqrt(d2)
      const depth = c.r * 0.22
      const rim = c.r * 0.05
      if (d < 1) h += depth * (d2 - 1) + rim * d2 * d2
      else h += rim * Math.exp(-(d - 1) * 3.2)
      ejecta = Math.max(ejecta, Math.exp(-((d - 1.05) ** 2) * 9) * (c.r > 8 ? 1 : 0.5))
    }
    let crack = 0
    if (R.cracks) {
      const n1 = Math.abs(fbm(x / 160, z / 160, s + 21, 4) - 0.5)
      const n2 = Math.abs(fbm(x / 70 + 9, z / 70, s + 33, 3) - 0.5)
      crack = Math.max(1 - smooth(0.0, 0.018, n1), 0.6 * (1 - smooth(0.0, 0.012, n2))) * R.cracks
      h += crack * 0.6
    }
    const r = Math.hypot(x, z)
    if (R.mountains) h += smooth(900, 2600, r) * fbm(x / 700, z / 700, s + 77, 4) ** 1.6 * R.mountains * 2.2
    if (raw) return { h, ejecta, crack }
    const a = 1 - smooth(4, 12, Math.hypot(x, z))
    const b = 1 - smooth(14, 30, Math.hypot(x - LANDER_POS.x, z - LANDER_POS.y))
    const f = Math.max(a, b)
    const base = a >= b ? this.baseEye : this.baseLander
    h = h * (1 - f) + base * f
    return { h, ejecta: ejecta * (1 - f), crack }
  }

  /** 丸みを含めた高さ：遠いほど地平線の下へ沈む（r² / 2R） */
  height(x: number, z: number) {
    const r2 = x * x + z * z
    return this.sample(x, z).h - r2 / (2 * this.radiusM)
  }

  /** 中心ほど細かい、円形の格子の地面 */
  geometry() {
    const RINGS = 150
    const SEG = 240
    const pos: number[] = []
    const col: number[] = []
    const uv: number[] = []
    const idx: number[] = []
    const g1 = new THREE.Color(this.def.ground)
    const g2 = new THREE.Color(this.def.ground2)
    const ej = new THREE.Color(this.def.ejecta ?? this.def.ground)
    const crackCol = new THREE.Color(this.def.id === 'europa' ? '#8a5a35' : this.def.ground2).multiplyScalar(0.8)
    const c = new THREE.Color()
    const twoTone = this.def.id === 'iapetus'
    const push = (x: number, z: number) => {
      const { h, ejecta, crack } = this.sample(x, z)
      const y = h - (x * x + z * z) / (2 * this.radiusM)
      pos.push(x, y, z)
      uv.push(x / 3, z / 3)
      let m = fbm(x / 260, z / 260, this.seed + 5, 4)
      m = twoTone ? smooth(0.42, 0.58, fbm(x / 1500, z / 1500, this.seed + 6, 3)) : smooth(0.3, 0.75, m)
      c.copy(g1).lerp(g2, m)
      c.lerp(ej, Math.min(1, ejecta * 0.75))
      c.lerp(crackCol, Math.min(1, crack))
      // 小さなむら
      c.multiplyScalar(0.9 + 0.2 * fbm(x / 9, z / 9, this.seed + 8, 3))
      col.push(c.r, c.g, c.b)
    }
    push(0, 0)
    for (let i = 1; i <= RINGS; i++) {
      const r = FAR * (i / RINGS) ** 2.3
      for (let j = 0; j < SEG; j++) {
        const a = (j / SEG) * Math.PI * 2
        push(Math.cos(a) * r, Math.sin(a) * r)
      }
    }
    for (let j = 0; j < SEG; j++) idx.push(0, 1 + ((j + 1) % SEG), 1 + j)
    for (let i = 1; i < RINGS; i++) {
      const a0 = 1 + (i - 1) * SEG
      const b0 = 1 + i * SEG
      for (let j = 0; j < SEG; j++) {
        const j1 = (j + 1) % SEG
        idx.push(a0 + j, a0 + j1, b0 + j, a0 + j1, b0 + j1, b0 + j)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    return geo
  }

  /** 岩：大きさはべき分布（小石が多く、大岩は少し）。平らにした場所には置かない */
  rocks(count: number) {
    const rnd = seeded(this.seed + 99)
    const out: { x: number; y: number; z: number; s: number; sy: number; rot: number; tilt: number; v: number }[] = []
    let tries = 0
    while (out.length < count && tries < count * 4) {
      tries++
      const ang = rnd() * Math.PI * 2
      const dist = 3 + rnd() ** 1.6 * 420
      const x = Math.cos(ang) * dist
      const z = Math.sin(ang) * dist
      if (this.flat(x, z) > 0.3) continue
      const s = 0.08 + 1.7 * rnd() ** 4.5
      out.push({ x, y: this.height(x, z) - s * 0.35, z, s, sy: 0.5 + rnd() * 0.5, rot: rnd() * 6.28, tilt: (rnd() - 0.5) * 0.6, v: Math.floor(rnd() * 3) })
    }
    return out
  }
}

/** でこぼこした岩の形（いくつかの種類） */
export function rockGeometry(seed: number, round: boolean) {
  const geo = new THREE.IcosahedronGeometry(1, round ? 2 : 1)
  const p = geo.attributes.position as THREE.BufferAttribute
  const rnd = seeded(seed)
  const map = new Map<string, number>()
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`
    let k = map.get(key)
    if (k === undefined) {
      k = round ? 0.9 + rnd() * 0.15 : 0.7 + rnd() * 0.5
      map.set(key, k)
    }
    v.multiplyScalar(k)
    if (!round && v.y < -0.2) v.y = -0.2 - (v.y + 0.2) * 0.3 // 底は平たく
    p.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()
  return geo
}

/** 細かい砂のつぶの絵（地面と岩に重ねて、近くで見ても平たく見えないように） */
let grain: THREE.CanvasTexture | null = null
export function grainTexture() {
  if (grain) return grain
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  const img = g.createImageData(size, size)
  const rnd = seeded(4242)
  // 細かいノイズを、少しぼかした大きなむらに重ねる
  const coarse = new Float32Array(size * size)
  for (let i = 0; i < coarse.length; i++) coarse[i] = rnd()
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = 0
      for (let k = -2; k <= 2; k++) acc += coarse[((y + k + size) % size) * size + ((x + k * 2 + size) % size)]
      const v = 0.82 + 0.1 * (acc / 5) + 0.16 * rnd() + (rnd() < 0.02 ? -0.25 : 0)
      const o = (y * size + x) * 4
      const b = Math.max(0, Math.min(255, v * 230))
      img.data[o] = img.data[o + 1] = img.data[o + 2] = b
      img.data[o + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  grain = new THREE.CanvasTexture(canvas)
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping
  grain.anisotropy = 4
  return grain
}
