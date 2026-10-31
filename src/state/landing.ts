import { create } from 'zustand'
import { useStore } from './store'
import { raceActive } from './race'
import { surfaceFor } from '../data/surfaces'
import { t } from '../i18n/lang'
import { isNear } from './proximity'
import { ship } from './flight'

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
  setView: (v: SurfaceView) => void
}

export const useLanding = create<LandingState>((set) => ({
  phase: 'idle',
  bodyId: null,
  since: 0,
  view: 'eye',
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
  useLanding.setState({ bodyId, view: 'eye' })
  setPhase('fadeIn')
  window.setTimeout(() => {
    if (useLanding.getState().phase === 'fadeIn') setPhase('descent')
  }, FADE * 1000)
  window.setTimeout(() => {
    if (useLanding.getState().phase === 'descent') setPhase('surface')
  }, (FADE + DESCENT) * 1000)
}

/** 降りる演出を飛ばす */
export function skipDescent() {
  if (useLanding.getState().phase === 'descent') setPhase('surface')
}

export function startTakeoff() {
  if (useLanding.getState().phase !== 'surface') return
  useLanding.setState({ view: 'eye' })
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
