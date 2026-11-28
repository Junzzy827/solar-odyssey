import type { Vec3 } from './station'

// どのモジュールを読んでおくかを決める（three を使わない、計算だけの部分。テストは moduleStreamer.test.ts）。
//   1. いる部屋：目の位置が入っている箱（いまの部屋の箱は margin だけ広げる：口の所で行ったり来たりしない）
//   2. となり：いる部屋の口のうち、near m より近い口の先の部屋
//   3. 口ごしに見える部屋：となりの部屋の、さらに先の口が、いる部屋の口を通して見えるとき（portalRange m まで）
//   4. いらなくなった部屋は、keep 秒たってから捨てる（口の前で読んだり捨てたりをくり返さない）
// 優先の順（いる部屋 → 近いとなり → 口ごし）に並べ、maxLoaded までにする（スマホのメモリ）

export type StreamHatch = { to: string | null; center: Vec3; normal: Vec3 }
export type StreamModule = { id: string; bboxMin: Vec3; bboxMax: Vec3; hatches: StreamHatch[] }

export type StreamOptions = {
  /** となりの口がこれより近いと読む（m） */
  near: number
  /** いらなくなってから捨てるまで（秒） */
  keep: number
  /** 口ごしに見える部屋を読む距離（m） */
  portalRange: number
  /** 口の穴の半径（m）。CBM の口は 1.27 m 角 */
  hatchRadius: number
  /** 一度に読んでおく部屋の数の上限 */
  maxLoaded: number
  /** いまの部屋の箱を広げる幅（m） */
  margin: number
}

export const STREAM_DEFAULTS: StreamOptions = { near: 4, keep: 3, portalRange: 14, hatchRadius: 0.62, maxLoaded: 7, margin: 0.15 }

export type StreamReason = 'room' | 'near' | 'portal'
export type StreamPlan = {
  /** いる部屋 */
  current: string
  /** 読んでおく部屋（優先の順） */
  want: string[]
  /** 捨てる部屋（読んでいる部屋のうち、keep 秒より長くいらなかったもの） */
  drop: string[]
  reason: Record<string, StreamReason>
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

function inBox(p: Vec3, m: StreamModule, margin: number) {
  for (let i = 0; i < 3; i++) if (p[i] < m.bboxMin[i] - margin || p[i] > m.bboxMax[i] + margin) return false
  return true
}

const volume = (m: StreamModule) => (m.bboxMax[0] - m.bboxMin[0]) * (m.bboxMax[1] - m.bboxMin[1]) * (m.bboxMax[2] - m.bboxMin[2])

/** 目の位置 p がどの部屋にいるか。いまの部屋の箱に（少し広げて）入っていればそのまま。どこにも入らなければ、いまの部屋 */
export function roomAt(p: Vec3, mods: readonly StreamModule[], current: string, margin = STREAM_DEFAULTS.margin): string {
  const cur = mods.find((m) => m.id === current)
  if (cur && inBox(p, cur, margin)) return current
  let best: StreamModule | null = null
  for (const m of mods) if (inBox(p, m, 0) && (!best || volume(m) < volume(best))) best = m
  return best ? best.id : current
}

/** 点 eye から点 q への線分が、口（中心 c・向き n・半径 r の円板）を通るか */
export function throughHatch(eye: Vec3, q: Vec3, c: Vec3, n: Vec3, r: number) {
  const d = sub(q, eye)
  const denom = dot(d, n)
  if (Math.abs(denom) < 1e-6) return false
  const t = dot(sub(c, eye), n) / denom
  if (t <= 1e-4 || t >= 1 - 1e-4) return false
  const hit: Vec3 = [eye[0] + d[0] * t, eye[1] + d[1] * t, eye[2] + d[2] * t]
  return dist(hit, c) <= r
}

/** 口 b の真ん中と、ふちの 4 点（口の面の上） */
function rim(b: StreamHatch, r: number): Vec3[] {
  const n = b.normal
  // 口の面の 2 つの向き（向きは軸にそろっているので、ほかの 2 軸）
  const u: Vec3 = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
  const w: Vec3 = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]]
  const c = b.center
  const pts: Vec3[] = [c]
  for (const [a, k] of [
    [u, r],
    [u, -r],
    [w, r],
    [w, -r],
  ] as [Vec3, number][])
    pts.push([c[0] + a[0] * k, c[1] + a[1] * k, c[2] + a[2] * k])
  return pts
}

