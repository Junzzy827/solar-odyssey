import { useMemo } from 'react'
import * as THREE from 'three'
import { useOptionalTexture } from '../hooks/useOptionalTexture'
import { textureUrl } from '../data/textures'

/** 輪のテクスチャは半径方向の1本の帯なので、UVを内側→外側に張り直す */
export function SaturnRing({ inner, outer, color }: { inner: number; outer: number; color: string }) {
  const alpha = useOptionalTexture(textureUrl('saturnRing'))

  const geometry = useMemo(() => {
    const g = new THREE.RingGeometry(inner, outer, 160, 1)
    const pos = g.attributes.position
    const uv = g.attributes.uv
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5)
    }
    return g
  }, [inner, outer])

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]}>
      {alpha ? (
        <meshStandardMaterial map={alpha} transparent side={THREE.DoubleSide} depthWrite={false} />
      ) : (
        <meshStandardMaterial color={color} transparent opacity={0.7} side={THREE.DoubleSide} />
      )}
    </mesh>
  )
}
