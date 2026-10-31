import { useEffect, useState } from 'react'
import { create } from 'zustand'
import * as THREE from 'three'
import { MISSIONS } from '../data/missions'
import { useMission } from './mission'
import { useStore } from './store'
import { t } from '../i18n/lang'

// アルカディアの発進路から着陸船を送り出す演出。
// 時間の流れ（秒）：0〜STANDBY 発進準備（誘導灯が前へ流れ、着陸船のエンジンが温まる）、
// 〜CATAPULT_END カタパルトで加速して舳先から飛び出す、〜FLY_END 前へ飛び去る、〜READY_AT 次の着陸船が発進路に出てくる

export const STANDBY = 1.6
export const CATAPULT_END = 4.2
export const FLY_END = 9.5
export const READY_AT = 11.5

type LaunchState = { /** 発進を始めた時刻（performance.now() / 1000）。null は待機中 */ start: number | null }

/** 毎フレームの値（React の外）：着陸船の宇宙での位置と、発進カメラを使う時間かどうか */
export const launchFx = { pos: new THREE.Vector3(), camera: 0 }

export const useLaunch = create<LaunchState>(() => ({ start: null }))

export const launchNow = () => performance.now() / 1000

/** 発進中かどうか（次の着陸船が出てくるまで） */
export const launchBusy = (s = useLaunch.getState()) => s.start !== null && launchNow() - s.start < READY_AT

/** 物語モードで、探査艇・着陸艇を出す場面か（そのときの L キーはそちらに使う） */
function missionCraftStep() {
  const m = useMission.getState()
  if (m.phase !== 'active') return false
  const kind = MISSIONS[m.index]?.steps[m.step]?.kind
  return kind === 'launch' || kind === 'land'
}

export function canLaunchLander() {
  const st = useStore.getState()
  return st.settings.ship === 'arcadia' && st.mode === 'flight' && st.warpPhase === 'idle' && !launchBusy() && !missionCraftStep()
}

export function launchLander() {
  if (!canLaunchLander()) return
  useLaunch.setState({ start: launchNow() })
  useStore.getState().showToast(t('着陸船、発進！', 'Lander away!'))
}

/** 待機にもどす（船を乗りかえたときなど） */
export function resetLaunch() {
  if (useLaunch.getState().start !== null) useLaunch.setState({ start: null })
}

/** ボタン用：発進中は押せない。次の着陸船が出てきたら押せるように描き直す */
export function useLaunchBusy() {
  const start = useLaunch((l) => l.start)
  const [, setTick] = useState(0)
  useEffect(() => {
    if (start === null) return
    const left = READY_AT - (launchNow() - start)
    if (left <= 0) return
    const id = window.setTimeout(() => setTick((n) => n + 1), left * 1000 + 50)
    return () => window.clearTimeout(id)
  }, [start])
  return start !== null && launchNow() - start < READY_AT
}
