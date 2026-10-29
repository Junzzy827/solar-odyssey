import { Stars } from '@react-three/drei'
import * as THREE from 'three'
import { textureUrl } from '../data/textures'
import { useOptionalTexture } from '../hooks/useOptionalTexture'

/** 天の川の全天画像。無ければ点の星空 */
export function Sky() {
  const map = useOptionalTexture(textureUrl('milkyWay'))
  if (!map) return <Stars radius={1500} depth={200} count={8000} factor={6} fade />
  return (
    <mesh>
      <sphereGeometry args={[2000, 64, 64]} />
      <meshBasicMaterial map={map} side={THREE.BackSide} color="#9a9a9a" depthWrite={false} />
    </mesh>
  )
}
