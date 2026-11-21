// 本物の探査機の道すじ（NASA JPL Horizons の値から）。
// 値は「ところどころの位置と速度」だけを持ち、そのあいだはケプラーの法則（重力が1つだけのときの動き）で進める。
//  ・ふだんは太陽の重力だけ（30日おきの値から進めるので、木星などに引かれるずれは小さい）
//  ・惑星のそばでは、その惑星の重力で曲がる道（双曲線）を、最接近の本物の位置と速度から進める
//  ・その境目は、なめらかにまぜる
// 座標は黄道（J2000）。x は春分の方向、z は黄道の北。

export type Encounter = {
  /** 惑星の id（data/bodies の PLANETS） */
  body: string
  /** 最接近の時刻（打ち上げは、Horizons に値がある最初の時刻） */
  ms: number
  /** 惑星の重力の強さ GM（km³/s²） */
  gm: number
  /** 惑星の重力で進める範囲（日、前後） */
  window: number
  /** 惑星中心から見た探査機の位置（km）と速度（km/s） */
  rel: number[]
  /** 惑星の、太陽中心の位置（天文単位）と速度（天文単位／日） */
  planet: number[]
}

export type Trajectory = {
  anchors: string
  encounters: Encounter[]
}

export const AU_KM = 149_597_870.7
const DAY_S = 86_400
const DAY_MS = 86_400_000
/** 太陽の GM（天文単位³／日²） */
export const GM_SUN_AU_DAY = 2.959122082855911e-4

type Vec = [number, number, number]
export type State = { r: Vec; v: Vec }

/** ストゥンプ関数 C(z)・S(z)（楕円・放物線・双曲線をひとつの式で扱うため） */
function stumpff(z: number) {
  if (z > 1e-6) {
    const s = Math.sqrt(z)
    return { C: (1 - Math.cos(s)) / z, S: (s - Math.sin(s)) / (s * s * s) }
  }
  if (z < -1e-6) {
    const s = Math.sqrt(-z)
    return { C: (Math.cosh(s) - 1) / -z, S: (Math.sinh(s) - s) / (s * s * s) }
  }
  return { C: 1 / 2 - z / 24, S: 1 / 6 - z / 120 }
}

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a: Vec) => Math.sqrt(dot(a, a))

/** ケプラーの法則で dt だけ進める（普遍変数の方法。単位は mu・r・v・dt でそろえる） */
export function propagate(r0: Vec, v0: Vec, dt: number, mu: number): State {
  if (dt === 0) return { r: [...r0], v: [...v0] }
  const r0n = len(r0)
  const vr0 = dot(r0, v0) / r0n
  const alpha = 2 / r0n - dot(v0, v0) / mu
  const sq = Math.sqrt(mu)
  // 最初の見当（Vallado の方法）
  let x: number
  if (alpha > 1e-9) x = sq * dt * alpha
  else if (alpha < -1e-9) {
    const a = 1 / alpha
    const sgn = Math.sign(dt)
    x = sgn * Math.sqrt(-a) * Math.log((-2 * mu * alpha * dt) / (dot(r0, v0) + sgn * Math.sqrt(-mu * a) * (1 - r0n * alpha)))
  } else x = (sq * dt) / r0n
  if (!Number.isFinite(x)) x = (sq * dt) / r0n
  for (let i = 0; i < 60; i++) {
    const z = alpha * x * x
    const { C, S } = stumpff(z)
    const F = ((r0n * vr0) / sq) * x * x * C + (1 - alpha * r0n) * x * x * x * S + r0n * x - sq * dt
    const dF = ((r0n * vr0) / sq) * x * (1 - z * S) + (1 - alpha * r0n) * x * x * C + r0n
    const step = F / dF
    x -= step
    if (Math.abs(step) < 1e-12 * Math.max(1, Math.abs(x))) break
  }
  const z = alpha * x * x
  const { C, S } = stumpff(z)
  const f = 1 - ((x * x) / r0n) * C
  const g = dt - (x * x * x * S) / sq
  const r: Vec = [f * r0[0] + g * v0[0], f * r0[1] + g * v0[1], f * r0[2] + g * v0[2]]
  const rn = len(r)
  const df = (sq / (rn * r0n)) * (alpha * x * x * x * S - x)
  const dg = 1 - ((x * x) / rn) * C
  return { r, v: [df * r0[0] + dg * v0[0], df * r0[1] + dg * v0[1], df * r0[2] + dg * v0[2]] }
}

