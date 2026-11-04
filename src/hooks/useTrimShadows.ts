import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const scale = new THREE.Vector3()

/**
 * 影を落とす部品のうち、とても小さいもの（半径 minRadius 未満。場面の単位で）は影を落とさないようにする。
 * 数 cm のボルトや札まで影の地図に描くと、影のための描画が全体の 3 分の 1 にもなるが、影はほとんど見えない。
 * 部品はあとから増える（作業の道具・ローバーなど）ので、1 秒ごとに見直す
 */
export function useTrimShadows(minRadius: number) {
  const next = useRef(0)
  useFrame(({ scene, clock }) => {
    if (clock.elapsedTime < next.current) return
    next.current = clock.elapsedTime + 1
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || !mesh.castShadow || mesh.userData.keepShadow) return
      const g = mesh.geometry
      if (!g.boundingSphere) g.computeBoundingSphere()
      mesh.getWorldScale(scale)
      const r = (g.boundingSphere?.radius ?? 0) * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z))
      if (r < minRadius) mesh.castShadow = false
    })
  })
}
