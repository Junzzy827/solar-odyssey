import { Suspense, memo, useEffect, useRef, type PointerEvent as RPointerEvent } from 'react'
import { Canvas } from '@react-three/fiber'
import { useDpr } from '../../state/quality'
import { isTouchDevice } from '../../state/input'
import { closeShuttle, leaveSpot, shuttleInput, useShuttle } from '../../state/shuttle'
import { ShuttleWorld } from './ShuttleWorld'
import { ShuttleHud } from './ShuttleHud'
import { startCabinHum, stopCabinHum } from './hum'
import './shuttle.css'

// スペースシャトルの乗員室の画面。宇宙の場面の上に、別の Canvas を全画面で出す。
// 描き方は ShuttleWorld が自分で決める（外の地球 → 奥行きを消す → 乗員室）。near は 3 cm（顔の前の計器まで描けるように）。

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

/** キー：押している間だけ。見どころの中では Esc で出る */
function useKeys() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.code === 'Escape' && useShuttle.getState().spot) {
        leaveSpot()
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
      startCabinHum()
      if (!(e.target instanceof HTMLCanvasElement)) return
      if (e.pointerType === 'mouse' && !document.pointerLockElement && !isTouchDevice()) {
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
  const look = useLookDrag()
  useKeys()
  useEffect(() => {
    startCabinHum()
    return stopCabinHum
  }, [])
  if (phase === 'none') return null
  return (
    <div className="surface-view solid shuttle-view" {...look}>
      <ShuttleCanvas />
      <ShuttleHud />
      <div className={`shuttle-curtain${phase === 'loading' ? ' on' : ''}`} />
    </div>
  )
}

export { closeShuttle }
