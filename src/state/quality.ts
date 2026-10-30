import { create } from 'zustand'
import { useStore } from './store'

// 画質：重いパソコン（内蔵 GPU のノートなど）では描画が追いつかず、惑星や構造物がちらついて消えることがある。
// 「自動」では FPS を測って、遅ければ一段ずつ下げ、余裕があれば戻す。

/** 実際に使う画質 */
export type Level = 'high' | 'medium' | 'low'
/** 設定の画質（auto は FPS を見て選ぶ） */
export type QualitySetting = 'auto' | Level

const ORDER: Level[] = ['low', 'medium', 'high']

/** 画質ごとの描き方 */
export const QUALITY: Record<Level, { dpr: number; msaa: number; bloom: boolean; shadow: number; closeTextures: boolean }> = {
  // 画面の細かさ（端末の倍率の上限）・後処理のアンチエイリアス・光のにじみ・船の影の細かさ（0 で影なし）・近づいたときの 4K テクスチャ
  high: { dpr: 2, msaa: 4, bloom: true, shadow: 2048, closeTextures: true },
  medium: { dpr: 1.25, msaa: 0, bloom: true, shadow: 1024, closeTextures: true },
  low: { dpr: 0.85, msaa: 0, bloom: false, shadow: 0, closeTextures: false },
}

export const dprFor = (level: Level) => Math.min(window.devicePixelRatio || 1, QUALITY[level].dpr)

type QualityState = {
  /** 自動のときに選んでいる画質 */
  auto: Level
  /** 直近の FPS（測れていなければ 0） */
  fps: number
  setAuto: (auto: Level) => void
  setFps: (fps: number) => void
}

export const useQuality = create<QualityState>((set) => ({
  auto: 'high',
  fps: 0,
  setAuto: (auto) => set({ auto }),
  setFps: (fps) => set({ fps }),
}))

/** 内蔵 GPU やスマホの GPU か（はじめから「標準」で始める） */
export function looksIntegrated(renderer: string) {
  return /intel|uhd|iris|hd graphics|mali|adreno|powervr|apple gpu|swiftshader|llvmpipe|microsoft basic/i.test(renderer)
}

/** 自動の画質を一段下げる・上げる（端なら変えない） */
export const stepDown = (level: Level): Level => ORDER[Math.max(0, ORDER.indexOf(level) - 1)]
export const stepUp = (level: Level): Level => ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(level) + 1)]

/** 今の画質（設定が自動なら、自動で選んでいるもの） */
export function useLevel(): Level {
  const setting = useStore((s) => s.settings.quality)
  const auto = useQuality((q) => q.auto)
  return setting === 'auto' ? auto : setting
}

/** useFrame の外から今の画質を読む */
export function currentLevel(): Level {
  const setting = useStore.getState().settings.quality
  return setting === 'auto' ? useQuality.getState().auto : setting
}
