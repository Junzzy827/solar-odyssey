import * as THREE from 'three'
import type { Terrain } from './terrain'

// 地形の影（谷の壁・山・クレーターのふちが落とす長い影）。本物の地形がある着陸地点で使う。
//
// 影の計算は、地面の各点から 32 の向きそれぞれに地形をたどって「その向きの地平線の高さ（角度）」を求め、
// 地図（地平線の地図）にしておく。この地図は着陸したときに 1 回だけ GPU で作る（1 フレームに 1 枚ずつ）。
// 描くときは、太陽の向きの前後 2 つの向きの地平線の角度を読んで、太陽がそれより低ければ影。
// 太陽が動いても作り直さないので、時間を早送りしても影はなめらかに動き、毎フレームの計算は 2 回読むだけで軽い。
//
// 地平線の地図は 2 枚：近く（6.4 km 四方、12.5 m 間隔：ローバーで走る範囲）と、遠く（100 km 四方：山並み）。
// 近くの地図の高さは地形そのもの（Terrain.height：作った丘や見どころも入る）、遠くの地図は観測された遠くの標高。
// 軽くする端末（画質「軽い」・メモリの少ない端末）では作らない。

/**
 * 空の光のうち、太陽のまわりの明るい光の輪から来るおよその割合。火星はほこりが光を前へ散らすので大きい
 * （火星の空は太陽のまわりがいちばん明るい。Pathfinder・Spirit の空の写真）
 */
export function aureoleFor(bodyId: string) {
  return bodyId === 'mars' ? 0.45 : bodyId === 'earth' ? 0.25 : bodyId === 'titan' ? 0.3 : 0
}

/** 向きの数（4 の倍数）。RGBA の 1 枚に 4 つの向き、地図を横 4 × 縦 2 枚並べる */
const AZ = 32
const COLS = 4
const ROWS = 2
/** 地平線の角度を 0〜1 に入れる範囲（ラジアン） */
const ANG_MIN = -0.25
const ANG_SPAN = 1.82

export type TerrainShadowUniforms = {
  uTsNear: { value: THREE.Texture | null }
  uTsFar: { value: THREE.Texture | null }
  /** x：近くの地図の半分の幅（m）、y：遠くの地図の半分の幅、z：影の強さ（0：影なし〜1）、w：太陽の見かけの半径（ラジアン） */
  uTsInfo: { value: THREE.Vector4 }
  /** 太陽の向き（世界の座標。y が上） */
  uTsSun: { value: THREE.Vector3 }
  /** 空の光のうち、太陽のまわりの光の輪から来る割合（空気のない天体は 0） */
  uTsAureole: { value: number }
}

/** 場面で 1 組（地面・岩・着陸船・ローバー・山並みの材質が共有する） */
export const terrainShadowUniforms: TerrainShadowUniforms = {
  uTsNear: { value: null },
  uTsFar: { value: null },
  uTsInfo: { value: new THREE.Vector4(3200, 50000, 0, 0.004) },
  uTsSun: { value: new THREE.Vector3(0, 1, 0) },
  uTsAureole: { value: 0 },
}

