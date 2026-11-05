import { create } from 'zustand'

// 無人探査ローバー ORV-7。着陸したあと、着陸船の腹からたたんだまま落とされ、地面で展開して走り出す。
// 流れ：none → drop（落ちる）→ deploy（展開）→ drive（運転）。回収すると none にもどる。

export type RoverPhase = 'none' | 'drop' | 'deploy' | 'drive'
/** 運転中の見方：後ろから追う・マストのカメラから */
export type RoverView = 'chase' | 'cam'

export const DEPLOY_SEC = 6
/** 走り回れる範囲（着陸地点を中心にした正方形の半分の幅、m）。広い天体（火星）は wideGround.ts の WIDE_RANGE */
export const ROVER_RANGE = 100
/** 最高速度（m/s）。時速 60 km */
export const ROVER_TOP = 60 / 3.6
/**
 * 走りの版。運転のしかた・地面・岩など、レースのタイムが変わる変更をしたら、同じコミットで 1 増やす
 * （見た目だけ・コメントだけの変更では増やさない）。レースのハイスコア表・ゴースト・ゲームに入っている記録は、
 * 同じ版で走ったものだけを使う（state/rallyHiscore.ts の courseOf）。だから版が同じなら、どのバージョンのゲームでも使える
 */
export const DRIVE_VERSION = 1

type RoverState = {
  phase: RoverPhase
  since: number
  view: RoverView
  /** 画面に出す速さ（km/h）。毎フレームではなく、ときどき書き換える */
  kmh: number
  /** 計器の表示（ときどき書き換える）：向き（度、0〜359）、前後・左右の傾き（度）、着陸船からの距離（m）、宙に浮いているか */
  hud: { hdg: number; pitch: number; roll: number; dist: number; air: boolean; fuel: number; x: number; z: number }
  /** 走れる範囲（正方形の半分の幅、m）。天体で変わる */
  range: number
  /** 走れる範囲の端に当たっている（メッセージを出す） */
  edge: boolean
  /** ミニマップ用：採集の岩の位置と、採ったものの番号 */
  sites: { x: number; z: number; poi?: string }[]
  taken: number[]
  /** 運転中に、時刻・天気などのメニューを開いているか（ふだんはたたんで景色を広く） */
  menu: boolean
  /** ミニマップを出しているか（右上の「－」でたたむと、小さな「地図」ボタンだけになる） */
  map: boolean
  /** 採集：アームの届く岩があるか・採集中か・いま見せている分析結果（試料の id）・この天体で集めた種類 */
  canSample: boolean
  sampling: boolean
  result: string | null
  /** いちばん近い、まだ採っていない岩（距離 m と、ローバーの正面から右回りの角度、近くの見どころの id（pois.ts）） */
  next: { dist: number; rel: number; where?: string | null } | null
  setView: (v: RoverView) => void
}

export const roverNow = () => performance.now() / 1000

export const useRover = create<RoverState>((set) => ({
  phase: 'none',
  since: 0,
  view: 'chase',
  kmh: 0,
  hud: { hdg: 0, pitch: 0, roll: 0, dist: 0, air: false, fuel: 1, x: 0, z: 0 },
  edge: false,
  range: ROVER_RANGE,
  sites: [],
  taken: [],
  menu: false,
  map: true,
  canSample: false,
  sampling: false,
  result: null,
  next: null,
  setView: (view) => set({ view }),
}))

export const roverActive = () => useRover.getState().phase !== 'none'

/** quick：着陸船から降ろす場面を飛ばし、展開した姿ですぐ走れるように（レースのスタート） */
export function launchRover(quick = false) {
  if (roverActive()) return
  roverQuick.on = quick === true
  useRover.setState({ phase: 'drop', since: roverNow(), view: 'chase', kmh: 0, menu: false, canSample: false, sampling: false, result: null, next: null, edge: false })
}

/** 次の展開を飛ばすか（launchRover の quick） */
export const roverQuick = { on: false }

export function recallRover() {
  useRover.setState({ phase: 'none', since: roverNow(), kmh: 0, canSample: false, sampling: false, result: null, next: null, edge: false })
}

