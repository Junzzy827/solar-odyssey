import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { isTouchDevice, touchInput } from '../state/input'
import { nextCameraMode, useStore } from '../state/store'
import { useQuiz } from '../state/quiz'
import { t, useLang } from '../i18n/lang'
import { useTouchUI } from '../state/touchUI'
import { bodyInfo, engage } from '../state/flight'
import { TouchThrottle } from './Throttle'
import { raceActive } from '../state/race'
import { launchLander, useLaunchBusy } from '../state/launch'
import { toggleObserve, useObserve } from '../state/observe'

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
function HoldButton({ label, title, onHold, className = '' }: { label: string; title: string; onHold: (on: boolean) => void; className?: string }) {
  return (
    <button
      className={`touch-button ${className}`}
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

/** 操縦席では推進の段階（−／＋）、目標を選んでいるときは目標の名前とワープ・自動航行（全体マップでも出す） */
export function TouchWarp() {
  useLang()
  const mode = useStore((s) => s.mode)
  const scope = useStore((s) => s.scope)
  const targetId = useStore((s) => s.targetId)
  const warpPhase = useStore((s) => s.warpPhase)
  const autopilot = useStore((s) => s.autopilot)
  const setAutopilot = useStore((s) => s.setAutopilot)
  const distance = useStore((s) => s.telemetry.distance)
  const observing = useObserve((o) => o.id !== null)
  const quizOpen = useQuiz((q) => q.open)
  const sheet = useTouchUI((u) => u.sheet)
  // 操縦席では、目標がなくても推進の段階（−／＋）だけは出す
  const throttle = mode === 'flight'
  if (!isTouchDevice() || mode === 'gallery' || scope || quizOpen || sheet || raceActive() || (!targetId && !throttle)) return null
  const info = targetId ? bodyInfo(targetId) : null
  const busy = warpPhase !== 'idle'
  return (
    <div className={`touch-warp ${mode}`}>
      {throttle && <TouchThrottle />}
      {targetId && (
        <>
          <div className="touch-warp-name">
            {info?.name}
            {distance !== null && <span>{distance < 10 ? distance.toFixed(1) : Math.round(distance)}</span>}
          </div>
          <div className="touch-row">
            <button className="touch-button wide warp" onClick={engage} disabled={busy}>
              {t('ワープ', 'Warp')}
            </button>
            <button className={`touch-button wide auto${autopilot ? ' on' : ''}`} onClick={() => setAutopilot(!autopilot)} disabled={busy}>
              {t('自動', 'Auto')}
            </button>
            {mode === 'flight' && (
              <button className={`touch-button wide observe${observing ? ' on' : ''}`} onClick={toggleObserve} disabled={busy}>
                {t('観察', 'Observe')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** スマホ・タブレットの操縦：スティック、なぞって向き、上昇・下降・回転・ビーム・カメラのボタン */
export function TouchControls() {
  useLang()
  const mode = useStore((s) => s.mode)
  const scope = useStore((s) => s.scope)
  const cameraMode = useStore((s) => s.cameraMode)
  const setCameraMode = useStore((s) => s.setCameraMode)
  const shipId = useStore((s) => s.settings.ship)
  const warpPhase = useStore((s) => s.warpPhase)
  const launching = useLaunchBusy()
  const quizOpen = useQuiz((q) => q.open)
  const sheet = useTouchUI((u) => u.sheet)
  const touch = isTouchDevice()
  const show = touch && mode === 'flight' && !scope && !quizOpen && !sheet
  useLookDrag(show)

  // 操縦席を離れたら、押しっぱなしの入力を残さない
  useEffect(() => {
    if (show) return
    Object.assign(touchInput, { x: 0, y: 0, lift: 0, roll: 0, lookX: 0, lookY: 0, beam: false, beamPressed: false })
  }, [show])

  if (!show) return null
  return (
    <>
      <Stick />
      <div className="touch-buttons">
        <div className="touch-row">
          <HoldButton label="⟲" title={t('左に回転', 'Roll left')} onHold={(on) => (touchInput.roll = on ? 1 : 0)} />
          <HoldButton label="⟳" title={t('右に回転', 'Roll right')} onHold={(on) => (touchInput.roll = on ? -1 : 0)} />
        </div>
        <div className="touch-row">
          <HoldButton label="▲" title={t('上昇', 'Up')} onHold={(on) => (touchInput.lift = on ? 1 : 0)} />
          <HoldButton label="▼" title={t('下降', 'Down')} onHold={(on) => (touchInput.lift = on ? -1 : 0)} />
        </div>
        {shipId === 'arcadia' && (
          <div className="touch-row">
            <button className="touch-button wide launch" onClick={launchLander} disabled={launching || warpPhase !== 'idle'}>
              {t('発進', 'Launch')}
            </button>
          </div>
        )}
        <div className="touch-row">
          <button className="touch-button wide" onClick={() => setCameraMode(nextCameraMode(cameraMode))}>
            {t('カメラ', 'Camera')}
          </button>
          <HoldButton className="wide beam" label={t('ビーム', 'Beam')} title={t('ビーム（長押しでチャージ）', 'Beam (hold to charge)')} onHold={(on) => {
              touchInput.beam = on
              if (on) touchInput.beamPressed = true
            }} />
        </div>
      </div>
    </>
  )
}
