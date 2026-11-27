import { describe, expect, it } from 'vitest'
import { altitudeAt, downrangeAt, pitchAt, rollAt, shotAt, ssmeThrust, srbThrust, LAUNCH_CUTS, SRB_SEP, SSME_START, SSME_STAGGER, STS61_LIFTOFF } from './launchPlan'

describe('shuttle launch plan', () => {
  it('liftoff time is 1993-12-02 4:27 a.m. EST', () => {
    expect(new Date(STS61_LIFTOFF).toISOString()).toBe('1993-12-02T09:27:00.000Z')
  })

  it('climbs steadily and reaches about 45 km at booster separation', () => {
    let prev = -1
    for (let t = 0; t <= 140; t += 0.5) {
      const h = altitudeAt(t)
      expect(h).toBeGreaterThanOrEqual(prev)
      prev = h
    }
    expect(altitudeAt(SRB_SEP)).toBeCloseTo(45_000, -2)
    // 塔（甲板から 約 92 m）は 7 秒ほどで越える
    expect(altitudeAt(6)).toBeLessThan(92)
    expect(altitudeAt(8)).toBeGreaterThan(92)
    expect(downrangeAt(9)).toBe(0)
  })

  it('stays upright until it clears the tower, then leans east', () => {
    expect(pitchAt(5)).toBe(0)
    expect(pitchAt(60)).toBeGreaterThan(0.2)
    expect(pitchAt(120)).toBeGreaterThan(pitchAt(60))
    expect(pitchAt(120)).toBeLessThan(Math.PI / 2)
  })

  it('rolls once between 8 and 20 s', () => {
    expect(rollAt(5)).toBe(0)
    expect(rollAt(14)).toBeGreaterThan(0.3)
    expect(rollAt(25)).toBe(1)
  })

  it('starts the main engines one after another, then the boosters at zero', () => {
    // 3 番（i = 2）が先
    expect(ssmeThrust(2, SSME_START + 0.05)).toBeGreaterThan(0)
    expect(ssmeThrust(0, SSME_START + 0.05)).toBe(0)
    expect(ssmeThrust(0, SSME_START + 2 * SSME_STAGGER + 3)).toBeCloseTo(1)
    expect(srbThrust(-0.1)).toBe(0)
    expect(srbThrust(1)).toBeGreaterThan(0.9)
    expect(srbThrust(SRB_SEP + 1)).toBe(0)
  })

  it('maps every moment to a film cut in order', () => {
    for (let i = 1; i < LAUNCH_CUTS.length; i++) expect(LAUNCH_CUTS[i].at).toBeGreaterThan(LAUNCH_CUTS[i - 1].at)
    expect(shotAt(-20).shot).toBe('seat')
    expect(shotAt(0).shot).toBe('wide')
    expect(shotAt(SRB_SEP).shot).toBe('sep')
  })
})