const lookupGlsl = /* glsl */ `
  uniform sampler2D uTsNear;
  uniform sampler2D uTsFar;
  uniform vec4 uTsInfo;
  uniform vec3 uTsSun;
  uniform float uTsAureole;
  /** 地平線の地図 atl の、向き a（0〜${AZ - 1}）の、地図の上の位置 uv（0〜1）の地平線の角度 */
  float tsAngle(sampler2D atl, vec2 uv, float a, float texel) {
    float tile = floor(a / 4.0);
    float ch = a - tile * 4.0;
    vec2 cell = vec2(mod(tile, ${COLS.toFixed(1)}), floor(tile / ${COLS.toFixed(1)}));
    // となりの地図の画素がにじまないように、ふちの半画素の内側だけを読む
    vec2 q = (cell + clamp(uv, vec2(0.5 * texel), vec2(1.0 - 0.5 * texel))) / vec2(${COLS.toFixed(1)}, ${ROWS.toFixed(1)});
    vec4 v = texture2D(atl, q);
    vec4 m = vec4(equal(vec4(ch), vec4(0.0, 1.0, 2.0, 3.0)));
    return dot(v, m) * ${ANG_SPAN.toFixed(3)} + ${ANG_MIN.toFixed(3)};
  }
  float tsHorizon(sampler2D atl, vec2 uv, float f, float texel) {
    float a0 = floor(f);
    float a1 = mod(a0 + 1.0, ${AZ.toFixed(1)});
    return mix(tsAngle(atl, uv, a0, texel), tsAngle(atl, uv, a1, texel), f - a0);
  }
  /** 地形の影。x：直射日光（1：日なた〜0：影）、y：太陽のまわりの明るい空（光の輪）が見える割合。p は世界の位置 */
  vec2 terrainShadow(vec3 p) {
    if (uTsInfo.z <= 0.0 || uTsSun.y < -0.05) return vec2(1.0);
    float m = max(abs(p.x), abs(p.z));
    if (m > uTsInfo.y) return vec2(1.0);
    float az = atan(uTsSun.z, uTsSun.x);
    float f = mod((az + PI) / (2.0 * PI) * ${AZ.toFixed(1)}, ${AZ.toFixed(1)});
    float el = asin(clamp(uTsSun.y, -1.0, 1.0));
    float kNear = 1.0 - smoothstep(uTsInfo.x - 400.0, uTsInfo.x - 60.0, m);
    float h = 0.0;
    // 遠くの地図は粗い（390 m 間隔）ので、影のふちを少しぼかす
    float pen = uTsInfo.w * mix(3.0, 1.0, kNear);
    if (kNear > 0.0) h = tsHorizon(uTsNear, p.xz / (2.0 * uTsInfo.x) + 0.5, f, 1.0 / ${(512).toFixed(1)});
    if (kNear < 1.0) h = mix(tsHorizon(uTsFar, p.xz / (2.0 * uTsInfo.y) + 0.5, f, 1.0 / ${(256).toFixed(1)}), h, kNear);
    float d = el - h;
    // 光の輪は太陽のまわり 10° ほどに広がっているので、壁に隠れるときもゆっくり
    return mix(vec2(1.0), vec2(smoothstep(-pen, pen, d), smoothstep(-0.12, 0.08, d)), uTsInfo.z);
  }
`

/**
 * 材質に地形の影を足す（直射日光だけを弱める。空の光はそのまま）。
 * withAir をかけた後で使う（世界の位置 vAirWorld を借りる。山並みでは縮める前の本当の位置）
 */
export function withTerrainShadow<M extends THREE.Material>(material: M, u: TerrainShadowUniforms = terrainShadowUniforms): M {
  const prev = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer)
    Object.assign(shader.uniforms, u)
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${lookupGlsl}`).replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
        {
          vec2 ts = terrainShadow(vAirWorld);
          reflectedLight.directDiffuse *= ts.x;
          reflectedLight.directSpecular *= ts.x;
          // ほこりの多い空では、空の明るさの多くが太陽のまわり（前へ散る光）から来る。壁がそこを隠すと、影の中は空の光も減る
          reflectedLight.indirectDiffuse *= 1.0 - uTsAureole * (1.0 - ts.y);
        }`,
    )
  }
  const key = material.customProgramCacheKey.bind(material)
  material.customProgramCacheKey = () => key() + '|tshadow'
  material.needsUpdate = true
  return material
}

// ---- 地平線の地図を作る ------------------------------------------------------------

const passVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

