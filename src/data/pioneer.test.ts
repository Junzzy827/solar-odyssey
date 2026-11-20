import { describe, expect, it } from 'vitest'
import { addToHold, addTrip, ALL_COST, canPay, checkSave, flow, goal, holdCapacity, LOG_MAX, markBuilt, NEW_SAVE, NONE, overallProgress, pay, rockYield, shortfall, STAGE_COUNT, STAGES, total, tripStats, type Trip } from './pioneer'

describe('pioneer rules', () => {
  it('fills the hold up to its capacity', () => {
    const a = addToHold(NONE, 'metal', 50, 60)
    expect(a.added).toBe(50)
    const b = addToHold(a.hold, 'ice', 30, 60)
    expect(b.added).toBe(10)
    expect(total(b.hold)).toBe(60)
    expect(addToHold(b.hold, 'gas', 5, 60).added).toBe(0)
  })

  it('gives bigger cargo ships more room', () => {
    expect(holdCapacity('sv01')).toBe(60)
    expect(holdCapacity('hakobune')).toBe(150)
  })

  it('maps rock types to resources', () => {
    expect(rockYield(0, 0.1).resource).toBe('ice')
    expect(rockYield(1, 0.1).resource).toBe('metal')
    expect(rockYield(2, 0.4).amount).toBeGreaterThan(rockYield(1, 0.4).amount)
  })

  it('pays stage costs and reports what is missing', () => {
    const cost = STAGES[2].cost
    const store = { metal: 50, ice: 0, gas: 10 }
    expect(canPay(store, cost)).toBe(false)
    expect(shortfall(store, cost)).toEqual({ metal: 0, ice: 0, gas: 20 })
    expect(pay({ metal: 60, ice: 1, gas: 30 }, cost)).toEqual({ metal: 10, ice: 1, gas: 0 })
  })

  it('needs about 8 trips with a 60 hold for the whole colony', () => {
    const sum = STAGES.reduce((n, s) => n + total(s.cost), 0)
    expect(Math.ceil(sum / 60)).toBe(8)
  })

  it('accepts only well-formed saves', () => {
    expect(checkSave(NEW_SAVE)).toBe(true)
    expect(checkSave({ ...NEW_SAVE, stage: 9 })).toBe(false)
    expect(checkSave({ ...NEW_SAVE, store: { metal: -1, ice: 0, gas: 0 } })).toBe(false)
    expect(checkSave(null)).toBe(false)
  })
})

describe('pioneer goal', () => {
  const base = { hold: { ...NONE }, store: { ...NONE }, stage: 0, colonyName: '' }
  it('starts by mining metal for the frame', () => {
    expect(goal(base, 60)).toEqual({ kind: 'mine', resource: 'metal' })
  })
  it('asks to deliver when the hold is full or already enough', () => {
    expect(goal({ ...base, hold: { metal: 0, ice: 60, gas: 0 } }, 60)).toEqual({ kind: 'deliver', full: true })
    expect(goal({ ...base, store: { metal: 30, ice: 0, gas: 0 }, hold: { metal: 30, ice: 0, gas: 0 } }, 60)).toEqual({ kind: 'deliver', full: false })
  })
  it('asks to build when the store can pay', () => {
    expect(goal({ ...base, store: { metal: 60, ice: 0, gas: 0 } }, 60)).toEqual({ kind: 'build' })
  })
  it('sends the player to Jupiter when gas is what is missing most', () => {
    expect(goal({ ...base, stage: 3 }, 60)).toEqual({ kind: 'gas' })
    expect(goal({ ...base, stage: 4, store: { metal: 40, ice: 0, gas: 0 } }, 60)).toEqual({ kind: 'mine', resource: 'ice' })
  })
  it('asks for a name once finished, then is done', () => {
    expect(goal({ ...base, stage: STAGES.length }, 60)).toEqual({ kind: 'name' })
    expect(goal({ ...base, stage: STAGES.length, colonyName: 'A' }, 60)).toEqual({ kind: 'done' })
  })
})

describe('記録と流れ（端末のグラフ）', () => {
  const a = (metal: number, ice = 0, gas = 0) => ({ metal, ice, gas })
  it('納品を記録し、古いものから捨てる', () => {
    let log: Trip[] = []
    for (let i = 0; i < LOG_MAX + 5; i++) log = addTrip(log, a(i), i)
    expect(log).toHaveLength(LOG_MAX)
    expect(log[0].a.metal).toBe(5)
  })
  it('建てた段階を最後の納品に付ける', () => {
    expect(markBuilt([], 'frame')).toEqual([])
    const log = markBuilt(markBuilt(addTrip([], a(60), 1), 'frame'), 'hull')
    expect(log[0].built).toEqual(['frame', 'hull'])
  })
  it('集めた量 = 使った + 倉庫 + 積み荷', () => {
    const f = flow({ stage: 2, store: a(10, 5), hold: a(0, 0, 7) })
    expect(f.used).toEqual(a(150))
    expect(f.gathered).toEqual(a(160, 5, 7))
  })
  it('全体の進み具合は、使える分だけ数える', () => {
    expect(overallProgress({ stage: 0, store: a(0), hold: a(0) })).toBe(0)
    expect(overallProgress({ stage: STAGE_COUNT, store: a(0), hold: a(0) })).toBe(1)
    // 金属は全部で 240。余分に持っていても 240 までしか数えない
    expect(overallProgress({ stage: 0, store: a(999), hold: a(0) })).toBeCloseTo(240 / total(ALL_COST))
  })
  it('記録のまとめ', () => {
    const st = tripStats([{ at: 0, a: a(20, 10) }, { at: 1, a: a(0, 0, 60) }])
    expect(st).toEqual({ count: 2, sum: a(20, 10, 60), average: 45, best: 60 })
    expect(tripStats([]).average).toBe(0)
  })
  it('古いセーブ（記録なし）も読める。壊れた記録は読まない', () => {
    const old = { v: 1, hold: a(0), store: a(0), stage: 0, colonyName: '', introSeen: true }
    expect(checkSave(old)).toBe(true)
    expect(checkSave({ ...old, log: [{ at: 1, a: a(1) }], trips: 1 })).toBe(true)
    expect(checkSave({ ...old, log: [{ at: 1, a: a(-1) }] })).toBe(false)
    expect(checkSave({ ...old, log: [{ at: 1, a: a(1), built: ['nope'] }] })).toBe(false)
  })
})
