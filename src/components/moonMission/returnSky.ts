import * as THREE from 'three'
import { SCATTER_CHUNK } from './earth'
import { OUT_CHUNK } from './shaderOut'

// 章9 の大気の中の空（components/moonMission/ReturnWorld.tsx）。
//
// 前は、空も海に映る空も、高さだけで決めた 2 色のぼかしだった（太陽の向きで変わらない、高さ 30 km でも灰色がかった青）。
// ここでは、宇宙から見た地球と同じ光の散乱の計算（earth.ts の SCATTER_CHUNK）で、カメラの高さと太陽の向きから空を求める。
// 計算は重いので、全方向の空を小さな絵（空の表：横 256 × 縦 128）に描いておき、空・海・映りこみがそれを引く。
// 高さか太陽の向きが少し変わったときだけ描きなおす。
//
// 表は 2 枚：目に入る散乱の光（inScatter）と、その向きの空気の透過（trans）。下向きは海面までの値なので、
// 海の色 × 透過 + 散乱の光 で、遠くの海がかすんで空にとける（本物の水平線と同じ理由で）。
// 座標：y が真上（カメラの真下が地球の中心）。

const LUT_W = 256
const LUT_H = 128

/** 向き → 表の位置。縦は地平線の近くを細かく（高さの角の平方根） */
export const SKY_LUT_GLSL = /* glsl */ `
  uniform sampler2D uSkyS;
  uniform sampler2D uSkyT;
  vec2 skyUv(vec3 d) {
    float u = atan(d.z, d.x) / 6.2831853 + 0.5;
    float e = asin(clamp(d.y, -1.0, 1.0)) / 1.5707963;
    float v = 0.5 + 0.5 * sign(e) * sqrt(abs(e));
    return vec2(u, clamp(v, 0.5 / ${LUT_H}.0, 1.0 - 0.5 / ${LUT_H}.0));
  }
  vec3 skyIn(vec3 d) { return texture2D(uSkyS, skyUv(d)).rgb; }
  vec3 skyTrans(vec3 d) { return texture2D(uSkyT, skyUv(d)).rgb; }
`

const lutVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const lutFrag = /* glsl */ `
  uniform vec3 uSun;
  uniform float uH;
  ${SCATTER_CHUNK}
  varying vec2 vUv;
  void main() {
    float phi = (vUv.x - 0.5) * 6.2831853;
    float s = vUv.y * 2.0 - 1.0;
    float e = sign(s) * s * s * 1.5707963;
    vec3 d = vec3(cos(e) * cos(phi), sin(e), cos(e) * sin(phi));
    vec3 ro = vec3(0.0, uR + uH, 0.0);
    // 海面（球）に当たる所まで。当たらなければ大気の外まで
    float b = dot(ro, d);
    float c = dot(ro, ro) - uR * uR;
    float disc = b * b - c;
    float tHit = disc > 0.0 && -b - sqrt(disc) > 0.0 ? -b - sqrt(disc) : 1e12;
    vec3 trans;
    vec3 inS = scatter(ro, d, tHit, uSun, trans);
    #ifdef SKY_TRANS
    gl_FragColor = vec4(trans, 1.0);
    #else
    gl_FragColor = vec4(inS, 1.0);
    #endif
  }
`

/** 空の表。update() で、高さ（m）と太陽の向き（y が真上）から描きなおす */
export class SkyLut {
  inScatter: THREE.WebGLRenderTarget
  trans: THREE.WebGLRenderTarget
  private matS: THREE.ShaderMaterial
  private matT: THREE.ShaderMaterial
  private quad: THREE.Mesh
  private scene = new THREE.Scene()
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private lastH = -1
  private lastSun = new THREE.Vector3()