/** 1 枚（4 つの向き）を描く。画素ごとに、その向きへ地形をたどって、いちばん高く見える角度を求める */
const passFragment = /* glsl */ `
  precision highp float;
  uniform sampler2D uHNear;
  uniform sampler2D uHFar;
  uniform float uNearHalf;
  uniform float uFarHalf;
  /** 描く地図の半分の幅（m） */
  uniform float uHalf;
  /** 4 つの向き（ラジアン。x が東、z が南） */
  uniform vec4 uAz;
  /** たどり始めの距離・1 歩ごとの伸び（倍）・歩数 */
  uniform vec3 uMarch;
  /** 近くの地図を使うか（遠くの地平線の地図は、遠くの地図だけでたどる） */
  uniform float uUseNear;
  varying vec2 vUv;
  float heightAt(vec2 p) {
    if (uUseNear > 0.5 && max(abs(p.x), abs(p.y)) < uNearHalf) return texture2D(uHNear, p / (2.0 * uNearHalf) + 0.5).r;
    return texture2D(uHFar, p / (2.0 * uFarHalf) + 0.5).r;
  }
  float horizon(vec2 p0, float h0, float az) {
    vec2 d = vec2(cos(az), sin(az));
    float best = ${Math.tan(ANG_MIN).toFixed(4)};
    float t = uMarch.x;
    for (int i = 0; i < 64; i++) {
      if (float(i) >= uMarch.z) break;
      vec2 p = p0 + d * t;
      if (max(abs(p.x), abs(p.y)) > uFarHalf) break;
      best = max(best, (heightAt(p) - h0) / t);
      t *= uMarch.y;
    }
    return (atan(best) - ${ANG_MIN.toFixed(3)}) / ${ANG_SPAN.toFixed(3)};
  }
  void main() {
    // 地図の行 0 が北のふち（z が小さい側）。描く画像の下（vUv.y = 0）を北にそろえる
    vec2 p0 = (vUv - 0.5) * 2.0 * uHalf;
    // 自分の地面より少し上から見る（ならした地面の小さなでこぼこで影にならないように）
    float h0 = heightAt(p0) + 1.5;
    gl_FragColor = vec4(horizon(p0, h0, uAz.x), horizon(p0, h0, uAz.y), horizon(p0, h0, uAz.z), horizon(p0, h0, uAz.w));
  }
`

function halfTexture(data: Float32Array, size: number) {
  const half = new Uint16Array(size * size)
  for (let i = 0; i < half.length; i++) half[i] = THREE.DataUtils.toHalfFloat(data[i])
  const tex = new THREE.DataTexture(half, size, size, THREE.RedFormat, THREE.HalfFloatType)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}

type Pass = { target: THREE.WebGLRenderTarget; tile: number; useNear: boolean; half: number; march: THREE.Vector3; size: number }

/**
 * 地形の影の地図を作って持つ。step() を毎フレーム呼ぶと、高さを読む → 地平線の地図を 1 枚ずつ描く、と少しずつ進む。
 * 出来上がったら ready が true
 */
export class TerrainShadowMaps {
  readonly near: THREE.WebGLRenderTarget
  readonly far: THREE.WebGLRenderTarget
  ready = false
  private hNear: Float32Array
  private row = 0
  private texNear: THREE.DataTexture | null = null
  private texFar: THREE.DataTexture
  private passes: Pass[] = []
  private mat: THREE.ShaderMaterial
  private quad: THREE.Mesh
  private scene = new THREE.Scene()
  private cam = new THREE.Camera()
  private disposed = false

