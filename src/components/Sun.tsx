import { SUN_RADIUS } from '../data/scale'

// M3でノイズシェーダによる表面のうねりに置き換える
export function Sun() {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[SUN_RADIUS, 64, 64]} />
        <meshBasicMaterial color="#ffcc66" />
      </mesh>
      <mesh scale={1.15}>
        <sphereGeometry args={[SUN_RADIUS, 32, 32]} />
        <meshBasicMaterial color="#ff9933" transparent opacity={0.15} depthWrite={false} />
      </mesh>
      <pointLight intensity={3} distance={0} decay={0} />
    </group>
  )
}
