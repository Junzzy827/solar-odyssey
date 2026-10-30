import * as THREE from 'three'

// スペースコロニーの絵（キャンバスで描く）。内側の大地と、外側の外板

const rng = (seed: number) => {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, g: c.getContext('2d')! }
}

const texture = (c: HTMLCanvasElement, srgb = true) => {
  const tex = new THREE.CanvasTexture(c)
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/**
 * 内側の大地（縦がコロニーの長さの向き、横が円周の向き）。
 * 畑と森、町、長さに沿って流れる川、両端の丘。端に近い湖。
 */
export function landTexture(seed: number) {
  const W = 512
  const H = 2048
  const { c, g } = canvas(W, H)
  const rand = rng(seed)
  g.fillStyle = '#5f7f45'
  g.fillRect(0, 0, W, H)

  // 畑：細長い区画を、少しずつ色を変えて敷きつめる
  const fields = ['#6d8f47', '#7f9c4c', '#a4a556', '#c2b267', '#5d8a43', '#8e8a4f', '#93ac5a', '#6a7d3e']
  for (let y = 0; y < H; ) {
    const rowH = 18 + rand() * 40
    for (let x = 0; x < W; ) {
      const w = 20 + rand() * 70
      g.fillStyle = fields[Math.floor(rand() * fields.length)]
      g.fillRect(x + 1, y + 1, w - 2, rowH - 2)
      x += w
    }
    y += rowH
  }
  // 森：濃い緑のかたまり
  for (let i = 0; i < 160; i++) {
    const x = rand() * W
    const y = rand() * H
    const r = 6 + rand() * 26
    g.fillStyle = `rgba(${40 + rand() * 15}, ${70 + rand() * 20}, ${38 + rand() * 10}, 0.85)`
    for (let k = 0; k < 6; k++) {
      g.beginPath()
      g.arc(x + (rand() - 0.5) * r, y + (rand() - 0.5) * r * 1.6, r * (0.4 + rand() * 0.5), 0, Math.PI * 2)
      g.fill()
    }
  }
  // 川：長さに沿って曲がりながら流れる
  g.strokeStyle = '#4f7fa8'
  g.lineCap = 'round'
  g.lineWidth = 9
  g.beginPath()
  const phase = rand() * 6
  for (let y = 0; y <= H; y += 16) {
    const x = W * 0.5 + Math.sin(y * 0.004 + phase) * W * 0.22 + Math.sin(y * 0.013 + phase * 2) * 18
    if (y === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  g.stroke()
  // 町：灰色と白の小さな建物と、碁盤の目の道
  const towns = 5 + Math.floor(rand() * 3)
  for (let i = 0; i < towns; i++) {
    const cx = W * (0.2 + rand() * 0.6)
    const cy = H * (0.12 + (i / towns) * 0.78) + rand() * 60
    const size = 40 + rand() * 50
    g.fillStyle = '#8c8c86'
    g.fillRect(cx - size, cy - size * 1.4, size * 2, size * 2.8)
    for (let k = 0; k < 220; k++) {
      const bx = cx + (rand() - 0.5) * size * 2
      const by = cy + (rand() - 0.5) * size * 2.8
      const v = 150 + rand() * 90
      g.fillStyle = `rgb(${v}, ${v}, ${v - 8})`
      g.fillRect(bx, by, 2 + rand() * 6, 2 + rand() * 6)
    }
    g.strokeStyle = 'rgba(70, 70, 70, 0.8)'
    g.lineWidth = 1.5
    for (let k = -size; k <= size; k += 12) {
      g.beginPath()
      g.moveTo(cx + k, cy - size * 1.4)
      g.lineTo(cx + k, cy + size * 1.4)
      g.stroke()
    }
  }
  // 長さに沿った大通り
  g.strokeStyle = 'rgba(120, 118, 110, 0.9)'
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(W * 0.15, 0)
  g.lineTo(W * 0.15, H)
  g.stroke()
  // 端の湖
  for (const y of [H * 0.05, H * 0.93]) {
    g.fillStyle = '#4a7aa3'
    g.beginPath()
    g.ellipse(W * (0.3 + rand() * 0.4), y, 50 + rand() * 40, 70, 0, 0, Math.PI * 2)
    g.fill()
  }
  // 両端（端の壁のそば）は丘になって少し暗い
  const fade = g.createLinearGradient(0, 0, 0, H)
  fade.addColorStop(0, 'rgba(50, 60, 40, 0.55)')
  fade.addColorStop(0.06, 'rgba(50, 60, 40, 0)')
  fade.addColorStop(0.94, 'rgba(50, 60, 40, 0)')
  fade.addColorStop(1, 'rgba(50, 60, 40, 0.55)')
  g.fillStyle = fade
  g.fillRect(0, 0, W, H)
  // 窓のそばの縁は土手（白っぽい壁）
  g.fillStyle = '#b8b4a8'
  g.fillRect(0, 0, 6, H)
  g.fillRect(W - 6, 0, 6, H)
  return texture(c)
}

/** 外板：灰色のパネルの継ぎ目と、ところどころの小さな灯 */
export function hullTexture(seed: number) {
  const W = 512
  const H = 1024
  const { c, g } = canvas(W, H)
  const rand = rng(seed)
  g.fillStyle = '#9a9ea6'
  g.fillRect(0, 0, W, H)
  for (let y = 0; y < H; y += 32) {
    for (let x = 0; x < W; x += 64) {
      const v = 135 + rand() * 40
      g.fillStyle = `rgb(${v}, ${v + 2}, ${v + 8})`
      g.fillRect(x + 1, y + 1, 62, 30)
    }
  }
  g.fillStyle = 'rgba(40, 44, 52, 0.7)'
  for (let y = 0; y < H; y += 128) g.fillRect(0, y, W, 3)
  for (let i = 0; i < 60; i++) g.fillRect(rand() * W, rand() * H, 8 + rand() * 30, 4 + rand() * 8)
  return texture(c)
}

/** 雲（やわらかい白いかたまり） */
export function cloudTexture() {
  const { c, g } = canvas(128, 128)
  const rand = rng(5)
  for (let i = 0; i < 14; i++) {
    const x = 34 + rand() * 60
    const y = 44 + rand() * 40
    const r = 14 + rand() * 20
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.55)')
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
  }
  return texture(c)
}
