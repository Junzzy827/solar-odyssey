import { describe, expect, it } from 'vitest'
import { AU_KM, encounterRelative, heliocentric, propagate, speedKmS, GM_SUN_AU_DAY } from './trajectory'
import { VOYAGER2_CHECKS, VOYAGER2_TRAJECTORY as V2 } from './trajectories/voyager2'

const DAY = 86_400_000
const rows = V2.anchors.split(';').map((r) => r.split(',').map(Number))
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

describe('ボイジャー2号の道すじ', () => {
  it('円軌道を1周させると元に戻る', () => {
    const r = propagate([1, 0, 0], [0, Math.sqrt(GM_SUN_AU_DAY), 0], 2 * Math.PI / Math.sqrt(GM_SUN_AU_DAY), GM_SUN_AU_DAY)
    expect(dist(r.r, [1, 0, 0])).toBeLessThan(1e-9)
  })

  it('Horizons の値どうし：30日進めても0.003天文単位以内（惑星から遠いところ）', () => {
    let checked = 0
    for (let i = 0; i + 1 < rows.length; i++) {
      const a = rows[i]
      const b = rows[i + 1]
      const ms = b[0] * 1000
      const nearPlanet = V2.encounters.some((e) => Math.abs(e.ms - a[0] * 1000) < 60 * DAY || Math.abs(e.ms - ms) < 60 * DAY)
      if (nearPlanet || b[0] - a[0] > 31 * 86400) continue
      const s = propagate([a[1] * 1e-6, a[2] * 1e-6, a[3] * 1e-6], [a[4] * 1e-9, a[5] * 1e-9, a[6] * 1e-9], (b[0] - a[0]) / 86400, GM_SUN_AU_DAY)
      expect(dist(s.r, [b[1] * 1e-6, b[2] * 1e-6, b[3] * 1e-6])).toBeLessThan(0.003)
      checked++
    }
    expect(checked).toBeGreaterThan(60)
  })

  it('heliocentric は Horizons の値をなぞる（最接近の前後を除く）', () => {
    for (const a of rows) {
      const ms = a[0] * 1000
      if (V2.encounters.some((e) => Math.abs(e.ms - ms) < e.window * DAY)) continue
      const s = heliocentric(V2, ms)
      expect(dist(s.r, [a[1] * 1e-6, a[2] * 1e-6, a[3] * 1e-6])).toBeLessThan(0.01)
    }
  })

  it('惑星のそばの双曲線は、Horizons の惑星中心の位置と 3% 以内で合う', () => {
    for (const c of VOYAGER2_CHECKS) {
      const e = V2.encounters.find((x) => x.body === c.body)!
      const s = encounterRelative(e, c.ms)
      expect(dist(s.r, c.rel) / Math.hypot(...c.rel)).toBeLessThan(0.03)
    }
  })

  it('木星のスイングバイで、太陽から見た速さがぐんと上がる', () => {
    const j = V2.encounters[1]
    const before = speedKmS(heliocentric(V2, j.ms - 30 * DAY))
    const after = speedKmS(heliocentric(V2, j.ms + 30 * DAY))
    expect(before).toBeLessThan(12)
    expect(after).toBeGreaterThan(18)
  })

  it('最接近の距離は本物どおり（木星 約72万km、海王星 約2.9万km）', () => {
    expect(Math.round(Math.hypot(...V2.encounters[1].rel.slice(0, 3)) / 1000)).toBe(721)
    expect(Math.round(Math.hypot(...V2.encounters[4].rel.slice(0, 3)) / 1000)).toBe(29)
    expect(AU_KM).toBeGreaterThan(1e8)
  })
})
