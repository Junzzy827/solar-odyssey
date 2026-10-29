import * as THREE from 'three'
import { ECLIPSE_GLSL, eclipseUniforms } from './eclipseShadow'

// 惑星と衛星の表面。光の当たり方を天体の種類ごとに変え、ガス惑星は雲を流し、
// 近づいたときはクレーターや凹凸を細かく足す。テクスチャが無い天体は模様を作る。

/**
 * airless: 大気のない岩の天体（月・水星）。満月が縁まで明るいのを再現する（ロンメル・ゼーリガー則）
 * rocky: 薄い大気のある岩の惑星（火星）
 * gas: ガス惑星（木星・土星）。縞が東西に流れる
 * ice: 氷の巨大惑星（天王星・海王星）。かすかな縞と大気のもや
 * clouds: 厚い雲の惑星（金星）・もやの衛星（タイタン）。雲が全体にゆっくり流れる
 */
export type SurfaceStyle = 'airless' | 'rocky' | 'gas' | 'ice' | 'clouds'

const STYLE_ID: Record<SurfaceStyle, number> = { airless: 0, rocky: 1, gas: 2, ice: 3, clouds: 4 }

export type SurfaceOptions = {
  style: SurfaceStyle
  radius: number
  color: string
  /** 大気のもやの色と強さ（縁と明暗境界ににじむ） */
  haze?: string
  hazeAmount?: number
  /** 東西の流れ（ジェット）の数と強さ */
  jets?: number
  flow?: number
  /** 渦（大赤斑など）：テクスチャ上の中心 u, v と半径、回る速さ。テクスチャが無ければ暗い斑点として描く */
  spot?: { u: number; v: number; ru: number; rv: number; spin: number; dark?: boolean }
  /** 輪の影（土星） */
  ring?: { inner: number; outer: number }
  /** テクスチャが無い衛星の模様の種 */
  seed?: number
  /** テクスチャが無い天体の目立つ地域（冥王星のハート、イアペトゥスの黒い半球など）。最大 MAX_REGIONS 個 */
  regions?: Region[]
  /** 日食の影が落ちる地球（テクスチャがそろう前の仮の地球）か、月食で地球の影に入る月か */
  eclipse?: 'earth' | 'moon'
}

/**
 * 球の上の丸い地域。lat・lon は度（lon は球の座標で、+X が 0 度・-Z が 90 度）、size は半径（度）。
 * crater を付けると色でなく、大きなクレーターとして掘る
 */
export type Region = { lat: number; lon: number; size: number; color?: string; amount?: number; crater?: boolean }

const MAX_REGIONS = 6

const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vPosL;
  void main() {
    vUv = uv;
    vPosL = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vPosW = w.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
    #include <logdepthbuf_vertex>
  }
