import * as THREE from 'three'

// 地表の大気。空の色・地平線の霞・太陽の色・まわりの景色の光（環境光）を、ぜんぶ同じ計算から出す。
// - 空気の分子の散乱（レイリー：青を散らす）と、ちりや霧の散乱（ミー：前へ強く散らす）を、高さで薄くなる層として持つ
// - 地面近くには、もう一つ薄い霞の層（火星の砂ぼこり、地球の湿った空気）
// - 空は「方向ごとの空の明るさ」の表（正距円筒の小さな絵）に、太陽が動いたときだけ描き直す。描くたびの負担はほぼ無い
// - 地面・岩・着陸船には、その表を見て「視線の先の空の色」を、距離に応じて重ねる（空気遠近）
// 単位：太陽の光の強さ（地面に垂直に当たる明るさ）を 1 とした明るさ。最後に露出を掛ける。

export type AirParams = {
  /** 分子の散乱（1/m、RGB）と、その高さの尺度（m） */
  rayleigh: [number, number, number]
  rayleighH: number
  /** ちりの散乱と、吸収を含めた弱まり方（1/m、RGB）・高さの尺度（m） */
  mie: [number, number, number]
  mieExt: [number, number, number]
  mieH: number
  /** 前へ散らす強さ（色ごと。火星は青ほど強く前へ散らすので、夕方の太陽のまわりが青くなる） */
  g: [number, number, number]
  /** 地面近くの霞の層：散乱・弱まり方（1/m）・高さの尺度（m） */
  low: [number, number, number]
  lowExt: [number, number, number]
  lowH: number
  /** 何度も散った光の分（簡易）。厚い大気ほど大きい */
  multi: number
}

const e = (a: number, b: number, c: number, s: number): [number, number, number] => [a * s, b * s, c * s]

/** 大気のある天体の値（大気の無い天体は null） */
const AIR: Record<string, AirParams> = {
  earth: {
    rayleigh: e(5.8, 13.5, 33.1, 1e-6), rayleighH: 8000,
    mie: e(4, 4, 4, 1e-6), mieExt: e(4.4, 4.4, 4.4, 1e-6), mieH: 1200,
    g: [0.76, 0.76, 0.76],
    low: e(2.5, 2.6, 2.8, 1e-5), lowExt: e(2.7, 2.8, 3.0, 1e-5), lowH: 600,
    multi: 0.25,
  },
  // 火星：分子はとても薄い。赤いちりが青を吸い、赤を散らす（昼は黄土色の空）
  mars: {
    rayleigh: e(0.2, 0.5, 1.2, 1e-6), rayleighH: 11100,
    mie: e(2.8, 1.7, 0.8, 1e-5), mieExt: e(3.0, 2.9, 2.85, 1e-5), mieH: 11000,
    g: [0.6, 0.72, 0.9],
    low: e(5.0, 3.0, 1.5, 1e-5), lowExt: e(6.0, 5.6, 5.4, 1e-5), lowH: 1600,
    multi: 1.2,
  },
  // 金星：厚い雲の底。太陽の形は見えず、オレンジ色の光が回りこむ
  venus: {
    rayleigh: e(2, 4.6, 11, 1e-5), rayleighH: 15900,
    mie: e(1.5, 0.85, 0.3, 1e-4), mieExt: e(1.6, 2.0, 2.8, 1e-4), mieH: 9000,
    g: [0.7, 0.7, 0.7],
    low: e(0.6, 0.32, 0.1, 1e-4), lowExt: e(0.65, 0.8, 1.1, 1e-4), lowH: 2500,
    multi: 1.6,
  },
  // タイタン：オレンジ色の有機物のもや
  titan: {
    rayleigh: e(0.5, 1.2, 3.0, 1e-6), rayleighH: 20000,
    mie: e(5.5, 3.2, 1.2, 1e-5), mieExt: e(6.2, 5.6, 5.2, 1e-5), mieH: 30000,
    g: [0.7, 0.7, 0.7],
    low: e(8, 4.6, 1.8, 1e-5), lowExt: e(9, 8.2, 7.8, 1e-5), lowH: 3000,
    multi: 2.0,
  },
  // 冥王星・トリトン：ほとんど真空だが、地平線に青いもやの層
  pluto: {
    rayleigh: e(0, 0, 0, 1), rayleighH: 20000,
    mie: e(0.25, 0.55, 1.2, 1e-6), mieExt: e(0.25, 0.55, 1.2, 1e-6), mieH: 30000,
    g: [0.55, 0.6, 0.65],
    low: e(0, 0, 0, 1), lowExt: e(0, 0, 0, 1), lowH: 1000,
    multi: 0.1,
  },
  triton: {
    rayleigh: e(0, 0, 0, 1), rayleighH: 20000,
    mie: e(0.15, 0.3, 0.6, 1e-6), mieExt: e(0.15, 0.3, 0.6, 1e-6), mieH: 20000,
    g: [0.55, 0.6, 0.65],
    low: e(0, 0, 0, 1), lowExt: e(0, 0, 0, 1), lowH: 1000,
    multi: 0.1,
  },
}

