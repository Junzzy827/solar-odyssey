import * as THREE from 'three'
import type { SurfaceDef } from '../../data/surfaces'
import { detailAt, heightAt, type Dem } from './dem'

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

  /** 本物の地形（観測された標高）。あれば起伏・クレーター・砂丘・山並みは作らず、これを使う */
  readonly dem: Dem | null

  constructor(readonly def: SurfaceDef, dem: Dem | null = null) {
    this.seed = idSeed(def.id)
    this.radiusM = def.radiusKm * 1000
    this.dem = dem
    const rnd = seeded(this.seed + 7)
    const n = dem ? 0 : Math.round(def.relief.craters * 260)
    const add = (r: number, x: number, z: number) => {
      // 立つ場所と着陸船の下には大きなクレーターを置かない
      const clear = Math.min(Math.hypot(x, z), Math.hypot(x - LANDER_POS.x, z - LANDER_POS.y))
      if (clear < r * 1.6 + 20) return
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
    for (let i = 0; i < n; i++) {
      // 小さいクレーターほど多い（べき分布）
      const r = Math.max(2.5, def.relief.craterMax * rnd() ** 3.2)
      const ang = rnd() * Math.PI * 2
      const dist = Math.sqrt(rnd()) * 2200
      add(r, Math.cos(ang) * dist, Math.sin(ang) * dist)
    }
    // ローバーで走れる範囲（3 km 四方）と、その先に見える所にも、同じ密度でクレーターを足す（2.2〜4.2 km の輪）。
    // 着陸地点のまわりの並びは今までと同じ
    const rnd2 = seeded(this.seed + 8)
    const n2 = Math.round(n * ((4200 / 2200) ** 2 - 1))
    for (let i = 0; i < n2; i++) {
      const r = Math.max(2.5, def.relief.craterMax * rnd2() ** 3.2)
      const ang = rnd2() * Math.PI * 2
      const dist = Math.sqrt(2200 ** 2 + rnd2() * (4200 ** 2 - 2200 ** 2))
      add(r, Math.cos(ang) * dist, Math.sin(ang) * dist)
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
    if (this.dem) {
      // 本物の地形 ＋ 地図より細かい足もとのでこぼこ
      let real = heightAt(this.dem.near, x, z) ?? heightAt(this.dem.far, x, z) ?? 0
      if (this.dem.detail) real += detailAt(this.dem.detail, x, z)
      if (this.def.id === 'mars') real += this.marsRelief(x, z)
      let h = real + (fbm(x / 22, z / 22, s + 50, 3) - 0.5) * 0.5 + (fbm(x / 5, z / 5, s + 51, 2) - 0.5) * 0.15
      if (raw) return { h, ejecta: 0, crack: 0 }
      const a = 1 - smooth(4, 12, Math.hypot(x, z))
      const b = 1 - smooth(14, 30, Math.hypot(x - LANDER_POS.x, z - LANDER_POS.y))
      const f = Math.max(a, b)
      h = h * (1 - f) + (a >= b ? this.baseEye : this.baseLander) * f
      return { h, ejecta: 0, crack: 0 }
    }
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
    // 遠くの山並み。ローバーで走れる範囲（着陸地点から 1.5 km）の外から立ち上がる
    if (R.mountains) h += smooth(1700, 3300, r) * fbm(x / 700, z / 700, s + 77, 4) ** 1.6 * R.mountains * 2.2
    if (raw) return { h, ejecta, crack }
    const a = 1 - smooth(4, 12, Math.hypot(x, z))
    const b = 1 - smooth(14, 30, Math.hypot(x - LANDER_POS.x, z - LANDER_POS.y))
    const f = Math.max(a, b)
    const base = a >= b ? this.baseEye : this.baseLander
    h = h * (1 - f) + base * f
    return { h, ejecta: ejecta * (1 - f), crack }
  }

  /**
   * 火星の走れる範囲に足す起伏。本物の着陸地点（ゲール・クレーターの底）は 3 km で高低差 20 m ほどの平原なので、
   * 写真に出てくる地形を重ねる：ゆるい丘、段になった低い台地（ふちは急な崖）、くねくね曲がる川の跡の溝。
   * 着陸地点から 2.4 km より外では弱めて、3.4 km で 0（遠くの山並みの本物の地形とつながるように）
   */
  private marsRelief(x: number, z: number) {
    const fade = 1 - smooth(2400, 3400, Math.hypot(x, z))
    if (fade <= 0) return 0
    const s = this.seed
    // ゆるい丘（数百 m の大きさ、高さ ±10 m ほど）
    let h = (fbm(x / 330, z / 330, s + 60, 4) - 0.5) * 45
    // 台地：大きなむらの高い所を、2 段の平らな段にする（段のふちは幅 20〜30 m の急な斜面）
    const m = fbm(x / 560 + 3.1, z / 560 - 1.7, s + 61, 4) + (fbm(x / 90, z / 90, s + 65, 2) - 0.5) * 0.04
    h += smooth(0.53, 0.55, m) * 8 + smooth(0.6, 0.615, m) * 6
    // 川の跡の溝：ゆがめた雑音の「0.5 の線」に沿って掘る。断面は U 字（深さ 6 m・幅 40〜60 m）。
    // 線は輪になりやすいので、別の雑音で半分ほど途切れさせ、ところどころに残る涸れ川にする
    const wx = x + (fbm(x / 420, z / 420, s + 62, 3) - 0.5) * 520
    const wz = z + (fbm(x / 420 + 7.3, z / 420, s + 63, 3) - 0.5) * 520
    const c = Math.abs(fbm(wx / 1300, wz / 1300, s + 64, 3) - 0.5)
    const w = 0.026
    if (c < w) {
      const keep = smooth(0.46, 0.52, fbm(x / 700 + 5, z / 700, s + 67, 2))
      const u = c / w
      h -= 7 * (1 - u * u) * keep
    }
    return h * fade
  }

  /** 丸みを含めた高さ：遠いほど地平線の下へ沈む（r² / 2R） */
  height(x: number, z: number) {
    const r2 = x * x + z * z
    return this.sample(x, z).h - r2 / (2 * this.radiusM)
  }

  /** 地面の色（場所ごとのむら・クレーターの噴出物・割れ目）。sample() の結果を渡す */
  private colors() {
    const g1 = new THREE.Color(this.def.ground)
    const g2 = new THREE.Color(this.def.ground2)
    const ej = new THREE.Color(this.def.ejecta ?? this.def.ground)
    const crackCol = new THREE.Color(this.def.id === 'europa' ? '#8a5a35' : this.def.ground2).multiplyScalar(0.8)
    const twoTone = this.def.id === 'iapetus'
    return (c: THREE.Color, x: number, z: number, ejecta: number, crack: number) => {
      let m = fbm(x / 260, z / 260, this.seed + 5, 4)
      m = twoTone ? smooth(0.42, 0.58, fbm(x / 1500, z / 1500, this.seed + 6, 3)) : smooth(0.3, 0.75, m)
      c.copy(g1).lerp(g2, m)
      c.lerp(ej, Math.min(1, ejecta * 0.75))
      c.lerp(crackCol, Math.min(1, crack))
      // 小さなむら
      c.multiplyScalar(0.9 + 0.2 * fbm(x / 9, z / 9, this.seed + 8, 3))
      return c
    }
  }

  /** 円形の格子の輪の数と、1 周の分割数 */
  get rings() {
    return this.dem ? { RINGS: 190, SEG: 360 } : { RINGS: 150, SEG: 240 }
  }

  /**
   * 中心ほど細かい、円形の格子の地面。中心はふだん着陸地点（cx, cz = 0）。
   * 広い範囲を走れる天体では、ローバーが遠くへ行くと、ローバーのそばを中心に作り直す
   */
  geometry(cx = 0, cz = 0) {
    const job = this.geometryJob(cx, cz)
    let r = job.next()
    while (!r.done) r = job.next()
    return r.value
  }

  /** geometry() を少しずつ作る（輪 20 本ごとに一休み。走っている間に作り直しても画面が止まらないように） */
  *geometryJob(cx = 0, cz = 0): Generator<void, THREE.BufferGeometry, void> {
    // 本物の地形は、崖や岩山の形が崩れないよう細かめに
    const { RINGS, SEG } = this.rings
    const nv = 1 + RINGS * SEG
    const pos = new Float32Array(nv * 3)
    const col = new Float32Array(nv * 3)
    const uv = new Float32Array(nv * 2)
    const c = new THREE.Color()
    const color = this.colors()
    let k = 0
    const push = (x: number, z: number) => {
      const { h, ejecta, crack } = this.sample(x, z)
      pos[k * 3] = x
      pos[k * 3 + 1] = h - (x * x + z * z) / (2 * this.radiusM)
      pos[k * 3 + 2] = z
      uv[k * 2] = x / 3
      uv[k * 2 + 1] = z / 3
      color(c, x, z, ejecta, crack)
      col[k * 3] = c.r
      col[k * 3 + 1] = c.g
      col[k * 3 + 2] = c.b
      k++
    }
    push(cx, cz)
    for (let i = 1; i <= RINGS; i++) {
      const r = FAR * (i / RINGS) ** 2.3
      for (let j = 0; j < SEG; j++) {
        const a = (j / SEG) * Math.PI * 2
        push(cx + Math.cos(a) * r, cz + Math.sin(a) * r)
      }
      if (i % 4 === 0) yield
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    geo.setIndex(this.ringIndex())
    // 法線：輪に沿った向きと、外へ向かう向きの外積（となりの頂点から。少しずつ）
    const nrm = new Float32Array(nv * 3)
    nrm[1] = 1
    const at = (i: number, j: number) => (i <= 0 ? 0 : 1 + (i - 1) * SEG + ((j + SEG) % SEG)) * 3
    for (let i = 1; i <= RINGS; i++) {
      for (let j = 0; j < SEG; j++) {
        const p0 = at(i, j - 1)
        const p1 = at(i, j + 1)
        const q0 = at(i - 1, j)
        const q1 = at(Math.min(RINGS, i + 1), j)
        const ax = pos[p1] - pos[p0]
        const ay = pos[p1 + 1] - pos[p0 + 1]
        const az = pos[p1 + 2] - pos[p0 + 2]
        const bx = pos[q1] - pos[q0]
        const by = pos[q1 + 1] - pos[q0 + 1]
        const bz = pos[q1 + 2] - pos[q0 + 2]
        const nx = ay * bz - az * by
        const ny = az * bx - ax * bz
        const nz = ax * by - ay * bx
        const l = Math.hypot(nx, ny, nz) || 1
        const o = at(i, j)
        nrm[o] = nx / l
        nrm[o + 1] = ny / l
        nrm[o + 2] = nz / l
      }
      if (i % 40 === 0) yield
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, 0, cz), FAR * 1.01)
    return geo
  }

  private ringIdx: THREE.BufferAttribute | null = null
  /** 円形の格子のつなぎ方（どこを中心にしても同じなので 1 つだけ作る） */
  private ringIndex() {
    if (this.ringIdx) return this.ringIdx
    const { RINGS, SEG } = this.rings
    const idx = new Uint32Array(SEG * 3 + (RINGS - 1) * SEG * 6)
    let o = 0
    for (let j = 0; j < SEG; j++) {
      idx[o++] = 0
      idx[o++] = 1 + ((j + 1) % SEG)
      idx[o++] = 1 + j
    }
    for (let i = 1; i < RINGS; i++) {
      const a0 = 1 + (i - 1) * SEG
      const b0 = 1 + i * SEG
      for (let j = 0; j < SEG; j++) {
        const j1 = (j + 1) % SEG
        idx[o++] = a0 + j
        idx[o++] = a0 + j1
        idx[o++] = b0 + j
        idx[o++] = a0 + j1
        idx[o++] = b0 + j1
        idx[o++] = b0 + j
      }
    }
    this.ringIdx = new THREE.BufferAttribute(idx, 1)
    return this.ringIdx
  }

  /**
   * 正方形のタイルの地面（ローバーのまわりの細かい地面）。(x0, z0) が北西の角、一辺 size m、step m 間隔。
   * 法線はタイルの外の 1 つ先の高さも使って求めるので、となりのタイルと継ぎ目なくつながる。
   * ふちには下へ垂らした「すそ」を付ける（となりや粗い地面との小さなすき間をふさぐ）
   */
  tile(x0: number, z0: number, size: number, step: number) {
    const job = this.tileJob(x0, z0, size, step)
    let r = job.next()
    while (!r.done) r = job.next()
    return r.value
  }

  /** tile() を少しずつ作る（16 行ごとに一休み） */
  *tileJob(x0: number, z0: number, size: number, step: number): Generator<void, THREE.BufferGeometry, void> {
    const n = Math.round(size / step)
    const w = n + 3 // 外側に 1 つずつ余分に
    const hs = new Float32Array(w * w)
    for (let j = 0; j < w; j++) {
      for (let i = 0; i < w; i++) hs[j * w + i] = this.height(x0 + (i - 1) * step, z0 + (j - 1) * step)
      if (j % 16 === 15) yield
    }
    const v = (n + 1) * (n + 1)
    const skirt = 4 * n
    const pos = new Float32Array((v + skirt) * 3)
    const nrm = new Float32Array((v + skirt) * 3)
    const col = new Float32Array((v + skirt) * 3)
    const uv = new Float32Array((v + skirt) * 2)
    const c = new THREE.Color()
    const color = this.colors()
    let k = 0
    for (let j = 0; j <= n; j++) {
      if (j % 16 === 15) yield
      for (let i = 0; i <= n; i++, k++) {
        const x = x0 + i * step
        const z = z0 + j * step
        const at = (j + 1) * w + i + 1
        pos[k * 3] = x
        pos[k * 3 + 1] = hs[at]
        pos[k * 3 + 2] = z
        const hx = hs[at + 1] - hs[at - 1]
        const hz = hs[at + w] - hs[at - w]
        const l = Math.hypot(hx, 2 * step, hz)
        nrm[k * 3] = -hx / l
        nrm[k * 3 + 1] = (2 * step) / l
        nrm[k * 3 + 2] = -hz / l
        uv[k * 2] = x / 3
        uv[k * 2 + 1] = z / 3
        const sm = this.def.relief.cracks || this.craters.length ? this.sample(x, z) : null
        color(c, x, z, sm?.ejecta ?? 0, sm?.crack ?? 0)
        col[k * 3] = c.r
        col[k * 3 + 1] = c.g
        col[k * 3 + 2] = c.b
      }
    }
    const idx: number[] = []
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i
        idx.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2)
      }
    // すそ：ふちを 1 周（北→東→南→西）たどり、真下へ 3 m 下げた頂点と結ぶ
    const ring: number[] = []
    for (let i = 0; i < n; i++) ring.push(i)
    for (let j = 0; j < n; j++) ring.push(j * (n + 1) + n)
    for (let i = n; i > 0; i--) ring.push(n * (n + 1) + i)
    for (let j = n; j > 0; j--) ring.push(j * (n + 1))
    ring.forEach((src, r) => {
      const d = v + r
      for (let q = 0; q < 3; q++) {
        pos[d * 3 + q] = pos[src * 3 + q]
        nrm[d * 3 + q] = nrm[src * 3 + q]
        col[d * 3 + q] = col[src * 3 + q]
      }
      pos[d * 3 + 1] -= 3
      uv[d * 2] = uv[src * 2]
      uv[d * 2 + 1] = uv[src * 2 + 1]
    })
    for (let r = 0; r < ring.length; r++) {
      const a = ring[r]
      const b = ring[(r + 1) % ring.length]
      const a2 = v + r
      const b2 = v + ((r + 1) % ring.length)
      idx.push(a, b, a2, b, b2, a2, a, a2, b, b, a2, b2)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    geo.setIndex(idx)
    geo.computeBoundingSphere()
    return geo
  }

  /** 上向きの法線（丸みを含む） */
  normal(x: number, z: number) {
    const e = 1.2
    const hx = this.height(x + e, z) - this.height(x - e, z)
    const hz = this.height(x, z + e) - this.height(x, z - e)
    const l = Math.hypot(hx, 2 * e, hz)
    return { x: -hx / l, y: (2 * e) / l, z: -hz / l }
  }

  private rockCache = new Map<number, Rock[]>()

  /**
   * 岩の置き方（地形ラボで決めた決まり）：
   *  1. 岩は崖（急な斜面）やクレーターのふちから来るので、その近くに多い
   *  2. 群れで置く：親の岩のまわりに、割れたかけらが下り坂の方へ散らばる
   *  3. 大きさはべき分布（大岩は少しだけ、小石はたくさん）
   *  4. 急な斜面には大きな岩は留まれないので、留まれる傾きまで転がして置く（崖のふもとにたまる）
   *  5. 2〜4 割を地面に埋め、地面の傾きに沿わせる
   * 同じ数なら同じ並び（ローバーの当たり判定も同じものを使う）
   */
  rocks(count: number): Rock[] {
    const hit = this.rockCache.get(count)
    if (hit) return hit
    const rnd = seeded(this.seed + 99)
    const out = this.scatter(rnd, count, () => {
      const ang = rnd() * Math.PI * 2
      const dist = 3 + rnd() ** 1.6 * 420
      return [Math.cos(ang) * dist, Math.sin(ang) * dist]
    })
    this.rockCache.set(count, out)
    return out
  }

  /**
   * タイル（北西の角 (tx, tz)・一辺 size m）の岩。決まりは rocks() と同じ。タイルの番号から種を作るので、
   * 何度作っても同じ岩が同じ場所に出る（離れて戻ってきても変わらない）
   */
  tileRocks(tx: number, tz: number, size: number, count: number): Rock[] {
    const rnd = seeded(this.seed * 7919 + (tx / size + 4096) * 9973 + (tz / size + 4096) * 7)
    return this.scatter(rnd, count, () => [tx + rnd() * size, tz + rnd() * size])
  }

  private scatter(rnd: () => number, count: number, pick: () => [number, number]): Rock[] {
    const out: Rock[] = []
    const steep = (x: number, z: number) => Math.min(1, Math.max(0, (1 - this.normal(x, z).y - 0.07) / 0.18))
    /** 岩の出やすさ：近く（5 m）に崖があるか、クレーターのふちか */
    const rockiness = (x: number, z: number) => {
      let st = steep(x, z)
      for (let k = 0; k < 4; k++) st = Math.max(st, steep(x + Math.cos(k * 1.57 + 0.4) * 5, z + Math.sin(k * 1.57 + 0.4) * 5))
      return 0.35 + 0.65 * st + 0.6 * this.sample(x, z).ejecta
    }
    const place = (x0: number, z0: number, s: number, sy: number) => {
      let x = x0
      let z = z0
      const hold = s > 0.45 ? 0.9 : s > 0.2 ? 0.82 : 0.7
      let n = this.normal(x, z)
      for (let step = 0; step < 30 && n.y < hold; step++) {
        const l = Math.hypot(n.x, n.z) || 1
        x += (n.x / l) * 0.8
        z += (n.z / l) * 0.8
        n = this.normal(x, z)
      }
      if (n.y < hold || this.flat(x, z) > 0.3) return
      const bury = 0.15 + rnd() * 0.2
      out.push({ x, y: this.height(x, z) - s * sy * bury, z, s, sy, rot: rnd() * 6.28, tilt: 0, nx: n.x * 0.8, nz: n.z * 0.8, v: Math.floor(rnd() * 3) })
    }
    let tries = 0
    while (out.length < count && tries < count * 20) {
      tries++
      const [x, z] = pick()
      if (this.flat(x, z) > 0.3 || rnd() > rockiness(x, z)) continue
      const big = 0.08 + 1.7 * rnd() ** 4
      const sy = 0.65 + rnd() * 0.35
      place(x, z, big, sy)
      // かけら：親が大きいほど多く、下り坂の方へ
      const n = this.normal(x, z)
      const kids = Math.floor(rnd() * 3 + big * 6)
      for (let c = 0; c < kids && out.length < count; c++) {
        const r = (0.5 + big * 1.5) * Math.sqrt(-2 * Math.log(1 - rnd() * 0.98)) * 0.7
        const a = rnd() * 6.28
        place(x + Math.cos(a) * r + n.x * r * 1.5, z + Math.sin(a) * r + n.z * r * 1.5, Math.max(0.06, big * (0.12 + 0.45 * rnd() ** 1.8)), sy * (0.9 + rnd() * 0.2))
      }
    }
    return out
  }
}

