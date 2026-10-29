import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// 小惑星の形：細長くゆがんだ塊に、大きなクレーターをいくつか彫る。
// 細かいクレーターと砂の凹凸は、描くときにシェーダーで足す（asteroidMaterial）

function hash(x: number, y: number, z: number) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  return h - Math.floor(h)
}

function noise(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  const fx = x - ix, fy = y - iy, fz = z - iz
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz)
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const c = (dx: number, dy: number, dz: number) => hash(ix + dx, iy + dy, iz + dz)
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  )
}

function fbm(p: THREE.Vector3, octaves: number) {
  let v = 0, a = 0.5, f = 1
  for (let i = 0; i < octaves; i++) {
    v += a * noise(p.x * f, p.y * f, p.z * f)
    f *= 2.03
    a *= 0.5
  }
  return v
}

/** 大きなクレーターの断面：くぼみと、盛り上がった縁 */
function craterProfile(t: number) {
  const bowl = t < 1 ? t * t - 1 : 0
  const rim = Math.exp(-(((t - 1) * 4) ** 2)) * 0.3
  return bowl + rim
}

export function asteroidGeometry(rand: () => number, detail: number) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, detail))
  const pos = g.attributes.position
  const v = new THREE.Vector3()
  const d = new THREE.Vector3()
  const offset = new THREE.Vector3(rand() * 50, rand() * 50, rand() * 50)
  // 細長さ（多くの小惑星はジャガイモ形）
  const stretch = new THREE.Vector3(1 + rand() * 0.7, 0.65 + rand() * 0.3, 0.75 + rand() * 0.3)
  const craters = Array.from({ length: 3 + Math.floor(rand() * 5) }, () => ({
    dir: new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize(),
    size: 0.2 + rand() * 0.45,
  }))
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize()
    // 大きなでこぼこ（低い周波数）と中くらいのこぶ
    let r = 0.78 + 0.45 * (fbm(v.copy(d).multiplyScalar(1.3).add(offset), 3) - 0.5) * 2 * 0.5
    r += 0.12 * (fbm(v.copy(d).multiplyScalar(4).add(offset), 2) - 0.5)
    for (const c of craters) {
      const angle = Math.acos(THREE.MathUtils.clamp(d.dot(c.dir), -1, 1))
      const t = angle / c.size
      if (t < 1.6) r += craterProfile(t) * c.size * 0.22
    }
    v.copy(d).multiplyScalar(r).multiply(stretch)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

/**
 * 岩の質感：細かいクレーターと砂の凹凸を、岩の座標の上で作る（拡大しても崩れない）。
 * 光は MeshStandardMaterial のまま使い、法線だけをずらす。
 */
export function asteroidMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, metalness: 0 })
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vObj;
        varying float vRockScale;
        varying float vRockSeed;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vObj = position;
        vRockScale = length(instanceMatrix[0].xyz);
        vRockSeed = float(gl_InstanceID);`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vObj;
        varying float vRockScale;
        varying float vRockSeed;
        float rhash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        vec3 rhash3(vec3 p) { return vec3(rhash(p), rhash(p + 19.19), rhash(p + 47.77)); }
        float rnoise(vec3 x) {
          vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(rhash(i), rhash(i + vec3(1,0,0)), f.x), mix(rhash(i + vec3(0,1,0)), rhash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(rhash(i + vec3(0,0,1)), rhash(i + vec3(1,0,1)), f.x), mix(rhash(i + vec3(0,1,1)), rhash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float rfbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * rnoise(p); p = p * 2.07 + 3.1; a *= 0.5; } return v; }
        float rcraters(vec3 p) {
          vec3 i = floor(p); vec3 f = fract(p); float h = 0.0;
          for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec3 o = vec3(float(x), float(y), float(z));
            vec3 r = rhash3(i + o);
            if (r.z < 0.5) continue;
            float rad = 0.2 + 0.3 * fract(r.x * 7.1);
            float t = length(f - o - r) / rad;
            if (t > 1.6) continue;
            h += ((t < 1.0 ? t * t - 1.0 : 0.0) + exp(-pow((t - 1.0) * 5.0, 2.0)) * 0.35) * rad;
          }
          return h;
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 q = vObj + vRockSeed * 1.37;
          // 画面上で細かすぎる模様は消す（ちらつき防止）
          float px = length(fwidth(q));
          float w1 = 1.0 - smoothstep(0.12, 0.3, px * 3.2);
          float w2 = 1.0 - smoothstep(0.12, 0.3, px * 9.0);
          float w3 = 1.0 - smoothstep(0.12, 0.3, px * 22.0);
          float h = rcraters(q * 3.2) * 0.5 * w1 + (w2 > 0.0 ? rcraters(q * 9.0) * 0.18 * w2 : 0.0) + (rfbm(q * 22.0) - 0.5) * 0.12 * w3;
          vec3 p = -vViewPosition;
          vec3 dpdx = dFdx(p); vec3 dpdy = dFdy(p);
          float dhdx = dFdx(h); float dhdy = dFdy(h);
          vec3 r1 = cross(dpdy, normal); vec3 r2 = cross(normal, dpdx);
          float det = dot(dpdx, r1);
          vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
          vec3 bumped = normalize(abs(det) * normal - vRockScale * 0.35 * grad);
          // 太陽（原点）と反対を向いた面では凹凸を消す（影の側に明るい点が出ないように）
          vec3 sunView = (viewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float facing = dot(normal, normalize(sunView - p));
          normal = normalize(mix(normal, bumped, smoothstep(-0.05, 0.2, facing)));
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // 明るさのむら（砂がたまったところは明るく、岩肌は暗い）
          vec3 q = vObj + vRockSeed * 1.37;
          diffuseColor.rgb *= 0.78 + 0.4 * rfbm(q * 2.5) + 0.12 * (rnoise(q * 30.0) - 0.5);
        }`,
      )
  }
  return material
}
