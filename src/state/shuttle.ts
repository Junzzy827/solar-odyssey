import { create } from 'zustand'
import { useStore } from './store'
import { saveSlot } from './save'

// スペースシャトルの乗員室（STS-61「ハッブルをなおせ」の見本の一角）。
// いまは試しの URL（?shuttle=sample）でだけ入れる。開くと宇宙の場面の上に別の Canvas を出し（components/shuttle/ShuttleView）、
// 無重力で乗員室の中をただよえる。外には実寸の地球と、開いた荷物室のハッブル。
// 流れ：none → loading（暗いまま読み込む）→ cabin（明けて中をただよう）→ none

export type ShuttlePhase = 'none' | 'loading' | 'cabin'
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
  return { phase: 'none', since: 0, deck: 'flight', light: s.light, spot: null, near: null, seen: s.seen }
})

const persist = () => {
  const s = useShuttle.getState()
  slot.save({ seen: s.seen, light: s.light })
}

export const shuttleActive = () => useShuttle.getState().phase !== 'none'

/** 乗員室へ入る（読み込みが終わると ShuttleWorld が markShuttleReady を呼ぶ） */
export function openShuttle() {
  if (useShuttle.getState().phase !== 'none') return
  // 起動の画面（#boot）が消える前には入らない：中にいるあいだは宇宙の場面を止めるので、
  // 宇宙の場面が最初の数コマを描けず、起動の画面がいつまでも消えなくなる
  if (typeof document !== 'undefined' && document.getElementById('boot')) {
    setTimeout(openShuttle, 300)
    return
  }
  useShuttle.setState({ phase: 'loading', since: now(), deck: 'flight', spot: null, near: null })
}

export function markShuttleReady() {
  if (useShuttle.getState().phase === 'loading') useShuttle.setState({ phase: 'cabin', since: now() })
}

/** 乗員室を出て、宇宙の自由探索へもどる */
export function closeShuttle() {
  if (useShuttle.getState().phase === 'none') return
  if (document.pointerLockElement) void document.exitPointerLock?.()
  useShuttle.setState({ phase: 'none', since: now(), spot: null, near: null })
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
    setTimeout(openShuttle, 1500)
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
} = {}
