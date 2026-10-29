import { PLANETS, SUN } from './bodies'
import { CUBE_AU, CUBE_EDGE } from './cube'
import { SUN_RADIUS, bodyRadius, moonOrbitRadius, orbitRadius } from './scale'

// 天体の並べ方。距離のスライダー（0〜1）で、見やすく縮めた距離から本物に近い距離まで、なめらかに広げる。
// 0 は今までどおり（距離は対数で縮め、衛星は惑星のすぐそば）。
// 1 では、衛星は惑星の大きさに対して本物の比率になり、惑星どうしは本物の約20〜50分の1まで離れる。
// 惑星まで本物にすると海王星が今の約5000倍遠くなり、数値の細かさが足りずに表面が崩れるので、そこで止める。
//
// 大きさのスライダー（0〜1）は、地球の大きさを変えずに、ほかの天体を本物の比率に近づける。
// 0 は立方根で差を縮めた今の大きさ、1 は本物の比率（太陽は地球の約109倍、月は約4分の1）。
// 小さな衛星は見失わないよう一定の大きさより小さくしない。太陽が大きくなるぶん、惑星の軌道は外へずらす。

/** 1天文単位（表示上の地球の半径に対する本物の比率） */
const AU = 23_481 * bodyRadius(6_371)
/** スライダーの右端で、惑星の距離を本物にどこまで近づけるか（対数で。冥王星がおよそ2万の距離に収まる） */
const PLANET_REALISM = 0.54
/** 隣りあう惑星の衛星の軌道どうしのすきま */
const GAP = 3
/** 小惑星帯の内側と外側（天文単位） */
export const BELT_AU = { inner: 2.2, outer: 3.3 }

export type Layout = {
  /** 太陽の半径 */
  sun: number
  /** 惑星と衛星の半径 */
  radius: Map<string, number>
  /** 惑星の公転の半径 */
  orbit: Map<string, number>
  /** 衛星の公転の半径と、角速度にかける倍率（遠い軌道ほどゆっくり） */
  moon: Map<string, { radius: number; speed: number }>
  /** 小惑星帯の岩の、太陽からの距離 */
  belt: (au: number) => number
}

/** 小さな衛星の、表示上のいちばん小さい半径 */
const MIN_MOON = 0.12
/** 本物の比率での太陽の半径（地球の半径の約109倍） */
const SUN_REAL = bodyRadius(6_371) * (SUN.radiusKm / 6_371)

const blend = (near: number, far: number, t: number) => near * (far / near) ** t
/** 大きさのスライダーでの半径：立方根で縮めた大きさ（size 0）から本物の比率（size 1）まで。地球は変わらない */
export const sizedRadius = (km: number, size: number) => blend(bodyRadius(km), bodyRadius(6_371) * (km / 6_371), size)
export const sunRadius = (size: number) => blend(SUN_RADIUS, SUN_REAL, size)

const cache = new Map<string, Layout>()
const clamp01 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000

export function computeLayout(distance: number, size = 0): Layout {
  const f = clamp01(distance)
  const s = clamp01(size)
  const key = `${f}|${s}`
  const hit = cache.get(key)
  if (hit) return hit
  const sun = sunRadius(s)
  // 太陽が大きくなったぶん、近づける限界（半径の1.3倍）ごと惑星を外へずらす。
  // 距離を本物に近づけると惑星はもともと太陽から十分に離れるので、ずらす量は減らしていく
  const sunPush = (sun - SUN_RADIUS) * 1.3 * (1 - f)
  const planetDistance = (au: number) => blend(orbitRadius(au) + sunPush, au * AU, f * PLANET_REALISM)
  const radius = new Map<string, number>()
  const orbit = new Map<string, number>()
  const moon = new Map<string, { radius: number; speed: number }>()
  let prevEdge = sun * 1.3
  let marsPush = 0
  for (const p of PLANETS) {
    // 木星の衛星が、小惑星帯や謎の立方体船にかからないように
    if (p.id === 'jupiter') prevEdge = Math.max(prevEdge, planetDistance(Math.max(BELT_AU.outer, CUBE_AU)) + marsPush + CUBE_EDGE / 2)
    const r = sizedRadius(p.radiusKm, s)
    radius.set(p.id, r)
    const ring = p.ring ? p.ring.outer : 1
    const base = r * ring
    let system = base
    p.moons.forEach((m, i) => {
      const mr = Math.max(MIN_MOON, sizedRadius(m.radiusKm, s))
      radius.set(m.id, mr)
      const near = moonOrbitRadius(base, i)
      const far = (r * m.distanceKm) / p.radiusKm
      const at = blend(near, far, f)
      // 回る速さは、今の大きさ・距離のときの軌道を基準に、遠いほどゆっくり
      const usual = moonOrbitRadius(bodyRadius(p.radiusKm) * ring, i)
      moon.set(m.id, { radius: at, speed: Math.sqrt(usual / at) })
      system = Math.max(system, at + mr)
    })
    // 衛星の軌道が隣の惑星の衛星とぶつからないよう、必要なら少し外へずらす
    const wanted = planetDistance(p.distanceAu)
    const R = Math.max(wanted, prevEdge + system + GAP)
    if (p.id === 'mars') marsPush = R - wanted
    orbit.set(p.id, R)
    prevEdge = R + system
  }
  const layout: Layout = { sun, radius, orbit, moon, belt: (au) => planetDistance(au) + marsPush }
  cache.set(key, layout)
  return layout
}
