import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useOptionalTexture } from '../hooks/useOptionalTexture'
import { textureUrl } from '../data/textures'

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// 昼側は昼の地図、夜側は都市の灯り。境目（明暗境界）はなめらかに混ぜる
const fragmentShader = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform vec3 uSunDir;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  void main() {
    float light = dot(normalize(vWorldNormal), uSunDir);
    float dayMix = smoothstep(-0.15, 0.25, light);
    vec3 day = texture2D(uDay, vUv).rgb * max(light, 0.0);
    vec3 night = texture2D(uNight, vUv).rgb * 1.4;
    gl_FragColor = vec4(mix(night, day, dayMix), 1.0);
    #include <colorspace_fragment>
  }
`

/** 地球の表面。テクスチャが揃わない間は null を返し、呼び出し側が通常の球を描く */
export function EarthSurface({ radius }: { radius: number }) {
  const day = useOptionalTexture(textureUrl('earth'))
  const night = useOptionalTexture(textureUrl('earthNight'))
  const clouds = useOptionalTexture(textureUrl('earthClouds'))
  const surface = useRef<THREE.Mesh>(null!)
  const cloudLayer = useRef<THREE.Mesh>(null)

  const uniforms = useMemo(
    () => ({ uDay: { value: null as THREE.Texture | null }, uNight: { value: null as THREE.Texture | null }, uSunDir: { value: new THREE.Vector3(1, 0, 0) } }),
    [],
  )
  uniforms.uDay.value = day
  uniforms.uNight.value = night

  const worldPos = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, delta) => {
    if (!surface.current) return
    surface.current.getWorldPosition(worldPos)
    uniforms.uSunDir.value.copy(worldPos).negate().normalize()
    if (cloudLayer.current) cloudLayer.current.rotation.y += delta * 0.02
  })

  if (!day || !night) return null

  return (
    <>
      <mesh ref={surface}>
        <sphereGeometry args={[radius, 64, 64]} />
        <shaderMaterial vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniforms} />
      </mesh>
      {clouds && (
        <mesh ref={cloudLayer} scale={1.012}>
          <sphereGeometry args={[radius, 64, 64]} />
          <meshStandardMaterial alphaMap={clouds} transparent depthWrite={false} color="#ffffff" />
        </mesh>
      )}
    </>
  )
}
