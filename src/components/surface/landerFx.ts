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

// ---- 砂ぼこり -----------------------------------------------------------------------------

const dustVertex = /* glsl */ `
  attribute float aAlpha;
  attribute float aSize;
  uniform float uScale;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(-mv.z, 0.5);
    gl_Position = projectionMatrix * mv;
  }
`
const dustFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
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

export class Dust {
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
    /** 空気の抵抗（大気が無ければ 0：弧を描いてすぐ落ちる） */
    private drag: number,
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
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      uniforms: { uMap: { value: haloTexture() }, uColor: { value: color.clone() }, uScale: { value: 500 } },
      transparent: true,
      depthWrite: false,
    })
    this.points = new THREE.Points(this.geo, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 2
  }

  /** 着陸船の真下 (cx, gy, cz) から、強さ k（0〜1）で吹き出す */
  emit(dt: number, cx: number, gy: number, cz: number, k: number, rate: number) {
    const n = Math.min(this.count / 4, Math.floor(dt * rate * k + Math.random()))
    for (let i = 0; i < n; i++) {
      const j = this.next++ % this.count
      const a = Math.random() * Math.PI * 2
      const r = 1.5 + Math.random() * 5
      const sp = (5 + Math.random() * 14) * (0.5 + 0.5 * k)
      this.pos[j * 3] = cx + Math.cos(a) * r
      this.pos[j * 3 + 1] = gy + 0.2 + Math.random() * 0.6
      this.pos[j * 3 + 2] = cz + Math.sin(a) * r
      this.vel[j * 3] = Math.cos(a) * sp
      this.vel[j * 3 + 1] = 0.4 + Math.random() * 2.2 * k
      this.vel[j * 3 + 2] = Math.sin(a) * sp
      this.age[j] = 0
      this.life[j] = this.drag > 0 ? 3.5 + Math.random() * 4.5 : 1.6 + Math.random() * 1.2
      this.size[j] = 1.2 + Math.random() * 1.6
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
      if (this.drag > 0) {
        // 空気に引かれて、風と同じ速さに近づいていく。細かい粒はなかなか落ちない
        const k = Math.min(1, this.drag * dt)
        this.vel[i] += (w.x - this.vel[i]) * k
        this.vel[i + 2] += (w.z - this.vel[i + 2]) * k
        this.vel[i + 1] += (0.15 - this.vel[i + 1]) * k * 0.6 - 9.8 * this.gravity * dt * 0.04
      } else {
        this.vel[i + 1] -= 9.8 * this.gravity * dt
      }
      this.pos[i] += this.vel[i] * dt
      this.pos[i + 1] = Math.max(groundY + 0.05, this.pos[i + 1] + this.vel[i + 1] * dt)
      this.pos[i + 2] += this.vel[i + 2] * dt
      // 広がりながら薄くなる
      this.size[j] += dt * (this.drag > 0 ? 2.2 : 0.6)
      const fadeIn = Math.min(1, this.age[j] / 0.15)
      this.alpha[j] = fadeIn * Math.max(0, 1 - u) ** 1.5 * (this.drag > 0 ? 0.2 : 0.35)
    }
    this.geo.attributes.position.needsUpdate = true
    this.geo.attributes.aAlpha.needsUpdate = true
    this.geo.attributes.aSize.needsUpdate = true
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
    // 1 画素より小さい粒は、大きさの代わりに薄さで表す（ちらつかない）
    vAlpha = aAlpha * min(1.0, px / 1.6);
    gl_PointSize = max(px, 1.6);
    gl_Position = projectionMatrix * mv;
  }
`
const gritFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.35, r) * vAlpha;
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
      // 噴流は地面すれすれに外へ流れるので、粒は浅い角度で速く飛ぶ
      const sp = (7 + Math.random() * 20) * (0.45 + 0.55 * k)
      const up = (0.6 + Math.random() * Math.random() * 7) * (0.5 + 0.5 * k)
      this.pos[j * 3] = cx + Math.cos(a) * r
      this.pos[j * 3 + 1] = gy + 0.05 + Math.random() * 0.3
      this.pos[j * 3 + 2] = cz + Math.sin(a) * r
      this.vel[j * 3] = Math.cos(a) * sp
      this.vel[j * 3 + 1] = up
      this.vel[j * 3 + 2] = Math.sin(a) * sp
      this.age[j] = 0
      this.life[j] = 1.4 + Math.random() * 2.2
      // 砂（数 cm）がほとんど、ときどき小石
      this.size[j] = Math.random() < 0.1 ? 0.25 + Math.random() * 0.2 : 0.09 + Math.random() * 0.1
    }
  }

  update(dt: number, groundY: number) {
    const w = this.wind
    const g = 9.8 * this.gravity
    // 空気があると少しだけ減速して風に寄る（砂つぶは重いので、雲ほどは流されない）
    const drag = this.hasAir ? Math.min(1, 0.35 * dt) : 0
    for (let j = 0; j < this.count; j++) {
      if (this.age[j] >= this.life[j]) {
        this.alpha[j] = 0
        continue
      }
      this.age[j] += dt
      const i = j * 3
      const onGround = this.pos[i + 1] <= groundY + 0.03
      if (!onGround) {
        this.vel[i] += (w.x - this.vel[i]) * drag
        this.vel[i + 2] += (w.z - this.vel[i + 2]) * drag
        this.vel[i + 1] -= g * dt
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
