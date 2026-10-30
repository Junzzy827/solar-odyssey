import * as THREE from 'three'
import { Batch, canvasTexture, place, roofGeometry, seeded } from './batch'

// 月の都の建物（模型の単位。1 単位は MoonCity の MODEL 倍）。
// 平安の御所をもとにしたオリジナルのデザイン：石の基壇の上に朱の柱と縁側、白い壁と格子の窓、
// 反りのある淡い金の瓦屋根。築地塀に囲まれ、二階建ての門・太鼓橋の架かる光る池・五重の塔・
// 月の桂の大木がある。塀の外には碁盤の目の町並みが、クレーターの縁まで広がる。
// 部品は材質ごとに 1 つの形にまとめる（描く回数は材質の数だけ）。

export type Ground = (x: number, z: number) => number

const box = new THREE.BoxGeometry(1, 1, 1)
const cyl = new THREE.CylinderGeometry(1, 1, 1, 10)
const cyl6 = new THREE.CylinderGeometry(1, 1, 1, 6)
const cone4 = new THREE.CylinderGeometry(0, 1, 1, 4)
const diamond = new THREE.CylinderGeometry(1, 1, 1, 4, 1)
const ring = new THREE.TorusGeometry(1, 0.18, 6, 20)
const leaf = new THREE.IcosahedronGeometry(1, 1)
const leafLow = new THREE.IcosahedronGeometry(1, 0)

/** 瓦：縦の列（丸瓦の明暗）と、うすい横の段 */
function tileTexture() {
  return canvasTexture(128, (g, n) => {
    for (let x = 0; x < n; x++) {
      const k = Math.cos(((x % 32) / 32) * Math.PI * 2)
      const c = Math.round(205 + 45 * k)
      g.fillStyle = `rgb(${c},${c},${c})`
      g.fillRect(x, 0, 1, n)
    }
    g.fillStyle = 'rgba(0,0,0,0.18)'
    for (let y = 0; y < n; y += 32) g.fillRect(0, y, n, 3)
  })
}

/** 格子の窓（明るい障子に、細い桟） */
function latticeTexture() {
  return canvasTexture(64, (g, n) => {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, n, n)
    g.fillStyle = '#3a2a1c'
    for (let i = 0; i < n; i += 16) {
      g.fillRect(i, 0, 3, n)
      g.fillRect(0, i, n, 3)
    }
  })
}

/** 白砂の庭（ほうきで引いた筋） */
function sandTexture() {
  return canvasTexture(128, (g, n) => {
    g.fillStyle = '#d8d4ca'
    g.fillRect(0, 0, n, n)
    for (let y = 0; y < n; y += 8) {
      g.fillStyle = 'rgba(255,255,255,0.5)'
      g.fillRect(0, y, n, 3)
      g.fillStyle = 'rgba(0,0,0,0.12)'
      g.fillRect(0, y + 4, n, 2)
    }
  })
}

/** 石：細かいまだら */
function stoneTexture() {
  return canvasTexture(128, (g, n) => {
    const r = seeded(7)
    g.fillStyle = '#9c978e'
    g.fillRect(0, 0, n, n)
    for (let i = 0; i < 900; i++) {
      const c = Math.round(120 + r() * 70)
      g.fillStyle = `rgba(${c},${c - 3},${c - 8},0.5)`
      g.fillRect(r() * n, r() * n, 1 + r() * 3, 1 + r() * 3)
    }
    g.fillStyle = 'rgba(40,36,30,0.35)'
    for (let y = 0; y < n; y += 32) g.fillRect(0, y, n, 2)
    for (let y = 0; y < n; y += 32) for (let x = (y / 32) % 2 ? 16 : 0; x < n; x += 32) g.fillRect(x, y, 2, 32)
  })
}

/** 少し自分で光る、照らされる材質（月の裏でも都がほのかに見えるよう） */
function lit(color: string, opts: THREE.MeshStandardMaterialParameters & { glow?: number } = {}) {
  const { glow = 0.25, ...rest } = opts
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...rest })
  m.emissive.set(color).multiplyScalar(glow)
  if (rest.map) m.emissiveMap = rest.map
  // 構造物の外板の細工（StructureLook）は当てない（瓦・石の模様を自前で持っている）
  m.userData.noDetail = true
  return m
}

