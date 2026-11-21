import { describe, expect, it } from 'vitest'
import { captionScene, flybyNumbers, poleOf, probeNow } from './probeView'
import { VOYAGER2_TRAJECTORY as V2 } from './trajectories/voyager2'

const DAY = 86_400_000

describe('模型の画面の数字', () => {
  it('木星のスイングバイ：太陽から見て約10km/sから20km/s以上へ、木星から見た速さは前後で同じ', () => {
    const j = V2.encounters[1]
    const n = flybyNumbers(V2, j)
    expect(n.speedBefore).toBeGreaterThan(8)
    expect(n.speedBefore).toBeLessThan(12)
    expect(n.speedAfter).toBeGreaterThan(17)
    expect(Math.round(n.closestKm / 10000)).toBe(72)
    expect(n.turnPlanet).toBeGreaterThan(30)
  })

  it('海王星は雲の上 約5,000km をかすめた', () => {
    const n = flybyNumbers(V2, V2.encounters[4])
    expect(n.altitudeKm).toBeGreaterThan(4000)
    expect(n.altitudeKm).toBeLessThan(5500)
  })

  it('字幕の場面：打ち上げ→巡航→木星の最接近→海王星のあと', () => {
    expect(captionScene(V2, probeNow(V2, V2.encounters[0].ms + 0.1 * DAY)).kind).toBe('launch')
    expect(captionScene(V2, probeNow(V2, V2.encounters[0].ms + 300 * DAY)).kind).toBe('cruise')
    expect(captionScene(V2, probeNow(V2, V2.encounters[1].ms))).toEqual({ kind: 'flyby', body: 'jupiter', step: 2 })
    expect(captionScene(V2, probeNow(V2, V2.encounters[4].ms + 400 * DAY)).kind).toBe('beyond')
  })

  it('土星の北極は黄道の北の側に、天王星の北極は黄道の面の近くに寝ている', () => {
    expect(poleOf('saturn')[2]).toBeGreaterThan(0.8)
    expect(Math.abs(poleOf('uranus')[2])).toBeLessThan(0.2)
  })
})
