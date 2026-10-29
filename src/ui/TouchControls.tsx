import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { isTouchDevice, touchInput } from '../state/input'
import { useStore } from '../state/store'
import { useQuiz } from '../state/quiz'

/** スティックを倒しきったときの、つまみの動く半径（ピクセル） */
const STICK_RADIUS = 48
/** 画面をなぞった量に掛ける倍率（マウスより大きく動かしにくいので） */
const LOOK_GAIN = 2.2

/** 左手の親指で動かすスティック：上で前進、下で後退、左右で横に動く */
function Stick() {
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const center = useRef({ x: 0, y: 0 })
  const active = useRef<number | null>(null)

  const update = (e: ReactPointerEvent) => {
    let x = e.clientX - center.current.x
    let y = e.clientY - center.current.y
    const len = Math.hypot(x, y)
    if (len > STICK_RADIUS) {
      x *= STICK_RADIUS / len
      y *= STICK_RADIUS / len
    }
    setKnob({ x, y })
    touchInput.x = x / STICK_RADIUS
    touchInput.y = y / STICK_RADIUS
  }
  const release = () => {
    active.current = null
    setKnob({ x: 0, y: 0 })
    touchInput.x = touchInput.y = 0
  }

  return (
    <div
      className="touch-stick"
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        center.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        active.current = e.pointerId
        e.currentTarget.setPointerCapture(e.pointerId)
        update(e)
      }}
      onPointerMove={(e) => active.current === e.pointerId && update(e)}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div className="touch-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  )
}

/** 押しているあいだだけ効くボタン（上昇・下降・回転） */
function HoldButton({ label, title, onHold }: { label: string; title: string; onHold: (on: boolean) => void }) {
  return (
    <button
      className="touch-button"
      aria-label={title}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        onHold(true)
      }}
      onPointerUp={() => onHold(false)}
      onPointerCancel={() => onHold(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  )
}

/** 画面（キャンバス）をなぞって船の向きを変える */
function useLookDrag(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const canvas = document.querySelector<HTMLCanvasElement>('#root canvas')
    if (!canvas) return
    let last: { id: number; x: number; y: number } | null = null
    const down = (e: PointerEvent) => {
      if (last) return
      last = { id: e.pointerId, x: e.clientX, y: e.clientY }
    }
    const move = (e: PointerEvent) => {
      if (!last || last.id !== e.pointerId) return
      touchInput.lookX += (e.clientX - last.x) * LOOK_GAIN
      touchInput.lookY += (e.clientY - last.y) * LOOK_GAIN
      last = { id: e.pointerId, x: e.clientX, y: e.clientY }
    }
    const up = (e: PointerEvent) => {
      if (last?.id === e.pointerId) last = null
    }
    canvas.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      canvas.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [enabled])
}

/** スマホ・タブレットの操縦：スティック、なぞって向き、上昇・下降・回転・ビーム・カメラのボタン */
export function TouchControls() {
  const mode = useStore((s) => s.mode)
  const scope = useStore((s) => s.scope)
  const cameraMode = useStore((s) => s.cameraMode)
  const setCameraMode = useStore((s) => s.setCameraMode)
  const quizOpen = useQuiz((q) => q.open)
  const touch = isTouchDevice()
  const show = touch && mode === 'flight' && !scope && !quizOpen
  useLookDrag(show)

  // 操縦席を離れたら、押しっぱなしの入力を残さない
  useEffect(() => {
    if (show) return
    Object.assign(touchInput, { x: 0, y: 0, lift: 0, roll: 0, lookX: 0, lookY: 0, fire: false })
  }, [show])

  if (!show) return null
  return (
    <>
      <Stick />
      <div className="touch-buttons">
        <div className="touch-row">
          <HoldButton label="⟲" title="左に回転" onHold={(on) => (touchInput.roll = on ? 1 : 0)} />
          <HoldButton label="⟳" title="右に回転" onHold={(on) => (touchInput.roll = on ? -1 : 0)} />
        </div>
        <div className="touch-row">
          <HoldButton label="▲" title="上昇" onHold={(on) => (touchInput.lift = on ? 1 : 0)} />
          <HoldButton label="▼" title="下降" onHold={(on) => (touchInput.lift = on ? -1 : 0)} />
        </div>
        <div className="touch-row">
          <button className="touch-button wide" onClick={() => setCameraMode(cameraMode === 'chase' ? 'hero' : 'chase')}>
            カメラ
          </button>
          <button className="touch-button wide beam" onPointerDown={() => (touchInput.fire = true)}>
            ビーム
          </button>
        </div>
      </div>
    </>
  )
}