  constructor(radius: number, steps: number) {
    const opt = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, generateMipmaps: false }
    this.inScatter = new THREE.WebGLRenderTarget(LUT_W, LUT_H, opt)
    this.trans = new THREE.WebGLRenderTarget(LUT_W, LUT_H, opt)
    // 横（向きの角）は一周つながる
    for (const t of [this.inScatter.texture, this.trans.texture]) t.wrapS = THREE.RepeatWrapping
    const make = (trans: boolean) =>
      new THREE.ShaderMaterial({
        vertexShader: lutVert,
        fragmentShader: lutFrag,
        defines: { SCATTER_N: steps, SCATTER_MS: '0.45', ...(trans ? { SKY_TRANS: '' } : {}) },
        uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) }, uH: { value: 0 }, uR: { value: radius }, uCenter: { value: new THREE.Vector3() } },
        depthTest: false,
        depthWrite: false,
      })
    this.matS = make(false)
    this.matT = make(true)
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.matS)
    this.quad.frustumCulled = false
    this.scene.add(this.quad)
  }

  /** 高さが 1% か 20 m、太陽が 0.3° 以上かわったら描きなおす。描きなおしたら true */
  update(gl: THREE.WebGLRenderer, h: number, sun: THREE.Vector3) {
    const hh = Math.max(0, h)
    if (this.lastH >= 0 && Math.abs(hh - this.lastH) < Math.max(20, this.lastH * 0.01) && this.lastSun.angleTo(sun) < 0.005) return false
    this.lastH = hh
    this.lastSun.copy(sun)
    const prev = gl.getRenderTarget()
    for (const [m, rt] of [
      [this.matS, this.inScatter],
      [this.matT, this.trans],
    ] as const) {
      m.uniforms.uH.value = hh
      m.uniforms.uSun.value.copy(sun).normalize()
      this.quad.material = m
      gl.setRenderTarget(rt)
      gl.render(this.scene, this.cam)
    }
    gl.setRenderTarget(prev)
    return true
  }

  /** 空・海の素材に、この表を渡す */
  bind(m: THREE.ShaderMaterial) {
    m.uniforms.uSkyS = { value: this.inScatter.texture }
    m.uniforms.uSkyT = { value: this.trans.texture }
  }

  dispose() {
    this.inScatter.dispose()
    this.trans.dispose()
    this.matS.dispose()
    this.matT.dispose()
    this.quad.geometry.dispose()
  }
}

// ---- 空のドーム（カメラを囲む） -----------------------------------------------------------------

const domeVert = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`

const domeFrag = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uSun;
  uniform float uAlpha;
  const float EXPO = 2.2;
  vec3 expose(vec3 L) { return pow(1.0 - exp(-EXPO * L), vec3(1.0 / 2.2)); }
  ${SKY_LUT_GLSL}
  varying vec3 vDir;
  void main() {
    #include <logdepthbuf_fragment>
    vec3 d = normalize(vDir);
    vec3 col = expose(skyIn(d));
    // 太陽：見かけの半径 0.267°。ふちが少し暗い（周辺減光）。空気を通った色で、画面の白より明るく（光のにじみが出る）
    float cs = dot(d, uSun);
    float r = acos(clamp(cs, -1.0, 1.0)) / 0.00466;
    if (r < 1.25) {
      float disc = 1.0 - smoothstep(0.85, 1.25, r);
      float limb = 0.55 + 0.45 * sqrt(max(0.0, 1.0 - min(r, 1.0) * min(r, 1.0)));
      col += skyTrans(d) * disc * limb * 6.0;
    }
    gl_FragColor = vec4(col * uAlpha, 1.0);
    ${OUT_CHUNK}
  }
`

/** 空のドーム。表（SkyLut）を bind してから使う。uAlpha で宇宙の黒へ（0 で黒） */
export function skyDomeMaterial(lut: SkyLut) {
  const m = new THREE.ShaderMaterial({
    vertexShader: domeVert,
    fragmentShader: domeFrag,
    uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) }, uAlpha: { value: 1 } },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  })
  lut.bind(m)
  return m
}

// ---- 太陽の光の色（JS）：船・雲・パラシュートを照らす平行光 -----------------------------------------

const B_R = [5.8e-6, 13.5e-6, 33.1e-6]
const B_O = [0.65e-6 * 2.5, 1.881e-6 * 2.5, 0.085e-6 * 2.5]
const B_M = 12e-6
const H_R = 8000
const H_M = 1200

function chapman(X: number, h: number, c: number) {
  const k = Math.sqrt(1.5708 * (X + h))
  if (c >= 0) return (k / (k * c + 1)) * Math.exp(-h)
  const x0 = Math.sqrt(Math.max(0, 1 - c * c)) * (X + h)
  const k0 = Math.sqrt(1.5708 * x0)
  return 2 * k0 * Math.exp(Math.min(X - x0, 60)) - (k / (1 - k * c)) * Math.exp(-h)
}

/** 高さ h（m）で、太陽の高さの sin が mu のとき、空気を通った日の光の割合（赤・緑・青）。シェーダーの sunTau と同じ式 */
export function sunTransmit(radius: number, h: number, mu: number, out: THREE.Color) {
  const hh = Math.max(0, h)
  const dR = H_R * chapman(radius / H_R, hh / H_R, mu)
  const dM = H_M * chapman(radius / H_M, hh / H_M, mu)
  return out.setRGB(
    Math.exp(-((B_R[0] + B_O[0]) * dR + B_M * 1.11 * dM)),
    Math.exp(-((B_R[1] + B_O[1]) * dR + B_M * 1.11 * dM)),
    Math.exp(-((B_R[2] + B_O[2]) * dR + B_M * 1.11 * dM)),
    THREE.LinearSRGBColorSpace,
  )
}
