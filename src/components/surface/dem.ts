import { useEffect, useState } from 'react'

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

export type Dem = { near: HeightMap; far: HeightMap; attribution: string[] }

/** 本物の地形がある天体 */
export const DEM_BODIES = new Set(['mars', 'earth'])

type Meta = {
  near: { size: number; extent_m: number; step: number; offset: number }
  far: { size: number; extent_m: number; step: number; offset: number }
  attribution: string[]
}

async function loadMap(url: string, m: Meta['near']): Promise<HeightMap> {
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
  const n = m.size
  const data = new Float32Array(n * n)
  for (let i = 0; i < n * n; i++) data[i] = (px[i * 4] * 256 + px[i * 4 + 1]) * m.step - m.offset
  return { size: n, extent: m.extent_m, data }
}

const cache = new Map<string, Promise<Dem>>()

export function loadDem(id: string): Promise<Dem> {
  let p = cache.get(id)
  if (!p) {
    const base = `${import.meta.env.BASE_URL}terrain/${id}`
    p = fetch(`${base}.json`)
      .then((r) => r.json() as Promise<Meta>)
      .then(async (meta) => ({
        near: await loadMap(`${base}_near.png`, meta.near),
        far: await loadMap(`${base}_far.png`, meta.far),
        attribution: meta.attribution,
      }))
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
  const [dem, setDem] = useState<Dem | null | false>(null)
  useEffect(() => {
    if (!DEM_BODIES.has(id)) {
      setDem(false)
      return
    }
    let alive = true
    setDem(null)
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