  constructor(
    private terrain: Terrain,
    readonly nearSize = 512,
    readonly farSize = 256,
  ) {
    const dem = terrain.dem!
    const nearHalf = dem.near.extent / 2
    const farHalf = dem.far.extent / 2
    this.hNear = new Float32Array(nearSize * nearSize)
    // 遠くの地図：観測された標高から、星の丸み（遠くほど下がる）を引く
    const R = terrain.radiusM
    const fs = dem.far.size
    const hf = new Float32Array(fs * fs)
    for (let j = 0; j < fs; j++)
      for (let i = 0; i < fs; i++) {
        const x = ((i + 0.5) / fs - 0.5) * dem.far.extent
        const z = ((j + 0.5) / fs - 0.5) * dem.far.extent
        hf[j * fs + i] = dem.far.data[j * fs + i] - (x * x + z * z) / (2 * R)
      }
    this.texFar = halfTexture(hf, fs)
    const rt = (size: number) =>
      new THREE.WebGLRenderTarget(size * COLS, size * ROWS, {
        type: THREE.UnsignedByteType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
        generateMipmaps: false,
      })
    this.near = rt(nearSize)
    this.far = rt(farSize)
    this.mat = new THREE.ShaderMaterial({
      vertexShader: passVertex,
      fragmentShader: passFragment,
      uniforms: {
        uHNear: { value: null },
        uHFar: { value: this.texFar },
        uNearHalf: { value: nearHalf },
        uFarHalf: { value: farHalf },
        uHalf: { value: nearHalf },
        uAz: { value: new THREE.Vector4() },
        uMarch: { value: new THREE.Vector3() },
        uUseNear: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat)
    this.quad.frustumCulled = false
    this.scene.add(this.quad)
    const reach = Math.min(48000, farHalf * 0.98)
    // 近く：20 m から 64 歩で 48 km まで（遠くほど歩幅を広く）。遠く：400 m から 40 歩
    const nearMarch = new THREE.Vector3(20, (reach / 20) ** (1 / 63), 64)
    const farMarch = new THREE.Vector3(400, (reach / 400) ** (1 / 39), 40)
    for (let t = 0; t < AZ / 4; t++) this.passes.push({ target: this.near, tile: t, useNear: true, half: nearHalf, march: nearMarch, size: nearSize })
    for (let t = 0; t < AZ / 4; t++) this.passes.push({ target: this.far, tile: t, useNear: false, half: farHalf, march: farMarch, size: farSize })
  }

  /** 少しずつ作る。終わったら true */
  step(gl: THREE.WebGLRenderer): boolean {
    if (this.ready || this.disposed) return this.ready
    const n = this.nearSize
    if (this.row < n) {
      // 近くの地図の高さを、地形そのものから読む（1 フレームに 32 行。512 行で 16 フレーム）
      const ext = this.terrain.dem!.near.extent
      const end = Math.min(n, this.row + 32)
      for (let j = this.row; j < end; j++) {
        const z = ((j + 0.5) / n - 0.5) * ext
        for (let i = 0; i < n; i++) this.hNear[j * n + i] = this.terrain.height(((i + 0.5) / n - 0.5) * ext, z)
      }
      this.row = end
      if (this.row >= n) {
        this.texNear = halfTexture(this.hNear, n)
        this.mat.uniforms.uHNear.value = this.texNear
      }
      return false
    }
    const p = this.passes.shift()
    if (!p) return false
    const u = this.mat.uniforms
    u.uHalf.value = p.half
    u.uUseNear.value = p.useNear ? 1 : 0
    u.uMarch.value.copy(p.march)
    const a = (k: number) => ((p.tile * 4 + k) / AZ) * Math.PI * 2 - Math.PI
    u.uAz.value.set(a(0), a(1), a(2), a(3))
    const col = p.tile % COLS
    const row = Math.floor(p.tile / COLS)
    const prevTarget = gl.getRenderTarget()
    const prevAuto = gl.autoClear
    gl.autoClear = false
    p.target.viewport.set(col * p.size, row * p.size, p.size, p.size)
    p.target.scissor.set(col * p.size, row * p.size, p.size, p.size)
    p.target.scissorTest = true
    gl.setRenderTarget(p.target)
    gl.render(this.scene, this.cam)
    gl.setRenderTarget(prevTarget)
    gl.autoClear = prevAuto
    if (!this.passes.length) {
      this.ready = true
      // 高さの地図は、もう使わない
      this.texNear?.dispose()
      this.texFar.dispose()
      this.texNear = null
      this.hNear = new Float32Array(0)
    }
    return this.ready
  }

  dispose() {
    this.disposed = true
    this.near.dispose()
    this.far.dispose()
    this.texNear?.dispose()
    this.texFar.dispose()
    this.mat.dispose()
    this.quad.geometry.dispose()
  }
}
