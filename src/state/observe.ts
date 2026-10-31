import * as THREE from 'three'
import { create } from 'zustand'
import { bodies, passThrough } from './registry'
import { useStore } from './store'
import { raceActive } from './race'
import { ship } from './flight'
import { COLONY_ID } from '../data/sf'
import { COLONY_GROUPS } from '../data/sfSides'
import { t } from '../i18n/lang'

/**
 * 周辺観察モード：目標の天体や構造物のまわりを、公転の向きにゆっくり回る。
 * 船首（とカメラ）はずっと目標を向き、速さは解除するまで変わらない（小さな構造物から飛んでいかない）。
 * 毎フレームの動きは components/Ship.tsx が、ここの値を読み書きして決める
 */

/** 回る速さ（1秒に何ラジアン）の初期値と上限。初期値で約 90 秒に 1 周 */
export const ORBIT_RATE = 0.07
export const ORBIT_RATE_MAX = 0.5

/** 観察を始められる距離（中心から。半径の何倍＋いくつまで） */
export const observeRange = (radius: number) => radius * 10 + 4
/** 回る距離の下限（天体の近づける限界より少し外。中に入れる構造物は外板の外） */
export const observeMin = (id: string, radius: number, limit: number) => (passThrough.has(id) ? radius : Math.max(limit, radius) * 1.03)

/** Ship が毎フレーム使う値 */
export const observeRun = {
  /** 始めた直後（回る面と距離を、今の位置から決め直す） */
  fresh: false,
  /** 回る面の軸（長さ 1。目標から見た自機の向きと直交） */
  axis: new THREE.Vector3(0, 1, 0),
  /** 目標の中心からの距離 */
  r: 1,
  /** 回る速さ（+ で船の右へ） */
  rate: ORBIT_RATE,
  /** 公転の向きにそろえる（目標の動きがわかるまで、このフレーム数だけ待つ） */
  alignPending: 0,
}

type ObserveUI = {
  /** 観察中の天体（null は観察していない） */
  id: string | null
  /** 港の入口へ自動で向かっている */
  docking: boolean
  /** 表示用：1 周にかかる秒数（負は左回り） */
  lap: number
}

export const useObserve = create<ObserveUI>(() => ({ id: null, docking: false, lap: 0 }))

/** 港から中へ入れる構造物（スペースコロニー） */
const ENTERABLE = new Set([COLONY_ID, 'colony-2', 'colony-3', ...COLONY_GROUPS.map((g) => g.id)])
export const canDock = (id: string | null) => !!id && ENTERABLE.has(id)

export const OBSERVE_TEXT = {
  far: (name: string) => t(`${name}のそばで使えます（ワープか自動航行で近づいてから）`, `Get closer to ${name} first (warp or autopilot)`),
  none: () => t('目標を選んで、そばまで行くと使えます', 'Choose a target and get close to it first'),
  inside: () => t('構造物の中では使えません', 'Not available inside a structure'),
  start: (name: string) => t(`${name}の周辺観察を開始`, `Observing ${name}`),
  docked: () => t('港の入口に着きました。前進（W）で中へ入れます', 'At the port entrance. Thrust forward (W) to go inside'),
}

const p = new THREE.Vector3()

/** 観察を始める（目標のそばにいるときだけ） */
export function startObserve() {
  const s = useStore.getState()
  if (s.mode !== 'flight' || s.warpPhase !== 'idle' || s.scope || raceActive()) return
  const body = s.targetId ? bodies.get(s.targetId) : undefined
  if (!body) {
    s.showToast(OBSERVE_TEXT.none())
    return
  }
  body.object.getWorldPosition(p)
  const d = p.distanceTo(ship.position)
  if (d > observeRange(body.radius)) {
    s.showToast(OBSERVE_TEXT.far(body.name))
    return
  }
  if (passThrough.has(body.id) && d < body.radius * 0.95) {
    s.showToast(OBSERVE_TEXT.inside())
    return
  }
  const chosen = body.id
  s.setAutopilot(false)
  observeRun.fresh = true
  observeRun.alignPending = 10
  observeRun.rate = ORBIT_RATE
  useObserve.setState({ id: chosen, docking: false, lap: (Math.PI * 2) / ORBIT_RATE })
  s.showToast(OBSERVE_TEXT.start(body.name))
}

export function stopObserve() {
  if (useObserve.getState().id) useObserve.setState({ id: null, docking: false })
}

export function toggleObserve() {
  if (useObserve.getState().id) stopObserve()
  else startObserve()
}

/** コロニーの港の入口まで自動で向かう（着いたら観察を終えて、操縦を返す） */
export function dockAtPort() {
  const { id, docking } = useObserve.getState()
  if (!canDock(id)) return
  useObserve.setState({ docking: !docking })
}
