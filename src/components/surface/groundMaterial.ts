import * as THREE from 'three'
import type { SurfaceDef } from '../../data/surfaces'

// 地面の素材：砂・レゴリス（月の砂）・氷・火山岩。それぞれの細かい凹凸（法線）とざらつき（粗さ）を、
// その場で作る絵（つなぎ目の無い繰り返し模様）から描く。
// 近くは細かい模様、遠くは大きな模様に切り替えて、同じ模様の繰り返しが目立たないようにする。
// 斜面は岩肌（ごつごつした角ばった凹凸と、岩の色）に変える。どの天体も同じ仕組みで、違いは素材の種類と色だけ。

export type SurfaceKind = 'sand' | 'regolith' | 'ice' | 'volcanic'

const KIND: Record<string, SurfaceKind> = {
  earth: 'sand', mars: 'sand', titan: 'sand',
  venus: 'volcanic', io: 'volcanic',
  europa: 'ice', enceladus: 'ice', triton: 'ice', pluto: 'ice', charon: 'ice', tethys: 'ice', dione: 'ice', rhea: 'ice',
  mimas: 'ice', iapetus: 'ice', miranda: 'ice', ariel: 'ice', titania: 'ice', oberon: 'ice', ganymede: 'ice',
}
export const kindFor = (def: SurfaceDef): SurfaceKind => KIND[def.id] ?? 'regolith'

/** 素材ごとの見え方：模様の大きさ（m）、凹凸の強さ、粗さ */
const LOOK: Record<SurfaceKind | 'rock', { tileNear: number; tileFar: number; normal: number; rough: number }> = {
  sand: { tileNear: 1.9, tileFar: 17, normal: 0.55, rough: 0.95 },
  regolith: { tileNear: 1.2, tileFar: 11, normal: 1.1, rough: 0.97 },
  ice: { tileNear: 2.4, tileFar: 20, normal: 0.7, rough: 0.62 },
  volcanic: { tileNear: 1.4, tileFar: 12, normal: 1.3, rough: 0.9 },
  rock: { tileNear: 2.2, tileFar: 2.2, normal: 1.6, rough: 0.85 },
}

// ---- つなぎ目の無いノイズ ----------------------------------------------------------------------

function makeNoise(seed: number) {
  const hash = (x: number, y: number, p: number) => {
    x = ((x % p) + p) % p
    y = ((y % p) + p) % p
    const v = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
    return v - Math.floor(v)
  }
  /** 周期 p の値ノイズ（0〜1） */
  const vnoise = (x: number, y: number, p: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const u = xf * xf * (3 - 2 * xf)
    const v = yf * yf * (3 - 2 * yf)
    const a = hash(xi, yi, p)
    const b = hash(xi + 1, yi, p)
    const c = hash(xi, yi + 1, p)
    const d = hash(xi + 1, yi + 1, p)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
  /** 0〜1 の座標で、端と端がつながる fbm */
  const fbm = (x: number, y: number, base: number, oct: number) => {
    let s = 0
    let a = 0.5
    let p = base
    let n = 0
    for (let o = 0; o < oct; o++) {
      s += a * vnoise(x * p, y * p, p)
      n += a
      a *= 0.5
      p *= 2
    }
    return s / n
  }
  /** 周期 p のセル（ボロノイ）：いちばん近い点と 2 番目の点までの距離 */
  const cells = (x: number, y: number, p: number) => {
    const gx = x * p
    const gy = y * p
    const xi = Math.floor(gx)
    const yi = Math.floor(gy)
    let d1 = 9
    let d2 = 9
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const cx = xi + i + hash(xi + i, yi + j, p)
        const cy = yi + j + hash(xi + i + 31, yi + j + 17, p)
        const d = Math.hypot(gx - cx, gy - cy)
        if (d < d1) {
          d2 = d1
          d1 = d
        } else if (d < d2) d2 = d
      }
    return [d1, d2]
  }
  return { fbm, cells, hash }
}