export const airFor = (id: string): AirParams | null => AIR[id] ?? null

const v3 = (a: [number, number, number]) => new THREE.Vector3(...a)

// ---- CPU 側：太陽の光が大気を通って地面に届くまでの色 --------------------------------------

/** 大気の上から地面（高さ h0）まで、太陽の方向（高度 el ラジアン）の光の通りやすさ（RGB） */
export function sunTransmittance(air: AirParams | null, radiusM: number, el: number, hazeScale = 1): THREE.Vector3 {
  if (!air) return new THREE.Vector3(1, 1, 1)
  const Rp = radiusM
  const top = Rp + 12 * Math.max(air.rayleighH, air.mieH)
  const ro = new THREE.Vector3(0, Rp + 2, 0)
  const rd = new THREE.Vector3(Math.cos(el), Math.sin(el), 0)
  // 地面に隠れる（太陽が地平線の下）
  const b = ro.dot(rd)
  const cPl = ro.lengthSq() - Rp * Rp
  if (b < 0 && b * b - cPl > 0) return new THREE.Vector3(0, 0, 0)
  const cAt = ro.lengthSq() - top * top
  const tMax = -b + Math.sqrt(Math.max(0, b * b - cAt))
  const N = 48
  const tau = new THREE.Vector3()
  const p = new THREE.Vector3()
  for (let i = 0; i < N; i++) {
    const t0 = tMax * (i / N) ** 2
    const t1 = tMax * ((i + 1) / N) ** 2
    p.copy(ro).addScaledVector(rd, (t0 + t1) / 2)
    const h = Math.max(0, p.length() - Rp)
    const dt = t1 - t0
    const dR = Math.exp(-h / air.rayleighH)
    const dM = Math.exp(-h / air.mieH)
    const dL = Math.exp(-h / air.lowH) * hazeScale
    tau.x += (air.rayleigh[0] * dR + air.mieExt[0] * dM + air.lowExt[0] * dL) * dt
    tau.y += (air.rayleigh[1] * dR + air.mieExt[1] * dM + air.lowExt[1] * dL) * dt
    tau.z += (air.rayleigh[2] * dR + air.mieExt[2] * dM + air.lowExt[2] * dL) * dt
  }
  return new THREE.Vector3(Math.exp(-tau.x), Math.exp(-tau.y), Math.exp(-tau.z))
}

export const luminance = (c: THREE.Vector3) => 0.2126 * c.x + 0.7152 * c.y + 0.0722 * c.z

// ---- GPU 側：大気の計算（空の表を描くシェーダー） -------------------------------------------

const airUniformsGlsl = /* glsl */ `
  uniform vec3 uBetaR;
  uniform float uHR;
  uniform vec3 uBetaM;
  uniform vec3 uExtM;
  uniform float uHM;
  uniform vec3 uBetaL;
  uniform vec3 uExtL;
  uniform float uHL;
  uniform vec3 uG;
  uniform float uMulti;
  uniform float uRp;
  uniform float uRa;
  uniform float uHasAir;
`

