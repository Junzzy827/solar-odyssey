import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// 細かい部品をたくさん並べる構造物（月の都・コロニーなど）のための道具。
// 同じ材質の部品はまとめて 1 つの形にしてから描く（部品が何百あっても、描く回数は材質の数だけ）。

const tmp = new THREE.Matrix4()
const q = new THREE.Quaternion()
const e = new THREE.Euler()
const v = new THREE.Vector3()
const s = new THREE.Vector3()

/** 位置・回転（XYZ のオイラー角）・大きさから行列を作る */
export function place(pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] | number = 1) {
  const sc = typeof scale === 'number' ? [scale, scale, scale] : scale
  return new THREE.Matrix4().compose(v.set(...pos), q.setFromEuler(e.set(...rot)), s.set(sc[0], sc[1], sc[2]))
}

/** 材質ごとに部品を集めて、最後に 1 つの形にまとめる */
export class Batch {
  private parts: THREE.BufferGeometry[] = []
  /** 親の行列（建物ごとの置き場所）。add の行列はこの中での位置 */
  parent = new THREE.Matrix4()

  /** 部品を足す。uv を倍にすると、模様（タイルや格子）が細かくなる */
  add(geo: THREE.BufferGeometry, matrix?: THREE.Matrix4, uv?: [number, number]) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name)
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    if (uv) {
      const a = g.attributes.uv as THREE.BufferAttribute
      for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * uv[0], a.getY(i) * uv[1])
    }
    g.applyMatrix4(matrix ? tmp.multiplyMatrices(this.parent, matrix) : this.parent)
    this.parts.push(g)
  }

  get empty() {
    return this.parts.length === 0
  }

  build() {
    const merged = this.parts.length ? mergeGeometries(this.parts) : new THREE.BufferGeometry()
    this.parts.forEach((p) => p.dispose())
    this.parts = []
    merged.computeBoundingSphere()
    return merged
  }
}

/**
 * 反りのある寄棟の屋根（和風の御殿・塔・家に使う）。
 * 半分の幅 w（x）・半分の奥行き d（z）・高さ h。軒先が y=0、棟が y=h。
 * 屋根の面はゆるく反り（くぼみ）、四隅の軒先は少し跳ね上がる。厚み thick の軒の裏と小口もつける。
 * uv は瓦の列が流れる向き（u が列をまたぐ向き、v が上下）で、1 単位あたり tile 列
 */
export function roofGeometry(w: number, d: number, h: number, opts: { seg?: number; lift?: number; thick?: number; tile?: number } = {}) {
  const seg = opts.seg ?? 24
  const lift = opts.lift ?? 0.3
  const thick = opts.thick ?? 0.05
  const tile = opts.tile ?? 6
  const long = Math.max(w, d)
  const short = Math.min(w, d)
  const ridge = long - short
  const nx = Math.max(2, Math.round((seg * w) / short / 2) * 2)
  const nz = Math.max(2, Math.round((seg * d) / short / 2) * 2)
  const height = (x: number, z: number) => {
    const ax = Math.abs(x)
    const az = Math.abs(z)
    // 長い向きの両端だけが寄棟の三角の面。棟の長さは long - short
    const mx = w >= d ? Math.max(0, ax - ridge) / short : ax / short
    const mz = w >= d ? az / short : Math.max(0, az - ridge) / short
    const m = Math.min(1, Math.max(mx, mz))
    const corner = Math.pow(Math.min(ax / w, az / d), 4)
    return { y: h * Math.pow(1 - m, 1.45) + h * lift * corner + h * 0.05 * Math.pow(m, 8), alongX: mz >= mx, m }
  }
  const pos: number[] = []
  const uvs: number[] = []
  const vert = (ix: number, iz: number, down: number) => {
    const x = -w + (2 * w * ix) / nx
    const z = -d + (2 * d * iz) / nz
    const r = height(x, z)
    pos.push(x, r.y - down, z)
    uvs.push((r.alongX ? x : z) * tile, (1 - r.m) * h * tile * 1.2)
  }
  // 上の面と裏の面（裏は少し下げて、向きを反対に）
  for (const down of [0, thick]) {
    for (let iz = 0; iz < nz; iz++)
      for (let ix = 0; ix < nx; ix++) {
        const quad: [number, number][] = [
          [ix, iz],
          [ix, iz + 1],
          [ix + 1, iz + 1],
          [ix + 1, iz],
        ]
        const order = down ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]
        for (const k of order) vert(quad[k][0], quad[k][1], down)
      }
  }
  // 面はなめらかに（頂点をつないで法線をならす。寄棟の稜線は uv が違うので折れ目のまま残る）
  const surface = new THREE.BufferGeometry()
  surface.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  surface.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  const smooth = mergeVertices(surface)
  smooth.computeVertexNormals()
  surface.dispose()
  pos.length = 0
  uvs.length = 0
  // 軒の小口（ふちをぐるりと、上の面と裏の面をつなぐ）
  const edge: [number, number][] = []
  for (let ix = 0; ix < nx; ix++) edge.push([ix, 0])
  for (let iz = 0; iz < nz; iz++) edge.push([nx, iz])
  for (let ix = nx; ix > 0; ix--) edge.push([ix, nz])
  for (let iz = nz; iz > 0; iz--) edge.push([0, iz])
  for (let i = 0; i < edge.length; i++) {
    const a = edge[i]
    const b = edge[(i + 1) % edge.length]
    vert(a[0], a[1], 0)
    vert(a[0], a[1], thick)
    vert(b[0], b[1], thick)
    vert(a[0], a[1], 0)
    vert(b[0], b[1], thick)
    vert(b[0], b[1], 0)
  }
  const rim = new THREE.BufferGeometry()
  rim.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  rim.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  rim.computeVertexNormals()
  const g = mergeGeometries([smooth.toNonIndexed(), rim])
  smooth.dispose()
  rim.dispose()
  return g
}

/** キャンバスで模様を描いて、くり返し貼るテクスチャにする */
export function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, size: number) => void, srgb = true) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  draw(c.getContext('2d')!, size)
  const tex = new THREE.CanvasTexture(c)
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

/** 決まった種から同じ並びを出す乱数 */
export function seeded(seed: number) {
  let n = seed
  return () => ((n = (n * 16807) % 2147483647) - 1) / 2147483646
}
