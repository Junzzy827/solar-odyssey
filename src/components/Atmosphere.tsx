import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vNormalW;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }
`

const fragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uColor;
  uniform float uPower;
  uniform vec3 uSunDir;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vNormalW;
  void main() {
    // 背面の球なので、外側の輪郭で0、本体の縁に近づくほど濃くなる
    float glow = pow(abs(dot(vNormal, vView)), uPower);
    // 太陽に照らされた側の縁だけ光る（夜側の縁はほとんど見えない）
    glow *= smoothstep(-0.45, 0.35, dot(normalize(vNormalW), uSunDir)) * 0.95 + 0.05;
    gl_FragColor = vec4(uColor * glow, glow);
    #include <logdepthbuf_fragment>
  }
`

const center = new THREE.Vector3()

/** 縁がぼんやり光る大気のグロー（背面を加算合成で描く） */
export function Atmosphere({ radius, color, power = 1.4, scale = 1.08 }: { radius: number; color: string; power?: number; scale?: number }) {
  const uniforms = useMemo(
    () => ({ uColor: { value: new THREE.Color(color) }, uPower: { value: power }, uSunDir: { value: new THREE.Vector3(1, 0, 0) } }),
    [color, power],
  )
  const mesh = useRef<THREE.Mesh>(null!)
  useFrame(() => {
    mesh.current.getWorldPosition(center)
    uniforms.uSunDir.value.copy(center).negate().normalize()
  })
  return (
    <mesh ref={mesh} scale={scale}>
      <sphereGeometry args={[radius, 48, 48]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.BackSide}
      />
    </mesh>
  )
}

const shellVertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
    #include <logdepthbuf_vertex>
  }
`

const shellFragment = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uColor;
  uniform vec3 uCenter;
  uniform vec3 uSunDir;
  uniform float uR;
  uniform float uA;
  uniform float uStrength;
  varying vec3 vWorld;

  void main() {
    vec3 ro = cameraPosition - uCenter;
    vec3 rd = normalize(vWorld - cameraPosition);
    float b = dot(ro, rd);
    // 惑星の中（ガス惑星に潜っているとき）は、雲の中の描き方にまかせる
    float cp = dot(ro, ro) - uR * uR;
    if (cp < 0.0) discard;
    // 大気の球に入るところと出るところ
    float ha = b * b - (dot(ro, ro) - uA * uA);
    if (ha <= 0.0) discard;
    ha = sqrt(ha);
    float t0 = max(0.0, -b - ha);
    float t1 = -b + ha;
    // 地表に当たるなら、そこまで
    float hp = b * b - cp;
    if (hp > 0.0) {
      float tp = -b - sqrt(hp);
      if (tp > 0.0) t1 = min(t1, tp);
    }
    if (t1 <= t0) discard;

    // 視線に沿って空気の濃さを足し合わせる。濃さは高さとともに指数関数で薄くなる
    float H = (uA - uR) * 0.28;
    float ds = (t1 - t0) / 12.0;
    float tau = 0.0;
    float light = 0.0;
    for (int i = 0; i < 12; i++) {
      vec3 p = ro + rd * (t0 + (float(i) + 0.5) * ds);
      float r = length(p);
      float d = exp(-max(r - uR, 0.0) / H) * ds / H;
      tau += d;
      // 昼の側の空気だけが光る（明け方・夕方の境目はやわらかく）
      float lit = smoothstep(-0.2, 0.3, dot(p / r, uSunDir));
      light += d * lit * exp(-tau * 0.12);
    }
    float mu = dot(rd, uSunDir);
    float phase = 0.75 * (1.0 + mu * mu);
    float glow = (1.0 - exp(-light * 0.28 * phase)) * uStrength;
    gl_FragColor = vec4(uColor * glow, glow);

    // 深さは、視線が地表（または大気の外）に出る点のものにする。
    // こうすると惑星の表面の手前にかすみが重なり、手前にある船にはかからない
    #ifdef USE_LOGDEPTHBUF
      float w = -(viewMatrix * vec4(cameraPosition + rd * t1, 1.0)).z;
      gl_FragDepth = log2(1.0 + max(w, 0.0) * 0.999) * logDepthBufFC * 0.5;
    #endif
  }
`

/**
 * 惑星の大気。視線が通る空気の量を計算して光らせるので、遠くからは縁の光る輪、
 * 低い軌道からは地平線にそって光る薄い層、斜めに見下ろす地表には青いかすみになる。
 */
export function PlanetAtmosphere({ radius, color, strength = 1, scale = 1.08 }: { radius: number; color: string; strength?: number; scale?: number }) {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(color) },
      uCenter: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uR: { value: radius },
      uA: { value: radius * scale },
      uStrength: { value: strength },
    }),
    [color, radius, scale, strength],
  )
  const mesh = useRef<THREE.Mesh>(null!)
  useFrame(() => {
    mesh.current.getWorldPosition(center)
    uniforms.uCenter.value.copy(center)
    uniforms.uSunDir.value.copy(center).negate().normalize()
  })
  return (
    <mesh ref={mesh} scale={scale} renderOrder={1}>
      <sphereGeometry args={[radius, 96, 64]} />
      <shaderMaterial
        vertexShader={shellVertex}
        fragmentShader={shellFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.BackSide}
      />
    </mesh>
  )
}
