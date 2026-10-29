import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useOptionalTexture } from '../hooks/useOptionalTexture'
import { textureUrl } from '../data/textures'

const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  varying vec3 vPosW;
  varying vec3 vNormalW;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vPosW = w.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
    #include <logdepthbuf_vertex>
  }
`

// 輪の粒は太陽の側から照らされる。本体の影に入ったところは暗くなる。
// 太陽と反対側から見ると、光が粒をすかして弱く通る
const fragmentShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform vec3 uColor;
  uniform vec3 uCenter;
  uniform float uPlanetRadius;
  varying vec2 vUv;
  varying vec3 vPosW;
  varying vec3 vNormalW;

  float hash(float x) { return fract(sin(x * 91.7) * 43758.5453); }

  void main() {
    vec4 tex = uHasMap > 0.5 ? texture2D(uMap, vec2(vUv.x, 0.5)) : vec4(uColor, 0.7);
    // 細い筋（リングレット）を足して、拡大したときも細かく見せる
    float x = vUv.x * 900.0;
    float ringlet = mix(hash(floor(x)), hash(floor(x) + 1.0), smoothstep(0.0, 1.0, fract(x)));
    tex.a *= 0.82 + 0.3 * ringlet;
    tex.rgb *= 0.9 + 0.2 * ringlet;

    vec3 L = normalize(-vPosW);
    vec3 V = normalize(cameraPosition - vPosW);
    vec3 N = normalize(vNormalW);
    float lit = abs(dot(N, L));
    bool sameSide = dot(N, L) * dot(N, V) > 0.0;
    float light = sameSide ? 0.25 + 0.85 * lit : 0.12 + 0.35 * lit * (1.0 - tex.a);

    // 本体の影：太陽へ向かう光線が球に当たるか
    vec3 oc = vPosW - uCenter;
    float b = dot(oc, L);
    float c = dot(oc, oc) - uPlanetRadius * uPlanetRadius;
    float disc = b * b - c;
    if (disc > 0.0 && -b - sqrt(disc) > 0.0) light *= 0.05;

    gl_FragColor = vec4(tex.rgb * light, tex.a);
    #include <logdepthbuf_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** 輪のテクスチャは半径方向の1本の帯なので、UVを内側→外側に張り直す */
export function SaturnRing({ inner, outer, color, planetRadius }: { inner: number; outer: number; color: string; planetRadius: number }) {
  const map = useOptionalTexture(textureUrl('saturnRing'))

  const geometry = useMemo(() => {
    const g = new THREE.RingGeometry(inner, outer, 256, 1)
    const pos = g.attributes.position
    const uv = g.attributes.uv
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5)
    }
    return g
  }, [inner, outer])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uMap: { value: null as THREE.Texture | null },
          uHasMap: { value: 0 },
          uColor: { value: new THREE.Color(color) },
          uCenter: { value: new THREE.Vector3() },
          uPlanetRadius: { value: planetRadius },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [color, planetRadius],
  )
  material.uniforms.uMap.value = map
  material.uniforms.uHasMap.value = map ? 1 : 0

  // 輪の中心＝本体の中心
  const mesh = useRef<THREE.Mesh>(null!)
  useFrame(() => mesh.current.getWorldPosition(material.uniforms.uCenter.value))

  return <mesh ref={mesh} geometry={geometry} material={material} rotation={[-Math.PI / 2, 0, 0]} />
}
