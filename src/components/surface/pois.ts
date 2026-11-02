// ローバーで行ける「見どころ」。天体ごとの一覧（データだけ）。地形の形は terrain.ts、地図の印は RoverHud.tsx。
//  kind：
//   buttes   … 地層の見える台地状の丘が集まった所（火星：シャープ山のふもとのマレー・ビュートのような）
//   boulders … 黒っぽい角ばった岩がごろごろ集まった所（火星：キュリオシティのディンゴ・ギャップのような）
//   dunes    … 黒い砂の砂丘の列（火星：バグノルド砂丘のような）。岩はない

export type PoiKind = 'buttes' | 'boulders' | 'dunes'

export type Poi = {
  id: string
  kind: PoiKind
  /** 中心（着陸地点からの m、x 東・z 南） */
  x: number
  z: number
  /** 広さ（半径 m） */
  r: number
  name: { ja: string; en: string }
}

export const POIS: Record<string, Poi[]> = {
  mars: [
    { id: 'mars-buttes', kind: 'buttes', x: -760, z: 380, r: 270, name: { ja: '地層の丘', en: 'Layered buttes' } },
    { id: 'mars-boulders', kind: 'boulders', x: 520, z: -600, r: 130, name: { ja: '岩塊の野', en: 'Boulder field' } },
    { id: 'mars-dunes', kind: 'dunes', x: -260, z: -980, r: 300, name: { ja: '黒い砂丘', en: 'Dark dunes' } },
  ],
}

export const poisFor = (bodyId: string) => POIS[bodyId] ?? []

/** 見どころの中心からの近さ：中心 1、ふち（r）で 0。fade はふちでぼかす幅（r に対する割合） */
export function poiWeight(p: Poi, x: number, z: number, fade = 0.35) {
  const d = Math.hypot(x - p.x, z - p.z) / p.r
  if (d >= 1) return 0
  const t = Math.min(1, (1 - d) / fade)
  return t * t * (3 - 2 * t)
}
