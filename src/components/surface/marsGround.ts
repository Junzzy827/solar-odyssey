import * as THREE from 'three'
import type { SurfaceDef } from '../../data/surfaces'
import { pixels } from './dem'

// 火星の地面（地球の砂漠に見えないように）。
// 地形は 1 枚のなめらかなメッシュのまま、シェーダーが 1 画素ずつ「何でできているか」を選んで塗る：
//   砂ぼこり（平らな所の明るい細かい砂）・小石の原（斜面や吹きさらしの所、黒っぽい玄武岩の小石）・
//   黒い砂（くぼみにたまった玄武岩の砂のさざ波）・岩盤（急な斜面や露頭の、割れ目で区切られた平たい板）。
// 素材の見本は Blender で焼いたつなぎ目の無いタイル（tools/blender/bake_mars_ground.py）。UV は使わず、
// 世界の位置から貼る（岩盤は 3 方向から：三面投影）。境目は素材の高さを比べて決める（小石のすき間に砂がたまる）。
// さらに小さなクレーター（数十 cm〜3 m）を、影もいっしょにシェーダーで描き足す（地形の形そのものは変えない）。

/** 素材の並び（タイルの名前と、1 枚の大きさ m）。bake_mars_ground.py の TILE と同じ */
const MATS = [
  { name: 'dust', tile: 2.0, rough: 0.97 },
  { name: 'gravel', tile: 1.5, rough: 0.9 },
  { name: 'darkSand', tile: 3.0, rough: 0.93 },
  { name: 'bedrock', tile: 3.0, rough: 0.82 },
] as const
/** 焼いた高さの範囲（m）。bake_mars_ground.py の H_MIN / H_MAX と同じ */
const H_MIN = -0.06
const H_MAX = 0.08

/** 太陽の向き（地表の座標）。SurfaceView が毎フレーム入れる。クレーターの影に使う */
export const marsSun = { value: new THREE.Vector3(0.5, 0.5, 0) }

/** まだ読めていないときの代わり：平らで、砂ぼこりの明るさ */
const placeholder = (() => {
  const t = new THREE.DataTexture(new Uint8Array([128, 128, 128, 214]), 1, 1, THREE.RGBAFormat)
  t.needsUpdate = true
  return t
})()

type Set4 = THREE.DataTexture[]
const loaded = new Map<boolean, Set4>()
const loading = new Map<boolean, Promise<Set4>>()
/** 読み終わったら材質に入れる（読み終わる前に作った材質のため） */
const waiting = new Map<boolean, ((s: Set4) => void)[]>()

/**
 * タイルを 1 枚読んで、シェーダー用の RGBA に作り直す：
 *  RG = 凹凸（接空間の法線の x, y）、B = その素材の中での高さ（0〜1）、A = 明るさ（すき間の暗さを足したもの）
 * PNG は R = 高さの上位 8 ビット、B = 下位、G = 明るさ。上下は逆さに入っているので、ここで戻す
 */
async function loadTile(name: string, tile: number, small: boolean) {
  const px = await pixels(`${import.meta.env.BASE_URL}textures/ground/mars_${name}${small ? '_s' : ''}.png`)
  const N = Math.round(Math.sqrt(px.length / 4))
  const h = new Float32Array(N * N)
  let lo = Infinity
  let hi = -Infinity
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = ((N - 1 - y) * N + x) * 4
      const v = H_MIN + ((px[i] * 256 + px[i + 2]) / 65535) * (H_MAX - H_MIN)
      h[y * N + x] = v
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  const at = (x: number, y: number) => h[((y + N) % N) * N + ((x + N) % N)]
  const texel = tile / N
  const data = new Uint8Array(N * N * 4)
  const r = Math.max(2, Math.round(N / 64))
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) / (2 * texel)
      const dy = (at(x, y + 1) - at(x, y - 1)) / (2 * texel)
      const l = Math.hypot(dx, dy, 1)
      // すき間の暗さ：まわり（数 cm）の平均より低い所は、光が届きにくい
      const c = at(x, y)
      const around = (at(x + r, y) + at(x - r, y) + at(x, y + r) + at(x, y - r) + at(x + r, y + r) + at(x - r, y - r) + at(x + r, y - r) + at(x - r, y + r)) / 8
      const ao = 1 - Math.min(0.35, Math.max(0, around - c) * 28)
      const alb = px[((N - 1 - y) * N + x) * 4 + 1] / 255
      const o = (y * N + x) * 4
      data[o] = Math.round(((-dx / l) * 0.5 + 0.5) * 255)
      data[o + 1] = Math.round(((-dy / l) * 0.5 + 0.5) * 255)
      data[o + 2] = Math.round(((c - lo) / (hi - lo + 1e-6)) * 255)
      data[o + 3] = Math.round(alb * ao * 255)
    }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.anisotropy = small ? 2 : 8
  t.needsUpdate = true
  return t
}

