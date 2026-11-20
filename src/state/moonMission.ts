import { create } from 'zustand'
import { useStore } from './store'
import { saveSlot } from './save'
import {
  altitude,
  guidePitch,
  orbitOf,
  progradePitch,
  startAscent,
  startTli,
  stepAscent,
  velocities,
  type Ascent,
  type AscentEvent,
} from '../data/saturnAscent'

// 月ミッション（アポロ17号の追体験）。第1弾は「打ち上げ」：夜の発射台 → 上昇 → 地球を回る → 月へ向けて点火。
// 宇宙の場面を止めて、別の Canvas（components/moonMission/MoonMissionView）で描く。
// 流れ：none → fadeIn → pad（カウントダウン）→ ascent（上昇）→ orbit（地球を回る）→ tli（月へ向かう燃焼）→ outbound（地球が遠ざかる）→ leave → none
//
// 物理は data/saturnAscent.ts（本物の推力・重さ・燃える時間）。時間は場面ごとに早送りする（warp）。

export type MissionPhase = 'none' | 'fadeIn' | 'pad' | 'ascent' | 'orbit' | 'tli' | 'outbound' | 'leave'
/** pad：地上から見上げる、chase：ロケットの横から、onboard：ロケットにつけたカメラで後ろを見る */
export type MissionCam = 'pad' | 'chase' | 'onboard'

export const MISSION_FADE = 0.8
/** カウントダウンを始める時刻（打ち上げの何秒前） */
export const COUNT_FROM = 20
/** 点火の手順を始める時刻（本物は T-8.9 秒） */
export const IGNITION_AT = 8.9
/** この時刻（T-）までに点火しなければ、自動で点火する */
export const AUTO_IGNITE = 6
/** 地球を回ってから、月へ向かう点火の「窓」が開くまで（軌道の秒） */
export const TLI_WINDOW_OPEN = 2400
/** 窓の幅（軌道の秒）。窓の真ん中で押すと ★ */
export const TLI_WINDOW = 600
/** 機首を動かす速さ（度/秒） */
export const PITCH_RATE = 7

/** 記録（いちばん良い星の数と、たどり着いた所） */
type MissionRecord = { stars: number; reached: number }
const record = saveSlot<MissionRecord>('moon-mission', { stars: 0, reached: 0 }, (v) =>
  typeof v === 'object' && v !== null && typeof (v as MissionRecord).stars === 'number' ? (v as MissionRecord) : null,
)

type MissionState = {
  phase: MissionPhase
  since: number
  cam: MissionCam
  /** カメラを自分で選んだ（自動の切り替えをしない） */
  camLocked: boolean
  /** おまかせ（機首を自動で手本に合わせる） */
  auto: boolean
  /** 打ち上げまでの残り秒（pad のあいだ）。打ち上げ後は 0 */
  countdown: number
  /** 点火した（エンジンの火が入った）時刻（T-）。まだなら null */
  ignitedAt: number | null
  /** 画面の字幕（出来事） */
  caption: { key: CaptionKey; at: number } | null
  /** 手本とのずれの平均（度）と、その時間 */
  errSum: number
  errTime: number
  /** 月へ向かう点火の押しどころ（窓の中心からのずれ、軌道の秒）。null はまだ */
  tliTiming: number | null
  /** 星（0〜3）。終わりのカードで出す */
  stars: number
  best: MissionRecord
}

export type CaptionKey =
  | 'ignition'
  | 'liftoff'
  | 'towerClear'
  | 'maxQ'
  | 'centerCutoff'
  | 'stage1Sep'
  | 'stage2Ign'
  | 'interstage'
  | 'les'
  | 'stage2Sep'
  | 'stage3Ign'
  | 'orbit'
  | 'sunrise'
  | 'tliWindow'
  | 'tliIgnition'
  | 'tliCutoff'

/** 確認用の動画を撮るときは、画面の時計をコマ送りの時計にする（film.t が null でなければそれを使う） */
export const film = { t: null as number | null }
export const missionNow = () => film.t ?? performance.now() / 1000

export const useMoonMission = create<MissionState>(() => ({
  phase: 'none',
  since: 0,
  cam: 'pad',
  camLocked: false,
  auto: false,
  countdown: COUNT_FROM,
  ignitedAt: null,
  caption: null,
  errSum: 0,
  errTime: 0,
  tliTiming: null,
  stars: 0,
  best: record.load(),
}))

/** 宇宙の場面を止めて、この場面を出しているか */
export const missionScene = (p: MissionPhase) => p !== 'none' && p !== 'fadeIn'

