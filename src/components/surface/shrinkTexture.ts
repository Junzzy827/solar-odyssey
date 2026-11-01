import * as THREE from 'three'

export const MAP_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap'] as const

/**
 * 大きなテクスチャを小さく描き直した写しを作る（スマホのメモリ対策）。
 * 地表の場面は宇宙の場面とは別の Canvas なので、着陸船の 2048 のテクスチャ5枚（GPU で約110MB）が
 * そのまま二重に載ると、iPhone ではページごと落ちてしまう。
 */
export function shrinkTexture(tex: THREE.Texture, max: number): THREE.Texture | null {
  const img = tex.image as { width?: number; height?: number } | undefined
  if (!img?.width || !img.height || Math.max(img.width, img.height) <= max) return null
  const k = max / Math.max(img.width, img.height)
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(img.width * k))
  c.height = Math.max(1, Math.round(img.height * k))
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(tex.image as CanvasImageSource, 0, 0, c.width, c.height)
  const out = tex.clone()
  out.source = new THREE.Source(c)
  out.needsUpdate = true
  return out
}
