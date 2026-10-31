import * as THREE from 'three'
import { haloTexture } from '../ship/ShipModel'

// 着陸の瞬間の演出：降り方（接地の速さ）、脚のサスペンション、腹の噴射（噴流と地面を照らす光）、舞い上がる砂ぼこり。

// ---- 降り方とサスペンション ---------------------------------------------------------------

/** 接地する時刻（降下の何割のところで）と、接地の速さ（m/s） */
export const TOUCHDOWN = 0.8
const TOUCH_SPEED = 1.4

/** 降下を始めてから T 秒のときの高さ（m）。最後はゆっくり、でも 0 ではない速さで脚が着く */
export function descentAltitude(T: number, descent: number, from: number) {
  const td = descent * TOUCHDOWN
  if (T >= td) return 0
  const s = T / td
  return from * (1 - s) ** 2.6 + TOUCH_SPEED * (td - T)
}

/** 降下中のエンジンの強さ（0〜1）：接地の少し後に止める */
export function descentThrust(T: number, descent: number) {
  const td = descent * TOUCHDOWN
  if (T < td) return 0.55 + 0.45 * Math.min(1, T / td) ** 2
  return Math.max(0, 1 - (T - td) / 0.35)
}

/**
 * 脚の縮み（m）：接地の勢いで沈み込み、ばねのように戻って、船の重さの分だけ縮んだところで落ち着く。
 * t は接地してからの秒。重力が弱いほど、ゆっくり・浅く
 */
export function suspension(t: number, gravity: number) {
  if (t <= 0) return 0
  const g = Math.max(0.05, gravity)
  const w = 2 * Math.PI * (0.9 + 0.5 * Math.sqrt(g / 0.38)) // 固有の速さ
  const z = 0.42 // 減衰
  const wd = w * Math.sqrt(1 - z * z)
  const decay = Math.exp(-z * w * t)
  const settle = 0.16 * Math.min(1.4, Math.sqrt(g / 0.38))
  // 重さで縮む分（ステップ応答）＋接地の勢い（初速の応答）
  const step = settle * (1 - decay * (Math.cos(wd * t) + (z / Math.sqrt(1 - z * z)) * Math.sin(wd * t)))
  const impact = ((TOUCH_SPEED * 1.6) / wd) * decay * Math.sin(wd * t)
  return Math.max(0, step + impact)
}

// ---- 噴射 ---------------------------------------------------------------------------------

const plumeVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const plumeFragment = /* glsl */ `
  uniform float uPower;
  uniform float uTime;
  uniform vec3 uCore;
  uniform vec3 uOuter;
  varying vec2 vUv;
  void main() {
    // vUv.y：0 が噴射口、1 が先。vUv.x：まわり（0〜1）
    float y = 1.0 - vUv.y; // 円柱の uv は上が 1 なので、噴射口（上）を 0 にする
    float edge = abs(fract(vUv.x * 2.0) - 0.5) * 2.0; // 縁ほど 1（筒を真横から見ると縁が薄い）
    float body = pow(1.0 - y, 1.6) * (1.0 - 0.75 * edge * edge);
    // 噴流の脈動（衝撃波のふし：ショックダイヤモンド）
    float diamonds = 0.75 + 0.25 * sin(y * 34.0 - uTime * 50.0);
    float flicker = 0.85 + 0.15 * sin(uTime * 63.0 + vUv.x * 40.0);
    vec3 col = mix(uOuter, uCore, pow(1.0 - y, 4.0));
    float a = body * diamonds * flicker * uPower;
    gl_FragColor = vec4(col * a, 1.0);
  }
`

/** 噴射口 1 つ分の噴流（先が広がる、開いた円すい）。噴射口が原点、-Y へ伸びる。長さ 1 */
export function plumeGeometry() {
  // 噴射口（上）で細く、先（下）ほど広がる
  const g = new THREE.CylinderGeometry(0.35, 1, 1, 16, 1, true)
  g.translate(0, -0.5, 0)
  return g
}

export function plumeMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: plumeVertex,
    fragmentShader: plumeFragment,
    uniforms: {
      uPower: { value: 0 },
      uTime: { value: 0 },
      // 推進剤（メタンと酸素）の炎：芯は白っぽい青、外は淡い青
      uCore: { value: new THREE.Color(2.4, 2.6, 3.2) },
      uOuter: { value: new THREE.Color(0.25, 0.45, 1.3) },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
}