// ---- 動いている物理（毎フレーム書きかえるので、zustand の外に置く） ----------------------------

export const sim = {
  a: startAscent(),
  /** 機首の向き（度、真上から東へ） */
  pitch: 0,
  /** 時間の早送り（物理の秒 / 画面の秒） */
  warp: 1,
  /** 地球を回り始めた時刻（物理の秒） */
  orbitAt: 0,
  /** 月へ向かう燃焼を始めた時刻 */
  tliAt: 0,
  /** 月へ向かう燃焼が終わった時刻 */
  tliEnd: 0,
  /** マックスQ を過ぎたか */
  maxQ: false,
  qPeak: 0,
  /** 日の出を見たか */
  sunrise: false,
  /** 段を切り離した時刻（演出のため） */
  sepAt: { s1: -1, ring: -1, les: -1, s2: -1 },
  /** 物理の出来事（場面の部品が読む。読み終わったら空にする） */
  events: [] as AscentEvent[],
  /** 手本の道すじ（打ち上げから軌道まで、物理の座標） */
  path: [] as [number, number][],
}

/** 手本どおりに飛んだときの道すじ（線で見せる） */
function idealPath() {
  const a = startAscent()
  const pts: [number, number][] = []
  for (let i = 0; i < 20 * 900 && !a.cutoff; i++) {
    stepAscent(a, 0.05, guidePitch(a))
    if (i % 20 === 0) pts.push([a.x, a.y])
  }
  pts.push([a.x, a.y])
  return pts
}

// ---- 入力 -----------------------------------------------------------------------------------

/** -1（立てる）〜 +1（倒す）。キー・画面のボタン */
export const missionInput = { tilt: 0, ignite: false }

function onKey(e: KeyboardEvent, down: boolean) {
  const k = e.key.toLowerCase()
  const s = useMoonMission.getState()
  if (s.phase === 'none') return
  if (k === 'arrowright' || k === 'd') missionInput.tilt = down ? 1 : missionInput.tilt === 1 ? 0 : missionInput.tilt
  else if (k === 'arrowleft' || k === 'a') missionInput.tilt = down ? -1 : missionInput.tilt === -1 ? 0 : missionInput.tilt
  else if (k === ' ' || k === 'enter') {
    missionInput.ignite = down
    if (down) pressGo()
  } else if (k === 'c' && down) cycleCam()
  else if (k === 'escape' && down) endMission()
  else return
  e.preventDefault()
}

export function bindMissionKeys() {
  const d = (e: KeyboardEvent) => onKey(e, true)
  const u = (e: KeyboardEvent) => onKey(e, false)
  window.addEventListener('keydown', d)
  window.addEventListener('keyup', u)
  return () => {
    window.removeEventListener('keydown', d)
    window.removeEventListener('keyup', u)
  }
}

// ---- 流れ -----------------------------------------------------------------------------------

export function startMoonMission() {
  if (useMoonMission.getState().phase !== 'none') return
  sim.a = startAscent()
  sim.pitch = 0
  sim.warp = 1
  sim.orbitAt = 0
  sim.tliAt = 0
  sim.tliEnd = 0
  sim.maxQ = false
  sim.qPeak = 0
  sim.sunrise = false
  sim.sepAt = { s1: -1, ring: -1, les: -1, s2: -1 }
  sim.events = []
  if (!sim.path.length) sim.path = idealPath()
  missionInput.tilt = 0
  missionInput.ignite = false
  useMoonMission.setState({
    phase: 'fadeIn',
    since: missionNow(),
    cam: 'pad',
    camLocked: false,
    auto: false,
    countdown: COUNT_FROM,
    ignitedAt: null,
    caption: null,
    errSum: 0,
    errTime: 0,
    tliTiming: null,
    stars: 0,
    best: record.load(),
  })
  useStore.getState().setMode('flight')
  setTimeout(() => {
    if (useMoonMission.getState().phase === 'fadeIn') useMoonMission.setState({ phase: 'pad', since: missionNow() })
  }, MISSION_FADE * 1000)
}

export function endMission() {
  const s = useMoonMission.getState()
  if (s.phase === 'none' || s.phase === 'leave') return
  useMoonMission.setState({ phase: 'leave', since: missionNow() })
  setTimeout(() => useMoonMission.setState({ phase: 'none', since: missionNow() }), MISSION_FADE * 1000)
}

/** もう一度、発射台から */
export function restartMission() {
  useMoonMission.setState({ phase: 'none' })
  startMoonMission()
  useMoonMission.setState({ phase: 'pad', since: missionNow() })
}

