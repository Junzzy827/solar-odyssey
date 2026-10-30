import * as THREE from 'three'

// 太陽系の外の惑星の表面と大気（手続き的に描く）。光は惑星ごとの恒星（2つまで）から当てる。
// kind 0：砂の惑星（砂丘の筋、岩の台地、干上がった塩の平原）
// kind 1：氷の惑星（青白い氷床、割れ目、海氷のすき間、うすい雲）

const vertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vLocal;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vLocal = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}
`

const noise = /* glsl */ `
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) { s += a * vnoise(p); p = p * 2.03 + 1.7; a *= 0.5; }
  return s;
}
`

const surface = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform int uKind;
uniform float uTime;
uniform vec3 uL1;
uniform vec3 uC1;
uniform vec3 uL2;
uniform vec3 uC2;
varying vec3 vLocal;
varying vec3 vWorld;
varying vec3 vNormal;
${noise}

vec3 desert(vec3 n, out float spec) {
  float h = fbm(n * 3.0);
  float plates = smoothstep(0.58, 0.64, fbm(n * 5.0 + 4.0)) * 0.85;
  vec3 sand = mix(vec3(0.85, 0.62, 0.38), vec3(0.93, 0.76, 0.52), fbm(n * 9.0));
  // 風が作る砂丘の筋（場所ごとに向きが少しずれる）
  float dune = sin(dot(n, vec3(0.8, 0.2, 0.5)) * 420.0 + fbm(n * 8.0) * 40.0);
  float duneField = smoothstep(0.45, 0.6, fbm(n * 3.0 + 2.0));
  sand *= 0.95 + 0.06 * dune * duneField;
  vec3 rock = mix(vec3(0.45, 0.28, 0.18), vec3(0.62, 0.4, 0.26), fbm(n * 20.0));
  vec3 col = mix(sand, rock, plates);
  // 干上がった塩の平原
  float salt = smoothstep(0.62, 0.66, fbm(n * 2.0 + 9.0));
  col = mix(col, vec3(0.92, 0.88, 0.8), salt * (1.0 - plates));
  col *= 0.85 + 0.3 * h;
  spec = 0.0;
  return col;
}

vec3 ice(vec3 n, out float spec) {
  float h = fbm(n * 3.5);
  vec3 sheet = mix(vec3(0.78, 0.88, 0.97), vec3(0.95, 0.98, 1.0), smoothstep(0.35, 0.7, h));
  // 氷の割れ目（青く光る細い線）
  float crack = 1.0 - smoothstep(0.0, 0.025, abs(fbm(n * 7.0 + 2.0) - 0.5));
  sheet = mix(sheet, vec3(0.45, 0.72, 0.92), crack * 0.7);
  // 赤道のあたりに、海氷のすき間（暗い海）
  float lead = smoothstep(0.66, 0.7, fbm(n * 4.0 + 7.0)) * (1.0 - smoothstep(0.2, 0.5, abs(n.y)));
  vec3 col = mix(sheet, vec3(0.05, 0.13, 0.22), lead);
  spec = mix(0.25, 0.8, lead);
  return col;
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vLocal);
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  float spec;
  vec3 albedo = uKind == 0 ? desert(n, spec) : ice(n, spec);
  // 雲（氷の惑星はうすい雲が多く、砂の惑星は砂ぼこりのもや）
  float c = fbm(n * 4.0 + vec3(uTime * 0.004, 0.0, uTime * 0.002));
  float cloud = uKind == 0 ? smoothstep(0.62, 0.8, c) * 0.25 : smoothstep(0.5, 0.75, c) * 0.6;
  albedo = mix(albedo, uKind == 0 ? vec3(0.95, 0.8, 0.62) : vec3(1.0), cloud);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    vec3 L = i == 0 ? uL1 : uL2;
    vec3 C = i == 0 ? uC1 : uC2;
    float d = dot(N, L);
    // 昼と夜の境目は少しやわらかく（大気で光が回りこむ）
    float lit = smoothstep(-0.08, 0.25, d) * max(d, 0.0) * 0.8 + smoothstep(-0.1, 0.1, d) * 0.12;
    vec3 H = normalize(L + V);
    col += C * (albedo * lit + spec * pow(max(dot(N, H), 0.0), 60.0) * step(0.0, d));
  }
  col += albedo * 0.015;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const air = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uCenter;
uniform float uRadius;
uniform vec3 uL1;
uniform vec3 uC1;
uniform vec3 uL2;
uniform vec3 uC2;
uniform vec3 uAir;
varying vec3 vWorld;
void main() {
  #include <logdepthbuf_fragment>
  vec3 V = normalize(vWorld - cameraPosition);
  // 視線が惑星にいちばん近づく高さ：ふちほど大気を長く通る
  vec3 oc = cameraPosition - uCenter;
  float t = -dot(oc, V);
  vec3 closest = oc + V * max(t, 0.0);
  float h = (length(closest) - uRadius) / (uRadius * 0.06);
  float thick = exp(-max(h, 0.0) * 2.2) * smoothstep(-0.6, 0.0, h);
  vec3 up = normalize(closest);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    vec3 L = i == 0 ? uL1 : uL2;
    vec3 C = i == 0 ? uC1 : uC2;
    float day = smoothstep(-0.3, 0.3, dot(up, L));
    // 太陽の方向を見ると、光が前へ散らばって明るい（夕焼けのふち）
    float forward = pow(max(dot(V, L), 0.0), 8.0);
    col += C * (uAir * day * 0.7 + vec3(1.0, 0.6, 0.35) * forward * day * 0.45);
  }
  gl_FragColor = vec4(col * thick, thick);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const uniforms = () => ({
  uL1: { value: new THREE.Vector3(1, 0, 0) },
  uC1: { value: new THREE.Color(1, 1, 1) },
  uL2: { value: new THREE.Vector3(0, 1, 0) },
  uC2: { value: new THREE.Color(0, 0, 0) },
})

export function exoSurfaceMaterial(kind: 0 | 1) {
  return new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: surface, uniforms: { ...uniforms(), uKind: { value: kind }, uTime: { value: 0 } } })
}

export function exoAirMaterial(color: THREE.Color) {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: air,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    uniforms: { ...uniforms(), uCenter: { value: new THREE.Vector3() }, uRadius: { value: 1 }, uAir: { value: color } },
  })
}