/** 素材ごとの高さの模様（0〜1、つなぎ目無し） */
function heightField(kind: SurfaceKind | 'rock', N: number): Float32Array {
  const { fbm, cells } = makeNoise(kind.length * 13 + 7)
  const h = new Float32Array(N * N)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = x / N
      const v = y / N
      let z = 0
      if (kind === 'sand') {
        // 風の作るさざ波（少しうねる）＋細かい砂
        // さざ波は場所によって強さが変わる（どこも同じ縞にしない）
        const warp = fbm(u, v, 4, 3) * 2.5
        const rip = Math.sin((u * 2 + v * 0.35) * Math.PI * 2 * 9 + warp * 3)
        const amt = 0.35 + 0.65 * fbm(u + 0.3, v + 0.7, 2, 2)
        z = 0.5 + 0.16 * amt * (rip > 0 ? rip : rip * 0.55) + 0.24 * (fbm(u, v, 32, 4) - 0.5) + 0.14 * (fbm(u, v, 4, 3) - 0.5)
      } else if (kind === 'regolith') {
        // 細かい砂の上に、小さなくぼみ（微小クレーター）と小石
        z = 0.5 + 0.3 * (fbm(u, v, 16, 5) - 0.5)
        const [d1] = cells(u, v, 9)
        if (d1 < 0.35) z -= 0.18 * (1 - d1 / 0.35) ** 2
        const [p1] = cells(u + 0.31, v + 0.17, 28)
        if (p1 < 0.18) z += 0.22 * (1 - p1 / 0.18)
      } else if (kind === 'ice') {
        // なめらかな氷に、細い割れ目
        z = 0.55 + 0.15 * (fbm(u, v, 4, 4) - 0.5)
        const [d1, d2] = cells(u, v, 6)
        const edge = d2 - d1
        if (edge < 0.05) z -= 0.3 * (1 - edge / 0.05)
        const [e1, e2] = cells(u + 0.5, v + 0.2, 17)
        if (e2 - e1 < 0.04) z -= 0.12 * (1 - (e2 - e1) / 0.04)
      } else if (kind === 'volcanic') {
        // ざらざらした溶岩に、泡の抜けた小さな穴
        z = 0.5 + 0.35 * (fbm(u, v, 12, 5) - 0.5)
        const [d1] = cells(u, v, 22)
        if (d1 < 0.25) z -= 0.25 * (1 - d1 / 0.25)
      } else {
        // 岩肌：角ばった割れ目と段
        const [d1, d2] = cells(u, v, 5)
        z = 0.35 + 0.5 * Math.min(1, (d2 - d1) * 2.2) + 0.2 * (fbm(u, v, 16, 4) - 0.5)
      }
      h[y * N + x] = Math.min(1, Math.max(0, z))
    }
  return h
}

const cache = new Map<string, THREE.DataTexture>()

/** RGB = 法線（接空間）、A = 高さ。つなぎ目無しで繰り返す */
export function detailTexture(kind: SurfaceKind | 'rock', small = false) {
  const key = `${kind}-${small ? 's' : 'l'}`
  const hit = cache.get(key)
  if (hit) return hit
  const N = small ? 256 : 512
  const h = heightField(kind, N)
  const data = new Uint8Array(N * N * 4)
  const k = (N / 64) * 1.2
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const at = (i: number, j: number) => h[((j + N) % N) * N + ((i + N) % N)]
      const dx = (at(x + 1, y) - at(x - 1, y)) * k
      const dy = (at(x, y + 1) - at(x, y - 1)) * k
      const l = Math.hypot(dx, dy, 1)
      const o = (y * N + x) * 4
      data[o] = Math.round(((-dx / l) * 0.5 + 0.5) * 255)
      data[o + 1] = Math.round(((-dy / l) * 0.5 + 0.5) * 255)
      data[o + 2] = Math.round(((1 / l) * 0.5 + 0.5) * 255)
      data[o + 3] = Math.round(h[y * N + x] * 255)
    }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.anisotropy = 4
  t.needsUpdate = true
  cache.set(key, t)
  return t
}

// ---- 材質 ------------------------------------------------------------------------------------

/**
 * 模様の貼り方（GLSL）。世界の法線（xyz）と模様の高さ（w）を返す。
 *  tri = false：上から（x, z）貼る。急な斜面では模様が縦に伸びる
 *  tri = true ：トライプラナー。3 方向から貼って面の向きで混ぜる（崖でも模様が伸びない）
 * 地形ラボ（components/terrainLab）と着陸地表で同じものを使う
 */
