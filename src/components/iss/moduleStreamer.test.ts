import { describe, expect, it } from 'vitest'
import station from '../../../public/models/iss/station.json'
import { ModuleStreamer, roomAt, seesThrough, type StreamModule } from './moduleStreamer'
import type { Vec3 } from './station'

// 本物のステーションの地図（tools/iss/textures.py が書く station.json）で、どの部屋を読むかを確かめる
const mods = station.modules as unknown as StreamModule[]
const center = (id: string) => station.modules.find((m) => m.id === id)!.center as Vec3

describe('roomAt', () => {
  it('箱の中の部屋を返し、口の所ではいまの部屋のまま（行ったり来たりしない）', () => {
    expect(roomAt([0, 0, -6], mods, 'node1')).toBe('us_lab')
    expect(roomAt([0, 0, -13.8], mods, 'us_lab')).toBe('node2')
    // デスティニーとハーモニーの境（z −10.76）の少し先：まだデスティニー（いまの部屋の箱は 0.15 m 広い）
    expect(roomAt([0, 0, -10.85], mods, 'us_lab')).toBe('us_lab')
    expect(roomAt([0, 0, -11.0], mods, 'us_lab')).toBe('node2')
    // どこにも入らない（外）：いまの部屋のまま
    expect(roomAt([30, 30, 30], mods, 'node3')).toBe('node3')
  })

  it('ノード 3 の下はキューポラ、左舷の先はビショップ', () => {
    expect(roomAt([-6.43, -2.6, 0], mods, 'node3')).toBe('cupola')
    expect(roomAt([-9.0, 0, 0], mods, 'node3')).toBe('bishop')
  })
})

describe('seesThrough', () => {
  const lab = mods.find((m) => m.id === 'us_lab')!
  const n2 = mods.find((m) => m.id === 'node2')!
  const toN2 = lab.hatches.find((h) => h.to === 'node2')!
  it('デスティニーの真ん中から、前の口ごしにハーモニーの前の口は見えるが、横の口（コロンバス）は見えない', () => {
    const fwd = n2.hatches.find((h) => h.to === null && h.normal[2] === -1) ?? n2.hatches[0]
    const col = n2.hatches.find((h) => h.to === 'columbus')!
    expect(seesThrough([0, 0, -6], toN2, fwd)).toBe(true)
    expect(seesThrough([0, 0, -6], toN2, col)).toBe(false)
  })
  it('口のすぐ前で斜めに見ると、横の口も見える', () => {
    const col = n2.hatches.find((h) => h.to === 'columbus')!
    expect(seesThrough([-0.45, 0, -10.2], toN2, col)).toBe(true)
  })
})

describe('ModuleStreamer', () => {
  it('デスティニーの入り口（後ろの口の前）：デスティニーとノード 1 を読み、ハーモニーはまだ', () => {
    const s = new ModuleStreamer(mods, 'us_lab')
    const p = s.update([0, 0.05, -2.75], 0)
    expect(p.current).toBe('us_lab')
    expect(p.want[0]).toBe('us_lab')
    expect(p.want).toContain('node1')
    expect(p.want).not.toContain('node2')
    expect(p.reason.node1).toBe('near')
  })

  it('ハーモニーの真ん中：となりの 3 部屋と、デスティニーの奥に口ごしに見えるユニティを読む', () => {
    const s = new ModuleStreamer(mods, 'node2')
    const p = s.update(center('node2'), 0)
    expect(p.current).toBe('node2')
    expect(new Set(p.want)).toEqual(new Set(['node2', 'us_lab', 'columbus', 'jpm', 'node1']))
    expect(p.reason.node1).toBe('portal')
  })

  it('ノード 3 の真ん中：となりの 5 部屋を全部読む（上限より少ない）', () => {
    const s = new ModuleStreamer(mods, 'node3')
    const p = s.update([-5.2, 0, 0], 0)
    for (const id of ['node3', 'node1', 'pmm', 'cupola', 'beam', 'bishop']) expect(p.want).toContain(id)
  })

  it('上限（maxLoaded）までにする。いる部屋がいちばん先で、近い口の部屋が先', () => {
    const s = new ModuleStreamer(mods, 'node3', { maxLoaded: 3 })
    const p = s.update([-6.0, 0, 0], 0)
    expect(p.want).toHaveLength(3)
    expect(p.want[0]).toBe('node3')
  })

  it('遠くなった部屋は keep 秒たってから捨てる', () => {
    const s = new ModuleStreamer(mods, 'us_lab', { keep: 3 })
    s.update([0, 0, -2.75], 0)
    // デスティニーの奥へ（ノード 1 の口から 7 m）
    let p = s.update([0, 0, -9.5], 1, ['us_lab', 'node1', 'node2'])
    expect(p.drop).not.toContain('node1')
    p = s.update([0, 0, -9.5], 2.5, ['us_lab', 'node1', 'node2'])
    expect(p.drop).not.toContain('node1')
    p = s.update([0, 0, -9.5], 4.5, ['us_lab', 'node1', 'node2'])
    expect(p.drop).toContain('node1')
    expect(p.drop).not.toContain('node2')
  })

  it('口をまたいだら、いる部屋が変わる', () => {
    const s = new ModuleStreamer(mods, 'us_lab')
    s.update([0, 0, -10.3], 0)
    const p = s.update([0, 0, -11.4], 0.5)
    expect(p.current).toBe('node2')
    expect(p.want).toContain('us_lab')
  })

  it('きぼうの保管室からキューポラへの道：口の真ん中を順に通る', () => {
    const s = new ModuleStreamer(mods, 'jlp')
    const r = s.route('jlp', 'cupola')
    expect(r.rooms).toEqual(['jlp', 'jpm', 'node2', 'us_lab', 'node1', 'node3', 'cupola'])
    expect(r.via).toHaveLength(6)
  })
})
