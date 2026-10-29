import { PLANETS } from './bodies'
import { SUN_RADIUS, bodyRadius, moonOrbitRadius, orbitRadius } from './scale'

// 天体の並べ方。距離のスライダー（0〜1）で、見やすく縮めた距離から本物に近い距離まで、なめらかに広げる。
// 0 は今までどおり（距離は対数で縮め、衛星は惑星のすぐそば）。
// 1 では、衛星は惑星の大きさに対して本物の比率になり、惑星どうしは本物の約20〜50分の1まで離れる。
// 惑星まで本物にすると海王星が今の約5000倍遠くなり、数値の細かさが足りずに表面が崩れるので、そこで止める。

/** 1天文単位（表示上の地球の半径に対する本物の比率） */
const AU = 23_481 * bodyRadius(6_371)
/** スライダーの右端で、惑星の距離を本物にどこまで近づけるか（対数で。冥王星がおよそ2万の距離に収まる） */
const PLANET_REALISM = 0.54
/** 隣りあう惑星の衛星の軌道どうしのすきま */
const GAP = 3

export type Layout = {
  /** 惑星の公転の半径 */
  orbit: Map<string, number>
  /** 衛星の公転の半径と、角速度にかける倍率（遠い軌道ほどゆっくり） */
  moon: Map<string, { radius: number; speed: number }>
  /** 小惑星帯の岩の、太陽からの距離 */
  belt: (au: number) => number
}

const moonSize = (km: number) => Math.max(0.12, bodyRadius(km))
const blend = (near: number, far: number, t: number) => near * (far / near) ** t
const planetDistance = (au: number, f: number) => blend(orbitRadius(au), au * AU, f * PLANET_REALISM)

const cache = new Map<number, Layout>()

export function computeLayout(distance: number): Layout {
  const f = Math.round(Math.min(1, Math.max(0, distance)) * 1000) / 1000
  const hit = cache.get(f)
  if (hit) return hit
  const orbit = new Map<string, number>()
  const moon = new Map<string, { radius: number; speed: number }>()
  let prevEdge = SUN_RADIUS * 1.3
  let marsPush = 0
  for (const p of PLANETS) {
    const r = bodyRadius(p.radiusKm)
    const base = r * (p.ring ? p.ring.outer : 1)
    let system = base
    p.moons.forEach((m, i) => {
      const near = moonOrbitRadius(base, i)
      const far = (r * m.distanceKm) / p.radiusKm
      const radius = blend(near, far, f)
      moon.set(m.id, { radius, speed: Math.sqrt(near / radius) })
      system = Math.max(system, radius + moonSize(m.radiusKm))
    })
    // 衛星の軌道が隣の惑星の衛星とぶつからないよう、必要なら少し外へずらす
    const wanted = planetDistance(p.distanceAu, f)
    const R = Math.max(wanted, prevEdge + system + GAP)
    if (p.id === 'mars') marsPush = R - wanted
    orbit.set(p.id, R)
    prevEdge = R + system
  }
  const layout: Layout = { orbit, moon, belt: (au) => planetDistance(au, f) + marsPush }
  cache.set(f, layout)
  return layout
}