export function setCaption(key: CaptionKey) {
  useMoonMission.setState({ caption: { key, at: missionNow() } })
}

export function setAuto(auto: boolean) {
  useMoonMission.setState({ auto })
}

const CAMS: MissionCam[] = ['pad', 'chase', 'onboard']
export function cycleCam() {
  const s = useMoonMission.getState()
  const i = CAMS.indexOf(s.cam)
  let next = CAMS[(i + 1) % CAMS.length]
  // 高く上がったら、地上のカメラからは小さな点にしか見えないので飛ばす
  if (next === 'pad' && s.phase !== 'pad' && altitude(sim.a) > 30_000) next = 'chase'
  useMoonMission.setState({ cam: next, camLocked: true })
}

/** 自動のカメラの切り替え（自分で選んでいないとき） */
export function autoCam(cam: MissionCam) {
  const s = useMoonMission.getState()
  if (!s.camLocked && s.cam !== cam) useMoonMission.setState({ cam })
}

/** 「点火」ボタン・スペース：発射台では点火、地球を回っているあいだは月へ向かう点火 */
export function pressGo() {
  const s = useMoonMission.getState()
  if (s.phase === 'pad' && s.ignitedAt === null && s.countdown <= IGNITION_AT + 0.6) ignite(s.countdown)
  else if (s.phase === 'orbit') {
    const t = sim.a.t - sim.orbitAt
    if (t >= TLI_WINDOW_OPEN) beginTli(t - (TLI_WINDOW_OPEN + TLI_WINDOW / 2))
  }
}

function ignite(at: number) {
  useMoonMission.setState({ ignitedAt: at })
  setCaption('ignition')
}

function beginTli(offset: number) {
  startTli(sim.a)
  sim.tliAt = sim.a.t
  useMoonMission.setState({ phase: 'tli', since: missionNow(), tliTiming: offset })
  setCaption('tliIgnition')
}

// ---- 毎フレーム -------------------------------------------------------------------------------

/** 場面ごとの早送り（物理の秒 / 画面の秒）。出来事の前後はゆっくり見せる */
function warpFor(phase: MissionPhase, a: Ascent) {
  if (phase === 'ascent') {
    const near = (t: number) => t >= 0 && Math.abs(a.t - t) < 4
    if (a.t < 22) return 1
    if (near(sim.sepAt.s1) || near(sim.sepAt.ring) || near(sim.sepAt.les) || near(sim.sepAt.s2)) return 1.5
    if (a.stage === 0) return a.t > 150 ? 2 : 4
    if (a.stage === 1) return 10
    return 5
  }
  if (phase === 'orbit') {
    const t = a.t - sim.orbitAt
    if (t < 8) return 2
    // 窓の前後はゆっくり（押しやすく）
    if (t > TLI_WINDOW_OPEN - 200 && t < TLI_WINDOW_OPEN + TLI_WINDOW + 60) return 30
    return 140
  }
  if (phase === 'tli') return a.cutoff ? 20 : 10
  if (phase === 'outbound') return 60 + Math.min(1600, (a.t - sim.tliEnd) * 4)
  return 1
}

