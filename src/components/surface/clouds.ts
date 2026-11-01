import * as THREE from 'three'
import { skyLookupGlsl, type ApUniforms } from './atmosphere'

// 地表の空の雲（いまは地球だけ）。地面から約 1.8 km の高さに、積雲の層を 1 枚置く。
// 雲の形は 2 枚の模様を別々の速さで流して重ねるので、流れながら形も少しずつ変わる（タイムラプスのように）。
// 同じ模様で、地面に雲の影を落とす（太陽から地面の点へ向かう線が雲の層を通る場所の濃さ）。
// 午後に増えて夜に減る（地面が温まって湧く、晴れた日の積雲の 1 日）。

/** 雲の層の uniform（場面で 1 組。雲の材質と、影を受ける地面の材質が共有する） */
export type CloudUniforms = {
  uCloudOn: { value: number }
  /** 雲の層の高さ（世界の y） */
  uCloudH: { value: number }
  /** 2 枚の模様のずれ（m） */
  uCloudOff: { value: THREE.Vector4 }
  /** 雲の量（0〜1） */
  uCloudCover: { value: number }
  uCloudSun: { value: THREE.Vector3 }
}

export const cloudUniforms: CloudUniforms = {
  uCloudOn: { value: 0 },
  uCloudH: { value: 1800 },
  uCloudOff: { value: new THREE.Vector4() },
  uCloudCover: { value: 0.5 },
  uCloudSun: { value: new THREE.Vector3(0, 1, 0) },
}

/** 雲の模様。oct は細かさの段数（影は少なめで軽く） */
const cloudGlsl = /* glsl */ `
  uniform float uCloudOn;
  uniform float uCloudH;
  uniform vec4 uCloudOff;
  uniform float uCloudCover;
  uniform vec3 uCloudSun;
  float cHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float cNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), u.x), mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float cFbm(vec2 p, int oct) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 6; i++) {
      if (i >= oct) break;
      s += a * cNoise(p);
      p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.1;
      a *= 0.5;
    }
    return s;
  }
  /** 雲の厚み（ふちで 0、0 より上ほど厚い）。xz は世界の水平の位置（m） */
  float cloudRaw(vec2 xz, int oct) {
    vec2 p = (xz + uCloudOff.xy) / 1500.0;
    // 模様を少しゆがめて、もくもくした丸いかたまりに
    p += (vec2(cNoise(p * 1.7 + 5.0), cNoise(p * 1.7 + 9.0)) - 0.5) * 0.22;
    float a = cFbm(p, oct);
    float b = cFbm((xz + uCloudOff.zw) / 2300.0 + 31.7, oct);
    float d = a * 0.62 + b * 0.38;
    return d - mix(0.62, 0.42, uCloudCover);
  }
  /** 雲の濃さ（0〜1） */
  float cloudDensity(vec2 xz, int oct) {
    return smoothstep(0.0, 0.09, cloudRaw(xz, oct));
  }
`

/** 雲の影：太陽へ向かう線が雲の層を通る場所の濃さで、直射日光を弱める */
const shadowGlsl = /* glsl */ `
  float cloudShadow(vec3 p) {
    if (uCloudOn < 0.5 || uCloudSun.y < 0.02) return 1.0;
    float t = (uCloudH - p.y) / uCloudSun.y;
    vec2 q = p.xz + uCloudSun.xz * min(t, 60000.0);
    float d = cloudDensity(q, 3);
    return 1.0 - 0.72 * d * smoothstep(0.02, 0.12, uCloudSun.y);
  }
`

/** 地面の材質に雲の影を足す。withAir をかけた後で使う（世界の位置 vAirWorld を借りる） */
export function withCloudShadow<M extends THREE.Material>(material: M, u: CloudUniforms = cloudUniforms): M {
  const prev = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer)
    Object.assign(shader.uniforms, u)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${cloudGlsl}\n${shadowGlsl}`)
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        {
          float cs = cloudShadow(vAirWorld);
          reflectedLight.directDiffuse *= cs;
          reflectedLight.directSpecular *= cs;
        }`,
      )
  }
  const key = material.customProgramCacheKey.bind(material)
  material.customProgramCacheKey = () => key() + '|cloud'
  material.needsUpdate = true
  return material
}