type Anchor = { ms: number; r: Vec; v: Vec }

const parsed = new WeakMap<Trajectory, Anchor[]>()
function anchorsOf(t: Trajectory) {
  let list = parsed.get(t)
  if (!list) {
    list = t.anchors.split(';').map((row) => {
      const n = row.split(',').map(Number)
      return { ms: n[0] * 1000, r: [n[1] * 1e-6, n[2] * 1e-6, n[3] * 1e-6] as Vec, v: [n[4] * 1e-9, n[5] * 1e-9, n[6] * 1e-9] as Vec }
    })
    parsed.set(t, list)
  }
  return list
}

/** 道すじの始まり（Horizons に値がある最初の時刻） */
export const trajectoryStart = (t: Trajectory) => t.encounters[0].ms

/** その時刻の惑星の太陽中心の位置と速度（最接近のときの本物の値から、太陽の重力で進める） */
export function encounterPlanet(e: Encounter, ms: number): State {
  return propagate(e.planet.slice(0, 3) as Vec, e.planet.slice(3, 6) as Vec, (ms - e.ms) / DAY_MS, GM_SUN_AU_DAY)
}

/** 惑星中心から見た探査機（km、km/s）。最接近の値から、惑星の重力で進める */
export function encounterRelative(e: Encounter, ms: number): State {
  return propagate(e.rel.slice(0, 3) as Vec, e.rel.slice(3, 6) as Vec, (ms - e.ms) / 1000, e.gm)
}

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return k * k * (3 - 2 * k)
}

/** 太陽の重力だけで進めた位置：同じ区間（惑星と惑星のあいだ）の、いちばん近い値から */
function cruise(t: Trajectory, ms: number): State {
  const list = anchorsOf(t)
  const enc = t.encounters
  let leg = 0
  while (leg + 1 < enc.length && enc[leg + 1].ms <= ms) leg++
  const from = enc[leg]
  const to = enc[leg + 1]
  const lo = from.ms + from.window * DAY_MS
  const hi = to ? to.ms - to.window * DAY_MS : Infinity
  let best: Anchor | null = null
  for (const a of list) {
    if (a.ms < lo || a.ms > hi) continue
    if (!best || Math.abs(a.ms - ms) < Math.abs(best.ms - ms)) best = a
  }
  if (!best) best = list.reduce((b, a) => (Math.abs(a.ms - ms) < Math.abs(b.ms - ms) ? a : b))
  return propagate(best.r, best.v, (ms - best.ms) / DAY_MS, GM_SUN_AU_DAY)
}

/** 惑星のそばでの位置（太陽中心、天文単位・天文単位／日） */
function near(e: Encounter, ms: number): State {
  const p = encounterPlanet(e, ms)
  const q = encounterRelative(e, ms)
  return {
    r: [p.r[0] + q.r[0] / AU_KM, p.r[1] + q.r[1] / AU_KM, p.r[2] + q.r[2] / AU_KM],
    v: [p.v[0] + (q.v[0] * DAY_S) / AU_KM, p.v[1] + (q.v[1] * DAY_S) / AU_KM, p.v[2] + (q.v[2] * DAY_S) / AU_KM],
  }
}

/** いちばん近い惑星の通過（打ち上げを含む）と、そこからの日数 */
export function nearestEncounter(t: Trajectory, ms: number) {
  let best = t.encounters[0]
  for (const e of t.encounters) if (Math.abs(e.ms - ms) < Math.abs(best.ms - ms)) best = e
  return { encounter: best, days: (ms - best.ms) / DAY_MS }
}

/** その時刻の探査機の、太陽中心の位置（天文単位）と速度（天文単位／日）。黄道座標 */
export function heliocentric(t: Trajectory, ms: number): State {
  ms = Math.max(ms, trajectoryStart(t))
  const { encounter, days } = nearestEncounter(t, ms)
  const w = 1 - smooth(encounter.window * 0.5, encounter.window, Math.abs(days))
  if (w >= 1) return near(encounter, ms)
  const c = cruise(t, ms)
  if (w <= 0) return c
  const n = near(encounter, ms)
  const mix = (a: Vec, b: Vec): Vec => [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w]
  return { r: mix(c.r, n.r), v: mix(c.v, n.v) }
}

/** 太陽から見た速さ（km/s） */
export const speedKmS = (s: State) => (len(s.v) * AU_KM) / DAY_S
