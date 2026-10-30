import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { photoUniform } from '../state/look'

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
  uniform float uFade;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vNormalW;
  void main() {
    // 背面の球なので、外側の輪郭で0、本体の縁に近づくほど濃くなる
    float glow = pow(abs(dot(vNormal, vView)), uPower);
    // 太陽に照らされた側の縁だけ光る（夜側の縁はほとんど見えない）
    glow *= smoothstep(-0.45, 0.35, dot(normalize(vNormalW), uSunDir)) * 0.95 + 0.05;
    glow *= uFade;
    gl_FragColor = vec4(uColor * glow, glow);
    #include <logdepthbuf_fragment>
  }
`

const center = new THREE.Vector3()

/** 写真モードの地球の大気の厚さ（半径に対する比） */
const PHOTO_EARTH_SCALE = 1.035

/** 縁がぼんやり光る大気のグロー（背面を加算合成で描く） */
/** photoFade: 写真モードのときの明るさ（太陽のグローは、写真ではレンズのにじみ程度に弱める） */
export function Atmosphere({ radius, color, power = 1.4, scale = 1.08, photoFade = 1 }: { radius: number; color: string; power?: number; scale?: number; photoFade?: number }) {
  const uniforms = useMemo(
    () => ({ uColor: { value: new THREE.Color(color) }, uPower: { value: power }, uSunDir: { value: new THREE.Vector3(1, 0, 0) }, uFade: { value: 1 } }),
    [color, power],
  )
  const mesh = useRef<THREE.Mesh>(null!)
  useFrame(() => {
    mesh.current.getWorldPosition(center)
    uniforms.uSunDir.value.copy(center).negate().normalize()
    uniforms.uFade.value = photoUniform.value > 0.5 ? photoFade : 1
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
  uniform float uPhoto;
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

    if (uPhoto > 0.5) {
      // 写真モード（地球）：簡単なレイリー散乱。空気は青い光ほど強く散らす。
      // 太陽の光がその場所まで空気を長く通ってくる（明け方・夕方の）ところでは、青が抜けてオレンジになる。
      // 惑星の影に入った空気は光らないので、夜側の縁は光らない
      vec3 beta = vec3(0.17, 0.41, 1.0);
      vec3 ray = vec3(0.0);
      vec3 mie = vec3(0.0);
      float tauV = 0.0;
      for (int i = 0; i < 12; i++) {
        vec3 p = ro + rd * (t0 + (float(i) + 0.5) * ds);
        float r = length(p);
        float d = exp(-max(r - uR, 0.0) / H) * ds / H;
        tauV += d;
        float cs = dot(p, uSunDir) / r;
        // 太陽への光線が惑星にさえぎられるか（影）
        float axis = length(p - dot(p, uSunDir) * uSunDir);
        float lit = cs > 0.0 ? 1.0 : smoothstep(uR * 0.995, uR * 1.01, axis);
        // 太陽の光が通ってくる空気の量（太陽が低いほど多い）
        float airmass = exp(-max(r - uR, 0.0) / H) / max(cs + 0.18, 0.06);
        vec3 sun = exp(-beta * airmass * 0.55) * lit;
        vec3 seen = exp(-beta * tauV * 0.06);
        ray += d * sun * seen;
        mie += d * sun * seen * exp(-tauV * 0.04);
      }
      vec3 c = ray * beta * 0.08 * phase + mie * 0.0015 * (1.0 + 4.0 * pow(max(mu, 0.0), 6.0));
      c = (1.0 - exp(-c * 1.6)) * uStrength;
      gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));
    }

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
/**
 * 写真モードでは、ガス・氷の巨大惑星（kind="giant"）の大気の輪は描かない。
 * 地球（kind="earth"）は昼側の縁に細く光る薄い膜にして、明け方・夕方の境目をほんのりオレンジにする
 */
export function PlanetAtmosphere({ radius, color, strength = 1, scale = 1.08, kind = 'other' }: { radius: number; color: string; strength?: number; scale?: number; kind?: 'earth' | 'giant' | 'other' }) {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(color) },
      uCenter: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uR: { value: radius },
      uA: { value: radius * scale },
      uStrength: { value: strength },
      uPhoto: { value: 0 },
    }),
    [color, radius, scale, strength],
  )
  const mesh = useRef<THREE.Mesh>(null!)
  useFrame(() => {
    const photo = photoUniform.value > 0.5
    mesh.current.visible = !(photo && kind === 'giant')
    // 地球の写真モード：大気の層を薄く（本物の大気は半径の約1.5%。光って見えるのはもっと下のほう）
    const s = photo && kind === 'earth' ? PHOTO_EARTH_SCALE : scale
    mesh.current.scale.setScalar(s)
    uniforms.uA.value = radius * s
    uniforms.uPhoto.value = photo && kind === 'earth' ? 1 : 0
    // 火星・金星・タイタンなどのもやも、写真では控えめ
    uniforms.uStrength.value = photo && kind === 'other' ? strength * 0.45 : strength
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