// 地面に当たった噴流の、平たく広がる光
const splashFragment = /* glsl */ `
  uniform float uPower;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float a = pow(max(0.0, 1.0 - r), 2.2) * uPower;
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`
export function splashMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: plumeVertex,
    fragmentShader: splashFragment,
    uniforms: { uPower: { value: 0 }, uColor: { value: new THREE.Color(0.9, 1.1, 1.8) } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  })
}

// ---- 噴射のガス（粒子） ----------------------------------------------------------------------
// 噴射口から「プシュー」と吹き出す高温のガス。細かい光る粒を高速で撃ち出し、広がりながら薄れる。
// 地面に当たったガスは、地面に沿って外へ流れる。大気の無い星では、ガスはすぐ横へ大きく広がる。

const exhaustVertex = /* glsl */ `
  attribute float aAlpha;
  attribute float aSize;
  attribute float aHeat;
  uniform float uScale;
  varying float vAlpha;
  varying float vHeat;
  void main() {
    vAlpha = aAlpha;
    vHeat = aHeat;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = min(aSize * uScale / max(-mv.z, 0.5), 256.0);
    gl_Position = projectionMatrix * mv;
    if (vAlpha < 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`
const exhaustFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uHot;
  uniform vec3 uCool;
  varying float vAlpha;
  varying float vHeat;
  void main() {
    float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
    if (a < 0.002) discard;
    // 噴射口の近くは白っぽく熱く、離れると淡い青に
    gl_FragColor = vec4(mix(uCool, uHot, vHeat) * a, 1.0);
  }