/** eye から、口 a（いる部屋 → となり）を通して、口 b（となり → その先）が少しでも見えるか */
export function seesThrough(eye: Vec3, a: StreamHatch, b: StreamHatch, r = STREAM_DEFAULTS.hatchRadius) {
  return rim(b, r * 0.9).some((q) => throughHatch(eye, q, a.center, a.normal, r))
}

export class ModuleStreamer {
  readonly opts: StreamOptions
  current: string
  private readonly mods: StreamModule[]
  private readonly byId: Map<string, StreamModule>
  private readonly lastWanted = new Map<string, number>()

  constructor(mods: readonly StreamModule[], start: string, opts: Partial<StreamOptions> = {}) {
    this.mods = [...mods]
    this.byId = new Map(mods.map((m) => [m.id, m]))
    this.current = start
    this.opts = { ...STREAM_DEFAULTS, ...opts }
  }

  /**
   * 目の位置 eye（m）、いまの時刻 now（秒）、読んでいる（読みかけも含む）部屋 loaded から、読む部屋・捨てる部屋を決める
   */
  update(eye: Vec3, now: number, loaded: Iterable<string> = []): StreamPlan {
    const o = this.opts
    this.current = roomAt(eye, this.mods, this.current, o.margin)
    const cur = this.byId.get(this.current)
    const reason: Record<string, StreamReason> = { [this.current]: 'room' }
    const near: [string, number][] = []
    const portal: [string, number][] = []
    if (cur) {
      for (const h of cur.hatches) {
        if (!h.to || !this.byId.has(h.to)) continue
        const d = dist(eye, h.center)
        if (d < o.near && !(h.to in reason)) {
          reason[h.to] = 'near'
          near.push([h.to, d])
        }
      }
      // 口ごし：となり（どの距離でも）の先の口が、いる部屋の口を通して見える
      for (const a of cur.hatches) {
        if (!a.to) continue
        const nb = this.byId.get(a.to)
        if (!nb) continue
        if (dist(eye, a.center) > o.portalRange) continue
        let seen = false
        for (const b of nb.hatches) {
          if (!b.to || b.to === this.current || !this.byId.has(b.to)) continue
          const d = dist(eye, b.center)
          if (d > o.portalRange) continue
          if (!seesThrough(eye, a, b, o.hatchRadius)) continue
          seen = true
          if (!(b.to in reason)) {
            reason[b.to] = 'portal'
            portal.push([b.to, d])
          }
        }
        // 口ごしの先が見えるなら、そのとなり自身も見えている（near より遠くても読む）
        if (seen && !(a.to in reason)) {
          reason[a.to] = 'portal'
          portal.push([a.to, dist(eye, a.center)])
        }
      }
    }
    near.sort((x, y) => x[1] - y[1])
    portal.sort((x, y) => x[1] - y[1])
    const want = [this.current, ...near.map((x) => x[0]), ...portal.map((x) => x[0])].slice(0, o.maxLoaded)
    for (const id of Object.keys(reason)) if (!want.includes(id)) delete reason[id]
    for (const id of want) this.lastWanted.set(id, now)
    const drop: string[] = []
    for (const id of loaded) {
      if (want.includes(id)) continue
      const t = this.lastWanted.get(id)
      if (t === undefined || now - t > o.keep) drop.push(id)
    }
    return { current: this.current, want, drop, reason }
  }

  /** 部屋から部屋への道（口の真ん中を通る）。BFS。見つからなければ空 */
  route(from: string, to: string): { via: Vec3[]; rooms: string[] } {
    if (from === to) return { via: [], rooms: [from] }
    const prev = new Map<string, { id: string; hatch: StreamHatch }>()
    const seen = new Set([from])
    const q = [from]
    while (q.length) {
      const id = q.shift()!
      const m = this.byId.get(id)
      if (!m) continue
      for (const h of m.hatches) {
        if (!h.to || seen.has(h.to) || !this.byId.has(h.to)) continue
        seen.add(h.to)
        prev.set(h.to, { id, hatch: h })
        if (h.to === to) {
          const via: Vec3[] = []
          const rooms = [to]
          let k = to
          while (k !== from) {
            const p = prev.get(k)!
            via.unshift(p.hatch.center)
            rooms.unshift(p.id)
            k = p.id
          }
          return { via, rooms }
        }
        q.push(h.to)
      }
    }
    return { via: [], rooms: [] }
  }
}
