import { useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { DIVE_DEPTH } from '../data/approach'
import { proximity } from '../state/proximity'

const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vLocal;
  varying vec2 vUv;
  void main() {
    vLocal = position;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`

const fragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uCam;
  uniform float uRadius;
  uniform float uDepth;
  uniform vec3 uHaze;
  uniform vec3 uDeep;
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform float uTime;
  varying vec3 vLocal;
  varying vec2 vUv;
  void main() {
    // 見上げると雲の層ごしに明るく、見下ろすと深く暗い
    vec3 dir = normalize(vLocal - uCam);
    vec3 up = normalize(uCam);
    float mu = dot(dir, up);
    float lift = smoothstep(-0.45, 0.85, mu);

    // 縞模様の雲（テクスチャがあればそれを使う）
    float lat = vLocal.y / uRadius;
    float wave = sin(lat * 46.0 + sin(vLocal.x / uRadius * 5.0 + uTime * 0.05) * 1.6);
    vec3 bands = uHaze * (0.82 + 0.18 * wave);
    if (uHasMap > 0.5) bands = mix(bands, texture2D(uMap, vUv).rgb * 1.15, 0.6);

    vec3 color = mix(uDeep, mix(uHaze, bands, 0.5), lift);
    // 下るほど暗く、赤みがかる
    color *= mix(1.0, 0.3, uDepth);
    color = mix(color, uDeep * vec3(1.3, 0.75, 0.5), uDepth * 0.6 * (1.0 - lift));
    gl_FragColor = vec4(color, 1.0);
    #include <logdepthbuf_fragment>
  }
`

const center = new THREE.Vector3()

/**
 * ガス惑星の雲の中。カメラか自機が雲の上（半径）より内側に入ったら、
 * 内側から見た球で外の宇宙を覆い、霧の中にいるように見せる。
 * 自機が潜ったら惑星の表面は消す（後ろのカメラが外にいても、船が雲の上面に隠れないように）。
 */
export function CloudInterior({
  id,
  radius,
  haze,
  deep,
  map,
  surface,
}: {
  id: string
  radius: number
  haze: string
  deep: string
  map: THREE.Texture | null
  surface: RefObject<THREE.Group>
}) {
  const mesh = useRef<THREE.Mesh>(null!)
  const uniforms = useMemo(
    () => ({
      uCam: { value: new THREE.Vector3() },
      uRadius: { value: radius },
      uDepth: { value: 0 },
      uHaze: { value: new THREE.Color(haze) },
      uDeep: { value: new THREE.Color(deep) },
      uMap: { value: null as THREE.Texture | null },
      uHasMap: { value: 0 },
      uTime: { value: 0 },
    }),
    [radius, haze, deep],
  )
  uniforms.uMap.value = map
  uniforms.uHasMap.value = map ? 1 : 0

  useFrame(({ camera, clock }) => {
    const m = mesh.current
    m.getWorldPosition(center)
    const shipInside = proximity.id === id && proximity.altitude < 0
    if (surface.current) surface.current.visible = !shipInside
    const inside = shipInside || camera.position.distanceTo(center) < radius * 0.999
    m.visible = inside
    if (!inside) return
    uniforms.uCam.value.copy(camera.position)
    m.worldToLocal(uniforms.uCam.value)
    uniforms.uDepth.value = THREE.MathUtils.clamp((radius - uniforms.uCam.value.length()) / (radius * DIVE_DEPTH), 0, 1)
    uniforms.uTime.value = clock.getElapsedTime()
  })

  return (
    <mesh ref={mesh} visible={false}>
      <sphereGeometry args={[radius, 96, 64]} />
      <shaderMaterial vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniforms} side={THREE.BackSide} />
    </mesh>
  )
}