`

const fragmentShader = /* glsl */ `
  #define MAX_REGIONS ${MAX_REGIONS}
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform vec3 uColor;
  uniform int uStyle;
  uniform float uTime;
  uniform float uRadius;
  uniform vec3 uSunW;
  uniform vec3 uSunL;
  uniform vec3 uHaze;
  uniform float uHazeAmount;
  uniform float uJets;
  uniform float uFlow;
  uniform vec4 uSpot;
  uniform vec3 uSpotShape;
  uniform float uEclipseTarget;
  ${ECLIPSE_GLSL}
  uniform float uRingOn;
  uniform float uRingIn;
  uniform float uRingOut;
  uniform sampler2D uRingMap;
  uniform float uRingHasMap;
  uniform float uDetail;
  uniform float uSeed;
  uniform vec4 uRegion[${MAX_REGIONS}];
  uniform vec4 uRegionColor[${MAX_REGIONS}];
  uniform int uRegionCount;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vPosL;

  // ---- ノイズ ----
  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  vec3 hash33(vec3 p) {
    return vec3(hash3(p), hash3(p + 19.19), hash3(p + 47.77));
  }
  float noise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float fbm3(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
    return v;
  }

  // クレーター：セルごとに丸いくぼみと盛り上がった縁を置く（高さを返す）
  float craters(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    float h = 0.0;
    for (int z = -1; z <= 1; z++)
    for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec3 o = vec3(float(x), float(y), float(z));
      vec3 r = hash33(i + o);
      if (r.z < 0.45) continue;
      float rad = 0.18 + 0.32 * fract(r.x * 7.1);
      float t = length(f - o - r) / rad;
      if (t > 1.6) continue;
      float bowl = t < 1.0 ? (t * t - 1.0) : 0.0;
      float rim = exp(-pow((t - 1.0) * 5.0, 2.0)) * 0.35;
      h += (bowl + rim) * rad;
    }
    return h;
  }

  // 地域の中心からの距離（半径を1とする）。縁はノイズで少しぎざぎざにする
  float regionDist(vec3 unit, vec4 region) {
    float d = acos(clamp(dot(unit, region.xyz), -1.0, 1.0)) / region.w;
    return d + (fbm3(unit * 7.0 + region.xyz * 3.0 + uSeed) - 0.5) * 0.45;
  }

  // ---- ガスの流れ ----
  // 緯度（-1〜1）ごとの東西の風。向きが交互に変わる帯（ジェット）
  float jets(float lat) {
    return sin(lat * PI * uJets) * 0.65 + sin(lat * PI * uJets * 0.43 + 1.3) * 0.35;
  }

  // 渦の中心のまわりを回す（楕円の形を保つ）
  vec2 swirl(vec2 uv, float phase) {
    if (uSpot.w == 0.0) return uv;
    vec2 axes = uSpotShape.xy;
    vec2 e = (uv - uSpot.xy) / axes;
    float rho = length(e);
    float ang = uSpot.w * phase * (1.0 - smoothstep(0.25, 1.15, rho));
    float c = cos(ang), s = sin(ang);
    e = mat2(c, -s, s, c) * e;
    return uSpot.xy + e * axes;
  }

  vec3 baseColor(vec2 uv) {
    if (uHasMap > 0.5) return texture2D(uMap, uv).rgb;
    return uColor;
  }

  // 流れる雲：位相をずらした2枚を重ねて、帯がちぎれずに流れ続けるようにする
  vec3 flowingColor(vec2 uv) {
    float lat = uv.y * 2.0 - 1.0;
    float w = jets(lat);
    float shear = abs(jets(lat + 0.01) - jets(lat - 0.01)) * 50.0;
    vec2 eddy = vec2(noise3(vec3(uv.x * 38.0, uv.y * 76.0, uTime * 0.04)), noise3(vec3(uv.x * 38.0 + 7.0, uv.y * 76.0, uTime * 0.04))) - 0.5;
    float period = 30.0;
    float p0 = fract(uTime / period);
    float p1 = fract(uTime / period + 0.5);
    vec2 drift = vec2(w * uFlow, 0.0);
    vec2 turb = eddy * vec2(0.0016, 0.0008) * (0.35 + min(shear, 2.0));
    vec2 uv0 = swirl(uv, p0) + drift * p0 + turb * p0;
    vec2 uv1 = swirl(uv, p1) + drift * p1 + turb * p1;
    float blend = abs(p0 * 2.0 - 1.0);
    return mix(baseColor(uv0), baseColor(uv1), blend);
  }

  // 高さの変化から法線をずらす（バンプ）
  vec3 bump(vec3 N, vec3 p, float h, float scale) {
    vec3 dpdx = dFdx(p);
    vec3 dpdy = dFdy(p);
    float dhdx = dFdx(h);
    float dhdy = dFdy(h);
    vec3 r1 = cross(dpdy, N);
    vec3 r2 = cross(N, dpdx);
    float det = dot(dpdx, r1);
    vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
    return normalize(abs(det) * N - scale * grad);
  }

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    vec3 L = normalize(uSunW - vPosW);
    vec3 unit = normalize(vPosL);
    bool solid = uStyle <= 1;

    // ---- 色 ----
    vec3 albedo;
    if (uStyle >= 2) albedo = flowingColor(vUv);
    else albedo = baseColor(vUv);
    if (uHasMap < 0.5) {
      // 模様の無い天体：明るさのむらと、明るい・暗い地域を作る
      float m = fbm3(unit * 3.5 + uSeed * 13.0);
      float s = fbm3(unit * 11.0 + uSeed * 7.0);
      albedo *= 0.62 + 0.55 * m + 0.25 * (s - 0.5);
      for (int i = 0; i < MAX_REGIONS; i++) {
        if (i >= uRegionCount) break;
        if (uRegionColor[i].w <= 0.0) continue;
        float w = 1.0 - smoothstep(0.8, 1.05, regionDist(unit, uRegion[i]));
        albedo = mix(albedo, uRegionColor[i].rgb * (0.85 + 0.3 * s), w * uRegionColor[i].w);
      }
    }
    if (uStyle == 3) {
      // 氷の巨大惑星：かすかな縞
      float lat = vUv.y * 2.0 - 1.0;
      albedo *= 0.96 + 0.05 * sin(lat * 26.0 + noise3(vec3(vUv * vec2(6.0, 30.0), uTime * 0.02)) * 2.0);
    }
    if (uSpot.w != 0.0 && uSpotShape.z > 0.5) {
      // テクスチャに無い渦（海王星の大暗斑）：暗い楕円と、そばの白い雲
      vec2 e = (vUv - uSpot.xy) / uSpotShape.xy;
      float d = length(e);
      albedo *= 1.0 - 0.38 * (1.0 - smoothstep(0.55, 1.0, d));
      float companion = 1.0 - smoothstep(0.0, 1.0, length((vUv - uSpot.xy - vec2(0.0, uSpotShape.y * 1.6)) / (uSpotShape.xy * vec2(1.4, 0.35))));
      albedo = mix(albedo, vec3(0.95), companion * 0.75);
    }

    // ---- 凹凸（岩の天体） ----
    vec3 Nb = N;
    if (solid) {
      float h = 0.0;
      if (uHasMap > 0.5) h = dot(albedo, vec3(0.3, 0.59, 0.11)) * 0.6;
      for (int i = 0; i < MAX_REGIONS; i++) {
        if (i >= uRegionCount) break;
        if (uRegionColor[i].w > 0.0) continue;
        // 大きなクレーター：くぼみと盛り上がった縁、真ん中の山
        float t = acos(clamp(dot(unit, uRegion[i].xyz), -1.0, 1.0)) / uRegion[i].w;
        h += ((t < 1.0 ? (t * t - 1.0) : 0.0) + exp(-pow((t - 1.0) * 6.0, 2.0)) * 0.4 + exp(-t * t * 90.0) * 0.5) * uRegion[i].w * 6.0;
      }
      if (uDetail > 0.001) {
        // 近づいたときだけ、細かいクレーターと岩肌を足す（画面上で細かすぎる模様は消す）
        float px = length(fwidth(unit));
        float w28 = 1.0 - smoothstep(0.12, 0.3, px * 28.0);
        float w85 = 1.0 - smoothstep(0.12, 0.3, px * 85.0);
        h += (fbm3(unit * 90.0) - 0.5) * 0.25 * uDetail * w85;
        if (uStyle == 0 || uHasMap < 0.5) h += (craters(unit * 28.0) * 0.6 * w28 + (w85 > 0.0 ? craters(unit * 85.0) * 0.25 * w85 : 0.0)) * uDetail;
        else h += craters(unit * 40.0) * 0.25 * uDetail * w28;
      }
      Nb = bump(N, vPosW, h, uRadius * 0.012);
    }

    // ---- 光 ----
    float ndlGeo = dot(N, L);
    float ndl = dot(Nb, L);
    float mu = max(dot(N, V), 0.0);
    float light;
    if (uStyle == 0) {
      // 大気がない：縁まで明るい（ロンメル・ゼーリガー）と、凹凸の陰影を混ぜる
      float mu0 = max(ndl, 0.0);
      float ls = 2.0 * mu0 / (mu0 + mu + 1e-4);
      light = mix(ls, mu0, 0.35) * smoothstep(-0.02, 0.06, ndlGeo);
    } else if (uStyle == 1) {
      float wrap = clamp((ndl + 0.05) / 1.05, 0.0, 1.0);
      light = wrap * smoothstep(-0.08, 0.1, ndlGeo);
    } else {
      // ガス・雲：境目がやわらかく、縁が少し暗い（周縁減光）
      float wrap = clamp((ndl + 0.12) / 1.12, 0.0, 1.0);
      light = wrap * (0.55 + 0.45 * sqrt(mu));
    }

    // ---- 輪の影（土星） ----
    if (uRingOn > 0.5 && abs(uSunL.y) > 1e-4) {
      float t = -vPosL.y / uSunL.y;
      if (t > 0.0) {
        vec2 hit = (vPosL + uSunL * t).xz;
        float r = length(hit);
        if (r > uRingIn && r < uRingOut) {
          float x = (r - uRingIn) / (uRingOut - uRingIn);
          float a = uRingHasMap > 0.5 ? texture2D(uRingMap, vec2(x, 0.5)).a : 0.6;
          light *= 1.0 - a * 0.85;
        }
      }
    }

    // ---- 日食・月食の影 ----
    float eclipseRed = 0.0;
    float redLevel = 0.0;
    if (uEclipseTarget > 0.5 && uEclipseTarget < 1.5) light *= solarShadow(vPosW);
    if (uEclipseTarget > 1.5 && uShadowOn > 1.5) {
      vec3 q = vPosW - uShadowC;
      float t = dot(q, uShadowD);
      float d = length(q - t * uShadowD);
      if (t > 0.0) {
        // 半影ではだんだん暗く、本影の中は、地球の大気を通って曲がった赤い光だけが届く
        float pen = 1.0 - smoothstep(uShadowR.x, uShadowR.y, d);
        light *= 1.0 - 0.6 * pen * pen;
        eclipseRed = 1.0 - smoothstep(uShadowR.x * 0.97, uShadowR.x * 1.03, d);
        redLevel = 0.3 + 0.45 * clamp(d / uShadowR.x, 0.0, 1.0);
      }
    }

    vec3 color = albedo * light * 1.05;
    // 赤い光も太陽の側から来るので、照らされている半球だけが赤くなる
    color = mix(color, albedo * vec3(0.62, 0.2, 0.08) * redLevel * (0.55 + 0.45 * mu) * smoothstep(-0.05, 0.15, ndlGeo), eclipseRed);

    // ---- 大気のもや：昼側の縁ににじむ光と、明暗境界の夕焼け色 ----
    if (uHazeAmount > 0.0) {
      float day = smoothstep(-0.25, 0.45, ndlGeo);
      float rim = pow(1.0 - mu, 2.6);
      color += uHaze * rim * day * uHazeAmount;
      float dusk = exp(-pow(ndlGeo * 5.0, 2.0)) * (0.4 + 0.6 * rim);
      color += uHaze * vec3(1.0, 0.55, 0.3) * dusk * uHazeAmount * 0.35;
    }

    // 夜側もほんの少し見える（星明かり）
    color += albedo * 0.012;

    gl_FragColor = vec4(color, 1.0);
    #include <logdepthbuf_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const DEG = Math.PI / 180