const lutFragment = /* glsl */ `
  ${airUniformsGlsl}
  uniform vec3 uSunDir;
  uniform float uSunI;
  uniform vec3 uGround;
  uniform float uExposure;
  uniform float uCamH;
  varying vec2 vUv;

  #define PI 3.14159265

  vec2 raySphere(vec3 ro, vec3 rd, float r) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - r * r;
    float d = b * b - c;
    if (d < 0.0) return vec2(-1.0);
    d = sqrt(d);
    return vec2(-b - d, -b + d);
  }
  vec3 dens(vec3 p) {
    float h = max(length(p) - uRp, 0.0);
    return vec3(exp(-h / uHR), exp(-h / uHM), exp(-h / uHL));
  }
  vec3 ext(vec3 d) { return uBetaR * d.x + uExtM * d.y + uExtL * d.z; }
  /** 点 p から太陽への光の通りやすさ */
  vec3 toSun(vec3 p) {
    vec2 pl = raySphere(p, uSunDir, uRp);
    if (pl.x > 0.0) return vec3(0.0);
    float t = raySphere(p, uSunDir, uRa).y;
    vec3 tau = vec3(0.0);
    const int L = 10;
    for (int i = 0; i < L; i++) {
      float t0 = t * pow(float(i) / float(L), 2.0);
      float t1 = t * pow(float(i + 1) / float(L), 2.0);
      tau += ext(dens(p + uSunDir * (0.5 * (t0 + t1)))) * (t1 - t0);
    }
    return exp(-tau);
  }
  float phaseR(float mu) { return 3.0 / (16.0 * PI) * (1.0 + mu * mu); }
  vec3 phaseM(float mu) {
    vec3 g2 = uG * uG;
    // Cornette-Shanks
    return 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * uG * mu, vec3(1.5)));
  }

  void main() {
    // 正距円筒（three.js の equirectUv と同じ向き）の uv から方向へ
    float phi = (vUv.x - 0.5) * 2.0 * PI;
    float theta = (vUv.y - 0.5) * PI;
    vec3 rd = vec3(cos(theta) * cos(phi), sin(theta), cos(theta) * sin(phi));
    vec3 ro = vec3(0.0, uRp + uCamH, 0.0);
    vec3 col = vec3(0.0);
    vec3 T = vec3(1.0);
    vec2 pl = raySphere(ro, rd, uRp);
    bool ground = pl.x > 0.0;
    if (uHasAir > 0.5) {
      float tMax = raySphere(ro, rd, uRa).y;
      if (ground) tMax = pl.x;
      float mu = dot(rd, uSunDir);
      float pr = phaseR(mu);
      vec3 pm = phaseM(mu);
      const int N = 40;
      for (int i = 0; i < N; i++) {
        float t0 = tMax * pow(float(i) / float(N), 2.0);
        float t1 = tMax * pow(float(i + 1) / float(N), 2.0);
        float dt = t1 - t0;
        vec3 p = ro + rd * (0.5 * (t0 + t1));
        vec3 d = dens(p);
        vec3 sun = toSun(p);
        vec3 scR = uBetaR * d.x;
        vec3 scM = uBetaM * d.y + uBetaL * d.z;
        // 何度も散った光：太陽の高さに応じた、どの向きにも同じ明るさの光として足す
        float up = clamp(dot(normalize(p), uSunDir) + 0.1, 0.0, 1.0);
        vec3 multi = (scR + scM) * uMulti * up / (4.0 * PI);
        vec3 S = (scR * pr + scM * pm) * sun + multi;
        vec3 e = ext(d);
        // 区間の中で弱まる分も考えて積む
        vec3 Tseg = exp(-e * dt);
        col += T * S * (1.0 - Tseg) / max(e, vec3(1e-12));
        T *= Tseg;
      }
    }
    if (ground) {
      // 地面：太陽の光と空の光で照らされた色（まわりの景色の光の下半分）
      vec3 p = ro + rd * max(pl.x, 0.0);
      vec3 n = normalize(p);
      float ndl = max(dot(n, uSunDir), 0.0);
      vec3 sun = uHasAir > 0.5 ? toSun(p + n * 2.0) : (ndl > 0.0 ? vec3(1.0) : vec3(0.0));
      float skyAmb = uHasAir > 0.5 ? (0.08 + uMulti * 0.15) * clamp(uSunDir.y + 0.15, 0.0, 1.0) : 0.0;
      col += T * uGround / PI * (sun * ndl + skyAmb);
    }
    gl_FragColor = vec4(col * uSunI * uExposure, 1.0);
  }
`

const lutVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

/** 大気の値を、シェーダーの uniform にする（空の表・空気遠近で共有） */
export function airUniforms(air: AirParams | null, radiusM: number, hazeScale: number) {
  const a = air
  const zero = new THREE.Vector3()
  return {
    uBetaR: { value: a ? v3(a.rayleigh) : zero.clone() },
    uHR: { value: a?.rayleighH ?? 8000 },
    uBetaM: { value: a ? v3(a.mie) : zero.clone() },
    uExtM: { value: a ? v3(a.mieExt) : zero.clone() },
    uHM: { value: a?.mieH ?? 1000 },
    uBetaL: { value: a ? v3(a.low).multiplyScalar(hazeScale) : zero.clone() },
    uExtL: { value: a ? v3(a.lowExt).multiplyScalar(hazeScale) : zero.clone() },
    uHL: { value: a?.lowH ?? 1000 },
    uG: { value: a ? v3(a.g) : new THREE.Vector3(0.7, 0.7, 0.7) },
    uMulti: { value: a?.multi ?? 0 },
    uRp: { value: radiusM },
    uRa: { value: radiusM + 12 * Math.max(a?.rayleighH ?? 0, a?.mieH ?? 0, 1000) },
    uHasAir: { value: a ? 1 : 0 },
  }
}

export type AirUniforms = ReturnType<typeof airUniforms>

/** 方向ごとの空の明るさの表（正距円筒）。太陽の向き・露出が変わったときだけ描き直す */
export class SkyLut {
  readonly target: THREE.WebGLRenderTarget
  readonly material: THREE.ShaderMaterial
  private scene = new THREE.Scene()
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private mesh: THREE.Mesh

  constructor(air: AirUniforms, ground: THREE.Color, width = 512) {
    this.target = new THREE.WebGLRenderTarget(width, width / 2, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
      generateMipmaps: false,
    })
    this.target.texture.mapping = THREE.EquirectangularReflectionMapping
    this.target.texture.wrapS = THREE.RepeatWrapping
    this.target.texture.colorSpace = THREE.LinearSRGBColorSpace
    this.material = new THREE.ShaderMaterial({
      vertexShader: lutVertex,
      fragmentShader: lutFragment,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        ...air,
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunI: { value: 1 },
        uGround: { value: new THREE.Vector3(ground.r, ground.g, ground.b) },
        uExposure: { value: 1 },
        uCamH: { value: 2 },
      },
    })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    this.mesh.frustumCulled = false
    this.scene.add(this.mesh)
  }

  render(gl: THREE.WebGLRenderer, sunDir: THREE.Vector3, sunI: number, exposure: number) {
    const u = this.material.uniforms
    u.uSunDir.value.copy(sunDir)
    u.uSunI.value = sunI
    u.uExposure.value = exposure
    const prev = gl.getRenderTarget()
    const xr = gl.xr.enabled
    gl.xr.enabled = false
    gl.setRenderTarget(this.target)
    gl.render(this.scene, this.camera)
    gl.setRenderTarget(prev)
    gl.xr.enabled = xr
  }

  dispose() {
    this.target.dispose()
    this.material.dispose()
    this.mesh.geometry.dispose()
  }
}

// ---- 空気遠近：地面・岩・着陸船の材質に重ねる -------------------------------------------------

/** 空の表から、方向 d の空の色を読む（地平線より下を向いていても、地平線のすぐ上の空を読む） */
export const skyLookupGlsl = /* glsl */ `
  vec3 airSkyColor(sampler2D lut, vec3 d) {
    d.y = max(d.y, 0.004);
    d = normalize(d);
    vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
    return texture2D(lut, uv).rgb;
  }
`

const apPars = /* glsl */ `
  uniform sampler2D uAirLut;
  uniform vec3 uApR;
  uniform vec3 uApM;
  uniform vec3 uApL;
  uniform vec3 uApH;
  uniform float uApGround;
  uniform float uApOn;
  varying vec3 vAirWorld;
  ${skyLookupGlsl}
  /** 高さ h0 から h1 まで、距離 d の、高さの尺度 H の層の厚み（密度×距離） */
  float airDepth(float h0, float h1, float d, float H) {
    float dh = h1 - h0;
    float a = exp(-max(h0, 0.0) / H);
    if (abs(dh) < 1.0) return a * d;
    float b = exp(-max(h1, 0.0) / H);
    return d * H * (a - b) / dh;
  }
`

