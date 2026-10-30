import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { registerBody } from '../state/registry'
import { t } from '../i18n/lang'
import { useLayout } from '../state/useLayout'
import { Atmosphere } from './Atmosphere'
import { usePostToneMapping } from './SpaceLighting'

const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vPos = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }
`

// 3Dノイズを重ねて、粒状斑（対流の泡）と黒点のような濃淡がゆっくり動く表面を作る
const fragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform float uTime;
  uniform float uToned;
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vView;

  vec3 hash3(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(dot(hash3(i), f), dot(hash3(i + vec3(1, 0, 0)), f - vec3(1, 0, 0)), u.x),
          mix(dot(hash3(i + vec3(0, 1, 0)), f - vec3(0, 1, 0)), dot(hash3(i + vec3(1, 1, 0)), f - vec3(1, 1, 0)), u.x), u.y),
      mix(mix(dot(hash3(i + vec3(0, 0, 1)), f - vec3(0, 0, 1)), dot(hash3(i + vec3(1, 0, 1)), f - vec3(1, 0, 1)), u.x),
          mix(dot(hash3(i + vec3(0, 1, 1)), f - vec3(0, 1, 1)), dot(hash3(i + vec3(1, 1, 1)), f - vec3(1, 1, 1)), u.x), u.y),
      u.z);
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 p = normalize(vPos) * 3.0;
    float t = uTime * 0.04;
    // ノイズで座標をずらしてから再びノイズをかけ、うねる流れにする
    vec3 warp = vec3(fbm(p + t), fbm(p + vec3(5.2, 1.3, 2.8) - t), fbm(p + vec3(1.7, 9.2, 3.4) + t * 0.5));
    float granules = fbm(p * 4.0 + warp * 2.0 + t * 2.0);
    float spots = smoothstep(0.35, 0.55, fbm(p * 0.8 + vec3(t * 0.3)));
    float heat = clamp(0.55 + granules * 0.9 - spots * 0.35, 0.0, 1.0);

    vec3 deep = vec3(0.75, 0.22, 0.02);
    vec3 mid = vec3(1.0, 0.62, 0.15);
    vec3 hot = vec3(1.0, 0.95, 0.75);
    vec3 color = heat < 0.5 ? mix(deep, mid, heat * 2.0) : mix(mid, hot, (heat - 0.5) * 2.0);

    // 周縁減光：縁ほど暗く赤くなる
    float mu = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
    color *= 0.45 + 0.55 * pow(mu, 0.45);

    color *= 1.6;
    // 後処理でトーンマッピング（ACES）を掛ける画質では、掛けた後も今までの金色に近く見えるよう、色を寄せておく
    if (uToned > 0.5) color *= vec3(1.2, 0.85, 0.65);
    gl_FragColor = vec4(color, 1.0);
    #include <logdepthbuf_fragment>
  }
`

export function Sun() {
  const surface = useRef<THREE.Mesh>(null!)
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uToned: { value: 0 } }), [])
  uniforms.uToned.value = usePostToneMapping() ? 1 : 0
  const radius = useLayout().sun

  useEffect(() => registerBody({ id: 'sun', get name() { return t('太陽', 'Sun') }, radius, object: surface.current }), [radius])

  // 太陽は赤道付近で約25日かけて自転する
  useFrame(({ clock }, delta) => {
    uniforms.uTime.value = clock.getElapsedTime()
    surface.current.rotation.y += delta * 0.05
  })

  return (
    <group>
      <mesh ref={surface}>
        <sphereGeometry args={[radius, 96, 96]} />
        <shaderMaterial vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniforms} toneMapped={false} />
      </mesh>
      <Atmosphere radius={radius} color="#ffb347" power={1.5} scale={1.4} />
      <pointLight intensity={3} distance={0} decay={0} />
    </group>
  )
}
