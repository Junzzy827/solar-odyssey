import { create } from 'zustand'
import { issSlot } from './saves/iss'

// 宇宙ステーション（ISS）の一日。いまは見本の一角（?iss=sample）：実験棟デスティニーの中を浮かんで、3 つの印で遊ぶ。
// 宇宙の場面は止めて、ISS の中の場面（components/iss/IssView）を出す。
// 流れ：none → loading（暗い幕・読みこみ）→ inside（中を浮かぶ）→ none
// モジュールの名前は tools/iss/modules.json の id（'us_lab' など）

export type IssPhase = 'none' | 'loading' | 'inside'
export type IssSpot = 'water' | 'bike' | 'window'
export const ISS_SPOTS: IssSpot[] = ['water', 'bike', 'window']

const QUERY = typeof location !== 'undefined' ? location.search + location.hash : ''
/** 試しの URL（?iss=sample）で開いたとき。起動したら、すぐ ISS に入る */
export const ISS_SAMPLE = /[?&#]iss=sample\b/.test(QUERY)

type IssState = {
  phase: IssPhase
  /** いるモジュール */
  module: string
  /** いま遊んでいる印（カードが出ている） */
  spot: IssSpot | null
  /** やったこと（このモジュールの印） */
  done: IssSpot[]
  /** 一度でも動いたか（操作の説明を消す） */
  moved: boolean
  /** 宙返りの合図（数が増えたら 1 回） */
  flips: number
}

const doneIn = (module: string) =>
  issSlot
    .load()
    .done.filter((d) => d.startsWith(`${module}:`))
    .map((d) => d.slice(module.length + 1))
    .filter((d): d is IssSpot => (ISS_SPOTS as string[]).includes(d))

export const useIss = create<IssState>(() => ({ phase: 'none', module: 'us_lab', spot: null, done: [], moved: false, flips: 0 }))

export const issScene = (p: IssPhase) => p !== 'none'

/** 操作（キー・スティック・ボタン）。場面のコンポーネントが毎フレーム読む */
export const issInput = { x: 0, y: 0, z: 0, stickX: 0, stickY: 0, up: false, down: false, lookX: 0, lookY: 0 }

/** 動作確認用（__sv.iss.debug）：move を入れるとその向きに押し続ける。pose は毎フレーム書く */
export const issDebug = {
  move: null as null | [number, number, number],
  pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, speed: 0 },
  /** 読みこんだもの（重さを測るとき用） */
  loaded: false,
  /** 入れると、次のコマでその場所・向きへ飛ぶ [x, y, z, yaw, pitch]（撮影用） */
  goto: null as null | [number, number, number, number, number],
  /** 1 コマの描画の数（IssEarth が毎コマ書く） */
  frame: { calls: 0, triangles: 0, textures: 0, geometries: 0 },
}

export function openIss(module = 'us_lab') {
  if (useIss.getState().phase !== 'none') return
  useIss.setState({ phase: 'loading', module, spot: null, done: doneIn(module), moved: false })
  const rec = issSlot.load()
  if (!rec.visited.includes(module)) issSlot.save({ ...rec, visited: [...rec.visited, module] })
}

export function closeIss() {
  Object.assign(issInput, { x: 0, y: 0, z: 0, stickX: 0, stickY: 0, up: false, down: false, lookX: 0, lookY: 0 })
  issDebug.loaded = false
  useIss.setState({ phase: 'none', spot: null })
}

/** 印で遊んだ（カードを出し、記録する） */
export function playSpot(spot: IssSpot | null) {
  const s = useIss.getState()
  if (!spot) {
    useIss.setState({ spot: null })
    return
  }
  const done = s.done.includes(spot) ? s.done : [...s.done, spot]
  useIss.setState({ spot, done })
  const rec = issSlot.load()
  const key = `${s.module}:${spot}`
  if (!rec.done.includes(key)) issSlot.save({ ...rec, done: [...rec.done, key] })
}