const apFragment = /* glsl */ `
  if (uApOn > 0.5) {
    vec3 toP = vAirWorld - cameraPosition;
    float d = length(toP);
    float h0 = cameraPosition.y - uApGround;
    float h1 = vAirWorld.y - uApGround;
    vec3 tau = uApR * airDepth(h0, h1, d, uApH.x) + uApM * airDepth(h0, h1, d, uApH.y) + uApL * airDepth(h0, h1, d, uApH.z);
    vec3 T = exp(-tau);
    vec3 sky = airSkyColor(uAirLut, toP / max(d, 1e-3));
    gl_FragColor.rgb = gl_FragColor.rgb * T + sky * (1.0 - T);
  }
`

export type ApUniforms = {
  uAirLut: { value: THREE.Texture | null }
  uApR: { value: THREE.Vector3 }
  uApM: { value: THREE.Vector3 }
  uApL: { value: THREE.Vector3 }
  uApH: { value: THREE.Vector3 }
  uApGround: { value: number }
  uApOn: { value: number }
}

export function apUniforms(air: AirParams | null, hazeScale: number, groundY: number, lut: THREE.Texture | null): ApUniforms {
  return {
    uAirLut: { value: lut },
    uApR: { value: air ? v3(air.rayleigh) : new THREE.Vector3() },
    uApM: { value: air ? v3(air.mieExt) : new THREE.Vector3() },
    uApL: { value: air ? v3(air.lowExt).multiplyScalar(hazeScale) : new THREE.Vector3() },
    uApH: { value: new THREE.Vector3(air?.rayleighH ?? 1, air?.mieH ?? 1, air?.lowH ?? 1) },
    uApGround: { value: groundY },
    uApOn: { value: air ? 1 : 0 },
  }
}

/**
 * 材質に空気遠近を足す（three.js の霧の代わり）。uniform は場面全体で 1 組を共有するので、
 * 太陽を動かしても材質を作り直さなくてよい
 */
export function withAir<M extends THREE.Material>(material: M, u: ApUniforms, realAttr = false): M {
  const prev = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer)
    Object.assign(shader.uniforms, u)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAirWorld;' + (realAttr ? '\nattribute vec3 aReal;' : ''))
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 aw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            aw = instanceMatrix * aw;
          #endif
          vAirWorld = (modelMatrix * aw).xyz;
          ${realAttr ? '// 縮めて置いた形は、縮める前の本当の位置で空気の厚みを計算する\n          vAirWorld = aReal; // （縮めた形はカメラに合わせて動かすので、本当の位置は aReal そのもの）' : ''}
        }`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${apPars}`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>\n${apFragment}`)
  }
  // 空気遠近つきとそうでない材質を、別のシェーダーとして扱わせる
  const key = material.customProgramCacheKey.bind(material)
  material.customProgramCacheKey = () => key() + (realAttr ? '|air-real' : '|air')
  material.needsUpdate = true
  return material
}

// ---- 露出 -------------------------------------------------------------------------------------

/**
 * 露出：日なたの地面がおよそ同じ明るさに見えるように合わせる（目やカメラが慣れるのと同じ）。
 * ただし遠い星ほど少し暗く感じるよう、慣れ方は 8 割ほどにする
 */
export function autoExposure(sunI: number, sunT: THREE.Vector3, sunEl: number, air: AirParams | null, bias = 0) {
  const sinEl = Math.max(Math.sin(sunEl), 0.12)
  const direct = sunI * luminance(sunT) * sinEl
  const ambient = air ? sunI * (0.05 + air.multi * 0.08) : 0
  const L = (0.3 * (direct + ambient)) / Math.PI + 1e-4
  const earthNoon = (0.3 * 0.75) / Math.PI
  const adapt = Math.min(1, L / earthNoon) ** 0.22
  return (0.42 / L) * adapt * 2 ** bias
}
