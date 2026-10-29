import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useOptionalTexture } from '../hooks/useOptionalTexture'
import { textureUrl } from '../data/textures'

const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vPosW = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`

// 昼側は昼の地図、夜側は都市の灯り。境目（明暗境界）はなめらかに混ぜる。
// 海には太陽の照り返し、地表には雲の影、縁には大気の青い散乱をのせる
const fragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uClouds;
  uniform float uHasClouds;
  uniform float uCloudShift;
  uniform vec3 uSunDir;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vPosW;
  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vPosW);
    vec3 L = uSunDir;
    float light = dot(N, L);
    float mu = max(dot(N, V), 0.0);
    float dayMix = smoothstep(-0.15, 0.25, light);
    vec3 dayTex = texture2D(uDay, vUv).rgb;

    // 雲の影：雲の層は少し速く回るので、ずらした位置の雲を読む
    float shadow = 1.0;
    if (uHasClouds > 0.5) {
      float c = texture2D(uClouds, vUv + vec2(uCloudShift, 0.0)).r;
      shadow = 1.0 - 0.45 * c;
    }
    vec3 day = dayTex * max(light, 0.0) * shadow;

    // 海の照り返し（青が強いところを海とみなす）
    float ocean = smoothstep(0.02, 0.12, dayTex.b - max(dayTex.r, dayTex.g) * 0.9);
    vec3 H = normalize(L + V);
    float glint = pow(max(dot(N, H), 0.0), 260.0) * 0.7 + pow(max(dot(N, H), 0.0), 40.0) * 0.05;
    day += vec3(1.0, 0.92, 0.8) * glint * ocean * shadow * step(0.0, light);

    vec3 night = texture2D(uNight, vUv).rgb * 1.4;
    vec3 color = mix(night, day, dayMix);

    // 大気の散乱：昼側の縁が青く光り、明暗境界は夕焼け色に
    float rim = pow(1.0 - mu, 2.4);
    float lit = smoothstep(-0.25, 0.45, light);
    color += vec3(0.32, 0.58, 1.0) * rim * lit * 0.55;
    color += vec3(1.0, 0.5, 0.25) * exp(-pow(light * 9.0, 2.0)) * rim * 0.12;

    gl_FragColor = vec4(color, 1.0);
    #include <logdepthbuf_fragment>
    #include <tonemapping_fragment>
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
    () => ({
      uDay: { value: null as THREE.Texture | null },
      uNight: { value: null as THREE.Texture | null },
      uClouds: { value: null as THREE.Texture | null },
      uHasClouds: { value: 0 },
      uCloudShift: { value: 0 },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    }),
    [],
  )
  uniforms.uDay.value = day
  uniforms.uNight.value = night
  uniforms.uClouds.value = clouds
  uniforms.uHasClouds.value = clouds ? 1 : 0
  if (clouds && clouds.wrapS !== THREE.RepeatWrapping) {
    clouds.wrapS = THREE.RepeatWrapping
    clouds.needsUpdate = true
  }

  const worldPos = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, delta) => {
    if (!surface.current) return
    surface.current.getWorldPosition(worldPos)
    uniforms.uSunDir.value.copy(worldPos).negate().normalize()
    if (cloudLayer.current) {
      cloudLayer.current.rotation.y += delta * 0.02
      // 球の u は回転と逆向きに進むので、雲の回った分だけ戻して読む
      uniforms.uCloudShift.value = -cloudLayer.current.rotation.y / (Math.PI * 2)
    }
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
