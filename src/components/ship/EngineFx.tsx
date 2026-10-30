import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { ShipSpec } from '../../data/ships'
import { thrustFx, warpFx } from '../../state/flight'
import { useStore, type ThrustFxLevel } from '../../state/store'
import { useLevel } from '../../state/quality'

// エンジン噴射と姿勢制御の演出。「さりげなくかっこいい」：ふだんは控えめで、操縦したときだけ反応する。
// - 噴射口のある船：噴射口から青白い炎（芯と外側の光の 2 層）。前進（W）に合わせて伸び、止まると小さく揺らぐだけ
// - 噴射口のない船（SV-01）：ナセルの後端から光の粒が後ろへ流れる。ナセルの光そのものは ShipModel が thrustFx.power で強める
// - 姿勢制御：動き・回りたい向きと逆の船体の端から、短い白いガス（噴射口のない船は小さな光の点滅）
// - ワープ：粒を線状に引き伸ばし、炎を長く
// どれも船の模型の座標で描く（船と一緒に動き、接近ズームで一緒に縮む）。粒は決まった数をくり返し使う

/** 粒の数の上限（使い回す）と、出す量の倍率 */
const AMOUNT: Record<Exclude<ThrustFxLevel, 'off'>, { cap: number; rate: number; puff: number }> = {
  many: { cap: 640, rate: 1.7, puff: 7 },
  normal: { cap: 320, rate: 1, puff: 4 },
}

/** 止まっているときの炎の長さ（噴射口の半径の何倍か）と明るさ */
const IDLE_LEN = 1.6
const IDLE_POWER = 0.35
/** 噴かすときは速く、止めるときはゆっくり変わる（1秒あたり） */
const ATTACK = 3
const RELEASE = 1.4
/** この強さを超えたら姿勢制御を噴く。噴いたら少し間をあける（秒） */
const RCS_THRESHOLD = 0.18
const RCS_GAP = 0.16

// ---- 光の粒（決まった数を輪のように使い回す） -------------------------------------------------

const particleVertex = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aVel;
attribute vec2 aTime;   // 生まれた時刻、寿命
attribute vec4 aShape;  // 初めの大きさ、終わりの大きさ、引き伸ばし、減速（0〜1）
attribute vec3 aColor;
uniform float uTime;
uniform float uStretch;
varying vec2 vUv;
varying vec3 vColor;
void main() {
  float age = uTime - aTime.x;
  float k = age / aTime.y;
  if (k < 0.0 || k >= 1.0) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    vUv = vec2(0.0);
    vColor = vec3(0.0);
    return;
  }
  vec3 p = aStart + aVel * age * (1.0 - 0.5 * aShape.w * k);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float unit = length(modelViewMatrix[0].xyz);
  float size = mix(aShape.x, aShape.y, sqrt(k)) * unit;
  // 速さの向き（画面の上で）に引き伸ばす。ワープ中は線になる
  vec2 dir = (modelViewMatrix * vec4(aVel * (1.0 - aShape.w * k), 0.0)).xy;
  float speed = length(dir);
  vec2 ax = speed > 1e-7 ? dir / speed : vec2(1.0, 0.0);
  float len = size + aShape.z * uStretch * speed * 0.12;
  mv.xy += ax * position.x * len + vec2(-ax.y, ax.x) * position.y * size;
  gl_Position = projectionMatrix * mv;
  vUv = position.xy * 2.0;
  vColor = aColor * smoothstep(0.0, 0.08, k) * pow(1.0 - k, 1.5);
}
`

const particleFragment = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float a = 1.0 - r2;
  gl_FragColor = vec4(vColor * a * a, 1.0);
  #include <colorspace_fragment>
}
`

class ParticlePool {
  readonly mesh: THREE.Mesh
  readonly uniforms = { uTime: { value: 0 }, uStretch: { value: 0 } }
  private next = 0
  private dirty = false
  private attrs: Record<'start' | 'vel' | 'time' | 'shape' | 'color', THREE.InstancedBufferAttribute>

