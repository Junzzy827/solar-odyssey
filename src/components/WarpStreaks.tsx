import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { warpFx } from '../state/flight'

const COUNT = 700
const DEPTH = 160

/** ワープ中に星が光の筋になって流れる。カメラに追従させる */
export function WarpStreaks() {
  const group = useRef<THREE.Group>(null!)
  const material = useRef<THREE.LineBasicMaterial>(null!)

  const { geometry, seeds } = useMemo(() => {
    const seeds = Array.from({ length: COUNT }, () => {
      const a = Math.random() * Math.PI * 2
      const r = 1.5 + Math.random() * 30
      return { x: Math.cos(a) * r, y: Math.sin(a) * r, z: -Math.random() * DEPTH }
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 6), 3))
    return { geometry: g, seeds }
  }, [])

  useFrame(({ camera }, delta) => {
    const k = warpFx.intensity
    group.current.visible = k > 0.01
    if (!group.current.visible) return
    group.current.position.copy(camera.position)
    group.current.quaternion.copy(camera.quaternion)
    material.current.opacity = k

    const pos = geometry.attributes.position.array as Float32Array
    const speed = 40 + 400 * k
    const length = 0.5 + 25 * k
    seeds.forEach((s, i) => {
      s.z += speed * delta
      if (s.z > 0) s.z -= DEPTH
      pos.set([s.x, s.y, s.z, s.x, s.y, s.z - length], i * 6)
    })
    geometry.attributes.position.needsUpdate = true
  })

  return (
    <group ref={group} visible={false}>
      <lineSegments geometry={geometry} frustumCulled={false}>
        <lineBasicMaterial ref={material} color="#bcd4ff" transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </lineSegments>
    </group>
  )
}