`

export class Exhaust {
  readonly points: THREE.Points
  readonly material: THREE.ShaderMaterial
  private geo = new THREE.BufferGeometry()
  private pos: Float32Array
  private vel: Float32Array
  private alpha: Float32Array
  private size: Float32Array
  private heat: Float32Array
  private age: Float32Array
  private life: Float32Array
  private next = 0

  constructor(
    readonly count: number,
    /** 大気がある（ガスがまっすぐ伸びる）か、真空（すぐ横へ広がる）か */
    private hasAir: boolean,
  ) {
    this.pos = new Float32Array(count * 3)
    this.vel = new Float32Array(count * 3)
    this.alpha = new Float32Array(count)
    this.size = new Float32Array(count)
    this.heat = new Float32Array(count)
    this.age = new Float32Array(count).fill(99)
    this.life = new Float32Array(count).fill(1)
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1))
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1))
    this.geo.setAttribute('aHeat', new THREE.BufferAttribute(this.heat, 1))
    this.material = new THREE.ShaderMaterial({
      vertexShader: exhaustVertex,
      fragmentShader: exhaustFragment,
      uniforms: {
        uMap: { value: haloTexture() },
        uScale: { value: 500 },
        uHot: { value: new THREE.Color(2.2, 2.3, 2.8) },
        uCool: { value: new THREE.Color(0.35, 0.55, 1.4) },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
    this.points = new THREE.Points(this.geo, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 3
  }

  /** 噴射口 (x, y, z) から真下へ、強さ k（0〜1）で吹き出す */
  emit(dt: number, x: number, y: number, z: number, k: number, rate: number) {
    const n = Math.min(this.count / 8, Math.floor(dt * rate * k + Math.random()))
    const spread = this.hasAir ? 0.13 : 0.32
    for (let i = 0; i < n; i++) {
      const j = this.next++ % this.count
      const sp = (38 + Math.random() * 22) * (0.6 + 0.4 * k)
      // 噴射口の円の中から、少しずつ違う向きへ
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * 0.35
      const sx = (Math.random() - 0.5 + (Math.random() - 0.5)) * spread
      const sz = (Math.random() - 0.5 + (Math.random() - 0.5)) * spread
      // 1 フレームの中で出した時刻をばらして、すじにならないように
      const t0 = Math.random() * dt
      this.pos[j * 3] = x + Math.cos(a) * r + sx * sp * t0
      this.pos[j * 3 + 1] = y - sp * t0
      this.pos[j * 3 + 2] = z + Math.sin(a) * r + sz * sp * t0
      this.vel[j * 3] = sx * sp
      this.vel[j * 3 + 1] = -sp
      this.vel[j * 3 + 2] = sz * sp
      this.age[j] = t0
      this.life[j] = (this.hasAir ? 0.45 : 0.25) + Math.random() * 0.3
      this.size[j] = 0.35 + Math.random() * 0.3
    }
  }

  update(dt: number, groundY: number, power: number) {
    for (let j = 0; j < this.count; j++) {
      if (this.age[j] >= this.life[j]) {
        this.alpha[j] = 0
        continue
      }
      this.age[j] += dt
      const u = Math.min(1, this.age[j] / this.life[j])
      const i = j * 3
      this.pos[i] += this.vel[i] * dt
      this.pos[i + 1] += this.vel[i + 1] * dt
      this.pos[i + 2] += this.vel[i + 2] * dt
      // 地面に当たったら、地面に沿って外へ流れる
      if (this.pos[i + 1] < groundY + 0.25 && this.vel[i + 1] < 0) {
        const down = -this.vel[i + 1]
        let hx = this.vel[i]
        let hz = this.vel[i + 2]
        const hl = Math.hypot(hx, hz) || 1
        if (hl < 1e-3) {
          const a = Math.random() * Math.PI * 2
          hx = Math.cos(a)
          hz = Math.sin(a)
        }
        const out = down * 0.55
        this.vel[i] = (hx / hl) * out + hx * 0.3
        this.vel[i + 2] = (hz / hl) * out + hz * 0.3
        this.vel[i + 1] = down * 0.04
        this.pos[i + 1] = groundY + 0.25
      }
      // 空気があると速さが落ちる（真空ではそのまま飛び去る）
      if (this.hasAir) {
        const f = Math.exp(-dt * 2.2)
        this.vel[i] *= f
        this.vel[i + 1] *= f
        this.vel[i + 2] *= f
      }
      // 広がりながら薄くなる
      this.size[j] += dt * (this.hasAir ? 9 : 14)
      this.heat[j] = (1 - u) ** 3
      this.alpha[j] = Math.min(1, this.age[j] / 0.03) * (1 - u) ** 1.6 * 0.16 * power
    }
    this.geo.attributes.position.needsUpdate = true
    this.geo.attributes.aAlpha.needsUpdate = true
    this.geo.attributes.aSize.needsUpdate = true
    this.geo.attributes.aHeat.needsUpdate = true
  }

  dispose() {
    this.geo.dispose()
    this.material.dispose()
  }
}

// ---- 砂ぼこり -----------------------------------------------------------------------------

/** もくもくした煙のかたまりの模様（4 種類を 2×2 に並べた 1 枚の絵）。ゆらいだ雲の形を、何層かの揺らぎで作る */
let puffTex: THREE.Texture | null = null
export function puffTexture() {
  if (puffTex) return puffTex
  const N = 256
  const H = N / 2
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = N
  const g = canvas.getContext('2d')!
  const img = g.createImageData(N, N)
  // 簡単な値ノイズ（格子の乱数をなめらかにつなぐ）
  const rnd = (x: number, y: number, s: number) => {
    const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453
    return v - Math.floor(v)
  }
  const noise = (x: number, y: number, s: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const u = xf * xf * (3 - 2 * xf)
    const v = yf * yf * (3 - 2 * yf)
    const a = rnd(xi, yi, s)
    const b = rnd(xi + 1, yi, s)
    const c = rnd(xi, yi + 1, s)
    const d = rnd(xi + 1, yi + 1, s)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
  for (let q = 0; q < 4; q++) {
    const ox = (q % 2) * H
    const oy = Math.floor(q / 2) * H
    for (let y = 0; y < H; y++)
      for (let x = 0; x < H; x++) {
        const px = (x / H) * 2 - 1
        const py = (y / H) * 2 - 1
        let n = 0
        let amp = 0.5
        let f = 3
        for (let o = 0; o < 5; o++) {
          n += amp * noise(px * f + 10 * q, py * f - 7 * q, q + o)
          amp *= 0.5
          f *= 2.1
        }
        // 丸い形に、ふちを揺らぎで食い込ませる
        const r = Math.hypot(px, py)
        const edge = 1 - r * (1.05 + (0.5 - n) * 0.9)
        const a = Math.max(0, Math.min(1, edge * 2.2)) * (0.55 + 0.6 * n)
        const i = ((oy + y) * N + ox + x) * 4
        // 色の濃さ（rgb）に、もう一度別の揺らぎを入れて、かたまりの中のむらにする
        const shade = 0.75 + 0.5 * noise(px * 5 + 3, py * 5 - 2, q + 9)
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, shade * 200)
        img.data[i + 3] = Math.round(Math.min(1, a) * 255)
      }
  }
  g.putImageData(img, 0, 0)
  puffTex = new THREE.CanvasTexture(canvas)
  puffTex.colorSpace = THREE.NoColorSpace
  return puffTex
}

const dustVertex = /* glsl */ `
  attribute float aAlpha;
  attribute float aSize;
  attribute float aRot;
  attribute float aVar;
  uniform float uScale;
  varying float vAlpha;
  varying float vRot;
  varying float vVar;
  void main() {
    vAlpha = aAlpha;
    vRot = aRot;
    vVar = aVar;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float px = aSize * uScale / max(-mv.z, 0.5);
    // カメラにかぶさるほど近いかたまりは薄く（画面いっぱいの灰色にしない）
    // （大きな点は描く画素が多くて重いので、上限も設ける）
    vAlpha *= 1.0 - smoothstep(220.0, 420.0, px);
    gl_PointSize = min(px, 420.0);
    gl_Position = projectionMatrix * mv;
    // 見えない点は描かない（画面の外へ）
    if (vAlpha < 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`
const dustFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform vec3 uShadow;
  uniform vec3 uSunView;
  varying float vAlpha;
  varying float vRot;
  varying float vVar;
  void main() {
    // 点の中の座標を回して、4 種類の模様の 1 つを引く
    vec2 p = gl_PointCoord - 0.5;
    float c = cos(vRot), s = sin(vRot);
    vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
    if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) discard;
    float k = floor(vVar * 4.0);
    vec2 cell = vec2(mod(k, 2.0), floor(k / 2.0)) * 0.5;
    vec4 t = texture2D(uMap, cell + q * 0.5);
    float a = t.a * vAlpha;
    if (a < 0.004) discard;
    // かたまりを丸いものとみなして、太陽の側を明るく、反対側を影に
    vec2 d = (gl_PointCoord - 0.5) * 2.0;
    d.y = -d.y;
    vec3 n = normalize(vec3(d, sqrt(max(0.0, 1.0 - dot(d, d)))));
    float lit = clamp(dot(n, uSunView) * 0.6 + 0.5, 0.0, 1.0);
    vec3 col = mix(uShadow, uColor, lit) * t.r;
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** 天体ごとの風（m/s、x と z）。大気の無い星は無風 */
export function windFor(id: string, hasAir: boolean): THREE.Vector3 {
  if (!hasAir) return new THREE.Vector3()
  const w: Record<string, [number, number]> = { mars: [2.4, 0.9], earth: [1.6, 0.5], titan: [0.5, 0.2], venus: [0.4, 0.1] }
  const v = w[id] ?? [0.6, 0.2]
  return new THREE.Vector3(v[0], 0, v[1])
}

/**
 * 砂ぼこりの雲。噴流が地面を叩くと、砂が輪のように外へ押し出され、勢いが落ちるにつれて巻き上がり、
 * 風に流されて漂う（火星は長く残る）。大気の無い星では雲にならない：細かい砂が平たい膜のように
 * 地面すれすれをまっすぐ飛び、すぐに消える（アポロの着陸の映像と同じ）。
 */
export class Dust {
  readonly points: THREE.Points
  readonly material: THREE.ShaderMaterial
  private geo = new THREE.BufferGeometry()
  private pos: Float32Array
  private alpha: Float32Array
  private size: Float32Array
  private rot: Float32Array
  private spin: Float32Array
  private vari: Float32Array
  private vel: Float32Array
  private age: Float32Array
  private life: Float32Array
  private grow: Float32Array
  private next = 0
  private hasAir: boolean

  constructor(
    readonly count: number,
    color: THREE.Color,
    /** 空気の抵抗（大気が無ければ 0） */
    private drag: number,
    private gravity: number,
    private wind: THREE.Vector3,
  ) {
    this.hasAir = drag > 0
    this.pos = new Float32Array(count * 3)
    this.alpha = new Float32Array(count)
    this.size = new Float32Array(count)
    this.rot = new Float32Array(count)
    this.spin = new Float32Array(count)
    this.vari = new Float32Array(count)
    this.vel = new Float32Array(count * 3)
    this.age = new Float32Array(count).fill(99)
    this.life = new Float32Array(count).fill(1)
    this.grow = new Float32Array(count)
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1))
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1))
    this.geo.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1))
    this.geo.setAttribute('aVar', new THREE.BufferAttribute(this.vari, 1))
    this.material = new THREE.ShaderMaterial({
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      uniforms: {
        uMap: { value: puffTexture() },
        uColor: { value: color.clone() },
        uShadow: { value: color.clone().multiplyScalar(0.35) },
        uSunView: { value: new THREE.Vector3(0, 1, 0) },
        uScale: { value: 500 },
      },
      transparent: true,
      depthWrite: false,
    })
    this.points = new THREE.Points(this.geo, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 2
  }

  /** 着陸船の真下 (cx, gy, cz) から、強さ k（0〜1）で吹き出す */
  emit(dt: number, cx: number, gy: number, cz: number, k: number, rate: number) {
    const n = Math.min(this.count / 6, Math.floor(dt * rate * k + Math.random()))
    for (let i = 0; i < n; i++) {
      const j = this.next++ % this.count
      const a = Math.random() * Math.PI * 2
      const r = 2 + Math.random() * 4
      this.pos[j * 3] = cx + Math.cos(a) * r
      this.pos[j * 3 + 2] = cz + Math.sin(a) * r
      this.age[j] = 0
      this.rot[j] = Math.random() * Math.PI * 2
      this.vari[j] = Math.random() * 0.999
      if (this.hasAir) {
        // 地面を這うように外へ。上向きの勢いは、外への勢いが落ちてから付く（update で）
        const sp = (9 + Math.random() * 10) * (0.5 + 0.5 * k)
        this.pos[j * 3 + 1] = gy + 0.3 + Math.random() * 0.8
        this.vel[j * 3] = Math.cos(a) * sp
        this.vel[j * 3 + 1] = 0.3 + Math.random() * 1.2
        this.vel[j * 3 + 2] = Math.sin(a) * sp
        this.life[j] = 5 + Math.random() * 7
        this.size[j] = 1.2 + Math.random() * 1.6
        this.grow[j] = 0.9 + Math.random() * 0.9
        this.spin[j] = (Math.random() - 0.5) * 0.6
      } else {
        // 真空：浅い角度で速く、まっすぐ飛ぶ薄い膜
        const sp = (16 + Math.random() * 22) * (0.5 + 0.5 * k)
        this.pos[j * 3 + 1] = gy + 0.1 + Math.random() * 0.3
        this.vel[j * 3] = Math.cos(a) * sp
        this.vel[j * 3 + 1] = sp * (0.03 + Math.random() * 0.07)
        this.vel[j * 3 + 2] = Math.sin(a) * sp
        this.life[j] = 0.7 + Math.random() * 0.8
        this.size[j] = 0.8 + Math.random() * 1.2
        this.grow[j] = 2.5
        this.spin[j] = (Math.random() - 0.5) * 0.3
      }
    }
  }

  update(dt: number, groundY: number) {
    let alive = 0
    const w = this.wind
    for (let j = 0; j < this.count; j++) {
      if (this.age[j] >= this.life[j]) {
        this.alpha[j] = 0
        continue
      }
      alive++
      this.age[j] += dt
      const u = this.age[j] / this.life[j]
      const i = j * 3
      if (this.hasAir) {
        // 空気に引かれて外への勢いが落ちる。落ちた勢いの分だけ巻き上がる（輪になって転がり上がる）
        const k = Math.min(1, this.drag * 1.6 * dt)
        const hx = this.vel[i] - w.x
        const hz = this.vel[i + 2] - w.z
        const lost = Math.hypot(hx, hz) * k
        this.vel[i] -= hx * k
        this.vel[i + 2] -= hz * k
        this.vel[i + 1] += lost * 0.32 - this.vel[i + 1] * k * 0.5 - 9.8 * this.gravity * dt * 0.02
        // ゆるい渦：かたまりごとに少しずつ違う向きにゆらぐ
        const t = this.age[j] * 0.8 + this.vari[j] * 20
        this.vel[i] += Math.sin(t * 1.7) * 0.25 * dt
        this.vel[i + 2] += Math.cos(t * 1.3) * 0.25 * dt
      } else {
        this.vel[i + 1] -= 9.8 * this.gravity * dt
      }
      this.pos[i] += this.vel[i] * dt
      this.pos[i + 1] = Math.max(groundY + 0.1, this.pos[i + 1] + this.vel[i + 1] * dt)
      this.pos[i + 2] += this.vel[i + 2] * dt
      // 広がりながら薄くなる（はじめは速く、あとはゆっくり）
      this.size[j] += dt * this.grow[j] * (this.hasAir ? 1.4 / (0.4 + this.age[j] * 0.35) : 3)
      this.rot[j] += this.spin[j] * dt
      const fadeIn = Math.min(1, this.age[j] / (this.hasAir ? 0.35 : 0.08))
      const fadeOut = this.hasAir ? Math.max(0, 1 - u) ** 1.3 : Math.max(0, 1 - u) ** 2
      this.alpha[j] = fadeIn * fadeOut * (this.hasAir ? 0.45 : 0.16)
    }
    this.geo.attributes.position.needsUpdate = true
    this.geo.attributes.aAlpha.needsUpdate = true
    this.geo.attributes.aSize.needsUpdate = true
    this.geo.attributes.aRot.needsUpdate = true
    this.geo.attributes.aVar.needsUpdate = true
    return alive
  }

  dispose() {
    this.geo.dispose()
    this.material.dispose()
  }
}

// ---- 砂つぶ ---------------------------------------------------------------------------------
// 噴流に叩かれて弾き飛ばされる、ひとつぶずつ見える砂や小石。弧を描いて飛び、地面に落ちて止まる。
// （ふわっと広がる砂ぼこりの雲 Dust とは別。こちらは粒が見える）

const gritVertex = /* glsl */ `
  attribute float aAlpha;
  attribute float aSize;
  uniform float uScale;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float px = aSize * uScale / max(-mv.z, 0.5);
    // 1 画素より小さい粒は、大きさの代わりに薄さで表す（ちらつかない）。カメラのすぐ前を横切る粒は消す
    vAlpha = aAlpha * min(1.0, px / 1.6) * (1.0 - smoothstep(7.0, 16.0, px));
    gl_PointSize = clamp(px, 1.6, 16.0);
    gl_Position = projectionMatrix * mv;
    if (vAlpha < 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`
const gritFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.35, 1.0, r)) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export class Grit {
  readonly points: THREE.Points
  readonly material: THREE.ShaderMaterial
  private geo = new THREE.BufferGeometry()
  private pos: Float32Array
  private alpha: Float32Array
  private size: Float32Array
  private vel: Float32Array
  private age: Float32Array
  private life: Float32Array
  private next = 0

  constructor(
    readonly count: number,
    color: THREE.Color,
    private hasAir: boolean,
    private gravity: number,
    private wind: THREE.Vector3,
  ) {
    this.pos = new Float32Array(count * 3)
    this.alpha = new Float32Array(count)
    this.size = new Float32Array(count)
    this.vel = new Float32Array(count * 3)
    this.age = new Float32Array(count).fill(99)
    this.life = new Float32Array(count).fill(1)
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1))
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1))
    this.material = new THREE.ShaderMaterial({
      vertexShader: gritVertex,
      fragmentShader: gritFragment,
      uniforms: { uColor: { value: color.clone() }, uScale: { value: 500 } },
      transparent: true,
      depthWrite: false,
    })
    this.points = new THREE.Points(this.geo, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 2
  }

  /** 着陸船の真下 (cx, gy, cz) の地面から、強さ k（0〜1）で弾き出す */
  emit(dt: number, cx: number, gy: number, cz: number, k: number, rate: number) {
    const n = Math.min(this.count / 4, Math.floor(dt * rate * k + Math.random()))
    for (let i = 0; i < n; i++) {
      const j = this.next++ % this.count
      const a = Math.random() * Math.PI * 2
      const r = 0.8 + Math.random() * 4.5
      // 噴流は地面すれすれに外へ流れるので、粒は浅い角度で速く飛ぶ。真空ではさらに平たく速い
      const sp = (this.hasAir ? 7 + Math.random() * 20 : 15 + Math.random() * 28) * (0.45 + 0.55 * k)
      const up = (this.hasAir ? 0.6 + Math.random() * Math.random() * 7 : 0.3 + Math.random() * Math.random() * 2.5) * (0.5 + 0.5 * k)
      this.pos[j * 3] = cx + Math.cos(a) * r
      this.pos[j * 3 + 1] = gy + 0.05 + Math.random() * 0.3
      this.pos[j * 3 + 2] = cz + Math.sin(a) * r
      this.vel[j * 3] = Math.cos(a) * sp
      this.vel[j * 3 + 1] = up
      this.vel[j * 3 + 2] = Math.sin(a) * sp
      this.age[j] = 0
      this.life[j] = 1.4 + Math.random() * 2.2
      // ほとんどが細かい砂（画面では 1〜2 画素の点）、まれに小石
      this.size[j] = Math.random() < 0.03 ? 0.08 + Math.random() * 0.08 : 0.01 + Math.random() * 0.02
    }
  }

  update(dt: number, groundY: number) {
    const w = this.wind
    const g = 9.8 * this.gravity
    // 空気があると少しだけ減速して風に寄る（砂つぶは重いので、雲ほどは流されない）
    const drag = this.hasAir ? Math.min(1, 0.35 * dt) : 0
    // 細かい砂は空気に乗って、ゆっくり落ちる
    const dragFine = this.hasAir ? Math.min(1, 1.1 * dt) : 0
    for (let j = 0; j < this.count; j++) {
      if (this.age[j] >= this.life[j]) {
        this.alpha[j] = 0
        continue
      }
      this.age[j] += dt
      const i = j * 3
      const onGround = this.pos[i + 1] <= groundY + 0.03
      if (!onGround) {
        const fine = this.size[j] < 0.05
        const dk = fine ? dragFine : drag
        this.vel[i] += (w.x - this.vel[i]) * dk
        this.vel[i + 2] += (w.z - this.vel[i + 2]) * dk
        this.vel[i + 1] -= g * dt * (fine && this.hasAir ? 0.35 : 1)
        this.pos[i] += this.vel[i] * dt
        this.pos[i + 1] += this.vel[i + 1] * dt
        this.pos[i + 2] += this.vel[i + 2] * dt
        if (this.pos[i + 1] <= groundY + 0.03) {
          // 落ちたら止まって、すぐ地面に紛れる
          this.pos[i + 1] = groundY + 0.03
          this.life[j] = Math.min(this.life[j], this.age[j] + 0.4)
        }
      }
      const u = this.age[j] / this.life[j]
      const fadeIn = Math.min(1, this.age[j] / 0.05)
      this.alpha[j] = fadeIn * Math.max(0, 1 - u * u)
    }
    this.geo.attributes.position.needsUpdate = true
    this.geo.attributes.aAlpha.needsUpdate = true
    this.geo.attributes.aSize.needsUpdate = true
  }

  dispose() {
    this.geo.dispose()
    this.material.dispose()
  }
}

// ---- 脚の折り畳み ---------------------------------------------------------------------------

export type LegRig = {
  /** 4 本の脚をまとめた入れ物（サスペンションの縮みは、これを縦に縮める） */
  rig: THREE.Group
  /** 脚ごとの付け根（回すと脚が畳まれる）と、畳む向き（前の脚は前へ、後ろの脚は後ろへ） */
  hinges: { pivot: THREE.Object3D; dir: number }[]
}

/**
 * 模型の Legs（4 本が 1 つの形）を、三角形の位置で 4 本に分け、それぞれの付け根を軸に回せるようにする。
 * 付け根は、その脚のいちばん上（船体につながるところ）
 */
export function splitLegs(legs: THREE.Mesh): LegRig {
  const src = legs.geometry.index ? legs.geometry.toNonIndexed() : legs.geometry.clone()
  const pos = src.attributes.position as THREE.BufferAttribute
  const tris = pos.count / 3
  const groups: number[][] = [[], [], [], []]
  for (let t = 0; t < tris; t++) {
    let x = 0
    let z = 0
    for (let k = 0; k < 3; k++) {
      x += pos.getX(t * 3 + k)
      z += pos.getZ(t * 3 + k)
    }
    groups[(x > 0 ? 1 : 0) + (z > 0 ? 2 : 0)].push(t)
  }
  const rig = new THREE.Group()
  rig.name = 'LegRig'
  const hinges: LegRig['hinges'] = []
  groups.forEach((list, gi) => {
    if (!list.length) return
    const geo = new THREE.BufferGeometry()
    for (const name of Object.keys(src.attributes)) {
      const a = src.attributes[name] as THREE.BufferAttribute
      const out = new Float32Array(list.length * 3 * a.itemSize)
      list.forEach((t, i) => {
        for (let k = 0; k < 3; k++) for (let c = 0; c < a.itemSize; c++) out[(i * 3 + k) * a.itemSize + c] = a.getComponent(t * 3 + k, c)
      })
      geo.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize, a.normalized))
    }
    geo.computeBoundingBox()
    const bb = geo.boundingBox!
    // 付け根：上の端の、真ん中
    const hinge = new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.max.y, (bb.min.z + bb.max.z) / 2)
    geo.translate(-hinge.x, -hinge.y, -hinge.z)
    const mesh = new THREE.Mesh(geo, legs.material)
    mesh.castShadow = legs.castShadow
    mesh.receiveShadow = legs.receiveShadow
    const pivot = new THREE.Group()
    pivot.position.copy(hinge)
    pivot.add(mesh)
    rig.add(pivot)
    hinges.push({ pivot, dir: gi >= 2 ? -1 : 1 })
  })
  src.dispose()
  return { rig, hinges }
}

/** 脚の出し具合（0 = 畳んだ、1 = 出した）を、付け根の角度にする。少し行き過ぎて止まる */
export function setLegs(rig: LegRig, deploy: number) {
  const d = Math.min(1, Math.max(0, deploy))
  // 出し切る直前に少しだけ行き過ぎて戻る（油圧で止まる感じ）
  const e = d < 1 ? 1 - (1 - d) ** 3 + Math.sin(d * Math.PI) * 0.04 : 1
  const angle = (1 - e) * THREE.MathUtils.degToRad(84)
  for (const h of rig.hinges) h.pivot.rotation.x = angle * h.dir
}

/** 降下中の脚の出し具合：高さ 70 m を切ったら 2.2 秒かけて出す */
export function legsDuringDescent(T: number, descent: number, from: number) {
  // 高さ 70 m になる時刻を探す（高さは時間とともに減るだけなので、二分探索）
  let lo = 0
  let hi = descent * TOUCHDOWN
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    if (descentAltitude(mid, descent, from) > 70) lo = mid
    else hi = mid
  }
  return (T - hi) / 2.2
}

// ---- 着陸の跡 -------------------------------------------------------------------------------
// 噴流に吹き払われた地面の輪。空気のある星では表面の砂が飛んで暗い地肌が出る。
// 月のような星では、細かい砂が払われて少し明るく見える（アポロの着陸地点のまわりと同じ）。

let blastTex: THREE.Texture | null = null
function blastAlpha() {
  if (blastTex) return blastTex
  const N = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = N
  const g = canvas.getContext('2d')!
  const img = g.createImageData(N, N)
  // 放射状のすじ：角度ごとに長さの違う筋
  const rays = Array.from({ length: 90 }, () => 0.55 + Math.random() * 0.45)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const px = (x / N) * 2 - 1
      const py = (y / N) * 2 - 1
      const r = Math.hypot(px, py)
      const ang = ((Math.atan2(py, px) / (Math.PI * 2)) + 1) % 1
      const fi = ang * rays.length
      const i0 = Math.floor(fi) % rays.length
      const f = fi - Math.floor(fi)
      const ray = rays[i0] * (1 - f) + rays[(i0 + 1) % rays.length] * f
      const core = Math.max(0, 1 - r / 0.35)
      const streak = Math.max(0, 1 - r / ray) ** 1.5
      const a = Math.min(1, core * 0.9 + streak * 0.75) * Math.max(0, 1 - r)
      const k = (y * N + x) * 4
      img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.round(a * 255)
      img.data[k + 3] = 255
    }
  g.putImageData(img, 0, 0)
  blastTex = new THREE.CanvasTexture(canvas)
  blastTex.colorSpace = THREE.NoColorSpace
  return blastTex
}

export function blastMark(ground: THREE.Color, hasAir: boolean) {
  const geo = new THREE.CircleGeometry(1, 48)
  geo.rotateX(-Math.PI / 2)
  const mat = new THREE.MeshStandardMaterial({
    color: ground.clone().multiplyScalar(hasAir ? 0.55 : 1.3),
    alphaMap: blastAlpha(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    roughness: hasAir ? 1 : 0.85,
    polygonOffset: true,
    polygonOffsetFactor: -3,
  })
  return { geo, mat }
}
