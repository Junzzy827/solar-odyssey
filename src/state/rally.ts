import { create } from 'zustand'
import { launchRover, roverActive } from './rover'
import { goToSite, useLanding } from './landing'

// 火星の峡谷レース（マリネリス峡谷のレース場）：色違いの ORV-7 が 4 台で、光の門を順にくぐってゴールを目指す。
// 自分の 1 台のほかの 3 台はコンピューター（それぞれ性格がちがう）。
// 流れ：off → deploy（ローバーを降ろして展開）→ count（スタートの列に並んで 3・2・1）→ run → done（結果）

export type RallyPhase = 'off' | 'deploy' | 'count' | 'run' | 'done'

/** 4 色のローバー。name はコンピューターが運転するときの名前 */
export const RALLY_COLORS = [
  { id: 'red', hex: '#d63a2c', ja: '赤', en: 'Red', name: ['アカツメ', 'Akatsume'], trait: ['スピード型', 'Speedster'] },
  { id: 'blue', hex: '#2f6fe0', ja: '青', en: 'Blue', name: ['ミナモ', 'Minamo'], trait: ['慎重型', 'Careful'] },
  { id: 'yellow', hex: '#f0c22c', ja: '黄', en: 'Yellow', name: ['イナズマ', 'Inazuma'], trait: ['ジャンプ好き', 'Jumper'] },
  { id: 'green', hex: '#3aa64c', ja: '緑', en: 'Green', name: ['コケモモ', 'Kokemomo'], trait: ['近道好き', 'Shortcut fan'] },
] as const

export const COUNT_SEC = 3.6

export type RallyEntry = { color: number; time: number | null; you: boolean }

type RallyState = {
  phase: RallyPhase
  /** 今の段階を始めた時刻（performance.now() / 1000） */
  since: number
  /** 自分の色（RALLY_COLORS の番号） */
  color: number
  /** 次にくぐる門（0 から）と、門の数（最後の門がゴール） */
  gate: number
  gates: number
  /** 走っている時間（秒）。ときどき書き換える */
  time: number
  /** 今の順位（1〜4） */
  place: number
  /** 次の門までの距離（m）と、ローバーの正面から右回りの角度（度） */
  toGate: { dist: number; rel: number } | null
  /** 門をくぐったときの表示：自己ベストとの差（秒）。null は初めて */
  split: { gate: number; time: number; diff: number | null; at: number } | null
  /** ゴールの結果。at はハイスコア表に入れた日時、rank は表での順位（state/rallyHiscore.ts） */
  result: { time: number; place: number; best: number; newBest: boolean; order: RallyEntry[]; at: number; rank: number } | null
  /** 門から外れて戻る（R）の案内を出す */
  lost: boolean
  /** 追いかけっこ（月）：つかまえたローバーと、ゴールまで逃げきったローバー（色の番号）、最後につかまえた時刻と色 */
  chase: { caught: number[]; escaped: number[]; at: number; last: number } | null
  /** ミニマップ用：コンピューターのローバーの位置（色の番号, x, z） */
  bots: { c: number; x: number; z: number }[]
}

/** 自己ベストはレース場ごと */
const bestKey = () => `solar-voyager:rally-best:${useLanding.getState().site ?? 'coprates'}`
const COLOR_KEY = 'solar-voyager:rally-color'

export type RallyBest = { time: number; splits: number[] }

export function loadBest(): RallyBest | null {
  try {
    const v = JSON.parse(localStorage.getItem(bestKey()) ?? 'null')
    return v && v.time > 0 ? v : null
  } catch {
    return null
  }
}

export function saveBest(b: RallyBest) {
  try {
    localStorage.setItem(bestKey(), JSON.stringify(b))
  } catch {
    // 保存できなくても遊べる
  }
}

function loadColor() {
  try {
    const v = Number(localStorage.getItem(COLOR_KEY))
    return v >= 0 && v < RALLY_COLORS.length ? v : 0
  } catch {
    return 0
  }
}

export const rallyNow = () => performance.now() / 1000

export const useRally = create<RallyState>(() => ({
  phase: 'off',
  since: 0,
  color: loadColor(),
  gate: 0,
  gates: 0,
  time: 0,
  place: 1,
  toGate: null,
  split: null,
  result: null,
  lost: false,
  chase: null,
  bots: [],
}))

export const setRallyPhase = (phase: RallyPhase) => useRally.setState({ phase, since: rallyNow() })

export function setRallyColor(color: number) {
  useRally.setState({ color })
  try {
    localStorage.setItem(COLOR_KEY, String(color))
  } catch {
    // 保存できなくても遊べる
  }
}

/** レースを始める。ローバーがまだ出ていなければ降ろして展開してから、スタートの列へ */
export function startRally() {
  useRally.setState({ gate: 0, time: 0, place: 1, toGate: null, split: null, result: null, lost: false, chase: null })
  if (!roverActive()) launchRover(true)
  setRallyPhase('deploy')
}

export function quitRally() {
  useRally.setState({ toGate: null, split: null, result: null, lost: false, chase: null })
  setRallyPhase('off')
}

/** レース中か（スタートの列に並んでから、結果を出すまで） */
export const rallyRacing = () => {
  const p = useRally.getState().phase
  return p === 'count' || p === 'run'
}

/** レース場へ着いたら、ローバーを出した状態にする（ローバーを運転中に「峡谷レースへ」を押したとき） */
export const rallyArrive = { rover: false }

/** ローバーを運転しているところから、その天体のレース場へ。着いたらすぐローバーで走れる（色えらびとスタートは画面に出る） */
export function goToRally(site: string) {
  if (useLanding.getState().phase !== 'surface') return
  rallyArrive.rover = true
  goToSite(site)
}
