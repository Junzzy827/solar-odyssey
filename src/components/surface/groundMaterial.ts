import * as THREE from 'three'
import type { SurfaceDef } from '../../data/surfaces'

// 地面の素材：砂・レゴリス（月の砂）・氷・火山岩。それぞれの細かい凹凸（法線）とざらつき（粗さ）を、
// その場で作る絵（つなぎ目の無い繰り返し模様）から描く。
// 近くは細かい模様、遠くは大きな模様に切り替えて、同じ模様の繰り返しが目立たないようにする。
// 斜面は岩肌（ごつごつした角ばった凹凸と、岩の色）に変える。どの天体も同じ仕組みで、違いは素材の種類と色だけ。

export type SurfaceKind = 'sand' | 'regolith' | 'ice' | 'volcanic'

const KIND: Record<string, SurfaceKind> = {
  mars: 'sand', titan: 'sand',
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
    // 斜面の傾き（1 - 法線の上向き成分）で岩肌に変わる範囲
    uSlope: { value: new THREE.Vector2(0.16, 0.34) },
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
        vec4 gNear; vec4 gFar; vec4 gRock; float gFarK; float gRockK;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 wuv = vGWorld.xz;
          float dist = length(vGWorld - cameraPosition);
          gNear = texture2D(uDetail, wuv / uTile.x);
          gFar = texture2D(uDetail, wuv / uTile.y + 0.37);
          gRock = texture2D(uRockDetail, wuv / uTile.z);
          gFarK = smoothstep(5.0, 30.0, dist);
          float slope = 1.0 - clamp(normalize(vGNormal).y, 0.0, 1.0);
          // 斜面の岩肌は、模様で境目をぎざぎざに
          gRockK = smoothstep(uSlope.x, uSlope.y, slope + (gFar.a - 0.5) * 0.12);
          float hgt = mix(gNear.a, gFar.a, gFarK);
          // くぼみは少し暗く、出っ張りは少し明るく（細かい影の代わり）
          diffuseColor.rgb *= mix(0.82, 1.12, hgt);
          vec3 rockCol = uRockColor * mix(0.7, 1.15, gRock.a);
          diffuseColor.rgb = mix(diffuseColor.rgb, rockCol, gRockK * 0.85);
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(mix(uRough.x, uRough.y, gRockK) + (0.5 - mix(gNear.a, gFar.a, gFarK)) * 0.12, 0.05, 1.0);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          float dist = length(vGWorld - cameraPosition);
          vec3 tn = mix(gNear.xyz, gFar.xyz, gFarK) * 2.0 - 1.0;
          tn.xy *= uNormalK.x * (1.0 - 0.6 * smoothstep(40.0, 220.0, dist));
          vec3 rn = gRock.xyz * 2.0 - 1.0;
          rn.xy *= uNormalK.y;
          tn = normalize(mix(normalize(tn), normalize(rn), gRockK));
          // 地面は上から見た座標（x, z）で模様を貼っているので、その向きで世界の法線に直す
          vec3 N = normalize(vGNormal);
          vec3 T = normalize(vec3(1.0, 0.0, 0.0) - N * N.x);
          vec3 B = normalize(cross(T, N));
          vec3 wn = normalize(T * tn.x + B * tn.y + N * tn.z);
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }`,
      )
  }
  m.customProgramCacheKey = () => `ground-${kind}`
  return m
}
