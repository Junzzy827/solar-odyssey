import * as THREE from 'three'
import { OUT_CHUNK } from './shaderOut'

// 打ち上げの煙。発射台の炎の溝から南北へ吹き出す大きな雲と、上がっていくロケットの後ろに残る煙の柱。
// 粒は地面に固定した座標で持ち（地上の物は地面と一緒に動く）、炎に近いほどオレンジに照らされる。
// 種類：0 煙、1 白い湯気（液体酸素の冷たい蒸気・炎の溝に撒く水の湯気）、2 氷のかけら（離昇の揺れで機体から落ちる霜）。
// 発射台の近くの粒は、照明（uAmb）で白っぽく照らされる。

const vert = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute float aSize;
  attribute float aAlpha;
  attribute float aSeed;
  attribute float aKind;
  uniform vec3 uFlame;
  uniform float uAmb;
  uniform float uFlamePower;
  uniform float uPx;
  varying float vAlpha;
  varying vec3 vLight;
  varying float vSeed;
  varying float vKind;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aSize * uPx / max(1.0, -mv.z), 1.0, 900.0);
    vAlpha = aAlpha;
    vSeed = aSeed;
    vKind = aKind;
    // 炎（uFlame は同じ地面の座標）からの距離で照らす
    float d = distance(position, uFlame);
    float lit = uFlamePower / (1.0 + d * d / 40000.0);
    // 照明：発射台のまわり（真ん中から約 250 m）ほど明るい
    float amb = uAmb / (1.0 + dot(position.xz, position.xz) / 60000.0);
    vec3 base = aKind < 0.5 ? vec3(0.035, 0.04, 0.05) + vec3(0.2, 0.22, 0.26) * amb
      : aKind < 1.5 ? vec3(0.05, 0.055, 0.065) + vec3(0.62, 0.68, 0.78) * amb
      : vec3(0.25, 0.27, 0.3) + vec3(1.1, 1.15, 1.25) * amb;
    vLight = base + vec3(1.0, 0.55, 0.22) * lit * (aKind > 1.5 ? 0.6 : 1.0);
    #include <logdepthbuf_vertex>
  }
`

const frag = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  varying float vAlpha;
  varying vec3 vLight;
  varying float vSeed;
  varying float vKind;
  void main() {
    #include <logdepthbuf_fragment>
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    if (vKind > 1.5) {
      // 氷のかけら：小さく光る点
      gl_FragColor = vec4(vLight, smoothstep(1.0, 0.2, r) * vAlpha);
      ${OUT_CHUNK}
      return;
    }
    // もこもこした縁
    float ang = atan(p.y, p.x);
    float edge = 1.0 - 0.18 * (sin(ang * 5.0 + vSeed * 6.0) * 0.5 + 0.5);
    float a = smoothstep(edge, edge * 0.35, r) * vAlpha;
    // 下側を少し明るく（下の炎に照らされる）
    vec3 col = vLight * (0.85 + 0.3 * (1.0 - gl_PointCoord.y));
    gl_FragColor = vec4(col, a);
    ${OUT_CHUNK}
  }
`

type Puff = { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number; grow: number; kind: number }
export const SMOKE = 0
export const STEAM = 1
export const ICE = 2

export class Smoke {
  points: THREE.Points
  private puffs: Puff[] = []
  private max: number
  private geo: THREE.BufferGeometry
  private pos: Float32Array
  private size: Float32Array
  private alpha: Float32Array
  private kind: Float32Array
  /** 粒が下りられるいちばん下（地面の座標の y） */
  private floor: number
  material: THREE.ShaderMaterial

  constructor(max: number, floor = 1) {
    this.max = max
    this.floor = floor
    this.geo = new THREE.BufferGeometry()
    this.pos = new Float32Array(max * 3)
    this.size = new Float32Array(max)
    this.alpha = new Float32Array(max)
    this.kind = new Float32Array(max)
    const seed = new Float32Array(max)
    for (let i = 0; i < max; i++) seed[i] = Math.random()
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    this.geo.setAttribute('aKind', new THREE.BufferAttribute(this.kind, 1).setUsage(THREE.DynamicDrawUsage))
    this.geo.setDrawRange(0, 0)
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uFlame: { value: new THREE.Vector3() }, uFlamePower: { value: 0 }, uPx: { value: 600 }, uAmb: { value: 1 } },
      transparent: true,
      depthWrite: false,
    })
    this.points = new THREE.Points(this.geo, this.material)
    this.points.frustumCulled = false
  }

  /** 煙を 1 つ出す（地面の座標、m と m/s） */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, grow = 1, kind = SMOKE) {
    if (this.puffs.length >= this.max) this.puffs.shift()
    this.puffs.push({ x, y, z, vx, vy, vz, age: 0, life, size, grow, kind })
  }

  get count() {
    return this.puffs.length
  }

  update(dt: number) {
    const keep: Puff[] = []
    for (const p of this.puffs) {
      p.age += dt
      if (p.age >= p.life) continue
      if (p.kind === ICE) {
        // 氷：重力で落ちて、地面に着いたら消える
        p.vy -= 9.8 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.z += p.vz * dt
        if (p.y < this.floor) continue
        keep.push(p)
        continue
      }
      // 空気に止められて、煙はゆっくり上へ（暖かい）、冷たい蒸気は少し沈む
      const k = Math.exp(-dt * 0.7)
      p.vx *= k
      p.vz *= k
      // 熱い煙は浮かんで、大きな雲になって立ち上がる
      p.vy = p.vy * k + (p.kind === STEAM ? -0.3 : 4.0) * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      // 海からの風で、少しずつ西へ流れる
      p.x -= 2.5 * dt
      if (p.y < this.floor) p.y = this.floor
      keep.push(p)
    }
    this.puffs = keep
    for (let i = 0; i < keep.length; i++) {
      const p = keep[i]
      const f = p.age / p.life
      this.pos[i * 3] = p.x
      this.pos[i * 3 + 1] = p.y
      this.pos[i * 3 + 2] = p.z
      this.size[i] = p.size * (1 + p.grow * 2.5 * Math.sqrt(f))
      this.kind[i] = p.kind
      this.alpha[i] = p.kind === ICE ? 1 - f * f : Math.min(1, p.age * 3) * (1 - f) * (p.kind === STEAM ? 0.5 : 0.75)
    }
    this.geo.setDrawRange(0, keep.length)
    ;(this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true
    ;(this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true
    ;(this.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true
    ;(this.geo.attributes.aKind as THREE.BufferAttribute).needsUpdate = true
  }

  dispose() {
    this.geo.dispose()
    this.material.dispose()
  }
}