  constructor(readonly cap: number) {
    const geo = new THREE.InstancedBufferGeometry()
    const quad = new THREE.PlaneGeometry(1, 1)
    geo.index = quad.index
    geo.setAttribute('position', quad.getAttribute('position'))
    const make = (size: number) => new THREE.InstancedBufferAttribute(new Float32Array(cap * size), size).setUsage(THREE.DynamicDrawUsage)
    this.attrs = { start: make(3), vel: make(3), time: make(2), shape: make(4), color: make(3) }
    // まだ使っていない粒は「とっくに寿命が過ぎた」ことにしておく
    for (let i = 0; i < cap; i++) this.attrs.time.setXY(i, -1e6, 1)
    geo.setAttribute('aStart', this.attrs.start)
    geo.setAttribute('aVel', this.attrs.vel)
    geo.setAttribute('aTime', this.attrs.time)
    geo.setAttribute('aShape', this.attrs.shape)
    geo.setAttribute('aColor', this.attrs.color)
    geo.instanceCount = cap
    const mat = new THREE.ShaderMaterial({
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 2
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, life: number, size0: number, size1: number, stretch: number, drag: number, c: THREE.Color) {
    const i = this.next
    this.next = (i + 1) % this.cap
    const a = this.attrs
    a.start.setXYZ(i, p.x, p.y, p.z)
    a.vel.setXYZ(i, v.x, v.y, v.z)
    a.time.setXY(i, this.uniforms.uTime.value, life)
    a.shape.setXYZW(i, size0, size1, stretch, drag)
    a.color.setXYZ(i, c.r, c.g, c.b)
    this.dirty = true
  }

  flush() {
    if (!this.dirty) return
    this.dirty = false
    for (const a of Object.values(this.attrs)) a.needsUpdate = true
  }

  dispose() {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}

// ---- 炎（噴射口ごとに、芯と外側の光の 2 枚の筒） ----------------------------------------------

const flameVertex = /* glsl */ `
attribute vec2 aFlame;  // 0 = 芯、1 = 外側の光 / 噴射口ごとのゆらぎのずれ
uniform float uTime;
uniform float uLen;
varying float vS;
varying float vEdge;
varying float vLayer;
void main() {
  float s = position.z;
  float layer = aFlame.x;
  float seed = aFlame.y;
  // ノイズ代わりの、ずらした波の重ね合わせ。先のほうほど大きく揺らぐ
  float wob = 0.5 * sin(uTime * 31.0 + seed * 7.1 + s * 11.0) + 0.5 * sin(uTime * 17.3 + seed * 3.7 - s * 7.0);
  float r = mix(1.0, 0.12, pow(s, 0.75)) * mix(0.55, 1.3, layer) * (1.0 + 0.08 * wob * s);
  float flick = 1.0 + 0.05 * sin(uTime * 23.0 + seed * 5.0) + 0.04 * sin(uTime * 41.0 + seed * 2.3);
  float len = uLen * mix(0.6, 1.0, layer) * flick;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position.xy * r, s * len, 1.0);
  mat3 toView = mat3(modelViewMatrix) * mat3(instanceMatrix);
  vec3 n = normalize(toView * vec3(position.xy, 0.0));
  vec3 axis = normalize(toView * vec3(0.0, 0.0, 1.0));
  vec3 eye = normalize(-mv.xyz);
  // 筒の真ん中ほど濃く、縁はぼかす。真後ろから見たときも見えるように
  vEdge = max(abs(dot(n, eye)), abs(dot(axis, eye)) * 0.8);
  vS = s;
  vLayer = layer;
  gl_Position = projectionMatrix * mv;
}
`

const flameFragment = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uOuter;
uniform float uPower;
varying float vS;
varying float vEdge;
varying float vLayer;
void main() {
  float along = pow(1.0 - vS, mix(1.5, 2.4, vLayer));
  float soft = pow(vEdge, 1.5);
  vec3 c = mix(uCore, uOuter, vLayer) * along * soft * uPower * mix(1.0, 0.5, vLayer);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`

function flameMesh(spec: Extract<ShipSpec['engine'], { kind: 'nozzle' }>) {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 18, 10, true)
  geo.rotateX(Math.PI / 2)
  geo.translate(0, 0, 0.5)
  const n = spec.nozzles.length
  const flame = new Float32Array(n * 4)
  const uniforms = {
    uTime: { value: 0 },
    uLen: { value: IDLE_LEN },
    uPower: { value: IDLE_POWER },
    uCore: { value: new THREE.Vector3(...spec.core) },
    uOuter: { value: new THREE.Vector3(...spec.outer) },
  }
  const mat = new THREE.ShaderMaterial({
    vertexShader: flameVertex,
    fragmentShader: flameFragment,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.InstancedMesh(geo, mat, n * 2)
  const m = new THREE.Matrix4()
  spec.nozzles.forEach((nz, i) => {
    m.makeScale(nz.r, nz.r, nz.r).setPosition(...nz.pos)
    for (const layer of [0, 1]) {
      const k = i * 2 + layer
      mesh.setMatrixAt(k, m)
      flame[k * 2] = layer
      flame[k * 2 + 1] = i * 1.7
    }
  })
  geo.setAttribute('aFlame', new THREE.InstancedBufferAttribute(flame, 2))
  mesh.frustumCulled = false
  mesh.renderOrder = 1
  return { mesh, uniforms }
}

// ---- 演出の本体 ---------------------------------------------------------------------------------

/**
 * 回したい向きに、この噴射口がどれだけ効くか。軸ごとに見て、その軸を回す力がある程度ある噴射口は、
 * 回す向きが合っていれば全力で噴く（斜めに効く噴射口でも、ロールだけ・ピッチだけの操作で反応するように）
 */
function turnDemand(torque: THREE.Vector3, spin: THREE.Vector3) {
  let d = 0
  for (const axis of ['x', 'y', 'z'] as const) {
    if (Math.abs(torque[axis]) > 0.25) d = Math.max(d, Math.sign(torque[axis]) * spin[axis])
  }
  return d
}

type Jet = { pos: THREE.Vector3; dir: THREE.Vector3; force: THREE.Vector3; torque: THREE.Vector3; wait: number }

const p = new THREE.Vector3()
const vel = new THREE.Vector3()
const col = new THREE.Color()
const want = new THREE.Vector3()
const spin = new THREE.Vector3()

export function EngineFx({ spec }: { spec: ShipSpec }) {
  const level = useStore((s) => s.settings.thrust)
  useEffect(() => {
    if (level === 'off') thrustFx.power = 0
  }, [level])
  return level === 'off' ? null : <EngineFxOn spec={spec} level={level} />
}

function EngineFxOn({ spec, level }: { spec: ShipSpec; level: Exclude<ThrustFxLevel, 'off'> }) {
  const engine = spec.engine
  const light = useLevel() === 'low'
  const amount = AMOUNT[level]
  const pool = useMemo(() => new ParticlePool(light ? amount.cap / 2 : amount.cap), [amount, light])
  const flame = useMemo(() => (engine.kind === 'nozzle' ? flameMesh(engine) : null), [engine])
  const jets = useMemo<Jet[]>(
    () =>
      engine.rcs.map(({ pos, dir }) => {
        const pv = new THREE.Vector3(...pos)
        const dv = new THREE.Vector3(...dir).normalize()
        // 吹き出す向きと逆に押される。船の中心（原点）まわりに回す力も
        const force = dv.clone().negate()
        const torque = new THREE.Vector3().crossVectors(pv, force)
        if (torque.lengthSq() > 1e-8) torque.normalize()
        return { pos: pv, dir: dv, force, torque, wait: 0 }
      }),
    [engine],
  )
  useEffect(() => () => pool.dispose(), [pool])
  useEffect(
    () => () => {
      if (!flame) return
      flame.mesh.geometry.dispose()
      ;(flame.mesh.material as THREE.Material).dispose()
      flame.mesh.dispose()
    },
    [flame],
  )

  const s = useRef({ time: 0, power: 0, vent: 0, turn: new THREE.Vector3(), prevTurn: new THREE.Vector3(), idle: 2 })

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05)
    const st = useStore.getState()
    const f = s.current
    f.time += dt
    pool.uniforms.uTime.value = f.time
    const warping = st.warpPhase !== 'idle'
    const w = warpFx.intensity
    const charge = Math.max(warpFx.glow, w)

    // 噴射の強さ：前進の噴かし具合（ワープの準備・ワープ中は全開へ）。急に出たり消えたりしないよう、なめらかに
    const target = warping ? charge : thrustFx.throttle
    f.power += (target - f.power) * (1 - Math.exp(-(target > f.power ? ATTACK : RELEASE) * dt))
    thrustFx.power = f.power
    const move = warping ? 0 : Math.max(thrustFx.speed, f.power)

    if (flame && engine.kind === 'nozzle') {
      const u = flame.uniforms
      u.uTime.value = f.time
      u.uLen.value = (IDLE_LEN + (engine.length - IDLE_LEN) * f.power) * (1 + 0.5 * w)
      u.uPower.value = IDLE_POWER + 0.9 * f.power + 0.6 * w
      // ワープの準備からワープ中は、噴射口からも光の筋を出す
      if (charge > 0.05) {
        f.vent += dt * 50 * amount.rate * charge
        while (f.vent >= 1) {
          f.vent -= 1
          const nz = engine.nozzles[Math.floor(Math.random() * engine.nozzles.length)]
          p.set(...nz.pos).add(vel.randomDirection().multiplyScalar(nz.r * 0.6))
          vel.set(0, 0, 1.2 + 2.2 * w)
          col.setRGB(...engine.outer).multiplyScalar(0.6 + 0.8 * w)
          pool.emit(p, vel, 0.3 + 0.2 * Math.random(), nz.r * 0.35, nz.r * 0.15, 1, 0, col)
        }
      } else f.vent = 0
    } else if (engine.kind === 'nacelle') {
      // ナセルの後端から光の粒：速いほど多く、長く。止まっているときはほとんど出ない（鑑賞モードでは少しだけ）
      const idle = st.mode === 'gallery' ? 2.5 : 0.6
      const rate = (idle + 70 * move * amount.rate + 160 * charge * amount.rate) * engine.vents.length
      f.vent += dt * rate
      while (f.vent >= 1) {
        f.vent -= 1
        const vent = engine.vents[Math.floor(Math.random() * engine.vents.length)]
        const a = Math.random() * Math.PI * 2
        const r = engine.ventRadius * Math.sqrt(Math.random())
        p.set(vent[0] + Math.cos(a) * r, vent[1] + Math.sin(a) * r * 0.75, vent[2] + Math.random() * 0.01)
        vel.set((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.02, 0.1 + 0.55 * move + 2.6 * w)
        col.setRGB(0.5, 0.78, 1.7).multiplyScalar(0.5 + 0.8 * move + 1.1 * charge)
        const life = (0.45 + 0.6 * move) * (1 - 0.45 * w) * (0.8 + 0.4 * Math.random())
        pool.emit(p, vel, life, 0.0055, 0.0015, 1, 0, col)
      }
    }
    pool.uniforms.uStretch.value = 0.3 + 0.5 * w

    // 姿勢制御：並進の入力（前進は主エンジンの役目なので除く）と、回る速さ・その変化から、噴く噴射口を選ぶ
    want.copy(thrustFx.move)
    want.z = Math.max(0, want.z)
    const k = 1 - Math.exp(-10 * dt)
    f.turn.lerp(spin.copy(thrustFx.turn).clampScalar(-1.5, 1.5), k)
    spin.copy(f.turn).sub(f.prevTurn).divideScalar(Math.max(dt, 1e-3)).multiplyScalar(0.15).addScaledVector(f.turn, 0.45)
    f.prevTurn.copy(f.turn)
    if (st.warpPhase === 'warp') want.set(0, 0, 0)
    let fired = false
    for (const jet of jets) {
      jet.wait -= dt
      const demand = Math.max(0, jet.force.dot(want)) + (st.warpPhase === 'warp' ? 0 : turnDemand(jet.torque, spin))
      if (demand > RCS_THRESHOLD && jet.wait <= 0) {
        jet.wait = RCS_GAP + Math.random() * 0.08
        fire(jet, Math.min(1, demand))
        fired = true
      }
    }
    // 鑑賞モードでは、ときどき小さく姿勢を整える
    if (st.mode === 'gallery' && !fired) {
      f.idle -= dt
      if (f.idle <= 0) {
        f.idle = 3.5 + Math.random() * 4
        fire(jets[Math.floor(Math.random() * jets.length)], 0.45)
      }
    }
    pool.flush()
  })

  function fire(jet: Jet, strength: number) {
    if (engine.kind === 'nacelle') {
      // 噴射口のない船：船体の端で、小さな光が一瞬だけ
      vel.set(0, 0, 0)
      col.setRGB(2.4, 2.6, 3.2).multiplyScalar(strength)
      pool.emit(jet.pos, vel, 0.13, 0.012, 0.018, 0, 0, col)
      col.multiplyScalar(0.2)
      pool.emit(jet.pos, vel, 0.16, 0.045, 0.06, 0, 0, col)
      return
    }
    // 噴射口のある船：白いガスが短く吹き出し、約0.2秒で広がって消える
    for (let i = 0; i < amount.puff; i++) {
      vel
        .randomDirection()
        .multiplyScalar(0.15)
        .addScaledVector(jet.dir, 0.45 + 0.2 * Math.random())
      col.setRGB(0.85, 0.88, 0.95).multiplyScalar(strength * (0.6 + 0.4 * Math.random()))
      pool.emit(jet.pos, vel, 0.2 + 0.07 * Math.random(), 0.005, 0.04 + 0.012 * Math.random(), 0, 1, col)
    }
  }

  return (
    <>
      {flame && <primitive object={flame.mesh} />}
      <primitive object={pool.mesh} />
    </>
  )
}