export const setRoverPhase = (phase: RoverPhase) => useRover.setState({ phase, since: roverNow() })

/** 運転の入力（キーボードと画面のボタンの両方から書き込む）。-1..1 */
export const roverInput = { throttle: 0, steer: 0, jump: false, sample: false, reset: false }
const keys = new Set<string>()

function fromKeys() {
  const f = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0
  const b = keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0
  const l = keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0
  const r = keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0
  roverInput.throttle = f - b
  roverInput.steer = r - l
}

const DRIVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyV', 'KeyE', 'KeyR'])

/** キーボード：WASD／矢印で走る、スペースでジャンプ、V で見方を切り替え */
export function bindRoverKeys() {
  const down = (e: KeyboardEvent) => {
    if (useRover.getState().phase !== 'drive' || !DRIVE_KEYS.has(e.code)) return
    const tag = (e.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    e.preventDefault()
    e.stopPropagation()
    if (e.code === 'Space') {
      if (!e.repeat) roverInput.jump = true
      return
    }
    if (e.code === 'KeyR') {
      // レース：直前の門へ戻る
      if (!e.repeat) roverInput.reset = true
      return
    }
    if (e.code === 'KeyE') {
      if (!e.repeat) roverInput.sample = true
      return
    }
    if (e.code === 'KeyV') {
      if (!e.repeat) useRover.setState({ view: useRover.getState().view === 'chase' ? 'cam' : 'chase' })
      return
    }
    keys.add(e.code)
    fromKeys()
  }
  const up = (e: KeyboardEvent) => {
    if (!keys.delete(e.code)) return
    fromKeys()
  }
  const blur = () => {
    keys.clear()
    fromKeys()
  }
  window.addEventListener('keydown', down, true)
  window.addEventListener('keyup', up, true)
  window.addEventListener('blur', blur)
  return () => {
    window.removeEventListener('keydown', down, true)
    window.removeEventListener('keyup', up, true)
    window.removeEventListener('blur', blur)
    blur()
  }
}

/** 運転しているローバーの今の姿（レースの門の判定と順位、ゴーストの記録に使う）。Rover が毎フレーム書き込む */
export const roverPose = { x: 0, y: 0, z: 0, heading: 0, speed: 0, slip: 0, grounded: true, pitch: 0, roll: 0 }

/**
 * レースからローバーを動かす：place（スタートの列・直前の門へ置く）、locked（スタート前は動けない）、
 * paint（車体の色。null は白いまま）、push（ほかのローバーとぶつかったときの押し返し、m）
 */
export const roverCtl: {
  place?: (x: number, z: number, heading: number) => void
  locked: boolean
  paint: string | null
  push: { x: number; z: number }
} = { locked: false, paint: null, push: { x: 0, z: 0 } }

/** ローバーのいる場所（太陽の影を描く範囲をローバーに合わせるため） */
export const roverFocus = { x: 0, y: 0, z: -15, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z } }

// ---- 採集した岩の記録（天体ごとに、集めた種類の id。ブラウザに残す） ----

const LOG_KEY = 'solar-voyager:rover-samples'

function readLog(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) ?? '{}')
  } catch {
    return {}
  }
}

/** 試料の記録（集めた種類の数を画面に出すため、変わったら数を増やす） */
export const useSampleLog = create<{ log: Record<string, string[]>; add: (bodyId: string, id: string) => boolean }>((set, get) => ({
  log: readLog(),
  /** 新しい種類なら true */
  add: (bodyId, id) => {
    const log = { ...get().log }
    const list = log[bodyId] ?? []
    if (list.includes(id)) return false
    log[bodyId] = [...list, id]
    set({ log })
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(log))
    } catch {
      // 保存できなくても遊べる
    }
    return true
  },
}))

/** テスト用（#debug）：ローバーの位置を動かす */
export const roverDebug: {
  /** 確認用のカメラ：ローバーから見た [前, 右, 上, 見る高さ]（m） */
  cam?: [number, number, number, number]
  moveTo?: (site: number) => void; sites?: () => { x: number; z: number }[]; place?: (x: number, z: number, heading?: number) => void; rocks?: () => { x: number; z: number; r: number; h: number }[] } = {}
