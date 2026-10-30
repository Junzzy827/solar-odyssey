import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import * as THREE from 'three'
import { textureUrl } from '../data/textures'
import { useOptionalTexture } from '../hooks/useOptionalTexture'
import { bodies } from '../state/registry'
import { photoUniform, starExposure } from '../state/look'

const BASE = new THREE.Color('#9a9a9a')
const center = new THREE.Vector3()
const toBody = new THREE.Vector3()
const forward = new THREE.Vector3()

/**
 * 写真モードの自動露出：日の当たった明るい天体が画面に大きく映っているほど、背景の星を暗くする。
 * カメラは明るい天体に露出を合わせるので、それよりずっと暗い星は写らない
 */
function brightOnScreen(camera: THREE.PerspectiveCamera) {
  const halfV = (camera.fov * Math.PI) / 360
  const halfH = Math.atan(Math.tan(halfV) * camera.aspect)
  const halfDiag = Math.atan(Math.hypot(Math.tan(halfV), Math.tan(halfH)))
  camera.getWorldDirection(forward)
  let sum = 0
  for (const b of bodies.values()) {
    b.object.getWorldPosition(center)
    toBody.subVectors(center, camera.position)
    const d = toBody.length()
    if (d < b.radius) return 1
    const a = Math.asin(b.radius / d)
    // 画面の外なら数えない
    if (Math.acos(THREE.MathUtils.clamp(toBody.dot(forward) / d, -1, 1)) > halfDiag + a) continue
    const area = Math.min((Math.PI * a * a) / (4 * halfV * halfH), 1)
    if (b.id === 'sun') {
      sum += Math.max(area, 0.004) * 60
      continue
    }
    // 見えている昼側の割合（位相）
    const cosPhase = center.lengthSq() > 0 ? -toBody.dot(center) / (d * center.length()) : 1
    sum += area * (1 + cosPhase) * 0.5
  }
  return sum
}

/** 天の川の全天画像。無ければ点の星空。遠くの星なので、どこへ行ってもカメラと一緒に動かす */
export function Sky() {
  const map = useOptionalTexture(textureUrl('milkyWay'))
  const group = useRef<THREE.Group>(null!)
  const material = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(({ camera }, delta) => {
    group.current.position.copy(camera.position)
    // 図鑑モードはいつも同じ明るさ。写真モードは明るい天体の映り方で、なめらかに変える
    const target = photoUniform.value > 0.5 ? 1 - 0.96 * THREE.MathUtils.smoothstep(brightOnScreen(camera as THREE.PerspectiveCamera), 0.003, 0.08) : 1
    starExposure.value += (target - starExposure.value) * (1 - Math.exp(-delta * 2.5))
    material.current?.color.copy(BASE).multiplyScalar(starExposure.value)
  })
  return (
    <group ref={group}>
      {map ? (
        <mesh renderOrder={-1}>
          <sphereGeometry args={[2000, 64, 64]} />
          <meshBasicMaterial ref={material} map={map} side={THREE.BackSide} color="#9a9a9a" depthWrite={false} />
        </mesh>
      ) : (
        <Stars radius={1500} depth={200} count={8000} factor={6} fade />
      )}
    </group>
  )
}