/** 火星の地面のタイルを読む（着陸の暗転のあいだに呼んでおく）。small：スマホなどメモリの少ないときは半分の大きさ */
export function loadMarsGround(small: boolean): Promise<Set4> {
  let p = loading.get(small)
  if (!p) {
    p = Promise.all(MATS.map((m) => loadTile(m.name, m.tile, small))).then((s) => {
      loaded.set(small, s)
      for (const f of waiting.get(small) ?? []) f(s)
      waiting.delete(small)
      return s
    })
    loading.set(small, p)
    p.catch(() => loading.delete(small))
  }
  return p
}

const GLSL = /* glsl */ `
uniform sampler2D uMT0; uniform sampler2D uMT1; uniform sampler2D uMT2; uniform sampler2D uMT3;
uniform vec4 uMTile; uniform vec4 uMRough;
uniform vec3 uMDark; uniform vec3 uMLight; uniform vec3 uMRef;
uniform vec3 uMSun;
varying vec3 vGWorld;
varying vec3 vGNormal;
vec3 gWN; float gRoughM;

float mHash(vec2 c, float s) { return fract(sin(dot(c, vec2(127.1, 311.7)) + s) * 43758.5453); }
float mNoise(vec2 q) {
  vec2 i = floor(q); vec2 f = fract(q); vec2 u = f * f * (3.0 - 2.0 * f);
  float a = mHash(i, 0.0), b = mHash(i + vec2(1.0, 0.0), 0.0), c = mHash(i + vec2(0.0, 1.0), 0.0), d = mHash(i + vec2(1.0, 1.0), 0.0);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
// 上から貼った 1 枚：接空間の法線（xy）と高さ・明るさ
vec4 mTop(sampler2D t, vec2 q) { return texture2D(t, q); }
vec3 mTopNormal(vec4 s, vec3 n, float k) {
  vec3 tn = normalize(vec3((s.rg * 2.0 - 1.0) * k, 1.0));
  vec3 T = normalize(vec3(1.0, 0.0, 0.0) - n * n.x);
  vec3 B = normalize(cross(T, n));
  return normalize(T * tn.x + B * tn.y + n * tn.z);
}
// 3 方向から貼る（岩盤の崖でも模様が伸びない）。xyz = 世界の法線、w = 高さ。明るさは alb に
vec4 mTri(sampler2D t, vec3 p, vec3 n, float tile, float k, out float alb) {
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
  vec4 sx = texture2D(t, p.zy / tile);
  vec4 sy = texture2D(t, p.xz / tile);
  vec4 sz = texture2D(t, p.xy / tile);
  vec3 tx = vec3((sx.rg * 2.0 - 1.0) * k, 1.0);
  vec3 ty = vec3((sy.rg * 2.0 - 1.0) * k, 1.0);
  vec3 tz = vec3((sz.rg * 2.0 - 1.0) * k, 1.0);
  tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x);
  ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y);
  tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
  alb = sx.a * w.x + sy.a * w.y + sz.a * w.z;
  return vec4(normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z), sx.b * w.x + sy.b * w.y + sz.b * w.z);
}
// 小さなクレーター：ます目（cell m）ごとに確率 prob で 1 つ。お椀の形の傾き（grad）と、太陽の側の縁が落とす影（shade）、
// 底にたまった砂ぼこり（fill）を足す。半径はます目の 1/4 まで、中心はます目の真ん中寄りなので、自分のます目だけ見ればよい
void mCrater(vec2 q, float cell, float prob, float rmin, float rmax, float seed, vec3 sun, inout vec2 grad, inout float shade, inout float fill) {
  vec2 c = floor(q / cell);
  float h1 = mHash(c, seed);
  if (h1 > prob) return;
  float R = mix(rmin, rmax, pow(mHash(c, seed + 1.7), 2.0));
  vec2 ctr = (c + 0.25 + 0.5 * vec2(mHash(c, seed + 3.1), mHash(c, seed + 5.3))) * cell;
  vec2 o = (q - ctr) / R;
  float rho = length(o);
  if (rho > 1.5) return;
  // 深さは半径の 6〜16%（古くて浅くなったものも）
  float D = mix(0.06, 0.16, h1 / prob);
  float dh = rho < 1.0 ? 2.0 * D * rho : -0.8 * D * (1.0 - (rho - 1.0) / 0.5);
  grad += dh * o / max(rho, 1e-3);
  if (rho < 1.0) {
    vec2 s2 = normalize(sun.xz + 1e-5);
    float tanE = max(sun.y, 0.0) / max(length(sun.xz), 1e-3);
    float od = dot(o, s2);
    float t = -od + sqrt(max(0.0, 1.0 - rho * rho + od * od));
    float dep = D * (1.0 - rho * rho);
    shade = min(shade, 1.0 - 0.62 * smoothstep(-0.004, 0.012, dep - t * tanE) * smoothstep(-0.05, 0.05, sun.y));
    fill = max(fill, (1.0 - smoothstep(0.25, 0.8, rho)) * 0.8);
  }
}
`

