import * as THREE from 'three'
import type { SurfaceDef } from '../../data/surfaces'
import { airFor, luminance, sunTransmittance } from './atmosphere'
import { SkyFrame } from './skyClock'

// 1 日の地表の温度と明るさ（目安）。
// 明るさ：太陽の高さと大気の通りやすさから、地面の照らされ方（ルクス）を出す。
// 温度：天体ごとの最低・最高気温（surfaces.ts）の間で、日ざしに遅れて上がり下がりする形にする。
//   空気の無い星はすぐ温まり、日が沈むとすぐ冷える。空気や海のある星は昼すぎに最も暑くなる。
//   金星やタイタンは厚い大気が熱を運ぶので、昼も夜もほとんど変わらない。

/** 温度が日ざしに追いつく速さ（1 日の何割で追いつくか）。大きいほどゆっくり */
/** 厚い雲で、地面に届く光がさらに減る（金星の地表は、くもりの日の地球くらい） */
const CLOUD: Record<string, number> = { venus: 0.13 }

const LAG: Record<string, number> = { earth: 0.12, mars: 0.07, venus: 50, titan: 50, moon: 0.02, mercury: 0.02 }

export type DayProfile = {
  /** 0〜24 時を N 等分した各時刻の、温度（℃）と明るさ（ルクス）、太陽の高さ（ラジアン） */
  temp: number[]
  lux: number[]
  el: number[]
  min: number
  max: number
}

export const PROFILE_N = 96
/** 晴れた日の地球の真昼の、地面の明るさ（ルクス）。太陽 1 au、真上 */
const LUX_1AU = 120000

export function dayProfile(def: SurfaceDef): DayProfile {
  const frame = new SkyFrame(def)
  const air = airFor(def.id)
  const radiusM = def.radiusKm * 1000
  const day = Math.abs(frame.day)
  // 1 日を細かくたどって、時刻ごとの太陽の高さを集める
  const M = 480
  const el = new Array<number>(PROFILE_N).fill(-1)
  const sun = new THREE.Vector3()
  for (let i = 0; i < M; i++) {
    frame.at((i / M) * day * Math.sign(frame.day))
    frame.sunLocal(sun)
    const k = Math.floor((frame.localClock() / 24) * PROFILE_N) % PROFILE_N
    el[k] = Math.asin(Math.max(-1, Math.min(1, sun.y)))
  }
  // 抜けた時刻は隣から埋める
  for (let k = 0; k < PROFILE_N; k++) if (el[k] === -1) el[k] = el[(k + PROFILE_N - 1) % PROFILE_N]

  const sunI = (CLOUD[def.id] ?? 1) / (def.au * def.au)
  const lux = el.map((e) => {
    // 昼：直射＋空の明るさ。日没後しばらくは薄明かり（空のある星だけ）
    if (e > 0) {
      const T = luminance(sunTransmittance(air, radiusM, e, 1))
      return LUX_1AU * sunI * (T * Math.sin(e) + (air ? 0.12 : 0) * Math.sqrt(Math.sin(e)))
    }
    if (!air) return 0
    const tw = Math.max(0, 1 + e / 0.21) // 太陽が 12° 沈むまで
    return LUX_1AU * sunI * 0.004 * tw ** 4
  })

  // 温度の形：日ざし（の 1/4 乗：放射で冷える釣り合い）に、遅れて追いつく
  const lag = LAG[def.id] ?? (air ? 0.1 : 0.03)
  const drive = el.map((e) => Math.max(0, Math.sin(e)) ** 0.25)
  const a = Math.min(1, 1 / (lag * PROFILE_N))
  let s = 0.5
  const shape = new Array<number>(PROFILE_N).fill(0)
  for (let pass = 0; pass < 6; pass++)
    for (let k = 0; k < PROFILE_N; k++) {
      s += (drive[k] - s) * a
      shape[k] = s
    }
  const lo = Math.min(...shape)
  const hi = Math.max(...shape)
  const [tMin, tMax] = def.temp
  const span = hi - lo
  const temp = shape.map((v) => (span < 1e-3 ? (tMin + tMax) / 2 : tMin + ((v - lo) / span) * (tMax - tMin)))
  return { temp, lux, el, min: tMin, max: tMax }
}

/** 時刻 clock（0〜24）の値を、なめらかに読む */
export function sampleAt(arr: number[], clock: number) {
  const x = (((clock / 24) * PROFILE_N) % PROFILE_N + PROFILE_N) % PROFILE_N
  const i = Math.floor(x)
  const f = x - i
  return arr[i] * (1 - f) + arr[(i + 1) % PROFILE_N] * f
}