function glow(r: number, g: number, b: number, map?: THREE.Texture) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), toneMapped: false, map: map ?? null })
}

export function moonCityModel(ground: Ground) {
  const tex = { tile: tileTexture(), lattice: latticeTexture(), sand: sandTexture(), stone: stoneTexture() }
  const mats = {
    stone: lit('#a29d94', { map: tex.stone, glow: 0.18 }),
    wood: lit('#b4442c', { roughness: 0.6, glow: 0.3 }),
    darkWood: lit('#4a3426', { roughness: 0.7, glow: 0.15 }),
    wall: lit('#eee8da', { roughness: 0.9, glow: 0.32 }),
    roof: lit('#e2c27a', { map: tex.tile, metalness: 0.25, roughness: 0.45, glow: 0.3 }),
    townRoof: lit('#b4b9c2', { map: tex.tile, metalness: 0.15, roughness: 0.6, glow: 0.22 }),
    townWall: lit('#d9d0bf', { glow: 0.22 }),
    gold: lit('#f0c862', { metalness: 1, roughness: 0.28, glow: 0.45 }),
    sand: lit('#ffffff', { map: tex.sand, roughness: 1, glow: 0.28 }),
    rock: lit('#8a867e', { map: tex.stone, roughness: 1, glow: 0.08 }),
    trunk: lit('#5a4334', { glow: 0.12 }),
    leaves: lit('#d9b955', { roughness: 0.7, glow: 0.4 }),
    blossom: lit('#f1d0d8', { roughness: 0.8, glow: 0.38 }),
    pad: lit('#3f6a4a', { glow: 0.25 }),
    window: glow(1.8, 1.25, 0.62, tex.lattice),
    lamp: glow(2.6, 1.9, 0.95),
    lotus: glow(2.2, 1.3, 1.5),
    pond: glow(0.55, 0.95, 1.3),
  }
  type Key = keyof typeof mats
  const batches = Object.fromEntries((Object.keys(mats) as Key[]).map((k) => [k, new Batch()])) as Record<Key, Batch>
  const at = (x: number, z: number, rotY = 0, y = 0) => {
    const m = place([x, ground(x, z) + y, z], [0, rotY, 0])
    for (const b of Object.values(batches)) b.parent.copy(m)
  }
  const roofs = new Map<string, THREE.BufferGeometry>()
  const roof = (w: number, d: number, h: number, seg: number) => {
    const key = [w, d, h, seg].map((n) => n.toFixed(3)).join()
    let g = roofs.get(key)
    if (!g) roofs.set(key, (g = roofGeometry(w, d, h, { seg, lift: 0.35, thick: Math.min(0.06, h * 0.12), tile: seg < 10 ? 3 : 5 })))
    return g
  }
  /** 長さ len の向きに柱を等間隔に並べる */
  const along = (len: number, step: number) => {
    const n = Math.max(1, Math.round(len / step))
    return Array.from({ length: n + 1 }, (_, i) => -len / 2 + (len * i) / n)
  }
  /** 四角い枠の上に、柱や手すりの点を置く */
  const frame = (w: number, d: number, step: number) => {
    const pts: [number, number][] = []
    for (const x of along(w, step)) pts.push([x, -d / 2], [x, d / 2])
    for (const z of along(d, step).slice(1, -1)) pts.push([-w / 2, z], [w / 2, z])
    return pts
  }

  /** 御殿：基壇・階段・縁側と手すり・朱の柱・白壁と格子窓・組物・反りのある屋根と金の飾り */
  const hall = (x: number, z: number, w: number, d: number, h: number, rotY = 0, steps = true) => {
    at(x, z, rotY)
    const b = batches
    b.stone.add(box, place([0, 0.15, 0], [0, 0, 0], [w + 1.0, 0.3, d + 1.0]), [w + 1, 0.3])
    if (steps) for (let k = 0; k < 3; k++) b.stone.add(box, place([0, 0.05 + k * 0.1, (d + 1.0) / 2 + 0.3 - k * 0.12], [0, 0, 0], [1.3, 0.1 * (k + 1) + 0.0, 0.14]))
    b.darkWood.add(box, place([0, 0.34, 0], [0, 0, 0], [w + 0.7, 0.08, d + 0.7]))
    const y0 = 0.38
    b.wall.add(box, place([0, y0 + h / 2, 0], [0, 0, 0], [w, h, d]))
    // 格子の窓：四方の壁の上のほう、柱の間
    const band = h * 0.5
    const wy = y0 + h * 0.55
    b.window.add(box, place([0, wy, 0], [0, 0, 0], [w * 0.92, band, d + 0.02]), [Math.round(w * 3), Math.round(band * 3)])
    b.window.add(box, place([0, wy, 0], [0, 0, 0], [w + 0.02, band, d * 0.88]), [Math.round(d * 3), Math.round(band * 3)])
    // 柱（縁側の外まわり）と、柱の頭をつなぐ朱の貫
    const pw = w + 0.5
    const pd = d + 0.5
    for (const [px, pz] of frame(pw, pd, 0.6)) b.wood.add(cyl, place([px, y0 + h / 2 + 0.05, pz], [0, 0, 0], [0.055, h + 0.1, 0.055]))
    b.wood.add(box, place([0, y0 + h + 0.04, pd / 2], [0, 0, 0], [pw + 0.1, 0.08, 0.08]))
    b.wood.add(box, place([0, y0 + h + 0.04, -pd / 2], [0, 0, 0], [pw + 0.1, 0.08, 0.08]))
    b.wood.add(box, place([pw / 2, y0 + h + 0.04, 0], [0, 0, 0], [0.08, 0.08, pd + 0.1]))
    b.wood.add(box, place([-pw / 2, y0 + h + 0.04, 0], [0, 0, 0], [0.08, 0.08, pd + 0.1]))
    // 組物（軒の下の、暗い木の段）
    b.darkWood.add(box, place([0, y0 + h + 0.13, 0], [0, 0, 0], [pw + 0.25, 0.1, pd + 0.25]))
    // 縁側の手すり（正面は階段のところを空ける）
    const rw = w + 0.66
    const rd = d + 0.66
    const ry = 0.38 + 0.14
    b.wood.add(box, place([0, ry, -rd / 2], [0, 0, 0], [rw, 0.035, 0.035]))
    b.wood.add(box, place([rw / 2, ry, 0], [0, 0, 0], [0.035, 0.035, rd]))
    b.wood.add(box, place([-rw / 2, ry, 0], [0, 0, 0], [0.035, 0.035, rd]))
    const side = (rw - 1.4) / 2
    for (const sx of [-1, 1]) b.wood.add(box, place([sx * (0.7 + side / 2), ry, rd / 2], [0, 0, 0], [side, 0.035, 0.035]))
    for (const [px, pz] of frame(rw, rd, 0.3)) if (!(pz > 0 && Math.abs(px) < 0.7)) b.wood.add(box, place([px, ry - 0.07, pz], [0, 0, 0], [0.025, 0.14, 0.025]))
    // 屋根
    const W = (w + 1.5) / 2
    const D = (d + 1.5) / 2
    const H = Math.max(0.5, h * 0.95)
    const ry0 = y0 + h + 0.18
    b.roof.add(roof(W, D, H, 22), place([0, ry0, 0]))
    const len = Math.max(0.2, 2 * Math.abs(W - D))
    const alongX = W >= D
    b.roof.add(box, place([0, ry0 + H + 0.02, 0], [0, alongX ? 0 : Math.PI / 2, 0], [len + 0.1, 0.09, 0.12]), [1, 1])
    // 棟の両端の金の飾り（鴟尾のような、反った角）
    for (const sgn of [-1, 1]) {
      const ex = alongX ? sgn * (len / 2 + 0.04) : 0
      const ez = alongX ? 0 : sgn * (len / 2 + 0.04)
      b.gold.add(cone4, place([ex, ry0 + H + 0.12, ez], [alongX ? 0 : sgn * 0.5, 0, alongX ? -sgn * 0.5 : 0], [0.07, 0.24, 0.07]))
    }
  }

  /** 二階建ての門 */
  const gate = (x: number, z: number) => {
    at(x, z)
    const b = batches
    b.stone.add(box, place([0, 0.1, 0], [0, 0, 0], [3.0, 0.2, 1.4]), [3, 0.2])
    for (const px of [-1.1, -0.4, 0.4, 1.1]) for (const pz of [-0.4, 0.4]) b.wood.add(cyl, place([px, 0.8, pz], [0, 0, 0], [0.07, 1.2, 0.07]))
    b.darkWood.add(box, place([0, 1.45, 0], [0, 0, 0], [2.6, 0.12, 1.1]))
    b.roof.add(roof(1.65, 0.85, 0.3, 14), place([0, 1.5, 0]))
    b.wall.add(box, place([0, 1.98, 0], [0, 0, 0], [2.1, 0.5, 0.75]))
    b.window.add(box, place([0, 2.0, 0], [0, 0, 0], [1.7, 0.28, 0.77]), [5, 1])
    for (const [px, pz] of frame(2.4, 1.0, 0.4)) b.wood.add(cyl, place([px, 1.98, pz], [0, 0, 0], [0.045, 0.52, 0.045]))
    b.darkWood.add(box, place([0, 2.3, 0], [0, 0, 0], [2.6, 0.1, 1.2]))
    b.roof.add(roof(1.75, 0.95, 0.55, 16), place([0, 2.34, 0]))
    b.roof.add(box, place([0, 2.92, 0], [0, 0, 0], [1.7, 0.08, 0.1]))
    for (const sgn of [-1, 1]) b.gold.add(cone4, place([sgn * 0.88, 3.02, 0], [0, 0, -sgn * 0.5], [0.06, 0.2, 0.06]))
  }

  /** 築地塀：白い壁に瓦の笠。月の丸みに合わせて、短く区切って置く */
  const wall = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0)
    const n = Math.ceil(len / 0.8)
    const rot = Math.atan2(-(z1 - z0), x1 - x0)
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n
      at(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, rot)
      const l = len / n + 0.02
      batches.stone.add(box, place([0, 0.06, 0], [0, 0, 0], [l, 0.12, 0.3]))
      batches.wall.add(box, place([0, 0.4, 0], [0, 0, 0], [l, 0.6, 0.2]))
      batches.wood.add(box, place([0, 0.55, 0], [0, 0, 0], [l, 0.04, 0.21]))
      batches.roof.add(diamond, place([0, 0.72, 0], [0, 0, Math.PI / 2], [0.1, l, 0.2]), [l * 5, 1])
    }
  }

  /** 石灯籠（灯りの入る火袋が光る） */
  const lantern = (x: number, z: number, s = 1) => {
    at(x, z)
    const b = batches
    b.stone.add(cyl6, place([0, 0.04 * s, 0], [0, 0, 0], [0.12 * s, 0.08 * s, 0.12 * s]))
    b.stone.add(cyl6, place([0, 0.2 * s, 0], [0, 0, 0], [0.04 * s, 0.26 * s, 0.04 * s]))
    b.stone.add(cyl6, place([0, 0.35 * s, 0], [0, 0, 0], [0.1 * s, 0.04 * s, 0.1 * s]))
    b.lamp.add(box, place([0, 0.43 * s, 0], [0, 0, 0], [0.11 * s, 0.12 * s, 0.11 * s]))
    b.stone.add(cone4, place([0, 0.55 * s, 0], [0, Math.PI / 4, 0], [0.17 * s, 0.12 * s, 0.17 * s]))
    b.stone.add(box, place([0, 0.63 * s, 0], [0, 0, 0], [0.04 * s, 0.05 * s, 0.04 * s]))
  }

  /** 木（桂は金の葉、桜は淡い紅）。big は月の桂の大木 */
  const tree = (x: number, z: number, size: number, kind: 'leaves' | 'blossom', rand: () => number, big = false) => {
    at(x, z, rand() * 6)
    const b = batches
    const hgt = size * 1.1
    b.trunk.add(cyl6, place([0, hgt / 2, 0], [0, 0, (rand() - 0.5) * 0.15], [size * 0.07, hgt, size * 0.07]))
    const n = big ? 16 : 5
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand()
      const r = i === 0 ? 0 : size * (0.2 + rand() * 0.35)
      const s = size * (0.2 + rand() * 0.12) * (i === 0 ? 1.4 : 1)
      b[kind].add(big ? leaf : leafLow, place([Math.cos(a) * r, hgt + (rand() - 0.2) * size * 0.4, Math.sin(a) * r], [rand(), rand(), rand()], [s, s * 0.7, s]))
    }
    if (big) for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      b.trunk.add(cyl6, place([Math.cos(a) * size * 0.2, hgt * 0.75, Math.sin(a) * size * 0.2], [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9], [size * 0.03, size * 0.5, size * 0.03]))
    }
  }

  const rand = seeded(23)

  // ── 御所 ──
  hall(0, -1.6, 4, 2.4, 1.3)
  hall(-3.5, 1.7, 2.2, 1.4, 0.9, Math.PI / 2, true)
  hall(3.5, 1.7, 2.2, 1.4, 0.9, -Math.PI / 2, true)
  hall(-1.4, -4.3, 2.6, 1.2, 0.8, 0, false)
  // 渡り廊下（屋根つき）
  for (const [x, z, w, d] of [[-0.6, -3.4, 0.5, 0.9]] as const) {
    at(x, z)
    batches.darkWood.add(box, place([0, 0.3, 0], [0, 0, 0], [w, 0.06, d]))
    for (const [px, pz] of frame(w, d * 0.8, 0.35)) batches.wood.add(cyl, place([px, 0.55, pz], [0, 0, 0], [0.035, 0.5, 0.035]))
    batches.roof.add(roof(w / 2 + 0.12, d / 2 + 0.12, 0.18, 8), place([0, 0.8, 0]))
  }
  gate(0, 5)
  wall(-5, 5, -1.55, 5)
  wall(1.55, 5, 5, 5)
  wall(-5, -5.5, 5, -5.5)
  wall(-5, -5.5, -5, 5)
  wall(5, -5.5, 5, 5)

  // 白砂の庭（塀の内側。月の丸みに合わせた格子を曲げる）
  {
    const g = new THREE.PlaneGeometry(9.9, 10.4, 20, 20)
    g.rotateX(-Math.PI / 2)
    g.translate(0, 0, -0.25)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) p.setY(i, ground(p.getX(i), p.getZ(i)) + 0.025)
    g.computeVertexNormals()
    for (const b of Object.values(batches)) b.parent.identity()
    batches.sand.add(g, undefined, [6, 6])
    g.dispose()
  }

  // 光る池と太鼓橋、蓮の灯り
  {
    const pz = 2.4
    at(0, pz, 0, 0.05)
    batches.pond.add(new THREE.CircleGeometry(1, 48), place([0, 0, 0], [-Math.PI / 2, 0, 0], [1.6, 1.0, 1]))
    batches.stone.add(new THREE.TorusGeometry(1, 0.06, 6, 64), place([0, 0, 0], [-Math.PI / 2, 0, 0], [1.62, 1.02, 1]))
    for (let i = 0; i < 16; i++) {
      const a = rand() * Math.PI * 2
      const r = 0.35 + rand() * 0.55
      const x = Math.cos(a) * r * 1.5
      const z = Math.sin(a) * r * 0.9
      if (Math.abs(x) < 0.35) continue
      batches.pad.add(cyl, place([x, 0.01, z], [0, 0, 0], [0.09, 0.01, 0.09]))
      batches.lotus.add(cone4, place([x, 0.04, z], [Math.PI, 0, 0], [0.04, 0.05, 0.04]))
    }
    // 太鼓橋（池を南北に渡る、反った朱の橋）
    const N = 12
    const half = 1.35
    const arch = (t: number) => 0.32 * (1 - t * t) + 0.06
    for (let i = 0; i < N; i++) {
      const t0 = -1 + (2 * i) / N
      const t1 = -1 + (2 * (i + 1)) / N
      const z0 = t0 * half
      const z1 = t1 * half
      const y0 = arch(t0)
      const y1 = arch(t1)
      const mid: [number, number, number] = [0, (y0 + y1) / 2, (z0 + z1) / 2]
      const len = Math.hypot(z1 - z0, y1 - y0)
      const tilt = Math.atan2(y1 - y0, z1 - z0)
      batches.darkWood.add(box, place(mid, [-tilt, 0, 0], [0.5, 0.04, len + 0.01]))
      for (const sx of [-0.26, 0.26]) {
        batches.wood.add(box, place([sx, mid[1] + 0.16, mid[2]], [-tilt, 0, 0], [0.03, 0.03, len + 0.01]))
        batches.wood.add(box, place([sx, y0 + 0.08, z0], [0, 0, 0], [0.03, 0.16, 0.03]))
      }
    }
    for (const sx of [-0.26, 0.26]) for (const sz of [-1, 1]) batches.gold.add(cyl6, place([sx, 0.24, sz * half], [0, 0, 0], [0.035, 0.08, 0.035]))
  }

  // 五重の塔
  {
    at(3.4, -3.6)
    const b = batches
    b.stone.add(box, place([0, 0.12, 0], [0, 0, 0], [1.3, 0.24, 1.3]), [1.3, 0.24])
    let y = 0.24
    for (let k = 0; k < 5; k++) {
      const s = 1.0 - k * 0.11
      const bh = k === 0 ? 0.5 : 0.36
      b.wall.add(box, place([0, y + bh / 2, 0], [0, 0, 0], [s * 0.66, bh, s * 0.66]))
      b.window.add(box, place([0, y + bh * 0.55, 0], [0, 0, 0], [s * 0.4, bh * 0.45, s * 0.67]), [2, 1])
      b.window.add(box, place([0, y + bh * 0.55, 0], [0, 0, 0], [s * 0.67, bh * 0.45, s * 0.4]), [2, 1])
      for (const [px, pz] of frame(s * 0.7, s * 0.7, s * 0.35)) b.wood.add(cyl6, place([px, y + bh / 2, pz], [0, 0, 0], [0.03, bh, 0.03]))
      b.darkWood.add(box, place([0, y + bh + 0.04, 0], [0, 0, 0], [s * 0.82, 0.08, s * 0.82]))
      const W = s * 0.62
      b.roof.add(roof(W, W, 0.24, 12), place([0, y + bh + 0.08, 0]))
      y += bh + 0.08 + 0.1
    }
    // 相輪（金の九つの輪と、光る宝珠）
    b.gold.add(cyl6, place([0, y + 0.1, 0], [0, 0, 0], [0.09, 0.2, 0.09]))
    b.gold.add(cyl6, place([0, y + 0.75, 0], [0, 0, 0], [0.025, 1.3, 0.025]))
    for (let i = 0; i < 9; i++) b.gold.add(ring, place([0, y + 0.3 + i * 0.09, 0], [Math.PI / 2, 0, 0], 0.09 - i * 0.004))
    b.lamp.add(leafLow, place([0, y + 1.45, 0], [0, 0, 0], 0.06))
  }

  // 灯籠：門から池まで、池のまわり、御殿の前
  for (const z of [3.7, 4.4]) for (const x of [-0.9, 0.9]) lantern(x, z)
  for (const a of [0.5, 1.2, 1.95, 2.65, 3.6, 4.4, 5.1, 5.8]) lantern(Math.cos(a) * 2.0, 2.4 + Math.sin(a) * 1.35, 0.9)
  for (const x of [-1.6, 1.6]) lantern(x, 0.35, 1.1)

  // 庭の木と、月の桂の大木
  tree(-4.0, -2.2, 1.3, 'leaves', rand, true)
  for (const [x, z, k] of [
    [-2.1, 4.2, 'blossom'],
    [2.2, 4.1, 'blossom'],
    [-3.6, 4.3, 'leaves'],
    [3.6, 4.3, 'leaves'],
    [4.4, -1.4, 'blossom'],
    [2.2, -4.8, 'leaves'],
    [1.6, -4.7, 'blossom'],
  ] as const)
    tree(x, z, 0.65 + rand() * 0.3, k, rand)

  // ── 塀の外の町並み（碁盤の目。朱雀大路は空ける） ──
  {
    const STEP = 1.9
    for (let gx = -6; gx <= 6; gx++)
      for (let gz = -6; gz <= 6; gz++) {
        const cx = gx * STEP
        const cz = gz * STEP
        const r = Math.hypot(cx, cz)
        if (r > 10.6 || r < 2) continue
        if (Math.abs(cx) < 6.3 && cz > -7 && cz < 6.4) continue
        if (Math.abs(cx) < 1.3) continue
        // ひと区画に 2〜4 軒
        const n = 2 + Math.floor(rand() * 3)
        for (let i = 0; i < n; i++) {
          const ox = (i % 2 ? 0.42 : -0.42) + (rand() - 0.5) * 0.1
          const oz = (i < 2 ? -0.4 : 0.4) + (rand() - 0.5) * 0.1
          const w = 0.55 + rand() * 0.25
          const d = 0.45 + rand() * 0.2
          const h = 0.3 + rand() * 0.18
          at(cx + ox, cz + oz, rand() < 0.5 ? 0 : Math.PI / 2)
          batches.stone.add(box, place([0, 0.04, 0], [0, 0, 0], [w + 0.12, 0.08, d + 0.12]))
          batches.townWall.add(box, place([0, 0.08 + h / 2, 0], [0, 0, 0], [w, h, d]))
          batches.window.add(box, place([0, 0.08 + h * 0.5, 0], [0, 0, 0], [w * 0.6, h * 0.3, d + 0.02]), [2, 1])
          batches.townRoof.add(roof((w + 0.22) / 2, (d + 0.22) / 2, 0.22, 6), place([0, 0.08 + h, 0]))
        }
        if (rand() < 0.35) tree(cx + (rand() - 0.5) * 1.4, cz + (rand() - 0.5) * 1.4, 0.45 + rand() * 0.2, rand() < 0.5 ? 'blossom' : 'leaves', rand)
      }
    // 朱雀大路の街灯
    for (let z = 6.0; z <= 10.5; z += 0.75) for (const x of [-1.0, 1.0]) lantern(x, z, 0.8)
  }

  // ── クレーターの縁：内側が段になって落ちる、でこぼこの岩の土手 ──
  {
    const profile: THREE.Vector2[] = []
    const pts: [number, number][] = [
      [10.9, -0.05],
      [11.3, 0.12],
      [11.5, 0.16],
      [11.8, 0.55],
      [12.1, 0.62],
      [12.45, 1.05],
      [12.8, 0.95],
      [13.4, 0.45],
      [14.2, -0.1],
    ]
    for (const [r, y] of pts) profile.push(new THREE.Vector2(r, y))
    const g = new THREE.LatheGeometry(profile, 128)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i)
      const z = p.getZ(i)
      const a = Math.atan2(z, x)
      const r = Math.hypot(x, z)
      const bump = 1 + 0.25 * Math.sin(a * 7 + 1.3) + 0.15 * Math.sin(a * 19 + 0.4) + 0.1 * Math.sin(a * 41)
      const y = p.getY(i) * (r > 11.6 ? bump : 1)
      p.setY(i, ground(x, z) + y)
    }
    g.computeVertexNormals()
    for (const b of Object.values(batches)) b.parent.identity()
    batches.rock.add(g, undefined, [40, 2])
    g.dispose()
  }

  const meshes = (Object.keys(mats) as Key[])
    .filter((k) => !batches[k].empty)
    .map((k) => ({ key: k, geometry: batches[k].build(), material: mats[k] as THREE.Material }))
  roofs.forEach((g) => g.dispose())
  return {
    meshes,
    dispose() {
      meshes.forEach((m) => m.geometry.dispose())
      Object.values(mats).forEach((m) => m.dispose())
      Object.values(tex).forEach((t) => t.dispose())
    },
  }
}
