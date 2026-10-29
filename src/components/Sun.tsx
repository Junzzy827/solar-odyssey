import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SUN_RADIUS } from '../data/scale'
import { textureUrl } from '../data/textures'
import { useOptionalTexture } from '../hooks/useOptionalTexture'
import { registerBody } from '../state/registry'
import { Atmosphere } from './Atmosphere'

// M3でノイズシェーダによる表面のうねりに置き換える
export function Sun() {
  const map = useOptionalTexture(textureUrl('sun'))
  const surface = useRef<THREE.Mesh>(null!)

  useEffect(() => registerBody({ id: 'sun', name: '太陽', radius: SUN_RADIUS, object: surface.current }), [])

  // 太陽は赤道付近で約25日かけて自転する
  useFrame((_, delta) => {
    surface.current.rotation.y += delta * 0.05
  })

  return (
    <group>
      <mesh ref={surface}>
        <sphereGeometry args={[SUN_RADIUS, 64, 64]} />
        {map ? <meshBasicMaterial map={map} color="#ffe0a0" /> : <meshBasicMaterial color="#ffcc66" />}
      </mesh>
      <Atmosphere radius={SUN_RADIUS} color="#ffb347" power={1.5} scale={1.4} />
      <pointLight intensity={3} distance={0} decay={0} />
    </group>
  )
}