/** 画面の dt 秒ぶん進める（MoonMissionView の useFrame から呼ぶ） */
export function tickMission(dt: number) {
  const s = useMoonMission.getState()
  const a = sim.a
  dt = Math.min(dt, 0.1)
  if (s.phase === 'pad') {
    const countdown = s.countdown - dt
    let ignitedAt = s.ignitedAt
    if (ignitedAt === null && countdown <= AUTO_IGNITE) {
      ignite(countdown)
      ignitedAt = countdown
    }
    if (countdown <= 0) {
      useMoonMission.setState({ phase: 'ascent', since: missionNow(), countdown: 0 })
      setCaption('liftoff')
      return
    }
    useMoonMission.setState({ countdown })
    return
  }
  if (s.phase !== 'ascent' && s.phase !== 'orbit' && s.phase !== 'tli' && s.phase !== 'outbound') return
  sim.warp = warpFor(s.phase, a)
  // 機首
  const guide = s.phase === 'ascent' ? guidePitch(a) : progradePitch(a)
  if (s.phase === 'ascent' && !s.auto && a.t > 12 && !a.cutoff) {
    sim.pitch += missionInput.tilt * PITCH_RATE * dt
    // 第3段は誘導におまかせ（本物も最後は自動）
    if (a.stage === 2) sim.pitch += (guide - sim.pitch) * Math.min(1, dt * 2)
  } else if (s.phase === 'ascent') {
    sim.pitch += (guide - sim.pitch) * Math.min(1, dt * 3)
  } else {
    // 軌道の上では、いつも進む向き（月へ向かう燃焼も、早送りの中で遅れないように）
    sim.pitch = guide
  }
  sim.pitch = Math.max(-10, Math.min(110, sim.pitch))
  // ずれの記録（操縦する第1・第2段だけ）
  if (s.phase === 'ascent' && !s.auto && a.t > 14 && a.stage < 2 && a.thrust > 0) {
    useMoonMission.setState({ errSum: s.errSum + Math.abs(sim.pitch - guide) * dt, errTime: s.errTime + dt })
  }
  // 物理
  let left = dt * sim.warp
  const maxStep = a.cutoff ? (altitude(a) > 1_000_000 ? 20 : 1) : 0.05
  const out: AscentEvent[] = []
  while (left > 1e-6) {
    const h = Math.min(maxStep, left)
    stepAscent(a, h, s.phase === 'ascent' ? sim.pitch : a.cutoff ? progradePitch(a) : sim.pitch, out)
    left -= h
  }
  if (!sim.maxQ && a.t > 30) {
    if (a.q > sim.qPeak) sim.qPeak = a.q
    else if (a.q < sim.qPeak * 0.97) {
      sim.maxQ = true
      setCaption('maxQ')
    }
  }
  if (s.phase === 'ascent' && a.t > 9 && a.t - dt * sim.warp <= 9) setCaption('towerClear')
  for (const e of out) {
    sim.events.push(e)
    if (e === 'stage1Sep') sim.sepAt.s1 = a.t
    if (e === 'interstage') sim.sepAt.ring = a.t
    if (e === 'les') sim.sepAt.les = a.t
    if (e === 'stage2Sep') sim.sepAt.s2 = a.t
    if (e === 'orbit') {
      sim.orbitAt = a.t
      useMoonMission.setState({ phase: 'orbit', since: missionNow() })
      setCaption('orbit')
    } else if (e === 'tliCutoff') {
      sim.tliEnd = a.t
      useMoonMission.setState({ phase: 'outbound', since: missionNow() })
      setCaption('tliCutoff')
      finish()
    } else setCaption(e)
  }
  // 地球を回っているあいだ：窓が開いたら知らせ、閉じても押さなければ自動で点火
  if (useMoonMission.getState().phase === 'orbit') {
    const t = a.t - sim.orbitAt
    const before = t - dt * sim.warp
    if (t >= TLI_WINDOW_OPEN && before < TLI_WINDOW_OPEN) setCaption('tliWindow')
    if (t >= TLI_WINDOW_OPEN + TLI_WINDOW) beginTli(TLI_WINDOW / 2)
  }
}

/** 終わり：星を決めて記録する */
function finish() {
  const s = useMoonMission.getState()
  const mean = s.errTime > 0 ? s.errSum / s.errTime : 99
  let stars = s.auto || s.errTime < 30 ? 1 : mean < 3 ? 3 : mean < 7 ? 2 : 1
  // 月へ向かう点火がぴったりなら、そのぶん 1 つ減らさない（ずれが大きいと 1 つ減る）
  if (s.tliTiming !== null && Math.abs(s.tliTiming) > TLI_WINDOW * 0.35) stars = Math.max(1, stars - 1)
  const best = { stars: Math.max(s.best.stars, stars), reached: Math.max(s.best.reached, 1) }
  record.save(best)
  useMoonMission.setState({ stars, best })
}

/** HUD に出す数字（毎フレーム読む） */
export function missionReadout() {
  const a = sim.a
  const v = velocities(a)
  const o = orbitOf(a)
  return {
    t: a.t,
    alt: altitude(a),
    speed: v.speed,
    g: a.accel / 9.80665,
    stage: a.stage,
    guide: guidePitch(a),
    pitch: sim.pitch,
    peri: o.peri,
    apo: o.apo,
    prop: a.prop,
    thrust: a.thrust,
    warp: sim.warp,
  }
}

/** テスト・確認用：物理の時刻 t（打ち上げからの秒）まで一気に進める（おまかせで） */
export function debugSkip(t: number) {
  const s = useMoonMission.getState()
  if (s.phase === 'pad') useMoonMission.setState({ phase: 'ascent', countdown: 0, ignitedAt: 1 })
  useMoonMission.setState({ auto: true })
  let guard = 0
  while (sim.a.t < t && guard++ < 200_000 && useMoonMission.getState().phase !== 'none') tickMission(0.1)
}
