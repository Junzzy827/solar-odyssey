import { Suspense, memo, useEffect, useRef, type PointerEvent as RPointerEvent } from 'react'
import { Canvas } from '@react-three/fiber'
import { useDpr } from '../../state/quality'
import { isTouchDevice } from '../../state/input'
import { closeShuttle, igniteShuttle, leaveSpot, openPadSpot, shuttleInput, useShuttle } from '../../state/shuttle'
import { ShuttleWorld } from './ShuttleWorld'
import { ShuttleLaunchWorld } from './ShuttleLaunchWorld'
import { ShuttleHud } from './ShuttleHud'
import { ShuttleLaunchHud } from './ShuttleLaunchHud'
import { startCabinHum, stopCabinHum } from './hum'
import { startLaunchAudio, stopLaunchAudio } from './rumble'
import './shuttle.css'

// スペースシャトルの画面。宇宙の場面の上に、別の Canvas を全画面で出す。
//   軌道の乗員室：描き方は ShuttleWorld が自分で決める（外の地球 → 奥行きを消す → 乗員室）。near は 3 cm（顔の前の計器まで描けるように）。
//   発射台と打ち上げ：ShuttleLaunchWorld。地上から高さ 60 km までを 1 つの場面で描くので、対数の奥行きを使う。

const ShuttleCanvas = memo(function ShuttleCanvas() {
  const dpr = useDpr(1.75)
  return (
    <Canvas dpr={dpr} gl={{ alpha: false, antialias: true }} camera={{ fov: 70, near: 0.03, far: 200, position: [0, 3.3, -1.2] }}>
      <Suspense fallback={null}>
        <ShuttleWorld />
      </Suspense>
    </Canvas>
  )
})

const LaunchCanvas = memo(function LaunchCanvas() {
  const dpr = useDpr(1.5)
  return (
    <Canvas dpr={dpr} gl={{ alpha: false, antialias: true, logarithmicDepthBuffer: true }} camera={{ fov: 45, near: 0.3, far: 400_000, position: [-120, 20, 140] }}>
      <Suspense fallback={null}>
        <ShuttleLaunchWorld />
      </Suspense>
    </Canvas>
  )
})

/** キー：押している間だけ。見どころの中では Esc で出る */
function useKeys() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      const st = useShuttle.getState()
      if (e.code === 'Escape' && st.spot) {
        leaveSpot()
        return
      }
      if (e.code === 'Escape' && st.padSpot) {
        openPadSpot(null)
        return
      }
      // 点火を待っているときは、Space・Enter でも点火できる
      if ((e.code === 'Space' || e.code === 'Enter') && st.phase === 'launch' && st.stage === 'hold') {
        igniteShuttle()
        e.preventDefault()
        return
      }
      if (/^(Key[WASD]|Arrow|Space|Shift)/.test(e.code)) {
        shuttleInput.keys.add(e.code)
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => shuttleInput.keys.delete(e.code)
    const blur = () => shuttleInput.keys.clear()
    const move = (e: MouseEvent) => {
      if (!document.pointerLockElement) return
      shuttleInput.lookX += e.movementX * 0.0025
      shuttleInput.lookY += e.movementY * 0.0025
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    document.addEventListener('mousemove', move)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      document.removeEventListener('mousemove', move)
      shuttleInput.keys.clear()
    }
  }, [])
}

/** 画面をなぞって見回す（指・マウス）。PC はクリックでマウスを固定 */
function useLookDrag() {
  const last = useRef<{ id: number; x: number; y: number } | null>(null)
  return {
    onPointerDown: (e: RPointerEvent) => {
      const cabin = useShuttle.getState().scene === 'orbit'
      if (cabin) startCabinHum()
      else startLaunchAudio()
      if (!(e.target instanceof HTMLCanvasElement)) return
      // マウスの固定は軌道の乗員室だけ（発射台はドラッグで回る、席はなぞって見回す）
      if (cabin && e.pointerType === 'mouse' && !document.pointerLockElement && !isTouchDevice()) {
        try {
          void e.target.requestPointerLock?.()
        } catch {
          // 固定できない環境では、なぞる操作だけ
        }
      }
      last.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
    },
    onPointerMove: (e: RPointerEvent) => {
      const l = last.current
      if (!l || l.id !== e.pointerId || document.pointerLockElement) return
      const k = e.pointerType === 'touch' ? 0.006 : 0.004
      shuttleInput.lookX += (e.clientX - l.x) * k
      shuttleInput.lookY += (e.clientY - l.y) * k
      l.x = e.clientX
      l.y = e.clientY
    },
    onPointerUp: () => (last.current = null),
    onPointerCancel: () => (last.current = null),
  }
}

export function ShuttleView() {
  const phase = useShuttle((s) => s.phase)
  const scene = useShuttle((s) => s.scene)
  const look = useLookDrag()
  useKeys()
  useEffect(() => {
    if (scene === 'pad') {
      startLaunchAudio()
      return stopLaunchAudio
    }
    startCabinHum()
    return stopCabinHum
  }, [scene])
  if (phase === 'none') return null
  const launch = scene === 'pad'
  return (
    <div className="surface-view solid shuttle-view" {...look}>
      {launch ? <LaunchCanvas /> : <ShuttleCanvas />}
      {launch && phase !== 'loading' ? <ShuttleLaunchHud /> : <ShuttleHud />}
      <div className={`shuttle-curtain${phase === 'loading' ? ' on' : ''}`} />
    </div>
  )
}

export { closeShuttle }
