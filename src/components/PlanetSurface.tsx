import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { textureUrl } from '../data/textures'
import { useOptionalTexture } from '../hooks/useOptionalTexture'
import { createSurfaceMaterial, surfaceOptions } from './planetMaterial'

const center = new THREE.Vector3()
const inverse = new THREE.Matrix4()

/** 惑星・衛星の表面（光の当たり方・流れる雲・近づいたときの凹凸・輪の影） */
export function PlanetSurface({
  id,
  radius,
  color,
  haze,
  ring,
}: {
  id: string
  radius: number
  color: string
  haze?: string
  ring?: { inner: number; outer: number }
}) {
  const map = useOptionalTexture(textureUrl(id))
  const ringMap = useOptionalTexture(ring ? textureUrl('saturnRing') : undefined)
  const mesh = useRef<THREE.Mesh>(null!)
  const material = useMemo(
    () => createSurfaceMaterial({ ...surfaceOptions(id, radius, color, { haze, ring }), eclipse: id === 'moon' ? 'moon' : id === 'earth' ? 'earth' : undefined }),
    // 輪は内側・外側の値だけを見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, radius, color, haze, ring?.inner, ring?.outer],
  )
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    // 雲を東西に流すので、横方向はつなげる
    if (map) {
      map.wrapS = THREE.RepeatWrapping
      map.needsUpdate = true
    }
    material.uniforms.uMap.value = map
    material.uniforms.uHasMap.value = map ? 1 : 0
    material.uniforms.uRingMap.value = ringMap
    material.uniforms.uRingHasMap.value = ringMap ? 1 : 0
  }, [map, ringMap, material])

  useFrame(({ camera, clock }) => {
    const u = material.uniforms
    u.uTime.value = clock.getElapsedTime()
    const m = mesh.current
    m.getWorldPosition(center)
    // 太陽の向きを、この球の座標で（輪の影の計算に使う）
    u.uSunL.value.copy(center).negate().transformDirection(inverse.copy(m.matrixWorld).invert())
    // 表面に近づくほど細かい凹凸を足す
    const altitude = camera.position.distanceTo(center) - radius
    u.uDetail.value = 1 - THREE.MathUtils.smoothstep(altitude, radius * 0.15, radius * 1.4)
  })

  return (
    <mesh ref={mesh} material={material}>
      <sphereGeometry args={[radius, 128, 96]} />
    </mesh>
  )
}