export const TRIPLANAR_GLSL = /* glsl */ `
vec3 labPlanar(vec3 tn, vec3 n) {
  vec3 T = normalize(vec3(1.0, 0.0, 0.0) - n * n.x);
  vec3 B = normalize(cross(T, n));
  return normalize(T * tn.x + B * tn.y + n * tn.z);
}
vec4 labSample(sampler2D t, vec3 p, vec3 n, float tile, float k, bool tri) {
  if (!tri) {
    vec4 s = texture2D(t, p.xz / tile);
    vec3 tn = s.xyz * 2.0 - 1.0;
    tn.xy *= k;
    return vec4(labPlanar(normalize(tn), n), s.a);
  }
  vec3 w = pow(abs(n), vec3(4.0));
  w /= (w.x + w.y + w.z);
  vec4 sx = texture2D(t, p.zy / tile);
  vec4 sy = texture2D(t, p.xz / tile);
  vec4 sz = texture2D(t, p.xy / tile);
  vec3 tx = sx.xyz * 2.0 - 1.0; tx.xy *= k;
  vec3 ty = sy.xyz * 2.0 - 1.0; ty.xy *= k;
  vec3 tz = sz.xyz * 2.0 - 1.0; tz.xy *= k;
  // whiteout 合成：それぞれの面の凹凸を、世界の向きに直して重ねる
  tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x);
  ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y);
  tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
  vec3 wn = normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
  return vec4(wn, sx.a * w.x + sy.a * w.y + sz.a * w.z);
}
`

/**
 * 地面の材質（頂点の色はそのまま。凹凸と粗さと岩肌を足す）。
 * small：スマホなどメモリの少ないときは模様を小さく
 */
