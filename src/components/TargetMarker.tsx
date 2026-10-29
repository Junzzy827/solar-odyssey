import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { bodies, markerOverride } from '../state/registry'
import { useStore } from '../state/store'

const p = new THREE.Vector3()
const MARGIN = 40

/** 目標の位置に枠を出し、画面外なら端に矢印を出す（DOM を直接動かす） */
export function TargetMarker() {
  useFrame(({ camera, size }) => {
    const el = document.getElementById('target-marker')
    if (!el) return
    const st = useStore.getState()
    const target = markerOverride.object ? { object: markerOverride.object } : st.targetId ? bodies.get(st.targetId) : undefined
    if (!target || st.mode !== 'flight' || st.warpPhase === 'warp') {
      el.style.display = 'none'
      return
    }
    target.object.getWorldPosition(p)
    p.project(camera)
    const behind = p.z > 1
    let x = p.x
    let y = p.y
    if (behind) {
      x = -x
      y = -y
    }
    const onScreen = !behind && Math.abs(x) <= 1 && Math.abs(y) <= 1
    if (!onScreen) {
      const k = 1 / Math.max(Math.abs(x), Math.abs(y), 1e-6)
      x *= k
      y *= k
    }
    const sx = THREE.MathUtils.clamp(((x + 1) / 2) * size.width, MARGIN, size.width - MARGIN)
    const sy = THREE.MathUtils.clamp(((1 - y) / 2) * size.height, MARGIN, size.height - MARGIN)
    el.style.display = 'block'
    el.style.transform = `translate(${sx}px, ${sy}px)`
    el.dataset.offscreen = String(!onScreen)
    const arrow = el.querySelector<HTMLElement>('.arrow')
    if (arrow) arrow.style.transform = `rotate(${Math.atan2(-y, x)}rad)`
  })
  return null
}
