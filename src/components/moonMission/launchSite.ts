import * as THREE from 'three'
import { glowTexture } from './plume'

// 打ち上げの場面の「地面の組」に置く、発射台のまわりの土地：陸（西）・海（東）・発射台の盛り土と炎の溝・夜の町の明かり。
// 座標は地面の組の中（x 東、y 上、z 南、ロケットの根元が原点）。地面の組ごと、地球の自転と一緒に回る。
//
// 本物の 39A 発射台は、まわりの土地より 12 m ほど高い盛り土の上にある（写真 S72-54813 で、台の左右に照らされた斜面が見える）。
// 盛り土のまん中を南北に炎の溝が通り、溝の底には炎を南北に分ける山形の板（デフレクター）。
// 移動発射台を運ぶクローラーの道は、西から 5 % の坂で上がってくる。

/** 移動発射台の甲板の下の、発射台の地面（盛り土の上）の高さ（m、ロケットの根元が 0） */
export const GROUND_Y = -13.8
/** まわりの土地の高さ（盛り土の下） */
export const LAND_Y = GROUND_Y - 12
/** 盛り土の上の平らな所（半分の幅：東西・南北） */
const TOP_X = 66
const TOP_Z = 78
/** 斜面の水平の長さ */
const SLOPE = 42
/** 炎の溝（半分の幅）と、底の高さ */
const TRENCH = 9
const TRENCH_Y = GROUND_Y - 13
/** クローラーの道（半分の幅）と坂 */
const CRAWLER = 20
const CRAWLER_GRADE = 0.05

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** 盛り土の高さ（炎の溝を除く）。投光器などを地面に置くのに使う */
export function moundHeight(x: number, z: number): number {
  const dx = Math.max(0, Math.abs(x) - TOP_X)
  const dz = Math.max(0, Math.abs(z) - TOP_Z)
  const d = Math.hypot(dx, dz)
  let y = GROUND_Y - 12 * smooth(0, SLOPE, d)
  // クローラーの道：西のふちから 5 % で下る
  if (x < -TOP_X && Math.abs(z) < CRAWLER + 6) {
    const ramp = GROUND_Y - (-TOP_X - x) * CRAWLER_GRADE
    const edge = 1 - smooth(CRAWLER, CRAWLER + 6, Math.abs(z))
    y = Math.max(y, y + (Math.max(ramp, LAND_Y) - y) * edge)
  }
  return y
}

/** 炎の溝も入れた地面の高さと、表面の種類（0 コンクリート、1 溝の中、2 土と草、3 クローラーの道の砂利） */
function surface(x: number, z: number): [number, number] {
  let y = moundHeight(x, z)
  let kind = y > LAND_Y + 0.3 ? 0 : 2
  if (x < -TOP_X && Math.abs(z) < CRAWLER && y > LAND_Y + 0.05) kind = 3
  // 炎の溝：盛り土を南北に切る。外の土地へ抜ける所で、底がまわりの高さに上がる
  const inTrench = 1 - smooth(TRENCH - 0.6, TRENCH + 0.6, Math.abs(x))
  if (inTrench > 0 && Math.abs(z) < TOP_Z + SLOPE + 30) {
    const out = smooth(TOP_Z + SLOPE - 10, TOP_Z + SLOPE + 30, Math.abs(z))
    const floor = TRENCH_Y + (LAND_Y - 0.4 - TRENCH_Y) * out
    if (floor < y) {
      y = y + (floor - y) * inTrench
      if (inTrench > 0.5) kind = 1
    }
  }
  return [y, kind]
}

/** 溝の縁が切り立つよう、x の格子は溝の縁のところで細かくする */
function gridXs(): number[] {
  const xs = new Set<number>()
  for (let x = -330; x <= 150; x += 3) xs.add(x)
  for (const e of [TRENCH - 0.7, TRENCH - 0.3, TRENCH, TRENCH + 0.3, TRENCH + 0.7]) {
    xs.add(e)
    xs.add(-e)
  }
  for (let x = -TRENCH + 1.5; x < TRENCH - 1; x += 1.5) xs.add(Math.round(x * 10) / 10)
  return [...xs].sort((a, b) => a - b)
}

const COLORS = [
  new THREE.Color('#5c5a55'), // コンクリート
  new THREE.Color('#2a2724'), // 溝の中（すす）
  new THREE.Color('#2a2d22'), // 土と草
  new THREE.Color('#6d6a63'), // 砂利
]

/** 盛り土・斜面・炎の溝・クローラーの道を 1 枚の高さの網で */
function moundGeometry() {
  const xs = gridXs()
  const zs: number[] = []
  for (let z = -200; z <= 200; z += 3) zs.push(z)
  const nx = xs.length
  const nz = zs.length
  const pos = new Float32Array(nx * nz * 3)
  const col = new Float32Array(nx * nz * 3)
  const uv = new Float32Array(nx * nz * 2)
  const c = new THREE.Color()
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      const [y, kind] = surface(xs[i], zs[j])
      pos.set([xs[i], y, zs[j]], k * 3)
      // 盛り土のふちほど、まわりの土に少しずつなじむ
      c.copy(COLORS[kind])
      if (kind === 0) c.lerp(COLORS[2], smooth(GROUND_Y - 4, LAND_Y + 0.3, y) * 0.7)
      // 甲板の下の、炎で焦げたところ
      if (kind === 0) c.multiplyScalar(0.55 + 0.45 * smooth(16, 40, Math.hypot(xs[i], zs[j])))
      col.set([c.r, c.g, c.b], k * 3)
      uv.set([xs[i] / 6, zs[j] / 6], k * 2)
    }
  }
  const idx: number[] = []
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i
      idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** コンクリートの細かな模様（6 m 四方で繰り返す）：継ぎ目、しみ、ざらつき */
