import { PLANETS, SUN } from './bodies'
import { CUBE_ID } from './cube'

// 天体への接近のしかた。岩の天体は低い軌道で止まり、ガス惑星は雲の中へ少し潜れる。

/** 自機（SV-01）の設定上の全長。大きさくらべに使う */
export const SHIP_LENGTH_KM = 0.64

/** 潜れる深さの見た目上の上限（半径に対する割合） */
export const DIVE_DEPTH = 0.3

/** 潜るのをやめる圧力（気圧）。ガリレオ探査機のプローブが通信を絶ったのは約22気圧 */
export const LIMIT_BAR = 22

/**
 * ガス惑星の雲の上（1気圧）の温度（K）と、深さ1kmあたりの温度の上がり方（K/km）。
 * 下がるほど断熱圧縮で温まり、圧力は (T/T0)^3.5 で増える（乾燥断熱の近似）。
 * 木星は探査機ガリレオのプローブの実測（深さ約150kmで約22気圧・約150℃）に合う。
 */
const GAS: Record<string, { t0: number; lapse: number }> = {
  jupiter: { t0: 166, lapse: 1.73 },
  saturn: { t0: 134, lapse: 0.73 },
  uranus: { t0: 76, lapse: 0.62 },
  neptune: { t0: 72, lapse: 0.78 },
}

export type ApproachKind = 'star' | 'gas' | 'rock' | 'object'

export const approachKind = (id: string): ApproachKind => (id === 'sun' ? 'star' : id === CUBE_ID ? 'object' : GAS[id] ? 'gas' : 'rock')

/** 天体の本当の半径（km） */
export function radiusKm(id: string) {
  if (id === 'sun') return SUN.radiusKm
  for (const p of PLANETS) {
    if (p.id === id) return p.radiusKm
    const moon = p.moons.find((m) => m.id === id)
    if (moon) return moon.radiusKm
  }
  return null
}

/** 中心からこれ以上は近づけない距離（表示上の単位） */
export function limitDistance(id: string, radius: number) {
  const kind = approachKind(id)
  if (kind === 'star') return radius * 1.3
  if (kind === 'gas') return radius * (1 - DIVE_DEPTH)
  if (kind === 'rock') return radius * 1.04 + 0.1
  return radius * 1.05 + 0.15
}

/** 潜れる一番深いところ（km） */
export function limitDepthKm(id: string) {
  const g = GAS[id]
  return g ? (g.t0 * (LIMIT_BAR ** (1 / 3.5) - 1)) / g.lapse : 0
}

/** 雲の上からの深さ（km）での気圧と温度（℃） */
export function atmosphereAt(id: string, depthKm: number) {
  const g = GAS[id]
  if (!g) return null
  const t = g.t0 + g.lapse * depthKm
  return { bar: (t / g.t0) ** 3.5, celsius: t - 273.15 }
}

export const APPROACH_TEXT = {
  star: '太陽の熱と光が強すぎて、これ以上は近づけません。表面は約6000℃もあります。',
  rock: (name: string) => `これより下は${name}の地表です。ここは低い軌道。探査機もこの高さから観察します。`,
  diveStart: (name: string) => `${name}の雲の中へ。ガス惑星には固い地面がなく、下るほど圧力と温度が上がっていきます。`,
  gasLimit: (name: string) =>
    `${name}の雲の下、約${LIMIT_BAR}気圧。これ以上は圧力が強すぎて進めません。1995年、探査機ガリレオのプローブは木星のこのくらいの深さで、熱と圧力のために通信が途絶えました。`,
}
