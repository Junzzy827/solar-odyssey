import { beforeAll, describe, expect, it } from 'vitest'

// 状態の読み込みは URL と記録を見るので、テストでは空の代わりを置いてから読む
type Mod = typeof import('./shuttle')
let m: Mod
beforeAll(async () => {
  const g = globalThis as unknown as Record<string, unknown>
  g.location ??= { search: '', hash: '', href: 'http://localhost/' }
  const map = new Map<string, string>()
  g.localStorage ??= { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k), key: () => null, length: 0 }
  m = await import('./shuttle')
})

// 軌道の章の段階：扉 → 開いていく → ハッブルが来る → つかむ → 立てる → おわり。ボタンは、その段階で届いたときだけ効く
describe('shuttle orbit chapter steps', () => {
  it('goes doors → opening → approach → grab → berth → done, and remembers Hubble', () => {
    const { berthHubble, grabHubble, openBayDoors, setArmReady, setOrbitStep, useShuttle } = m
    useShuttle.setState({ phase: 'cabin', orbit: 'doors', armReady: false, hubbleDone: false })
    grabHubble()
    expect(useShuttle.getState().orbit).toBe('doors')
    openBayDoors()
    expect(useShuttle.getState().orbit).toBe('opening')
    openBayDoors()
    expect(useShuttle.getState().orbit).toBe('opening')
    setOrbitStep('approach')
    setOrbitStep('grab')
    // 届く前は押しても何も起きない
    grabHubble()
    expect(useShuttle.getState().orbit).toBe('grab')
    setArmReady(true)
    grabHubble()
    expect(useShuttle.getState()).toMatchObject({ orbit: 'berth', armReady: false })
    berthHubble()
    expect(useShuttle.getState().orbit).toBe('berth')
    setArmReady(true)
    berthHubble()
    expect(useShuttle.getState()).toMatchObject({ orbit: 'done', armReady: false, hubbleDone: true })
  })

  it('ignores the buttons outside the cabin', () => {
    const { openBayDoors, useShuttle } = m
    useShuttle.setState({ phase: 'pad', orbit: 'doors', armReady: false })
    openBayDoors()
    expect(useShuttle.getState().orbit).toBe('doors')
  })
})
