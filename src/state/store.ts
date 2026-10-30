import { create } from 'zustand'
import type { Near } from './proximity'
import type { ScopeId } from '../data/telescopes'
import { DEFAULT_RATE } from '../data/scale'
import type { ShipId } from '../data/ships'
import type { QualitySetting } from './quality'

/** 全体マップ・操縦席・鑑賞モード（止まった自機のまわりを回って眺める） */
export type Mode = 'map' | 'flight' | 'gallery'
/** 追いかけ・見上げ（ヒーローショット）・ブリッジ（艦橋の中から窓ごしに見る） */
export type CameraMode = 'chase' | 'hero' | 'bridge'
const CAMERA_ORDER: CameraMode[] = ['chase', 'hero', 'bridge']
/** C キーやカメラボタンで次のカメラへ */
export const nextCameraMode = (mode: CameraMode) => CAMERA_ORDER[(CAMERA_ORDER.indexOf(mode) + 1) % CAMERA_ORDER.length]
export type WarpPhase = 'idle' | 'charge' | 'warp' | 'exit'

type Telemetry = { distance: number | null; speed: number; eta: number | null; near?: Near | null }

type State = {
  mode: Mode
  targetId: string | null
  warpFactor: number
  warpPhase: WarpPhase
  autopilot: boolean
  /** 時間の速さ：1秒に何時間進むか（data/scale.ts の TIME_RATES） */
  timeScale: number
  telemetry: Telemetry
  /** クイズに正解した天体 */
  visited: string[]
  logOpen: boolean
  cameraMode: CameraMode
  toast: { id: number; text: string } | null
  /** そばにいる宇宙望遠鏡（のぞける） */
  scopeNear: ScopeId | null
  /** のぞいている望遠鏡（写真の画面を開いている） */
  scope: ScopeId | null
  /** 表示の設定（端末に保存する） */
  settings: Settings
  setMode: (mode: Mode) => void
  setTarget: (id: string | null) => void
  setWarpFactor: (factor: number) => void
  setWarpPhase: (phase: WarpPhase) => void
  setAutopilot: (on: boolean) => void
  setTimeScale: (scale: number) => void
  setTelemetry: (t: Telemetry) => void
  markVisited: (id: string) => void
  setLogOpen: (open: boolean) => void
  setCameraMode: (mode: CameraMode) => void
  showToast: (text: string) => void
  setScopeNear: (id: ScopeId | null) => void
  setScope: (id: ScopeId | null) => void
  updateSettings: (patch: Partial<Settings>) => void
}

export type Settings = {
  /** 旋回するとき船体を少し傾ける（映画のような見た目。宇宙では本当は傾けなくても曲がれる） */
  banking: boolean
  /** 距離の広さ：0 は見やすい距離、1 は衛星が本物の比率・惑星どうしが本物の約20〜50分の1（data/layout.ts） */
  distance: number
  /** 大きさ：0 は差を縮めた見やすい大きさ、1 は地球を基準にした本物の比率（data/layout.ts） */
  size: number
  /** 音の大きさ（0〜1）。開いた人がびっくりしないよう、初めは小さめ */
  volume: number
  /** 音を消す */
  muted: boolean
  /** BGM を流す */
  music: boolean
  /** 画面の言語。まだ選んでいなければ null（初めて開いたときに選んでもらう） */
  lang: 'ja' | 'en' | null
  /** 世界：本物の太陽系だけ（real）か、架空の船や構造物も出す SF モード（sf） */
  world: 'real' | 'sf'
  /** 乗る船（data/ships.ts） */
  ship: ShipId
  /** 画質（state/quality.ts）。auto は FPS を見て自動で選ぶ */
  quality: QualitySetting
}

const SETTINGS_KEY = 'solar-voyager:settings'
const DEFAULT_SETTINGS: Settings = { banking: true, distance: 0, size: 0, volume: 0.3, muted: false, music: true, lang: null, world: 'real', ship: 'sv01', quality: 'auto' }

// リンクで世界を決めて開ける（#sf や #real）
const worldFromUrl = /[?&#](sf|real)\b/.exec(location.search + location.hash)?.[1] as Settings['world'] | undefined

// リンクで船を決めて開ける（#ship=heron など）
const shipFromUrl = /[?&#]ship=(sv01|heron|sorakaze|hakobune|meguri|amatsu)\b/.exec(location.search + location.hash)?.[1] as ShipId | undefined

function loadSettings(): Settings {
  let saved: Partial<Settings> = {}
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')
  } catch {
    // 読めなければ初めの設定で
  }
  return { ...DEFAULT_SETTINGS, ...saved, ...(worldFromUrl ? { world: worldFromUrl } : {}), ...(shipFromUrl ? { ship: shipFromUrl } : {}) }
}

const VISITED_KEY = 'solar-voyager:visited'

function loadVisited(): string[] {
  try {
    return JSON.parse(localStorage.getItem(VISITED_KEY) ?? '[]')
  } catch {
    return []
  }
}

export const useStore = create<State>((set) => ({
  mode: 'map',
  targetId: null,
  warpFactor: 6,
  warpPhase: 'idle',
  autopilot: false,
  timeScale: DEFAULT_RATE,
  telemetry: { distance: null, speed: 0, eta: null },
  visited: loadVisited(),
  logOpen: false,
  cameraMode: 'chase',
  toast: null,
  scopeNear: null,
  scope: null,
  settings: loadSettings(),
  setMode: (mode) => set({ mode }),
  setTarget: (targetId) => set({ targetId, autopilot: false, logOpen: false }),
  setWarpFactor: (warpFactor) => set({ warpFactor }),
  setWarpPhase: (warpPhase) => set({ warpPhase }),
  setAutopilot: (autopilot) => set({ autopilot }),
  setTimeScale: (timeScale) => set({ timeScale }),
  setTelemetry: (telemetry) => set({ telemetry }),
  markVisited: (id) =>
    set((s) => {
      if (s.visited.includes(id)) return s
      const visited = [...s.visited, id]
      try {
        localStorage.setItem(VISITED_KEY, JSON.stringify(visited))
      } catch {
        // 保存できなくても遊べる
      }
      return { visited }
    }),
  setLogOpen: (logOpen) => set({ logOpen }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  showToast: (text) => set({ toast: { id: Date.now(), text } }),
  setScopeNear: (scopeNear) => set({ scopeNear }),
  setScope: (scope) => set(scope ? { scope, logOpen: false, autopilot: false } : { scope }),
  updateSettings: (patch) =>
    set((s) => {
      const settings = { ...s.settings, ...patch }
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
      } catch {
        // 保存できなくても遊べる
      }
      return { settings }
    }),
}))

// 動作確認用：URL に #debug を付けると、ブラウザのコンソールから状態を見られる
if (location.hash.includes('debug')) (window as unknown as { __store: typeof useStore }).__store = useStore
