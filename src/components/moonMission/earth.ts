import * as THREE from 'three'
import { OUT_CHUNK } from './shaderOut'

// 打ち上げの場面の地球：昼の側は昼の地図と雲、夜の側は街の明かり、ふちには薄い大気の光。
// 本物の大きさ（半径 6,371 km）で描く。地上のすぐ近くは発射台のまわりの地面（LaunchWorld）が受け持つ。

const vert = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  varying vec3 vNw;
  varying vec3 vPw;
  void main() {
    vUv = uv;
    vNw = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vPw = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
    #include <logdepthbuf_vertex>
  }
`

const frag = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uClouds;
  uniform vec3 uSun;
  uniform float uNear;
  uniform float uLights;
  uniform float uNear2;
  varying vec2 vUv;
  varying vec3 vNw;
  varying vec3 vPw;
  void main() {
    #include <logdepthbuf_fragment>
    vec3 n = normalize(vNw);
    vec3 v = normalize(cameraPosition - vPw);
    float l = dot(n, uSun);
    float day = smoothstep(-0.08, 0.12, l);
    vec3 dayCol = texture2D(uDay, vUv).rgb;
    float cl = texture2D(uClouds, vUv).r;
    dayCol = mix(dayCol, vec3(0.95), smoothstep(0.15, 0.9, cl) * 0.9);
    dayCol *= max(0.0, l) * 1.25;
    // 夜の街の明かり（雲がかかると少し隠れる）
    vec3 night = texture2D(uNight, vUv).rgb * (1.0 - cl * 0.6);
    // 低い所から見ると地図の粗さ（1 画素 10 km）が目立つので、街の明かりは高く上がるほど強く
    night = pow(night, vec3(1.6)) * vec3(1.25, 0.95, 0.65) * 1.6 * uLights;
    vec3 col = mix(night, dayCol, day);
    // 夕焼けの帯
    float dusk = exp(-pow((l - 0.02) / 0.045, 2.0));
    col += vec3(0.6, 0.25, 0.08) * dusk * 0.12;
    // 大気：ふちほど青く光る（昼の側）
    // 低い軌道からは見える地面のほとんどが斜めなので、ふちの光は地平線のすぐ近くだけ
    float rim = pow(1.0 - max(0.0, dot(n, v)), mix(3.0, 9.0, uNear2));
    col += vec3(0.25, 0.5, 1.0) * rim * smoothstep(-0.2, 0.3, l) * 0.9;
    // 近いときは粗い地図が目立つので、少し暗く沈める
    col *= mix(1.0, 0.55, uNear);
    gl_FragColor = vec4(col, 1.0);
    ${OUT_CHUNK}
  }
`

export function earthMaterial(day: THREE.Texture, night: THREE.Texture, clouds: THREE.Texture) {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uDay: { value: day },
      uNight: { value: night },
      uClouds: { value: clouds },
      uSun: { value: new THREE.Vector3(0, -1, 0) },
      uNear: { value: 0 },
      uLights: { value: 1 },
      uNear2: { value: 0 },
    },
  })
}

// 大気の外側の殻（ふちの青い光の輪）
const atmoVert = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vNw;
  varying vec3 vPw;
  void main() {
    vNw = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vPw = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
    #include <logdepthbuf_vertex>
  }
`
const atmoFrag = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uSun;
  uniform vec3 uCenter;
  uniform float uR;
  uniform float uGlow;
  varying vec3 vNw;
  varying vec3 vPw;
  void main() {
    #include <logdepthbuf_fragment>
    vec3 n = normalize(vNw);
    vec3 v = normalize(cameraPosition - vPw);
    float rim = 1.0 - abs(dot(n, v));
    float a = pow(rim, 5.0);
    float lit = smoothstep(-0.35, 0.25, dot(n, uSun));
    vec3 col = mix(vec3(0.02, 0.04, 0.12), vec3(0.35, 0.6, 1.0), lit) * a;
    // 夜の大気光（酸素の緑の光）：高さ 90〜100 km の薄い層を真横から見るので、地平線の上に細い線になる
    vec3 d = -v;
    vec3 oc = uCenter - cameraPosition;
    float tc = dot(oc, d);
    float hTan = length(oc - d * tc) - uR;
    float g = tc > 0.0 ? exp(-pow((hTan - 95000.0) / 4500.0, 2.0)) : 0.0;
    vec3 q = normalize(cameraPosition + d * tc - uCenter);
    float night = 1.0 - smoothstep(-0.25, 0.05, dot(q, uSun));
    col += vec3(0.42, 0.8, 0.36) * g * night * 0.26 * uGlow;
    gl_FragColor = vec4(col, max(a, g * night * uGlow));
    ${OUT_CHUNK}
  }
`

export function atmosphereMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: atmoVert,
    fragmentShader: atmoFrag,
    uniforms: { uSun: { value: new THREE.Vector3(0, -1, 0) }, uCenter: { value: new THREE.Vector3() }, uR: { value: 6_371_000 }, uGlow: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  })
}