export function groundMaterial(def: SurfaceDef, small: boolean) {
  const kind = kindFor(def)
  const look = LOOK[kind]
  const rock = LOOK.rock
  const uniforms = {
    uDetail: { value: detailTexture(kind, small) },
    uRockDetail: { value: detailTexture('rock', small) },
    uTile: { value: new THREE.Vector3(look.tileNear, look.tileFar, rock.tileNear) },
    uNormalK: { value: new THREE.Vector2(look.normal, rock.normal) },
    uRough: { value: new THREE.Vector2(look.rough, rock.rough) },
    uRockColor: { value: new THREE.Color(def.rock) },
    // 斜面の傾き（1 - 法線の上向き成分）で岩肌に変わる範囲（真ん中＝約 37°）
    uSlope: { value: new THREE.Vector2(0.13, 0.27) },
  }
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: look.rough, metalness: 0 })
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
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uDetail;
        uniform sampler2D uRockDetail;
        uniform vec3 uTile;
        uniform vec2 uNormalK;
        uniform vec2 uRough;
        uniform vec3 uRockColor;
        uniform vec2 uSlope;
        varying vec3 vGWorld;
        varying vec3 vGNormal;
        vec4 gNear; vec4 gFar; vec4 gRock; float gFarK; float gRockK; vec3 gWN;
        ${TRIPLANAR_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 p = vGWorld;
          vec3 n = normalize(vGNormal);
          float dist = length(p - cameraPosition);
          // 斜面は 3 方向から貼る（スマホなど軽くするときは上からだけ）
          bool tri = ${small ? 'false' : 'true'};
          float fade = 1.0 - 0.6 * smoothstep(40.0, 220.0, dist);
          gNear = labSample(uDetail, p, n, uTile.x, uNormalK.x * fade, tri);
          gFar = labSample(uDetail, p + 0.37, n, uTile.y, uNormalK.x * fade, tri);
          gRock = labSample(uRockDetail, p, n, uTile.z, uNormalK.y, tri);
          gFarK = smoothstep(5.0, 30.0, dist);
          float slope = 1.0 - clamp(n.y, 0.0, 1.0);
          float hgt = mix(gNear.w, gFar.w, gFarK);
          // 砂と岩肌の境目：傾きで決まる割合に模様の高さを足して比べる（ぼかさず、岩の凹凸に沿ってくっきり）
          float r = clamp((slope - (uSlope.x + uSlope.y) * 0.5) / (uSlope.y - uSlope.x) + 0.5, 0.0, 1.0);
          float a1 = hgt + (1.0 - r);
          float a2 = gRock.w + r;
          float ma = max(a1, a2) - 0.08;
          float b1 = max(a1 - ma, 0.0);
          float b2 = max(a2 - ma, 0.0);
          gRockK = b2 / (b1 + b2 + 1e-5);
          // くぼみは少し暗く、出っ張りは少し明るく（細かい影の代わり）
          diffuseColor.rgb *= mix(0.82, 1.12, hgt);
          vec3 rockCol = uRockColor * mix(0.7, 1.15, gRock.w);
          diffuseColor.rgb = mix(diffuseColor.rgb, rockCol, gRockK * 0.85);
          gWN = normalize(mix(mix(gNear.xyz, gFar.xyz, gFarK), gRock.xyz, gRockK));
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(mix(uRough.x, uRough.y, gRockK) + (0.5 - mix(gNear.w, gFar.w, gFarK)) * 0.12, 0.05, 1.0);`,
      )
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n        normal = normalize((viewMatrix * vec4(gWN, 0.0)).xyz);')
  }
  m.customProgramCacheKey = () => `ground-${kind}-${small ? 'flat' : 'tri'}`
  return m
}

/**
 * 岩の質感：岩肌の模様（角ばった割れ目と段）の凹凸を、岩の形に沿って 3 方向から貼る。
 * 割れ目は暗く、出っ張りは明るく。上を向いた面のくぼみには砂がたまる（dust の色、境目はくっきり）。
 * 模様は岩そのものの座標で貼るので、岩を動かしても（採集で持ち上げても）模様がずれない。
 * 地面の岩・採集する岩・地形ラボの岩で共通。ほかの onBeforeCompile（空気・雲の影）より先に呼ぶ
 */
export function withRockDetail<T extends THREE.MeshStandardMaterial>(
  m: T,
  opts: { dust?: THREE.Color | null; dustOn?: { value: number }; tile?: number; strength?: number } = {},
): T {
  const uniforms = {
    uRockT: { value: detailTexture('rock') },
    uRockTile: { value: opts.tile ?? 0.9 },
    uRockK: { value: opts.strength ?? 1.4 },
    uRockDust: { value: opts.dust ?? new THREE.Color(0, 0, 0) },
    uRockDustOn: opts.dustOn ?? { value: opts.dust ? 1 : 0 },
  }
  const prev = m.onBeforeCompile
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer)
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRkP;\nvarying vec3 vRkN;\nvarying mat3 vRkM;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vRkP = position;
        vRkN = normal;
        #ifdef USE_INSTANCING
          vRkM = mat3(viewMatrix) * mat3(modelMatrix) * mat3(instanceMatrix);
        #else
          vRkM = mat3(viewMatrix) * mat3(modelMatrix);
        #endif`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uRockT; uniform float uRockTile; uniform float uRockK; uniform vec3 uRockDust; uniform float uRockDustOn;
        varying vec3 vRkP; varying vec3 vRkN; varying mat3 vRkM;
        vec3 gRkN; float gRkDust;
        ${TRIPLANAR_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 on = normalize(vRkN);
          vec4 a = labSample(uRockT, vRkP, on, uRockTile, uRockK, true);
          vec4 b = labSample(uRockT, vRkP * 2.7 + 1.3, on, uRockTile, uRockK * 0.6, true);
          float h = a.w * 0.65 + b.w * 0.35;
          vec3 objN = normalize(a.xyz + b.xyz * 0.5);
          gRkN = normalize(vRkM * objN);
          // 割れ目は暗く、出っ張りは明るく（細かい影の代わり）
          diffuseColor.rgb *= mix(0.55, 1.18, h);
          gRkDust = 0.0;
          if (uRockDustOn > 0.5) {
            float up = (vec4(gRkN, 0.0) * viewMatrix).y;
            gRkDust = smoothstep(-0.15, 0.15, smoothstep(0.45, 0.9, up) * 0.8 - h);
            diffuseColor.rgb = mix(diffuseColor.rgb, uRockDust, gRkDust * 0.45);
          }
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = normalize(mix(gRkN, normal, gRkDust * 0.6));
        #ifdef DOUBLE_SIDED
          normal *= faceDirection;
        #endif`,
      )
  }
  const key = m.customProgramCacheKey.bind(m)
  m.customProgramCacheKey = () => key() + '|rock-detail'
  return m
}
