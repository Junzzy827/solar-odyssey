import * as THREE from 'three'

// ---- 外壁の模様（キャンバスで描く） --------------------------------------------------------

export function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

export function hullTextures(base: string) {
  const N = 1024
  const color = document.createElement('canvas')
  const bump = document.createElement('canvas')
  color.width = color.height = bump.width = bump.height = N
  const c = color.getContext('2d')!
  const b = bump.getContext('2d')!
  const rnd = seeded(7)
  const col = new THREE.Color(base)
  c.fillStyle = base
  c.fillRect(0, 0, N, N)
  b.fillStyle = '#808080'
  b.fillRect(0, 0, N, N)
  const P = N / 4 // パネル 2 m 四方
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      // パネルごとに少しずつ色を変える
      const k = 0.94 + rnd() * 0.08
      c.fillStyle = `rgb(${Math.round(col.r * 255 * k)},${Math.round(col.g * 255 * k)},${Math.round(col.b * 255 * k)})`
      c.fillRect(i * P, j * P, P, P)
      // 細い段（点検口）
      if (rnd() < 0.3) {
        const w = P * (0.25 + rnd() * 0.3)
        const h = P * (0.15 + rnd() * 0.2)
        const x = i * P + P * 0.15 + rnd() * (P * 0.7 - w)
        const y = j * P + P * 0.15 + rnd() * (P * 0.7 - h)
        c.strokeStyle = 'rgba(40,44,52,0.55)'
        c.lineWidth = 2
        c.strokeRect(x, y, w, h)
        b.strokeStyle = '#5a5a5a'
        b.lineWidth = 3
        b.strokeRect(x, y, w, h)
      }
    }
  // 継ぎ目と留め具
  for (let k = 0; k <= 4; k++) {
    for (const ctx of [c, b]) {
      ctx.fillStyle = ctx === c ? 'rgba(30,33,40,0.85)' : '#303030'
      ctx.fillRect(k * P - 2, 0, 4, N)
      ctx.fillRect(0, k * P - 2, N, 4)
    }
    for (let m = 0; m < N; m += 16) {
      for (const [x, y] of [
        [k * P + 7, m + 8],
        [m + 8, k * P + 7],
      ]) {
        c.fillStyle = 'rgba(60,64,72,0.7)'
        c.fillRect(x - 1.5, y - 1.5, 3, 3)
        b.fillStyle = '#b0b0b0'
        b.fillRect(x - 1.5, y - 1.5, 3, 3)
      }
    }
  }
  // 汚れの筋（前から後ろへ流れる）と、焼けた跡
  for (let i = 0; i < 40; i++) {
    const x = rnd() * N
    const y = rnd() * N
    const g = c.createLinearGradient(x, y, x, y + 120 + rnd() * 200)
    g.addColorStop(0, 'rgba(70,60,50,0.13)')
    g.addColorStop(1, 'rgba(70,60,50,0)')
    c.fillStyle = g
    c.fillRect(x, y, 6 + rnd() * 18, 320)
  }
  const make = (cv: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(cv)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 8
    if (srgb) t.colorSpace = THREE.SRGBColorSpace
    return t
  }
  return { map: make(color, true), bump: make(bump, false) }
}

