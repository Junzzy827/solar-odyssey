import { useMemo, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * 球の細かさを、画面に写る大きさで切り替える（LOD）。
 * 遠くで数ピクセルにしか見えない惑星や衛星を、近くと同じ数万枚の三角形で描くと、
 * 内蔵 GPU のノートPCでは頂点の計算だけで重くなる。表面の模様や凹凸は画素ごとに描いているので、
 * 三角形を減らして変わるのは輪郭のなめらかさだけ。
 */

/** [横の分割, 縦の分割, この半径（画面のピクセル）以上で使う] 細かい順 */
const LEVELS: [number, number, number][] = [
  [0, 0, 160], // いちばん細かい（呼び出し側の分割をそのまま使う）
  [64, 48, 28],
  [24, 16, 0],
]
/** 切り替えの境目で行ったり来たりしないための幅（割合） */
const HYSTERESIS = 0.2

const cache = new Map<string, THREE.SphereGeometry>()
function sphere(radius: number, w: number, h: number) {
  const key = `${radius}:${w}:${h}`
  let g = cache.get(key)
  if (!g) {
    g = new THREE.SphereGeometry(radius, w, h)
    cache.set(key, g)
  }
  return g
}

const center = new THREE.Vector3()
const scale = new THREE.Vector3()

/** 画面での半径（CSS ピクセル） */
export function screenRadius(object: THREE.Object3D, radius: number, camera: THREE.Camera, viewHeight: number) {
  object.getWorldPosition(center)
  object.getWorldScale(scale)
  const r = radius * Math.max(scale.x, scale.y, scale.z)
  const d = Math.max(camera.position.distanceTo(center) - r, r * 0.01)
  const fov = (camera as THREE.PerspectiveCamera).fov ?? 50
  return (r / d / Math.tan((fov * Math.PI) / 360)) * (viewHeight / 2)
}

/**
 * mesh の球を、画面での大きさに合わせて細かい・中くらい・粗いに差し替える。
 * 返り値は最初に付ける（いちばん細かい）形
 */
export function useSphereLod(mesh: RefObject<THREE.Mesh | null>, radius: number, width: number, height: number) {
  const geometries = useMemo(() => LEVELS.map(([w, h], i) => (i === 0 ? sphere(radius, width, height) : sphere(radius, Math.min(w, width), Math.min(h, height)))), [radius, width, height])
  const state = useMemo(() => ({ level: 0 }), [])

  useFrame(({ camera, size }) => {
    const m = mesh.current
    if (!m) return
    const px = screenRadius(m, radius, camera, size.height)
    let level = state.level
    // 細かくするときはすぐ、粗くするときは境目より少し小さくなってから
    while (level > 0 && px >= LEVELS[level - 1][2]) level--
    while (level < LEVELS.length - 1 && px < LEVELS[level][2] * (1 - HYSTERESIS)) level++
    if (level !== state.level || m.geometry !== geometries[level]) {
      state.level = level
      m.geometry = geometries[level]
    }
  })

  // 形は半径ごとに使い回すので捨てない（<mesh geometry={...}> で渡せば、外すときに R3F も捨てない）
  return geometries[0]
}
