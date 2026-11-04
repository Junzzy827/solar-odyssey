import { useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import { screenRadius } from './useSphereLod'

/** 切り替えの境目で行ったり来たりしないための幅（割合） */
const HYSTERESIS = 0.2

/**
 * 物が画面で小さく（半径 px ピクセル未満に）なったら「遠い」とみなし、変わったときだけ onChange を呼ぶ（LOD）。
 * radius は object の座標での半径（拡大縮小は自動でかける）。返り値の current で今の状態も読める
 */
export function useFarLod(object: RefObject<THREE.Object3D | null>, radius: number, px: number, onChange: (far: boolean) => void) {
  const far = useRef(false)
  const started = useRef(false)
  useFrame(({ camera, size }) => {
    const o = object.current
    if (!o) return
    const r = screenRadius(o, radius, camera, size.height)
    const next = far.current ? r < px : r < px * (1 - HYSTERESIS)
    if (next === far.current && started.current) return
    started.current = true
    far.current = next
    onChange(next)
  })
  return far
}