export type Rock = { x: number; y: number; z: number; s: number; sy: number; rot: number; tilt: number; nx: number; nz: number; v: number }

/**
 * 岩の形。round = true は丸い小石（タイタンの氷）。ふだんは割れた角ばった岩：
 * 細かく分けた多面体を大小の凹凸で崩し、何本かの平面で削って割れた面を作る。底は平たく（地面に埋まる側）
 */
export function rockGeometry(seed: number, round: boolean) {
  const geo = new THREE.IcosahedronGeometry(1, round ? 2 : 3)
  const p = geo.attributes.position as THREE.BufferAttribute
  const rnd = seeded(seed)
  const cuts = round
    ? []
    : Array.from({ length: 10 }, () => ({ v: new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize(), d: 0.5 + rnd() * 0.35 }))
  const ph = [rnd() * 10, rnd() * 10, rnd() * 10]
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const bump = round
      ? 0.9 + 0.12 * Math.sin(v.x * 2.3 + ph[0]) * Math.sin(v.z * 2.1 + ph[1])
      : 1 + 0.1 * Math.sin(v.x * 2.1 + ph[0]) * Math.sin(v.y * 2.7 + ph[1]) + 0.05 * Math.sin(v.z * 7.3 + ph[2]) * Math.sin(v.x * 6.1)
    v.multiplyScalar(bump)
    for (const c of cuts) {
      const d = v.dot(c.v)
      if (d > c.d) v.addScaledVector(c.v, c.d - d)
    }
    if (!round && v.y < -0.25) v.y = -0.25 - (v.y + 0.25) * 0.25 // 底は平たく
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
