import { create } from 'zustand'
import { issSlot } from './saves/iss'

// 宇宙ステーション（ISS）の一日。いまは試しの URL（?iss=sample）で：実験棟デスティニーから入り、12 の部屋（モジュール）を
// ハッチを通ってどこへでも浮かんで行ける（段階 2）。デスティニーには 3 つの印（水の玉・自転車こぎ・地球の窓）。
// 宇宙の場面は止めて、ISS の中の場面（components/iss/IssView）を出す。
// 流れ：none → loading（暗い幕・はじめの部屋の読みこみ）→ inside（中を浮かぶ。となりの部屋は近づくと読む）→ none
// モジュールの名前は tools/iss/modules.json の id（'us_lab' など）

export type IssPhase = 'none' | 'loading' | 'inside'
export type IssSpot = 'water' | 'bike' | 'window'
export const ISS_SPOTS: IssSpot[] = ['water', 'bike', 'window']
/** 印のある部屋（段階 2 では、印はデスティニーだけ。ほかの部屋の遊びは段階 3） */
export const SPOT_MODULE = 'us_lab'

const QUERY = typeof location !== 'undefined' ? location.search + location.hash : ''
/** 試しの URL（?iss=sample）で開いたとき。起動したら、すぐ ISS に入る */
export const ISS_SAMPLE = /[?&#]iss=sample\b/.test(QUERY)
/** 試しの URL で、はじめの部屋を決める（?iss=sample&mod=node2）。動作確認・撮影用 */
export const ISS_START = QUERY.match(/[?&#]mod=([a-z0-9_]+)/)?.[1] ?? 'us_lab'

type IssState = {
  phase: IssPhase
  /** いるモジュール（入った部屋。口をまたぐと変わる） */
  module: string
  /** はじめに入る部屋 */
  start: string
  /** 入ったことのある部屋（記録から。地図で塗る） */
  visited: string[]
  /** 読みこんで見えている部屋（__sv.iss.loaded） */
  loaded: string[]
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

export const useIss = create<IssState>(() => ({ phase: 'none', module: 'us_lab', start: 'us_lab', visited: [], loaded: [], spot: null, done: [], moved: false, flips: 0 }))

export const issScene = (p: IssPhase) => p !== 'none'

/** 操作（キー・スティック・ボタン）。場面のコンポーネントが毎フレーム読む */
export const issInput = { x: 0, y: 0, z: 0, stickX: 0, stickY: 0, up: false, down: false, lookX: 0, lookY: 0 }

/** 動作確認用（__sv.iss.debug）：move を入れるとその向きに押し続ける。pose は毎フレーム書く */
export const issDebug = {
  move: null as null | [number, number, number],
  pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, speed: 0 },
  /** 読みこんだもの（重さを測るとき用） */
  loaded: false,
  /**
   * 入れると、次のコマで動く。[x, y, z, yaw, pitch] はその場所・向きへ飛ぶ（撮影用）。
   * 部屋の名前（'node2'）は、その部屋の真ん中まで、口を通って浮かんで行く（__sv.iss.goto）
   */
  goto: null as null | string | [number, number, number, number, number],
  /** 1 コマの描画の数（IssEarth が毎コマ書く） */
  frame: { calls: 0, triangles: 0, textures: 0, geometries: 0 },
  /** 部屋を読みこんだときの記録（重さを測るとき用）：いちばん長かったコマ（ms）、絵を載せるいちばん長い時間（ms） */
  stream: { maxFrameMs: 0, maxUploadMs: 0, loads: 0, drops: 0 },
  /** 撮影（__sv.iss.film）：道にそって、決めた時刻の場所・向きにする。null で使わない */
  film: null as null | { t: number },
  /** 撮影の道の長さ（秒・m）。道を作ったときに書く */
  filmLength: { seconds: 0, meters: 0 },
  /** 読みたい部屋が全部見えて、絵も載せ終わった（撮影で、このコマを撮ってよい） */
  settled: false,
}

export function openIss(module = ISS_START) {
  if (useIss.getState().phase !== 'none') return
  useIss.setState({ phase: 'loading', module, start: module, loaded: [], spot: null, done: doneIn(SPOT_MODULE), moved: false, visited: issSlot.load().visited })
  enterModule(module)
}

/** 部屋に入った（口をまたいだ）：いる部屋を変え、入ったことのある部屋に記録する */
export function enterModule(module: string) {
  const rec = issSlot.load()
  const visited = rec.visited.includes(module) ? rec.visited : [...rec.visited, module]
  if (visited !== rec.visited) issSlot.save({ ...rec, visited })
  const s = useIss.getState()
  if (s.module !== module || s.visited.length !== visited.length) useIss.setState({ module, visited, spot: s.module === module ? s.spot : null })
}

export function closeIss() {
  Object.assign(issInput, { x: 0, y: 0, z: 0, stickX: 0, stickY: 0, up: false, down: false, lookX: 0, lookY: 0 })
  issDebug.loaded = false
  issDebug.goto = null
  issDebug.film = null
  useIss.setState({ phase: 'none', spot: null, loaded: [] })
}

/** 動作確認用（__sv.iss.goto）：その部屋（'node2' など）の真ん中まで、口を通って浮かんで行く */
export const issGoto = (module: string) => {
  issDebug.goto = module
}

/** 動作確認用（__sv.iss.loaded）：読みこんで見えている部屋 */
export const issLoaded = () => useIss.getState().loaded

/** 撮影用（__sv.iss.film）：撮影の道の t 秒の場所・向きにする。null でやめる */
export const issFilm = (t: number | null) => {
  issDebug.film = t === null ? null : { t }
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
  const key = `${SPOT_MODULE}:${spot}`
  if (!rec.done.includes(key)) issSlot.save({ ...rec, done: [...rec.done, key] })
}