export function createSurfaceMaterial(opts: SurfaceOptions) {
  const spot = opts.spot
  const regions = (opts.regions ?? []).slice(0, MAX_REGIONS)
  const regionDirs = Array.from({ length: MAX_REGIONS }, (_, i) => {
    const r = regions[i]
    if (!r) return new THREE.Vector4()
    const lat = r.lat * DEG
    const lon = r.lon * DEG
    return new THREE.Vector4(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon), r.size * DEG)
  })
  const regionColors = Array.from({ length: MAX_REGIONS }, (_, i) => {
    const r = regions[i]
    if (!r || r.crater) return new THREE.Vector4()
    const c = new THREE.Color(r.color ?? opts.color)
    return new THREE.Vector4(c.r, c.g, c.b, r.amount ?? 1)
  })
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uMap: { value: null as THREE.Texture | null },
      uHasMap: { value: 0 },
      uColor: { value: new THREE.Color(opts.color) },
      uStyle: { value: STYLE_ID[opts.style] },
      uTime: { value: 0 },
      uRadius: { value: opts.radius },
      uSunW: { value: new THREE.Vector3() },
      uSunL: { value: new THREE.Vector3(1, 0, 0) },
      uHaze: { value: new THREE.Color(opts.haze ?? '#ffffff') },
      uHazeAmount: { value: opts.hazeAmount ?? 0 },
      uJets: { value: opts.jets ?? 6 },
      uFlow: { value: opts.flow ?? 0 },
      uSpot: { value: new THREE.Vector4(spot?.u ?? 0, spot?.v ?? 0, 0, spot?.spin ?? 0) },
      uSpotShape: { value: new THREE.Vector3(spot?.ru ?? 1, spot?.rv ?? 1, spot?.dark ? 1 : 0) },
      uRingOn: { value: opts.ring ? 1 : 0 },
      uRingIn: { value: opts.ring?.inner ?? 0 },
      uRingOut: { value: opts.ring?.outer ?? 0 },
      uRingMap: { value: null as THREE.Texture | null },
      uRingHasMap: { value: 0 },
      uDetail: { value: 0 },
      uSeed: { value: opts.seed ?? 0 },
      uRegion: { value: regionDirs },
      uRegionColor: { value: regionColors },
      uRegionCount: { value: regions.length },
      uEclipseTarget: { value: opts.eclipse === 'moon' ? 2 : opts.eclipse === 'earth' ? 1 : 0 },
      ...eclipseUniforms,
    },
  })
}