/**
 * 火星の地面の材質（頂点の色は大きな色むら・見どころの色。その上に素材の明るさと凹凸を掛ける）。
 * small：スマホ・軽量の画質では、タイルを半分に、岩盤も上からだけ、遠くの模様とクレーターの大きいほうを省く
 */
export function marsGroundMaterial(def: SurfaceDef, small: boolean) {
  const tex = loaded.get(small)
  const light = new THREE.Color('#bf8f69')
  const dark = new THREE.Color('#4b433d')
  const uniforms = {
    uMT0: { value: tex?.[0] ?? placeholder },
    uMT1: { value: tex?.[1] ?? placeholder },
    uMT2: { value: tex?.[2] ?? placeholder },
    uMT3: { value: tex?.[3] ?? placeholder },
    uMTile: { value: new THREE.Vector4(...MATS.map((m) => m.tile)) },
    uMRough: { value: new THREE.Vector4(...MATS.map((m) => m.rough)) },
    uMLight: { value: light },
    uMDark: { value: dark },
    // 砂ぼこりのふつうの明るさ（0.84）のときに、頂点の色がそのまま出るように割る基準
    uMRef: { value: dark.clone().lerp(light, 0.8) },
    uMSun: marsSun,
  }
  if (!tex) {
    void loadMarsGround(small).catch(() => null)
    const list = waiting.get(small) ?? []
    const slots = [uniforms.uMT0, uniforms.uMT1, uniforms.uMT2, uniforms.uMT3]
    list.push((s) => s.forEach((t, i) => (slots[i].value = t)))
    waiting.set(small, list)
  }
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: def.groundRough ?? 0.95, metalness: 0 })
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGWorld;\nvarying vec3 vGNormal;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vGWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vGNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 p = vGWorld;
          vec3 n = normalize(vGNormal);
          float dist = length(p - cameraPosition);
          float slope = 1.0 - clamp(n.y, 0.0, 1.0);
          // 遠くは凹凸を弱く（細かい模様がちらつかないように）
          float kN = 1.0 - 0.7 * smoothstep(25.0, 160.0, dist);

          // 小さなクレーター（平らな所だけ。遠くは消す）
          vec2 cg = vec2(0.0); float cShade = 1.0; float cFill = 0.0;
          float flatK = 1.0 - smoothstep(0.08, 0.22, slope);
          if (flatK > 0.0 && dist < 140.0) {
            mCrater(p.xz, 5.0, 0.3, 0.25, 1.1, 11.0, uMSun, cg, cShade, cFill);
            ${small ? '' : 'mCrater(p.xz + 7.3, 17.0, 0.3, 1.1, 3.2, 23.0, uMSun, cg, cShade, cFill);'}
            float cK = flatK * (1.0 - smoothstep(60.0, 140.0, dist));
            cg *= cK; cShade = mix(1.0, cShade, cK); cFill *= cK;
          }

          // どこに何があるか：大きな模様（数十 m）と傾きで、素材ごとの「出やすさ」を決める
          vec2 q = p.xz;
          float m1 = mNoise(q / 23.0) * 0.65 + mNoise(mat2(0.8, -0.6, 0.6, 0.8) * q / 7.7) * 0.35;
          float m2 = mNoise(q / 41.0 + 17.3) * 0.7 + mNoise(q / 13.0 + 3.1) * 0.3;
          float m3 = mNoise(q / 29.0 + 41.7) * 0.75 + mNoise(q / 9.0 + 7.9) * 0.25;
          float wDust = 0.55 + cFill * 0.9;
          float wGrav = 0.42 + smoothstep(0.035, 0.13, slope) * 0.9 + smoothstep(0.52, 0.72, m1) * 0.75;
          float wDark = smoothstep(0.6, 0.78, m2) * (1.0 - smoothstep(0.03, 0.1, slope)) * 1.15;
          float wRock = smoothstep(0.14, 0.3, slope) * 1.8 + smoothstep(0.7, 0.86, m3) * 0.95 * flatK;

          // 4 つの素材を読む（岩盤は 3 方向から）。遠くはタイルを大きく貼ったものと混ぜて、繰り返しを隠す
          vec4 s0 = mTop(uMT0, q / uMTile.x);
          vec4 s1 = mTop(uMT1, q / uMTile.y);
          vec4 s2 = mTop(uMT2, q / uMTile.z);
          ${
            small
              ? ''
              : `float farK = smoothstep(6.0, 40.0, dist);
          if (farK > 0.0) {
            mat2 rot = mat2(0.6, 0.8, -0.8, 0.6);
            s0 = mix(s0, mTop(uMT0, rot * q / (uMTile.x * 6.7) + 0.31), farK * 0.6);
            s1 = mix(s1, mTop(uMT1, rot * q / (uMTile.y * 7.3) + 0.57), farK * 0.6);
          }`
          }
          float aRock;
          ${small ? 'vec4 s3 = mTop(uMT3, q / uMTile.w); aRock = s3.a; vec4 r3 = vec4(mTopNormal(s3, n, kN), s3.b);' : 'vec4 r3 = mTri(uMT3, p, n, uMTile.w, kN, aRock);'}

          // 高さを比べて境目を決める（小石のすき間に砂ぼこり、岩盤の割れ目に砂）
          float a0 = s0.b * 0.5 + wDust;
          float a1 = s1.b * 0.7 + wGrav;
          float a2 = s2.b * 0.4 + wDark;
          float a3 = r3.w * 0.6 + wRock;
          float ma = max(max(a0, a1), max(a2, a3)) - 0.16;
          vec4 b = max(vec4(a0, a1, a2, a3) - ma, 0.0);
          b /= (b.x + b.y + b.z + b.w + 1e-5);

          float alb = s0.a * b.x + s1.a * b.y + s2.a * b.z + aRock * b.w;
          vec3 tint = mix(uMDark, uMLight, alb) / uMRef;
          diffuseColor.rgb *= tint * cShade;

          vec3 wn = mTopNormal(s0, n, kN) * b.x + mTopNormal(s1, n, kN) * b.y + mTopNormal(s2, n, kN) * b.z + r3.xyz * b.w;
          gWN = normalize(normalize(wn) - vec3(cg.x, 0.0, cg.y));
          gRoughM = dot(b, uMRough);
        }`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRoughM;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(gWN, 0.0)).xyz);')
  }
  m.customProgramCacheKey = () => `ground-mars-${small ? 'flat' : 'tri'}`
  return m
}
