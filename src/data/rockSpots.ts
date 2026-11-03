// 採集できる岩の置き場所。着陸地点のまわりと、ローバーで行ける「見どころ」（components/surface/pois.ts）のまわり。
// 見どころには、その地形らしい岩を置く（火星の地層の丘には泥岩や石こうの脈、など）。
// 着陸地点のまわりに無い岩は、見どころまで走って行かないと採れない。

import { samplesFor } from './rockSamples'
import { poisFor } from '../components/surface/pois'

/** 天体ごと：着陸地点のまわりで採れる岩（書いていない天体は、その天体の岩ぜんぶ） */
const NEAR: Record<string, string[]> = {
  mars: ['basalt', 'mudstone'],
  moon: ['mare-basalt', 'breccia'],
}

/** 見どころの id → そこで採れる岩 */
const AT_POI: Record<string, string[]> = {
  'mars-buttes': ['mudstone', 'vein'],
  'mars-boulders': ['basalt', 'meteorite'],
  'mars-dunes': ['blueberry'],
  'moon-crater': ['anorthosite', 'breccia'],
  'moon-rille': ['mare-basalt', 'orange-soil'],
  'moon-scarp': ['anorthosite'],
}

/** 見どころの地形 → 氷の天体で採れる岩（割れ目や混ざった地形には、下から上がってきた塩の筋） */
const ICY_BY_KIND: Record<string, string[]> = {
  ridges: ['salt', 'ice'],
  chaos: ['salt', 'ice'],
  grooves: ['salt', 'ice'],
  polygons: ['ice'],
  crater: ['ice'],
  scarp: ['ice'],
}

export type RockSpot = { poi: string | null; kinds: string[] }

/** 天体の岩の置き場所：着陸地点（poi: null）と見どころごとの、置く岩の種類 */
export function rockSpots(bodyId: string): RockSpot[] {
  const all = samplesFor(bodyId).map((s) => s.id)
  const has = (ids: string[]) => ids.filter((id) => all.includes(id))
  const pois = poisFor(bodyId)
  const icy = all.includes('ice')
  const spots: RockSpot[] = pois.map((p) => {
    const set = AT_POI[p.id] ?? (icy ? ICY_BY_KIND[p.kind] : undefined) ?? all
    return { poi: p.id, kinds: has(set).length ? has(set) : all }
  })
  // 着陸地点：決めてある天体はそれ。氷の天体で見どころに塩があれば、近くは氷だけ
  let near = NEAR[bodyId] ? has(NEAR[bodyId]) : all
  if (!NEAR[bodyId] && icy && spots.some((s) => s.kinds.includes('salt'))) near = ['ice']
  return [{ poi: null, kinds: near }, ...spots]
}

/** 図鑑のヒント用：この岩が置いてある見どころ（天体ごと） */
export function spotsOf(bodyId: string, sampleId: string) {
  const pois = poisFor(bodyId)
  return rockSpots(bodyId)
    .filter((s) => s.poi && s.kinds.includes(sampleId))
    .map((s) => pois.find((p) => p.id === s.poi)!)
}

/** 着陸地点のまわりにもあるか */
export const nearLander = (bodyId: string, sampleId: string) => rockSpots(bodyId)[0].kinds.includes(sampleId)
