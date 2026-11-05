import { useEffect, useState } from 'react'
import { lowMemory } from '../../state/quality'

// 本物の地形（観測された標高データ）。tools/terrain/pack_dem.py で作った public/terrain/ の地図を読む。
// 近くの地図（6.4 km 四方）は地面そのもの、遠くの地図（100 km 四方）は地平線の山並みに使う。
// 高さは着陸地点を 0 m とした値。x は東、z は南（アプリの地方の向きと同じ）。

export type HeightMap = {
  size: number
  /** 地図の一辺（m） */
  extent: number
  /** 各画素の高さ（m）。行 0 が北のふち */
  data: Float32Array
}

/**
 * 細かい地図：ローバーで走る範囲（3.2 km 四方、1.56 m 間隔）だけ、近くの地図との差（小さなクレーター・段差・尾根）を持つ。
 * 差は ±1.27 m までの 8 bit。軽くする端末では読まない
 */
export type DetailMap = { size: number; extent: number; step: number; data: Uint8Array }

export type Dem = { near: HeightMap; far: HeightMap; detail: DetailMap | null; attribution: string[] }

/** 本物の地形がある天体 */
export const DEM_BODIES = new Set(['mars', 'earth', 'mars_coprates', 'moon_taurus', 'europa_conamara'])

type Meta = {
  near: { size: number; extent_m: number; step: number; offset: number }
  far: { size: number; extent_m: number; step: number; offset: number }
  detail?: { size: number; extent_m: number; step: number; zero: number }
  attribution: string[]
}

export async function pixels(url: string) {
  const blob = await (await fetch(url)).blob()
  // 色の補正をかけずに、画素の値をそのまま読む
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width
  canvas.height = bmp.height
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  g.drawImage(bmp, 0, 0)
  const px = g.getImageData(0, 0, canvas.width, canvas.height).data
  bmp.close()
  canvas.width = canvas.height = 0
  return px
}

async function loadMap(url: string, m: Meta['near']): Promise<HeightMap> {
  const px = await pixels(url)
  const n = m.size
  const data = new Float32Array(n * n)
  for (let i = 0; i < n * n; i++) data[i] = (px[i * 4] * 256 + px[i * 4 + 1]) * m.step - m.offset
  return { size: n, extent: m.extent_m, data }
}

async function loadDetail(url: string, m: NonNullable<Meta['detail']>): Promise<DetailMap | null> {
  try {
    const px = await pixels(url)
    const n = m.size
    const data = new Uint8Array(n * n)
    for (let i = 0; i < n * n; i++) data[i] = px[i * 4]
    return { size: n, extent: m.extent_m, step: m.step, data }
  } catch (e) {
    // 細かい地図がなくても、近くの地図で走れる
    console.warn('[dem] detail failed', e)
    return null
  }
}

const cache = new Map<string, Promise<Dem>>()
/** 読み終わった地図（着陸の前に読んでおけば、地表の場面は最初から本物の地形で始まる） */
const loaded = new Map<string, Dem>()

export function loadDem(id: string): Promise<Dem> {
  let p = cache.get(id)
  if (!p) {
    const base = `${import.meta.env.BASE_URL}terrain/${id}`
    p = fetch(`${base}.json`)
      .then((r) => r.json() as Promise<Meta>)
      .then(async (meta) => {
        // 3 枚を同時に読む
        const [near, far, detail] = await Promise.all([
          loadMap(`${base}_near.png`, meta.near),
          loadMap(`${base}_far.png`, meta.far),
          meta.detail && !lowMemory() ? loadDetail(`${base}_detail.png`, meta.detail) : Promise.resolve(null),
        ])
        const dem = { near, far, detail, attribution: meta.attribution }
        loaded.set(id, dem)
        return dem
      })
    p.catch(() => cache.delete(id))
    cache.set(id, p)
  }
  return p
}

/**
 * 本物の地形を読む。読み終わるまで（と、無い天体では）null。
 * 読み込みに失敗したら false（今までの作った地形のまま）
 */
export function useDem(id: string): Dem | null | false {
  const now = () => (DEM_BODIES.has(id) ? (loaded.get(id) ?? null) : false)
  const [dem, setDem] = useState<Dem | null | false>(now)
  useEffect(() => {
    if (!DEM_BODIES.has(id)) {
      setDem(false)
      return
    }
    let alive = true
    setDem(now())
    loadDem(id).then(
      (d) => {
        if (alive) setDem(d)
      },
      (e) => {
        console.warn(`[dem] ${id} failed`, e)
        if (alive) setDem(false)
      },
    )
    return () => {
      alive = false
    }
  }, [id])
  return dem
}

/** 地図の高さ（なめらかにつなぐ）。地図の外では null */
export function heightAt(m: HeightMap, x: number, z: number): number | null {
  const half = m.extent / 2
  const fx = ((x + half) / m.extent) * m.size - 0.5
  const fz = ((z + half) / m.extent) * m.size - 0.5
  if (fx < 0 || fz < 0 || fx > m.size - 1 || fz > m.size - 1) return null
  const ix = Math.floor(fx)
  const iz = Math.floor(fz)
  const tx = fx - ix
  const tz = fz - iz
  const n = m.size
  const i = iz * n + ix
  const a = m.data[i]
  const b = m.data[Math.min(i + 1, iz * n + n - 1)]
  const c = m.data[Math.min(i + n, n * n - 1)]
  const d = m.data[Math.min(i + n + 1, n * n - 1)]
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz
}

/**
 * 細かい地図の差（m）。地図の外は 0。ふちの 60 m で 0 へなめらかに戻す（近くの地図との境目に段差を作らない）
 */
export function detailAt(m: DetailMap, x: number, z: number): number {
  const half = m.extent / 2
  const edge = half - Math.max(Math.abs(x), Math.abs(z))
  if (edge <= 0) return 0
  const fx = ((x + half) / m.extent) * m.size - 0.5
  const fz = ((z + half) / m.extent) * m.size - 0.5
  const n = m.size
  const ix = Math.max(0, Math.min(n - 2, Math.floor(fx)))
  const iz = Math.max(0, Math.min(n - 2, Math.floor(fz)))
  const tx = Math.max(0, Math.min(1, fx - ix))
  const tz = Math.max(0, Math.min(1, fz - iz))
  const i = iz * n + ix
  const d = m.data
  const a = d[i]
  const b = d[i + 1]
  const c = d[i + n]
  const e = d[i + n + 1]
  const v = a + (b - a) * tx + (c - a) * tz + (a - b - c + e) * tx * tz
  const k = edge < 60 ? edge / 60 : 1
  return (v - 128) * m.step * k
}
