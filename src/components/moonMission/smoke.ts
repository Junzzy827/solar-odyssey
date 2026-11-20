import * as THREE from 'three'

// 打ち上げの煙。発射台の炎の溝から南北へ吹き出す大きな雲と、上がっていくロケットの後ろに残る煙の柱。
// 粒は地面に固定した座標で持ち（地上の物は地面と一緒に動く）、炎に近いほどオレンジに照らされる。

const vert = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute float aSize;
  attribute float aAlpha;
  attribute float aSeed;
  uniform vec3 uFlame;
  uniform float uFlamePower;
  uniform float uPx;
  varying float vAlpha;
  varying vec3 vLight;
  varying float vSeed;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aSize * uPx / max(1.0, -mv.z), 1.0, 900.0);
    vAlpha = aAlpha;
    vSeed = aSeed;
    // 炎（uFlame は同じ地面の座標）からの距離で照らす
    float d = distance(position, uFlame);
    float lit = uFlamePower / (1.0 + d * d / 9000.0);
    vLight = vec3(0.035, 0.04, 0.05) + vec3(1.0, 0.55, 0.22) * lit;
    #include <logdepthbuf_vertex>
  }
`

const frag = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  varying float vAlpha;
  varying vec3 vLight;
  varying float vSeed;
  void main() {
    #include <logdepthbuf_fragment>
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    // もこもこした縁
    float ang = atan(p.y, p.x);
    float edge = 1.0 - 0.18 * (sin(ang * 5.0 + vSeed * 6.0) * 0.5 + 0.5);
    float a = smoothstep(edge, edge * 0.35, r) * vAlpha;
    // 下側を少し明るく（下の炎に照らされる）
    vec3 col = vLight * (0.85 + 0.3 * (1.0 - gl_PointCoord.y));
    gl_FragColor = vec4(col, a);
  }
`

type Puff = { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number; grow: number }

export class Smoke {
  points: THREE.Points
  private puffs: Puff[] = []
  private max: number
  private geo: THREE.BufferGeometry
  private pos: Float32Array
  private size: Float32Array
  private alpha: Float32Array
  material: THREE.ShaderMaterial

  constructor(max: number) {
    this.max = max
    this.geo = new THREE.BufferGeometry()
    this.pos = new Float32Array(max * 3)
    this.size = new Float32Array(max)
    this.alpha = new Float32Array(max)
    const seed = new Float32Array(max)
    for (let i = 0; i < max; i++) seed[i] = Math.random()
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    this.geo.setDrawRange(0, 0)
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uFlame: { value: new THREE.Vector3() }, uFlamePower: { value: 0 }, uPx: { value: 600 } },
      transparent: true,
      depthWrite: false,
    })
    this.points = new THREE.Points(this.geo, this.material)
    this.points.frustumCulled = false
  }

  /** 煙を 1 つ出す（地面の座標、m と m/s） */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, grow = 1) {
    if (this.puffs.length >= this.max) this.puffs.shift()
    this.puffs.push({ x, y, z, vx, vy, vz, age: 0, life, size, grow })
  }

  get count() {
    return this.puffs.length
  }

  update(dt: number) {
    const keep: Puff[] = []
    for (const p of this.puffs) {
      p.age += dt
      if (p.age >= p.life) continue
      // 空気に止められて、ゆっくり上へ（暖かい煙）
      const k = Math.exp(-dt * 0.7)
      p.vx *= k
      p.vz *= k
      p.vy = p.vy * k + 1.6 * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      // 海からの風で、少しずつ西へ流れる
      p.x -= 2.5 * dt
      if (p.y < 1) p.y = 1
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
      this.alpha[i] = Math.min(1, p.age * 3) * (1 - f) * 0.75
    }
    this.geo.setDrawRange(0, keep.length)
    ;(this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true
    ;(this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true
    ;(this.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true
  }

  dispose() {
    this.geo.dispose()
    this.material.dispose()
  }
}
