import { create } from 'zustand'
import { useStore } from './store'
import { saveSlot } from './save'

// スペースシャトル（STS-61「ハッブルをなおせ」）。いまは試しの URL（?shuttle=sample）でだけ入れる。
// 開くと宇宙の場面の上に別の Canvas を出す（components/shuttle/ShuttleView）。
//   発射台（pad）：夜の 39B。光る点でオービター・タンク・ロケットを知り、通路を渡って乗り込む
//   打ち上げ（launch）：席に仰向けにすわって秒読み。メインエンジンの点火は自分で押す。外のカットと中のカットの映画
//   軌道（cabin）：無重力で乗員室の中をただよう。外には実寸の地球と、開いた荷物室のハッブル
// 流れ：none → loading → pad → launch → loading → cabin → none（軌道から始めることもできる）

export type ShuttlePhase = 'none' | 'loading' | 'pad' | 'launch' | 'cabin'
/** 読み込む場面：pad = 発射台と打ち上げ、orbit = 軌道の乗員室 */
export type ShuttleScene = 'pad' | 'orbit'
/** 発射台の見どころ（光る点） */
export type PadSpot = 'orbiter' | 'et' | 'srb'
export const PAD_SPOTS: readonly PadSpot[] = ['orbiter', 'et', 'srb']
/** 打ち上げの進み：board = 通路を渡って席へ、count = 秒読み、hold = 点火のボタンを待つ、fire = 点火から先 */
export type LaunchStage = 'board' | 'count' | 'hold' | 'fire'
/** いる階：flight = フライトデッキ（上）、mid = ミッドデッキ（下） */
export type ShuttleDeck = 'flight' | 'mid'
/** 乗員室の明かり：day = 窓から日が入り照明もつく、dark = 地球の夜側・照明を消す */
export type ShuttleLight = 'day' | 'dark'
/** 見どころ：seat = 船長の席、arm = アームの台、bag = 寝ぶくろ */
export type ShuttleSpot = 'seat' | 'arm' | 'bag'
export const SHUTTLE_SPOTS: readonly ShuttleSpot[] = ['seat', 'arm', 'bag']