const vertex = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

const fragment = /* glsl */ `
  ${cloudGlsl}
  uniform sampler2D uAirLut;
  uniform vec3 uApR;
  uniform vec3 uApM;
  uniform vec3 uApL;
  uniform vec3 uApH;
  uniform float uApGround;
  uniform vec3 uSunCol;
  uniform vec3 uNightCol;
  uniform float uRadius;
  varying vec3 vW;
  ${skyLookupGlsl}
  float airDepth(float h0, float h1, float d, float H) {
    float dh = h1 - h0;
    float a = exp(-max(h0, 0.0) / H);
    if (abs(dh) < 1.0) return a * d;
    float b = exp(-max(h1, 0.0) / H);
    return d * H * (a - b) / dh;
  }
  void main() {
    vec2 xz = vW.xz;
    float raw = cloudRaw(xz, OCT);
    float d = smoothstep(0.0, 0.09, raw);
    float r = length(xz - cameraPosition.xz) / uRadius;
    float alpha = d * (1.0 - smoothstep(0.55, 1.0, r));
    if (alpha < 0.004) discard;
    // 太陽の側が薄い（雲のふち）ほど明るい。厚いところは下から見ると灰色の底
    vec2 sxz = normalize(uCloudSun.xz + 1e-4);
    float toward = cloudRaw(xz + sxz * 180.0, OCT);
    float rim = clamp((raw - toward) * 9.0 + 0.5, 0.0, 1.0);
    float thick = smoothstep(0.03, 0.22, raw);
    vec3 toP = vW - cameraPosition;
    float dist = length(toP);
    vec3 dir = toP / dist;
    // 太陽の近くの雲は、光が透けて縁が銀色に光る
    float mu = max(dot(dir, uCloudSun), 0.0);
    float silver = pow(mu, 12.0) * (1.0 - thick) * 2.5;
    vec3 skyUp = airSkyColor(uAirLut, vec3(0.0, 1.0, 0.0));
    vec3 sun = uSunCol * (0.25 + 0.6 * rim + silver) * mix(1.0, 0.3, thick);
    vec3 amb = skyUp * mix(1.0, 0.55, thick) + uNightCol;
    vec3 col = sun + amb;
    // 遠くの雲ほど空の色に溶ける（地面と同じ空気遠近）
    float h0 = cameraPosition.y - uApGround;
    float h1 = vW.y - uApGround;
    vec3 tau = uApR * airDepth(h0, h1, dist, uApH.x) + uApM * airDepth(h0, h1, dist, uApH.y) + uApL * airDepth(h0, h1, dist, uApH.z);
    vec3 T = exp(-tau);
    col = col * T + airSkyColor(uAirLut, dir) * (1.0 - T);
    gl_FragColor = vec4(col, alpha * 0.96);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function cloudMaterial(ap: ApUniforms, radius: number, light: boolean) {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    defines: { OCT: light ? 4 : 6 },
    uniforms: {
      ...cloudUniforms,
      uAirLut: ap.uAirLut,
      uApR: ap.uApR,
      uApM: ap.uApM,
      uApL: ap.uApL,
      uApH: ap.uApH,
      uApGround: ap.uApGround,
      uSunCol: { value: new THREE.Vector3() },
      uNightCol: { value: new THREE.Vector3() },
      uRadius: { value: radius },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  })
}

/**
 * 雲の量：晴れた日の積雲は、地面が温まる昼前から湧いて、午後にいちばん多く、夕方から夜に消えていく。
 * 日によって多い日と少ない日がある（hours はゆっくりした移り変わりに使う）
 */
export function cloudCover(clock: number, hours: number) {
  const day = 0.5 + 0.5 * Math.sin((clock - 10) * (Math.PI / 12)) // 16 時ごろに最大
  const slow = 0.5 + 0.5 * Math.sin(hours * 0.11 + 1.3)
  return THREE.MathUtils.clamp(0.15 + 0.55 * day * day + 0.3 * slow, 0, 1)
}

/** 雲の流れる速さ（m / 地表の 1 時間）。本当の風だと速すぎて目で追えないので、見やすい速さにしてある */
export const CLOUD_DRIFT = 2600
