import * as THREE from 'three'
import { create } from 'zustand'

// 地表の天気（いまは火星）。砂嵐の強さ storm（0〜1）と、つむじ風（ダストデビル）の出やすさ devils（0〜1）。
// 砂嵐：空が砂で濁って遠くが見えなくなり、太陽が暗く赤くなり、細かい砂が地面を這うように流れる。
//   火星の空気は薄いので、物を吹き飛ばす力は無い（映画の砂嵐のような激しさではなく、濁りと流れで表す）。
// つむじ風：よく晴れた日の昼すぎ、温まった地面から立ちのぼる。探査車が何度も撮影している。
// 強さは地表の時間（hours）で移り変わる。force を入れると、その強さに固定する（動作確認・天気ボタン用）

export type WeatherNow = {
  storm: number
  devils: number
  /** 砂嵐の強さを固定する（null なら自動） */
  force: number | null
}

export const weatherNow: WeatherNow = { storm: 0, devils: 0, force: null }

/** 天気ボタン：自動・砂嵐を呼ぶ・晴れにする。storm は画面に出す今の砂嵐の強さ（Scene が時々書く） */
export type WeatherMode = 'auto' | 'storm' | 'clear'
export const useWeather = create<{ mode: WeatherMode; storm: number; setMode: (m: WeatherMode) => void }>((set) => ({
  mode: 'auto',
  storm: 0,
  setMode: (mode) => set({ mode }),
}))

/** 天気が変わる天体 */
export const WEATHER_BODIES = new Set(['mars'])

/** 砂嵐で、空気中の砂（低いところの霞）が何倍まで濃くなるか */
export const STORM_HAZE = 18

/** 自動の砂嵐の強さ：数日おきに砂嵐が来て、半日ほど吹き荒れて、また晴れる（着陸したときは晴れ。1 秒 = 1 時間なら 1 分半ほどで最初の砂嵐） */
export function stormTarget(id: string, hours: number) {
  if (!WEATHER_BODIES.has(id)) return 0
  const a = Math.sin(hours * 0.045 + 4.0) * 0.65 + Math.sin(hours * 0.11 + 0.4) * 0.35
  return THREE.MathUtils.smoothstep(a, 0.45, 0.85)
}

/** つむじ風の出やすさ：よく晴れた昼すぎ（11〜17 時）。砂嵐の間は出ない */
export function devilTarget(id: string, clock: number, storm: number) {
  if (!WEATHER_BODIES.has(id)) return 0
  const day = THREE.MathUtils.smoothstep(clock, 10.5, 12.5) * (1 - THREE.MathUtils.smoothstep(clock, 16, 18))
  return day * (1 - THREE.MathUtils.smoothstep(storm, 0.05, 0.3))
}

/** 毎フレーム、地表の時間から天気を進める（急に変わらないよう、なめらかに追いかける） */
export function stepWeather(id: string, hours: number, clock: number, dt: number) {
  const w = weatherNow
  const mode = useWeather.getState().mode
  const forced = w.force ?? (mode === 'storm' ? 1 : mode === 'clear' ? 0 : null)
  const target = forced ?? stormTarget(id, hours)
  // ボタンで呼んだ砂嵐は、10 秒ほどかけて押し寄せる
  const k = Math.min(1, dt * (forced !== null ? 0.12 : 1.5))
  w.storm += (target - w.storm) * k
  if (Math.abs(target - w.storm) < 1e-3) w.storm = target
  w.devils += (devilTarget(id, clock, w.storm) - w.devils) * Math.min(1, dt * 0.8)
  return w
}
