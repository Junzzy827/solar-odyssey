import { create } from 'zustand'
import { useStore } from './store'
import { raceActive } from './race'
import { surfaceFor } from '../data/surfaces'
import { t } from '../i18n/lang'
import { isNear } from './proximity'
import { ship } from './flight'
import { recallRover } from './rover'
import { DEM_BODIES, loadDem } from '../components/surface/dem'

// 地表のある惑星・衛星への着陸。着陸しているあいだは、宇宙の場面を止めて、地表の場面（SurfaceView）を出す。
// 流れ：fadeIn（宇宙から暗転）→ descent（着陸船が降りてくる）→ surface（360°見渡す）→ ascent（離陸）→ fadeOut → もとの宇宙

export type LandingPhase = 'idle' | 'fadeIn' | 'descent' | 'surface' | 'ascent' | 'fadeOut'

export const FADE = 0.7
export const DESCENT = 8
export const ASCENT = 6

/** 地表での見方：地面に立って見回す・着陸船のまわりを回って眺める */
export type SurfaceView = 'eye' | 'lander'

type LandingState = {
  phase: LandingPhase
  bodyId: string | null
  /** 今の段階を始めた時刻（performance.now() / 1000） */
  since: number
  view: SurfaceView
  /** 着陸船のまわりで、説明と時刻・天気のメニューを開いているか（たたむと景色が広く見える）。
   * スマホ（狭い・低い画面）では、はじめはたたんでおく。開け閉めは次の着陸でも覚えている */
  menu: boolean
  /**
   * 地表の場面の用意（本物の地形の読み込み・シェーダー作り）ができたか。できるまでは暗転の幕を下ろしたままにして、
   * 降下の演出もそこから始める。用意の途中の、地面が無くて物が少しだけ浮かんでいる画面を見せない（Firefox で目立った）
   */
  ready: boolean
  setView: (v: SurfaceView) => void
}

export const useLanding = create<LandingState>((set) => ({
  phase: 'idle',
  bodyId: null,
  since: 0,
  view: 'eye',
  ready: false,
  menu: typeof window === 'undefined' || (window.innerWidth > 700 && window.innerHeight > 500),
  setView: (view) => set({ view }),
}))

export const landingNow = () => performance.now() / 1000

const setPhase = (phase: LandingPhase) => useLanding.setState({ phase, since: landingNow() })

/** 着陸できる天体のそばにいれば、その天体の id */
export function landableBody(): string | null {
  const s = useStore.getState()
  const near = s.telemetry.near
  if (s.mode !== 'flight' || s.warpPhase !== 'idle' || raceActive()) return null
  // 目標の衛星のそばにいれば、その衛星へ（地球と月のように、大きな惑星の方が「近い」と出ても）
  if (s.targetId && surfaceFor(s.targetId) && isNear(s.targetId, ship.position)) return s.targetId
  if (!near?.id || near.kind !== 'rock' || near.altitudeKm === null) return null
  return surfaceFor(near.id) ? near.id : null
}

/** 宇宙の場面を止めて地表へ */
export const landed = (phase = useLanding.getState().phase) => phase !== 'idle'

export function startLanding(bodyId = landableBody()) {
  if (!bodyId || !surfaceFor(bodyId) || landed()) return
  if (document.pointerLockElement) document.exitPointerLock()
  useLanding.setState({ bodyId, view: 'eye', ready: false })
  recallRover()
  setPhase('fadeIn')
  // 本物の地形は暗転しているあいだに読んでおく（読み終わるまで地表の場面を出さない）
  const dem = DEM_BODIES.has(bodyId) ? loadDem(bodyId).catch(() => null) : Promise.resolve(null)
  const fade = new Promise((r) => window.setTimeout(r, FADE * 1000))
  const giveUp = new Promise((r) => window.setTimeout(r, READY_LIMIT * 1000))
  void Promise.race([Promise.all([dem, fade]), giveUp]).then(() => {
    if (useLanding.getState().phase === 'fadeIn' && useLanding.getState().bodyId === bodyId) setPhase('descent')
  })
}

/** 場面の用意を待つ上限（秒）。過ぎたら、用意の途中でも幕を上げる */
const READY_LIMIT = 12

/** 地表の場面の用意ができた（SurfaceView から呼ぶ）。ここから降下の演出を始める */
export function surfaceReady() {
  const l = useLanding.getState()
  if (l.ready || l.phase !== 'descent') return
  useLanding.setState({ ready: true, since: landingNow() })
  const since = useLanding.getState().since
  window.setTimeout(() => {
    const now = useLanding.getState()
    if (now.phase === 'descent' && now.since === since) setPhase('surface')
  }, DESCENT * 1000)
}

/** 降りる演出を飛ばす */
export function skipDescent() {
  if (useLanding.getState().phase === 'descent') {
    useLanding.setState({ ready: true })
    setPhase('surface')
  }
}

export function startTakeoff() {
  if (useLanding.getState().phase !== 'surface') return
  useLanding.setState({ view: 'eye' })
  recallRover()
  setPhase('ascent')
  window.setTimeout(() => {
    if (useLanding.getState().phase === 'ascent') setPhase('fadeOut')
  }, ASCENT * 1000)
  window.setTimeout(() => {
    if (useLanding.getState().phase === 'fadeOut') {
      useLanding.setState({ phase: 'idle', bodyId: null })
      useStore.getState().showToast(t('母船にもどりました', 'Back aboard the ship'))
    }
  }, (ASCENT + FADE) * 1000)
}
