import * as THREE from 'three'
import { SKY_FROM_APP } from '../../data/skyFrame'

// ブラックホールのまわりで光が曲がる様子を、画面の点ごとに光の道すじをたどって描く。
// シュワルツシルト時空の光の道すじの近似（加速度 = -1.5 h² r / |r|⁵、事象の地平面の半径を1とする）。
// 光は降着円盤（薄い円盤）を横切るたびに色をもらい、外へ抜けたら曲がった向きの星空を、地平面に落ちたら黒を返す。
// 円盤は回っているので、こちらへ向かってくる側が明るく見える（相対論的ビーミング）。

const vertex = /* glsl */ `
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

const fragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uCenter;
uniform float uRs;
uniform float uLens;
uniform float uInner;
uniform float uOuter;
uniform mat3 uToLocal;
uniform sampler2D uSky;
uniform mat3 uSkyRot;
uniform float uHasSky;
uniform float uTime;
varying vec3 vWorld;

float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }

// 天の川の全天画像（Sky.tsx と同じ貼り方・同じ向き）。無ければ点の星
vec3 sky(vec3 d) {
  if (uHasSky > 0.5) {
    d = uSkyRot * d;
    float theta = acos(clamp(d.y, -1.0, 1.0));
    float phi = atan(d.z, -d.x);
    if (phi < 0.0) phi += 2.0 * PI;
    return texture2D(uSky, vec2(phi / (2.0 * PI), 1.0 - theta / PI)).rgb * 0.6;
  }
  vec3 cell = floor(d * 300.0);
  float h = hash(cell);
  return vec3(step(0.997, h) * (0.5 + 2.0 * fract(h * 91.0)));
}

// 円盤の色：内側ほど熱く白っぽく、外側は橙。回転する筋の模様
vec3 disk(vec3 q, vec3 rayDir, out float alpha) {
  float r = length(q.xz);
  float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
  alpha = smoothstep(uInner, uInner + 0.4, r) * (1.0 - smoothstep(uOuter - 4.0, uOuter, r));
  float ang = atan(q.z, q.x);
  float omega = 1.4 / pow(r, 1.5);
  float a = ang - uTime * omega;
  float streak = 0.62 + 0.24 * sin(r * 1.7 + 2.5 * sin(a * 2.0)) + 0.14 * sin(a * 5.0 + r * 0.9);
  alpha *= 0.55 + 0.4 * streak;
  vec3 hot = vec3(1.0, 0.92, 0.78);
  vec3 cool = vec3(1.0, 0.42, 0.12);
  vec3 col = mix(hot, cool, pow(t, 0.6)) * (1.9 * (1.0 - t) + 0.3) * streak;
  // 回る向き（上から見て反時計回り）と、こちらへ来る光の向きから、明るさを変える
  float beta = min(0.6, sqrt(0.5 / r));
  vec3 vel = normalize(vec3(-q.z, 0.0, q.x));
  float c = dot(vel, -rayDir);
  float g = 1.0 / (inversesqrt(1.0 - beta * beta) * (1.0 - beta * c));
  g *= sqrt(max(0.0, 1.0 - 1.0 / r));
  col *= clamp(g * g * g * g, 0.05, 5.0);
  col = mix(col, col * vec3(0.8, 0.9, 1.25), clamp(g - 1.0, 0.0, 1.0));
  return col;
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 dirW = normalize(vWorld - cameraPosition);
  vec3 p = uToLocal * (cameraPosition - uCenter) / uRs;
  vec3 v = uToLocal * dirW;
  // 計算する球の外にいるなら、球の入口から始める
  float pv = dot(p, v);
  if (dot(p, p) > uLens * uLens) {
    float disc = pv * pv - (dot(p, p) - uLens * uLens);
    if (disc < 0.0) discard;
    p += v * (-pv - sqrt(disc));
  }
  float b = length(cross(p, v));
  float h2 = b * b;
  vec3 col = vec3(0.0);
  float acc = 0.0;
  bool captured = false;
  for (int i = 0; i < 220; i++) {
    float r = length(p);
    if (r < 1.0) { captured = true; break; }
    if (r > uLens + 0.5 && dot(p, v) > 0.0) break;
    float dt = clamp(0.09 * r, 0.03, 4.0);
    vec3 prev = p;
    vec3 a = -1.5 * h2 * p / pow(r, 5.0);
    v = normalize(v + a * dt);
    p += v * dt;
    if (prev.y * p.y < 0.0) {
      vec3 q = mix(prev, p, prev.y / (prev.y - p.y));
      float rq = length(q.xz);
      if (rq > uInner && rq < uOuter) {
        float al;
        vec3 c = disk(q, v, al);
        col += (1.0 - acc) * al * c;
        acc += (1.0 - acc) * al;
        if (acc > 0.98) break;
      }
    }
  }
  vec3 bg = vec3(0.0);
  if (!captured) {
    // 球の縁に近い光は、曲がっていない向きへなめらかに戻す（球の外の星空とつなげる）
    vec3 straight = uToLocal * dirW;
    vec3 d = normalize(mix(v, straight, smoothstep(uLens * 0.55, uLens * 0.95, b)));
    bg = sky(transpose(uToLocal) * d);
  }
  gl_FragColor = vec4(col + (1.0 - acc) * bg, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export function lensMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uCenter: { value: new THREE.Vector3() },
      uRs: { value: 1 },
      uLens: { value: 80 },
      uInner: { value: 3 },
      uOuter: { value: 14 },
      uToLocal: { value: new THREE.Matrix3() },
      uSky: { value: null },
      uSkyRot: { value: SKY_FROM_APP },
      uHasSky: { value: 0 },
      uTime: { value: 0 },
    },
  })
}

// ゲートの口：向こう側の空が、ゆがんで見える球（光がふちで大きく曲がる）
const mouthFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uSky;
uniform mat3 uSkyRot;
uniform float uHasSky;
uniform float uTime;
uniform vec3 uCenter;
uniform float uRadius;
varying vec3 vWorld;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
vec3 sky(vec3 d) {
  if (uHasSky > 0.5) {
    d = uSkyRot * d;
    float theta = acos(clamp(d.y, -1.0, 1.0));
    float phi = atan(d.z, -d.x);
    if (phi < 0.0) phi += 2.0 * PI;
    return texture2D(uSky, vec2(phi / (2.0 * PI), 1.0 - theta / PI)).rgb * 0.75;
  }
  vec3 cell = floor(d * 200.0);
  float h = hash(cell);
  return vec3(step(0.995, h) * 2.0);
}
void main() {
  #include <logdepthbuf_fragment>
  vec3 view = normalize(vWorld - cameraPosition);
  vec3 n = normalize(vWorld - uCenter);
  float facing = clamp(-dot(view, n), 0.0, 1.0);
  // ふちほど強く曲げる。くるりと回る向こう側の星空
  float bend = pow(1.0 - facing, 1.5) * 2.8;
  float s = sin(uTime * 0.05), c = cos(uTime * 0.05);
  vec3 d = normalize(view - n * bend);
  d.xz = mat2(c, -s, s, c) * d.xz;
  vec3 col = sky(-d) * 1.4;
  // 向こうのブラックホールの円盤が、うっすら金色の輪に見える
  float ring = exp(-pow((facing - 0.35) * 9.0, 2.0));
  col += vec3(1.0, 0.65, 0.3) * ring * 0.35;
  col += vec3(0.55, 0.45, 1.0) * pow(1.0 - facing, 4.0) * 1.6;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export function mouthMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: mouthFragment,
    uniforms: {
      uSky: { value: null },
      uSkyRot: { value: SKY_FROM_APP },
      uHasSky: { value: 0 },
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
      uRadius: { value: 1 },
    },
  })
}