const QUERY = typeof location !== 'undefined' ? location.search + location.hash : ''
/** 試しの URL を付けたときだけ、乗員室へ入る入口を出す（付けなければ何も変わらず、何も読まない） */
export const SHUTTLE_SAMPLE = /[?&#]shuttle=sample\b/.test(QUERY)
/** 試しの URL で最初に開く場面（&at=orbit で軌道の乗員室から） */
const START_SCENE: ShuttleScene = /[?&#]at=orbit\b/.test(QUERY) ? 'orbit' : 'pad'

/** 秒読みの始まりと、点火を待つ所（components/shuttle/launchPlan.ts と同じ値） */
const COUNT_START = -31
const HOLD_T = -7
/** 打ち上げの時計（場面が毎フレーム書く。HUD が読む）。t は発射からの秒、ignitedAt は点火を押した T */
export const shuttleLaunch = { t: COUNT_START, ignitedAt: null as number | null, skip: false, fade: 0 }

type Seen = Partial<Record<ShuttleSpot, true>>
type Saved = { seen: Seen; light: ShuttleLight }

// 見どころを見たかと、明かりの好みだけを残す（どこにいたかは残さない。毎回、後ろのフライトデッキから始める）
const slot = saveSlot<Saved>('shuttle', { seen: {}, light: 'day' }, (v) => {
  const o = v as Partial<Saved> | null
  if (!o || typeof o !== 'object') return null
  const seen: Seen = {}
  for (const id of SHUTTLE_SPOTS) if (o.seen && (o.seen as Seen)[id]) seen[id] = true
  return { seen, light: o.light === 'dark' ? 'dark' : 'day' }
})

type ShuttleState = {
  phase: ShuttlePhase
  scene: ShuttleScene
  /** 発射台で開いている見どころのカード */
  padSpot: PadSpot | null
  stage: LaunchStage
  /** phase が変わった時刻（performance.now() の秒） */
  since: number
  deck: ShuttleDeck
  light: ShuttleLight
  /** いま入っている見どころ（null = ただよっている） */
  spot: ShuttleSpot | null
  /** 近くにある見どころ（ボタンを出す） */
  near: ShuttleSpot | null
  seen: Seen
}

const now = () => performance.now() / 1000

export const useShuttle = create<ShuttleState>(() => {
  const s = slot.load()
  return { phase: 'none', scene: 'pad', padSpot: null, stage: 'board', since: 0, deck: 'flight', light: s.light, spot: null, near: null, seen: s.seen }
})

const persist = () => {
  const s = useShuttle.getState()
  slot.save({ seen: s.seen, light: s.light })
}

export const shuttleActive = () => useShuttle.getState().phase !== 'none'

/** 開く。scene = 'pad' は夜の発射台から、'orbit' は軌道の乗員室から（読み込みが終わると、場面が markShuttleReady を呼ぶ） */
export function openShuttle(scene: ShuttleScene = START_SCENE) {
  if (useShuttle.getState().phase !== 'none') return
  // 起動の画面（#boot）が消える前には入らない：中にいるあいだは宇宙の場面を止めるので、
  // 宇宙の場面が最初の数コマを描けず、起動の画面がいつまでも消えなくなる
  if (typeof document !== 'undefined' && document.getElementById('boot')) {
    setTimeout(() => openShuttle(scene), 300)
    return
  }
  shuttleLaunch.t = COUNT_START
  shuttleLaunch.ignitedAt = null
  shuttleLaunch.skip = false
  shuttleLaunch.fade = 0
  useShuttle.setState({ phase: 'loading', scene, since: now(), deck: 'flight', spot: null, near: null, padSpot: null, stage: 'board' })
}

export function markShuttleReady() {
  const s = useShuttle.getState()
  if (s.phase === 'loading') useShuttle.setState({ phase: s.scene === 'pad' ? 'pad' : 'cabin', since: now() })
}

/** 発射台の見どころのカードを開く・閉じる */
export const openPadSpot = (padSpot: PadSpot | null) => useShuttle.setState({ padSpot })

/** 通路を渡って乗り込む（席に着くと、場面が秒読みを始める） */
export function boardShuttle() {
  if (useShuttle.getState().phase !== 'pad') return
  shuttleLaunch.t = COUNT_START
  shuttleLaunch.ignitedAt = null
  shuttleLaunch.skip = false
  shuttleLaunch.fade = 0
  useShuttle.setState({ phase: 'launch', stage: 'board', since: now(), padSpot: null })
}

export const setLaunchStage = (stage: LaunchStage) => useShuttle.getState().stage !== stage && useShuttle.setState({ stage })

/** メインエンジンの点火（ボタン）。秒読みを待っているときだけ */
export function igniteShuttle() {
  const s = useShuttle.getState()
  if (s.phase !== 'launch' || (s.stage !== 'hold' && s.stage !== 'count') || shuttleLaunch.ignitedAt !== null) return
  shuttleLaunch.ignitedAt = Math.max(shuttleLaunch.t, HOLD_T)
  setLaunchStage('fire')
}

/** 打ち上げの映画が終わった（または飛ばした）：幕を閉じて、軌道の乗員室を読み込む */
export function reachOrbit() {
  const s = useShuttle.getState()
  if (s.phase !== 'launch' && s.phase !== 'pad') return
  if (document.pointerLockElement) void document.exitPointerLock?.()
  useShuttle.setState({ phase: 'loading', scene: 'orbit', since: now(), padSpot: null })
}

/** 乗員室を出て、宇宙の自由探索へもどる */
export function closeShuttle() {
  if (useShuttle.getState().phase === 'none') return
  if (document.pointerLockElement) void document.exitPointerLock?.()
  useShuttle.setState({ phase: 'none', since: now(), spot: null, near: null, padSpot: null })
}

export function setShuttleLight(light: ShuttleLight) {
  useShuttle.setState({ light })
  persist()
}

export const toggleShuttleLight = () => setShuttleLight(useShuttle.getState().light === 'day' ? 'dark' : 'day')

/** 見どころに入る（見た印を残す） */
export function enterSpot(spot: ShuttleSpot) {
  const s = useShuttle.getState()
  if (s.phase !== 'cabin') return
  useShuttle.setState({ spot, seen: { ...s.seen, [spot]: true } })
  persist()
}

export const leaveSpot = () => useShuttle.setState({ spot: null })

/** セーブデータを消したときなど：見た印を忘れる */
export function forgetShuttle() {
  useShuttle.setState({ seen: {} })
  persist()
}

// 試しの URL のときは、言語を選んで少したったら自動で乗員室へ入る（言語の画面の上には出さない）
if (SHUTTLE_SAMPLE && typeof window !== 'undefined') {
  const tryOpen = () => {
    if (useStore.getState().settings.lang === null) return false
    setTimeout(() => openShuttle(), 1500)
    return true
  }
  if (!tryOpen()) {
    const off = useStore.subscribe((s) => {
      if (s.settings.lang !== null && tryOpen()) off()
    })
  }
}

/** 操作の入力（HUD とキーが書き、ShuttleWorld が読む）。x = 右、y = 上、z = 前、-1〜1 */
export const shuttleInput = {
  stick: { x: 0, z: 0 },
  /** 上下のボタン（スマホ） */
  lift: 0,
  /** 見回しの量（ラジアン） */
  lookX: 0,
  lookY: 0,
  keys: new Set<string>(),
}

/** テスト・撮影用の口（ShuttleWorld が中身を入れる） */
export const shuttleDebug: {
  place?: (x: number, y: number, z: number, yaw?: number, pitch?: number) => void
  pose?: () => { pos: number[]; yaw: number; pitch: number }
  info?: () => Record<string, number>
  push?: (x: number, y: number, z: number, sec: number) => void
  /** 名前の物を出す・隠す（確かめ用） */
  show?: (name: string, on: boolean) => void
  /** 発射台・打ち上げ：カメラを置く（撮影用）、打ち上げの時計を T 秒へ */
  padCam?: (x: number, y: number, z: number, tx: number, ty: number, tz: number, fov?: number) => void
  launchAt?: (t: number) => void
} = {}
