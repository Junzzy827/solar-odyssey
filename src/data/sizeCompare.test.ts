import { describe, expect, it } from 'vitest'
import { across, defaultPicks, lineup } from './sizeCompare'

describe('size compare', () => {
  it('lines things up from small to large without overlapping', () => {
    const items = lineup('jupiter', ['earth', 'moon'])
    expect(items.map((i) => i.id)).toEqual(['moon', 'earth', 'jupiter'])
    for (let i = 1; i < items.length; i++) expect(items[i].x - items[i].width / 2).toBeGreaterThan(items[i - 1].x + items[i - 1].width / 2)
  })
  it('counts how many fit across', () => {
    const [moon, earth, jupiter] = lineup('jupiter', ['earth', 'moon'])
    expect(across(jupiter, earth)).toBe(11)
    expect(across(earth, moon)).toBe(3.5)
  })
  it('shows Everest next to tiny moons, and the Moon next to small worlds', () => {
    expect(defaultPicks('phobos')).toEqual(['earth', 'moon', 'everest'])
    expect(defaultPicks('mars')).toEqual(['earth', 'moon'])
    expect(defaultPicks('jupiter')).toContain('sun')
    const [everest, phobos] = lineup('phobos', ['everest'])
    expect(everest.kind).toBe('mountain')
    expect(phobos.height / everest.height).toBeGreaterThan(2)
  })
})