/** 天体ごとの見た目の設定 */
export function surfaceOptions(id: string, radius: number, color: string, extra: { haze?: string; ring?: { inner: number; outer: number } }): SurfaceOptions {
  const seed = [...id].reduce((s, c) => s + c.charCodeAt(0), 0) % 97
  switch (id) {
    case 'mercury':
    case 'moon':
      return { style: 'airless', radius, color, seed }
    case 'earth':
      return { style: 'rocky', radius, color, haze: '#6fb0ff', hazeAmount: 0.6, seed }
    case 'mars':
      return { style: 'rocky', radius, color, haze: '#e8a07a', hazeAmount: 0.35, seed }
    case 'venus':
      return { style: 'clouds', radius, color, haze: '#f6dcae', hazeAmount: 0.8, jets: 1, flow: 0.006, seed }
    case 'jupiter':
      // 大赤斑の位置は 2k_jupiter.jpg の上で測った値
      return { style: 'gas', radius, color, haze: extra.haze, hazeAmount: 0.25, jets: 7, flow: 0.004, spot: { u: 0.366, v: 0.391, ru: 0.026, rv: 0.027, spin: 1.2 }, seed }
    case 'saturn':
      return { style: 'gas', radius, color, haze: extra.haze, hazeAmount: 0.22, jets: 5, flow: 0.003, ring: extra.ring, seed }
    case 'uranus':
      return { style: 'ice', radius, color, haze: '#bff1f6', hazeAmount: 0.25, jets: 3, flow: 0.003, seed }
    case 'neptune':
      return { style: 'ice', radius, color, haze: '#7f9cff', hazeAmount: 0.22, jets: 4, flow: 0.005, spot: { u: 0.55, v: 0.36, ru: 0.03, rv: 0.018, spin: 0.8, dark: true }, seed }
    case 'titan':
      return { style: 'clouds', radius, color, haze: '#e0a85a', hazeAmount: 0.7, jets: 1, flow: 0.004, seed }
    case 'pluto':
      // ハート形の明るい窒素の氷（トンボー領域）と、赤道の暗い赤茶色の地域（クトゥルフ斑）
      return {
        style: 'airless', radius, color, seed, haze: '#9fb8e6', hazeAmount: 0.12,
        regions: [
          { lat: 22, lon: 172, size: 26, color: '#f6f1e8' },
          { lat: 20, lon: 205, size: 25, color: '#ece2d2', amount: 0.85 },
          { lat: 2, lon: 188, size: 13, color: '#f1eadf', amount: 0.9 },
          { lat: -8, lon: 115, size: 26, color: '#4a2a1d' },
          { lat: -6, lon: 65, size: 24, color: '#55301f' },
          { lat: -10, lon: 25, size: 16, color: '#5d3624', amount: 0.85 },
        ],
      }
    case 'charon':
      // 北極の赤黒い地域（モルドール斑）。冥王星から逃げた大気が凍りついたもの
      return { style: 'airless', radius, color, seed, regions: [{ lat: 90, lon: 0, size: 28, color: '#5a3426', amount: 0.9 }] }
    case 'iapetus':
      // 公転の進む向きの半球が黒い（カッシーニ地域）。衛星はいつも同じ面を土星に向け、-Z の向きへ進む
      return { style: 'airless', radius, color, seed, regions: [{ lat: 0, lon: 90, size: 72, color: '#2a2018' }] }
    case 'mimas':
      // 直径の3分の1もある巨大なハーシェル・クレーター（進む向きの半球）
      return { style: 'airless', radius, color, seed, regions: [{ lat: 2, lon: 70, size: 19, crater: true }] }
    default:
      return { style: 'airless', radius, color, seed }
  }
}
