import { memo, useEffect, useRef, type PointerEvent as RPointerEvent } from 'react'
import { Canvas } from '@react-three/fiber'
import { useDpr } from '../../state/quality'
import { QualityGovernor } from '../QualityGovernor'
import { closeIss, issInput, playSpot, useIss } from '../../state/iss'
import { IssWorld } from './IssWorld'
import { IssHud } from './IssHud'
import './iss.css'

// 宇宙ステーション（ISS）の中の場面。宇宙の場面とは別の Canvas で描く（そのあいだ宇宙の場面は止める：App.tsx）。
// 奥行きの対数（logarithmicDepthBuffer）は使わない：near 3 cm で部屋（10 m ほど）を描き、
// 窓の外の地球は別のカメラで描く（IssEarth.tsx）。窓の型にステンシルを使うので stencil: true

const IssCanvas = memo(function IssCanvas() {
  const dpr = useDpr(1.75)
  return (
    <Canvas dpr={dpr} gl={{ alpha: false, stencil: true, antialias: true }} camera={{ fov: 70, near: 0.03, far: 60, position: [0, 0, -2.75] }}>
      <color attach="background" args={['#000']} />
      <IssWorld />
      <QualityGovernor />
    </Canvas>
  )
})

/** キー：WASD・矢印で進む、スペース・シフトで上下、F で宙返り、Esc でカードを閉じる */
const KEYS: Record<string, [keyof typeof issInput, number]> = {
  KeyW: ['z', 1],
  ArrowUp: ['z', 1],
  KeyS: ['z', -1],
  ArrowDown: ['z', -1],
  KeyA: ['x', -1],
  ArrowLeft: ['x', -1],
  KeyD: ['x', 1],
  ArrowRight: ['x', 1],
}

function useIssKeys() {
  useEffect(() => {
    const held = new Set<string>()
    const sync = () => {
      issInput.x = 0
      issInput.z = 0
      for (const k of held) {
        const m = KEYS[k]
        if (m) (issInput[m[0]] as number) += m[1]
      }
      issInput.up = held.has('Space') || held.has('KeyE')
      issInput.down = held.has('ShiftLeft') || held.has('ShiftRight') || held.has('KeyQ')
    }
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      // 宇宙の場面のキー（地図・発進など）に渡さない
      e.stopPropagation()
      if (e.code === 'Escape') {
        if (useIss.getState().spot) playSpot(null)
        else closeIss()
        return
      }
      if (e.code === 'KeyF') {
        if (!e.repeat) useIss.setState({ flips: useIss.getState().flips + 1 })
        return
      }
      if (KEYS[e.code] || ['Space', 'ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyE'].includes(e.code)) {
        e.preventDefault()
        held.add(e.code)
        sync()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (held.delete(e.code)) sync()
    }
    const blur = () => {
      held.clear()
      sync()
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
  }, [])
}

/** 見回す：画面をドラッグ（スマホでは右側をなぞる。左下のスティックとボタンは別） */
function LookPad() {
  const last = useRef<Map<number, [number, number]>>(new Map())
  const down = (e: RPointerEvent) => {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    last.current.set(e.pointerId, [e.clientX, e.clientY])
  }
  const move = (e: RPointerEvent) => {
    const p = last.current.get(e.pointerId)
    if (!p) return
    const k = e.pointerType === 'touch' ? 0.006 : 0.0045
    issInput.lookX += (e.clientX - p[0]) * k
    issInput.lookY += (e.clientY - p[1]) * k
    last.current.set(e.pointerId, [e.clientX, e.clientY])
  }
  const end = (e: RPointerEvent) => last.current.delete(e.pointerId)
  return <div className="iss-look" onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
}

export function IssView() {
  const phase = useIss((s) => s.phase)
  useIssKeys()
  return (
    <div className="iss-root" data-phase={phase}>
      <IssCanvas />
      <LookPad />
      <IssHud />
    </div>
  )
}
