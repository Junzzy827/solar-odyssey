import * as THREE from 'three'

// 乗員室の材質。実行中の照明は使わず、Blender で焼いた 2 枚の光の地図（昼・夜）を色の絵にかけるだけ。
//   色 = アトラス（UV0）× 光（UV1。焼いた値を 1/2.2 乗で 8 ビットにしたものを戻し、倍率をかける）× 露出
// 昼と夜は uMix でなめらかに混ぜる。夜はアトラスの A（0.5〜1）にある刻印・ランプの光を足す（パネルの文字が薄く光る）。

/** 焼いたときの明るさの値（tools/blender/build_shuttle_cabin.py が書く shuttle-cabin.json と同じ形） */
export type CabinMeta = { lightScale: { day: number; dark: number }; exposure: number }
type Meta = CabinMeta

// 対数の奥行き（打ち上げの場面の Canvas）でも、ふつうの奥行きでも描けるように、three の部品を入れておく
const vert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec2 uv1;
varying vec2 vUv;
varying vec2 vUv1;
void main() {
  vUv = uv;
  vUv1 = uv1;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`

const frag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uMap;
uniform sampler2D uDay;
uniform sampler2D uDark;
uniform float uScaleDay;
uniform float uScaleDark;
uniform float uExp;
uniform float uMix;
uniform float uFlat;
varying vec2 vUv;
varying vec2 vUv1;
vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  #include <logdepthbuf_fragment>
  vec4 a = texture2D(uMap, vUv);
#ifdef FLAT
  // 光の地図の無い小物（浮いている物）：その場の明るさを一つの値で
  vec3 irr = vec3(mix(0.85, 0.22, uMix));
#else
  vec3 d = pow(texture2D(uDay, vUv1).rgb, vec3(2.2)) * uScaleDay;
  vec3 n = pow(texture2D(uDark, vUv1).rgb, vec3(2.2)) * uScaleDark * 2.5;
  vec3 irr = mix(d, n, uMix) * uExp;
#endif
  vec3 col = a.rgb * irr;
  // 刻印の光（夜だけ）
  col += clamp((a.a - 0.5) * 2.0, 0.0, 1.0) * 0.35 * vec3(1.0, 0.85, 0.6) * uMix;
  // 明るすぎる所はやわらかく丸める（窓ぎわの日なた）
  col = col / (1.0 + max(col - 0.7, 0.0) * 1.2);
  gl_FragColor = vec4(toSrgb(col), 1.0);
}`

export function cabinMaterial(atlas: THREE.Texture, day: THREE.Texture, dark: THREE.Texture, meta: Meta) {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uMap: { value: atlas },
      uDay: { value: day },
      uDark: { value: dark },
      uScaleDay: { value: meta.lightScale.day },
      uScaleDark: { value: meta.lightScale.dark },
      // 焼いたときの目安より少し暗めに（白い天井が飛ばないように）
      uExp: { value: meta.exposure * 0.72 },
      uMix: { value: 0 },
      uFlat: { value: 1 },
    },
    side: THREE.DoubleSide,
    toneMapped: false,
  })
}

/** 光の地図の無い物：同じアトラスで、明るさは昼・夜の混ぜ具合だけ（uMix は部屋の材質と共有） */
export function flatMaterial(atlas: THREE.Texture, room: THREE.ShaderMaterial) {
  return new THREE.ShaderMaterial({
    vertexShader: vert.replace('attribute vec2 uv1;', '').replace('vUv1 = uv1;', 'vUv1 = uv;'),
    fragmentShader: frag,
    defines: { FLAT: '' },
    uniforms: { ...room.uniforms, uMap: { value: atlas } },
    side: THREE.DoubleSide,
    toneMapped: false,
  })
}

/** 窓のガラス：ほんの少し青く、映り込みの代わりにうっすら白く */
export function glassMaterial() {
  return new THREE.MeshBasicMaterial({ color: '#9fb8d0', transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
}

/** shuttle-cabin.json を読む（無ければ控えめな値）。読み終わるまでは Suspense で待つ */
let metaCache: CabinMeta | null = null
let metaPromise: Promise<CabinMeta> | null = null
export function useCabinMeta(): CabinMeta {
  if (metaCache) return metaCache
  metaPromise ??= fetch(`${import.meta.env.BASE_URL}models/shuttle-cabin.json`)
    .then((r) => r.json() as Promise<CabinMeta>)
    .catch(() => ({ lightScale: { day: 20, dark: 1 }, exposure: 0.4 }))
    .then((m) => (metaCache = m))
  throw metaPromise
}