function concreteTexture() {
  const n = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = n
  const ctx = cv.getContext('2d')!
  const img = ctx.createImageData(n, n)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const blot = new Float32Array(n * n)
  for (let b = 0; b < 40; b++) {
    const cx = rnd() * n
    const cy = rnd() * n
    const r = 6 + rnd() * 30
    const v = (rnd() - 0.5) * 0.16
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y) / r
        if (d > 1) continue
        const px = (Math.floor(cx + x) + n) % n
        const py = (Math.floor(cy + y) + n) % n
        blot[py * n + px] += v * (1 - d * d)
      }
    }
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let v = 0.86 + blot[y * n + x] + (rnd() - 0.5) * 0.1
      if (x < 2 || y < 2) v *= 0.55 // 板の継ぎ目
      const k = (y * n + x) * 4
      const g = Math.max(0, Math.min(255, v * 255))
      img.data[k] = img.data[k + 1] = img.data[k + 2] = g
      img.data[k + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(cv)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** 炎の溝の底の山形の板（南北へ炎を分ける）。ロケットの真下、稜線は東西 */
function deflectorGeometry() {
  const w = TRENCH - 0.4
  const top = GROUND_Y - 4.5
  const half = 14
  const v = new Float32Array([
    -w, TRENCH_Y, -half, w, TRENCH_Y, -half, w, top, 0, -w, top, 0,
    -w, top, 0, w, top, 0, w, TRENCH_Y, half, -w, TRENCH_Y, half,
  ])
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(v, 3))
  g.setIndex([0, 3, 1, 1, 3, 2, 4, 7, 5, 5, 7, 6])
  g.computeVertexNormals()
  return g
}

/** 発射台のまわりの夜の明かり（町・道路）。西と南の陸に、ところどころ集まった町 */
function cityLightsGeometry(small: boolean) {
  const n = small ? 500 : 1400
  const pos = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const town = i % 7
    const cx = -9000 - town * 2600 + (town % 2) * 4000
    const cz = -12000 + town * 5200
    const r = 400 + Math.random() * (town === 3 ? 6000 : 2200)
    const a = Math.random() * Math.PI * 2
    pos[i * 3] = Math.min(-600, cx + Math.cos(a) * r)
    pos[i * 3 + 1] = LAND_Y + 2
    pos[i * 3 + 2] = cz + Math.sin(a) * r
    const w = 0.7 + Math.random() * 0.3
    col[i * 3] = w
    col[i * 3 + 1] = w * (0.72 + Math.random() * 0.15)
    col[i * 3 + 2] = w * 0.45
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

export type LaunchSite = {
  group: THREE.Group
  /** 溝の炎の強さ k（0〜1）と時刻 t */
  update(k: number, t: number): void
  dispose(): void
}

export function buildSite(small: boolean): LaunchSite {
  const group = new THREE.Group()
  group.name = 'LaunchSite'
  const geos: THREE.BufferGeometry[] = []
  const mats: THREE.Material[] = []
  /** 地面に平らに寝かせた板 */
  const flat = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    geos.push(geo)
    mats.push(mat)
    const m = new THREE.Mesh(geo, mat)
    m.rotation.x = -Math.PI / 2
    m.position.set(x, y, z)
    group.add(m)
    return m
  }
  // 陸（西）と海（東）。盛り土の網の下に少しもぐらせる
  flat(new THREE.PlaneGeometry(30000, 60000), new THREE.MeshStandardMaterial({ color: '#1a1c16', roughness: 0.95 }), -15000 + 150, LAND_Y - 0.05, 0)
  flat(new THREE.PlaneGeometry(30000, 60000), new THREE.MeshStandardMaterial({ color: '#04070c', roughness: 0.18, metalness: 0.2 }), 15600, LAND_Y - 0.5, 0)
  // 発射台の盛り土・斜面・炎の溝・クローラーの道
  const moundGeo = moundGeometry()
  const concrete = concreteTexture()
  const moundMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: concrete, roughness: 0.92 })
  geos.push(moundGeo)
  mats.push(moundMat)
  group.add(new THREE.Mesh(moundGeo, moundMat))
  const deflGeo = deflectorGeometry()
  const deflMat = new THREE.MeshStandardMaterial({ color: '#3a3530', roughness: 0.7, metalness: 0.4, side: THREE.DoubleSide })
  geos.push(deflGeo)
  mats.push(deflMat)
  group.add(new THREE.Mesh(deflGeo, deflMat))
  // 炎の溝の火：点火すると溝が炎で満たされ、南北の出口から噴き出す
  const fireMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#ff9a3a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  const trenchFire = flat(new THREE.PlaneGeometry(30, 150), fireMat, 0, GROUND_Y - 3, 0)
  trenchFire.visible = false
  // 町の明かり
  const cityGeo = cityLightsGeometry(small)
  const cityMat = new THREE.PointsMaterial({ vertexColors: true, size: 2.2, sizeAttenuation: false, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  geos.push(cityGeo)
  mats.push(cityMat)
  group.add(new THREE.Points(cityGeo, cityMat))

  return {
    group,
    update(k, t) {
      trenchFire.visible = k > 0.01
      fireMat.opacity = Math.min(1, k * 1.4) * (0.85 + 0.15 * Math.sin(t * 29))
    },
    dispose() {
      for (const g of geos) g.dispose()
      for (const m of mats) m.dispose()
      concrete.dispose()
    },
  }
}
