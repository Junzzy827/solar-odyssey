import { create } from 'zustand'

// 無人探査ローバー ORV-7。着陸したあと、着陸船の腹からたたんだまま落とされ、地面で展開して走り出す。
// 流れ：none → drop（落ちる）→ deploy（展開）→ drive（運転）。回収すると none にもどる。

export type RoverPhase = 'none' | 'drop' | 'deploy' | 'drive'
/** 運転中の見方：後ろから追う・マストのカメラから */
export type RoverView = 'chase' | 'cam'

export const DEPLOY_SEC = 6
/** 走り回れる範囲（着陸地点を中心にした正方形の半分の幅、m） */
export const ROVER_RANGE = 100
/** 最高速度（m/s）。時速 60 km */
export const ROVER_TOP = 60 / 3.6

type RoverState = {
  phase: RoverPhase
  since: number
  view: RoverView
  /** 画面に出す速さ（km/h）。毎フレームではなく、ときどき書き換える */
  kmh: number
  setView: (v: RoverView) => void
}

export const roverNow = () => performance.now() / 1000

export const useRover = create<RoverState>((set) => ({
  phase: 'none',
  since: 0,
  view: 'chase',
  kmh: 0,
  setView: (view) => set({ view }),
}))

export const roverActive = () => useRover.getState().phase !== 'none'

export function launchRover() {
  if (roverActive()) return
  useRover.setState({ phase: 'drop', since: roverNow(), view: 'chase', kmh: 0 })
}

export function recallRover() {
  useRover.setState({ phase: 'none', since: roverNow(), kmh: 0 })
}

export const setRoverPhase = (phase: RoverPhase) => useRover.setState({ phase, since: roverNow() })

/** 運転の入力（キーボードと画面のボタンの両方から書き込む）。-1..1 */
export const roverInput = { throttle: 0, steer: 0, jump: false }
const keys = new Set<string>()

function fromKeys() {
  const f = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0
  const b = keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0
  const l = keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0
  const r = keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0
  roverInput.throttle = f - b
  roverInput.steer = r - l
}

const DRIVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyV'])

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

/** ローバーのいる場所（太陽の影を描く範囲をローバーに合わせるため） */
export const roverFocus = { x: 0, y: 0, z: -15, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z } }
