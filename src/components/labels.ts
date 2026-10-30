import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useLayout } from '../state/useLayout'
import { BLACK_HOLE_POS, DESERT_POS, ICE_POS } from '../data/sf'

/**
 * 天体の名札（drei の Html）の重なり順。既定ではとても大きな z-index になり、
 * 航法コンピュータや航海日誌の上に名札がかぶるので、画面の部品より下にする
 */
export const LABEL_Z: [number, number] = [0, 0]

const at = new THREE.Vector3()
const sight = new THREE.Vector3()

/** カメラから見て、その位置が太陽（原点）の向こうに隠れているか */
export function behindSun(eye: THREE.Vector3, p: THREE.Vector3, sun: number) {
  sight.subVectors(p, eye)
  const len = sight.length()
  sight.divideScalar(len)
  // 視線のうち、太陽にいちばん近づくところ
  const t = -eye.dot(sight)
  return t > 0 && t < len && eye.lengthSq() - t * t < sun * sun
}

const FAR_PLACES = [BLACK_HOLE_POS, DESERT_POS, ICE_POS].map((p) => new THREE.Vector3(...p))
const FAR_NEAR = 3000

/** 太陽系の外の遠い場所（ブラックホール・系外惑星）の近くにいるか。そこでは太陽系の名札を出さない */
export function nearFarPlace(eye: THREE.Vector3) {
  return FAR_PLACES.some((p) => eye.distanceToSquared(p) < FAR_NEAR * FAR_NEAR)
}

/** 名札は奥まで透けて見えるので、太陽の向こうに隠れたら消す（太陽を大きくしたときに目立つ） */
export function useHideBehindSun(span: RefObject<HTMLElement | null>, anchor: RefObject<THREE.Object3D | null>) {
  const sun = useLayout().sun
  useFrame(({ camera }) => {
    if (!span.current || !anchor.current) return
    const hide = nearFarPlace(camera.position) || behindSun(camera.position, anchor.current.getWorldPosition(at), sun)
    span.current.style.display = hide ? 'none' : ''
  })
}
