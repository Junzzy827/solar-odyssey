import * as THREE from 'three'
import { currentLevel, lowMemory } from '../../state/quality'
import { drawCityGround, drawCityLights } from './colonyCity'

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
 * 内側の大地（縦がコロニーの長さの向き、横が円周の向き）。帯 k の街の計画（colonyCity.ts）から、
 * 区画・道・川・湖・畑を描く。両端は丘、窓のそばの縁は土手。
 */
export function landTexture(seed: number, k: number) {
  const big = !lowMemory() && currentLevel() !== 'low'
  const W = big ? 1024 : 512
  const H = big ? 4096 : 2048
  const { c, g } = canvas(W, H)
  const rand = rng(seed)
  drawCityGround(g, W, H, k, rand)
  // 両端（端の壁のそば）は丘になって少し暗い
  const fade = g.createLinearGradient(0, 0, 0, H)
  fade.addColorStop(0, 'rgba(50, 60, 40, 0.55)')
  fade.addColorStop(0.03, 'rgba(50, 60, 40, 0)')
  fade.addColorStop(0.985, 'rgba(50, 60, 40, 0)')
  fade.addColorStop(1, 'rgba(50, 60, 40, 0.45)')
  g.fillStyle = fade
  g.fillRect(0, 0, W, H)
  // 窓のそばの縁は土手（白っぽい壁）
  g.fillStyle = '#b8b4a8'
  g.fillRect(0, 0, W * 0.012, H)
  g.fillRect(W * 0.988, 0, W * 0.012, H)
  return texture(c)
}

/** 夜の街の灯り（黒地。加算で大地に重ねる） */
export function lightsTexture(k: number) {
  const W = lowMemory() ? 512 : 1024
  const H = W * 4
  const { c, g } = canvas(W, H)
  drawCityLights(g, W, H, k)
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
