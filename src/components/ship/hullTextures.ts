import * as THREE from 'three'

// 船体の外板は画像を使わず Canvas で描く。
// 色（パネルの濃淡）、凹凸（パネルの継ぎ目）、発光（窓）の3枚を同じ配置で作る。

type Rand = () => number

export function seeded(seed: number): Rand {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

export type WindowRow = {
  /** テクスチャ縦方向の位置（0〜1） */
  v: number
  /** 窓が並ぶ割合 */
  density: number
  /** 横方向の範囲（0〜1）。省略時は全周 */
  from?: number
  to?: number
  /** true なら縦に並べる（v を横位置、from/to を縦の範囲として使う） */
  vertical?: boolean
}

export type HullTextures = {
  map: THREE.CanvasTexture
  bumpMap: THREE.CanvasTexture
  emissiveMap: THREE.CanvasTexture
}

export function hullTextures(opts: { width: number; height: number; seed: number; windows: WindowRow[]; panelScale?: number }): HullTextures {
  const { width, height, windows } = opts
  const rand = seeded(opts.seed)
  const panel = opts.panelScale ?? 1

  const color = document.createElement('canvas')
  const bump = document.createElement('canvas')
  const glow = document.createElement('canvas')
  for (const c of [color, bump, glow]) {
    c.width = width
    c.height = height
  }
  const cc = color.getContext('2d')!
  const bc = bump.getContext('2d')!
  const gc = glow.getContext('2d')!

  // 下地
  cc.fillStyle = '#b4b9c1'
  cc.fillRect(0, 0, width, height)
  bc.fillStyle = '#808080'
  bc.fillRect(0, 0, width, height)
  gc.fillStyle = '#000'
  gc.fillRect(0, 0, width, height)

  // 色味の違うパネルを大小重ねる（宇宙船らしいモザイク状の塗り分け）
  const sizes = [
    [160, 90, 140],
    [70, 40, 420],
    [30, 18, 900],
  ]
  for (const [w, h, count] of sizes) {
    for (let i = 0; i < count; i++) {
      const pw = (w * panel * (0.5 + rand())) | 0
      const ph = (h * panel * (0.5 + rand())) | 0
      const x = (rand() * width) | 0
      const y = (rand() * height) | 0
      // 撮影用模型の「パール塗装のアズテック模様」に倣い、
      // 青みのパネルを主に、ところどころ金色がかったパネルを混ぜる
      // 色の差はごくわずかにとどめる（近くで見て初めて分かる程度）
      const shade = 178 + ((rand() * 12) | 0)
      const k = rand()
      const [cr, cg, cb] = k < 0.55 ? [shade - 3, shade, shade + 5] : k < 0.8 ? [shade + 4, shade + 2, shade - 3] : [shade, shade, shade]
      // 半透明で重ねて、パネルの境目をやわらかくまだらにする
      cc.globalAlpha = 0.55
      cc.fillStyle = `rgb(${cr},${cg},${cb})`
      cc.fillRect(x, y, pw, ph)
      cc.globalAlpha = 1
      // 凹凸：パネルごとにわずかに高さを変える
      const b = 124 + ((rand() * 10) | 0)
      bc.fillStyle = `rgb(${b},${b},${b})`
      bc.fillRect(x, y, pw, ph)
    }
  }

  // 継ぎ目（溝）：間隔を揺らし、ところどころ途切れさせて、タイル張りに見えないようにする
  const step = 44 * panel
  const cols: number[] = []
  for (let x = 0; x < width; x += step * (0.6 + rand() * 0.8)) cols.push(x | 0)
  const rows: number[] = []
  for (let y = 0; y < height; y += step * 0.7 * (0.6 + rand() * 0.8)) rows.push(y | 0)
  cc.strokeStyle = 'rgba(70,74,82,0.12)'
  bc.strokeStyle = '#555555'
  cc.lineWidth = 1
  bc.lineWidth = 1.2
  const seam = (x1: number, y1: number, x2: number, y2: number) => {
    for (const ctx of [cc, bc]) {
      ctx.beginPath()
      ctx.moveTo(x1 + 0.5, y1 + 0.5)
      ctx.lineTo(x2 + 0.5, y2 + 0.5)
      ctx.stroke()
    }
  }
  for (let i = 0; i < rows.length; i++) {
    const y0 = rows[i]
    const y1 = rows[i + 1] ?? height
    seam(0, y0, width, y0)
    for (const x of cols) if (rand() < 0.55) seam(x, y0, x, y1)
  }

  // 窓：横一列に並べ、ところどころ消灯させる
  for (const row of windows) {
    if (row.vertical) {
      const x = row.v * width
      for (let y = (row.from ?? 0) * height; y < (row.to ?? 1) * height; y += 9) {
        if (rand() > row.density) continue
        gc.fillStyle = rand() < 0.85 ? '#ffe7b0' : '#cfe3ff'
        gc.fillRect(x - 1.5, y, 3, 5)
        cc.fillStyle = '#3b3f46'
        cc.fillRect(x - 2.5, y - 1, 5, 7)
        bc.fillStyle = '#505050'
        bc.fillRect(x - 2.5, y - 1, 5, 7)
      }
      continue
    }
    const y = row.v * height
    const from = (row.from ?? 0) * width
    const to = (row.to ?? 1) * width
    const step = 9
    for (let x = from; x < to; x += step) {
      if (rand() > row.density) continue
      const warm = rand() < 0.85
      gc.fillStyle = warm ? '#ffe7b0' : '#cfe3ff'
      gc.fillRect(x, y - 1.5, 5, 3)
      cc.fillStyle = '#3b3f46'
      cc.fillRect(x - 1, y - 2.5, 7, 5)
      bc.fillStyle = '#505050'
      bc.fillRect(x - 1, y - 2.5, 7, 5)
    }
  }

  const make = (canvas: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    t.wrapS = THREE.RepeatWrapping
    t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 8
    return t
  }

  return { map: make(color, true), bumpMap: make(bump, false), emissiveMap: make(glow, true) }
}

/** ディフレクター（同心円状に光る皿） */
export function deflectorTexture() {
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.25, '#ffd9a0')
  g.addColorStop(0.6, '#ff9b3d')
  g.addColorStop(1, '#5a2a10')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = 'rgba(60,20,0,0.5)'
  for (let r = 12; r < size / 2; r += 14) {
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * ワープコイル：黒地に描いて加算合成で重ねる。
 * 横（周方向）は中央が明るく縁に向かって消え、縦（長さ方向）は両端で消える。
 * コイルの区切りは細く控えめにして、内側から光がにじむように見せる。
 */
export function coilTexture() {
  const w = 128
  const h = 512
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(w, h)
  for (let y = 0; y < h; y++) {
    const along = y / (h - 1)
    const ends = Math.min(1, along / 0.06, (1 - along) / 0.06)
    const rib = 0.82 + 0.18 * Math.cos((along * 34 * Math.PI * 2) % (Math.PI * 2)) ** 8
    for (let x = 0; x < w; x++) {
      const across = Math.abs(x / (w - 1) - 0.5) * 2
      const band = Math.max(0, 1 - across ** 5)
      const core = Math.max(0, 1 - across * 1.6) ** 1.5
      const k = ends * band * rib
      const i = (y * w + x) * 4
      img.data[i] = Math.min(255, 40 * k + 140 * core * ends)
      img.data[i + 1] = Math.min(255, 110 * k + 120 * core * ends)
      img.data[i + 2] = Math.min(255, 255 * k)
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** 円盤上面の船名（オリジナルの名前と番号） */
export function nameTexture(text: string) {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 128
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, 1024, 128)
  ctx.fillStyle = 'rgba(40,44,52,0.85)'
  ctx.font = 'bold 84px "Helvetica Neue", Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 512, 68)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** バサードコレクター：中心が明るく、縁に向かって暗い赤。渦を描く筋を入れる */
export function bussardTexture() {
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, size)
  g.addColorStop(0, '#ffb08a')
  g.addColorStop(0.35, '#ff3a1a')
  g.addColorStop(1, '#4a0500')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = 'rgba(80,0,0,0.45)'
  ctx.lineWidth = 3
  for (let x = -size; x < size * 2; x += 16) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + size * 0.6, size)
    ctx.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  return t
}
