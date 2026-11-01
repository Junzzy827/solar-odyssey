import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { FAR, LANDER_POS, Terrain, rockGeometry, seeded } from './terrain'
import { dustFragment, dustVertex, puffTexture, windFor } from './landerFx'
import type { SkyNow } from './skyNow'
import { useLevel } from '../../state/quality'
import { useLanding } from '../../state/landing'
import { DEPLOY_SEC, ROVER_RANGE, ROVER_TOP, roverFocus, roverInput, roverDebug, roverNow, setRoverPhase, useRover, useSampleLog } from '../../state/rover'
import { samplesFor, type RockSample } from '../../data/rockSamples'

// 無人探査ローバー ORV-7（全長 1.8 m）。模型は tools/blender/build_rover.py で作った rover-orv7.glb。
// 関節（脚・太陽電池・マスト・アンテナ・アーム）は模型ではすべて 0 で、ここで回して
// 「たたんだ姿 → 展開」と、走っているあいだの姿勢を作る（角度は build_rover.py の deploy_pose と同じ）。

const url = (file: string) => `${import.meta.env.BASE_URL}models/${file}`
const D = Math.PI / 180

// ---- 展開の動き（build_rover.py と同じ数字） -----------------------------------------------

const WHEEL_R = 0.2
/** 脚ごとの、関節から車軸へのベクトル（前後, 上下）と、たたんだときの角度 */
const LEGS = {
  F: { vy: 0.3, vz: -0.32, fold: 122 * D },
  M: { vy: -0.42, vz: -0.32, fold: -69 * D },
  R: { vy: -0.36, vz: -0.32, fold: -117 * D },
} as const
type LegId = keyof typeof LEGS
const KNUCKLE_Z = 0.52
const BELLY_DROP = 0.32
const LINK_FOLD = 52 * D
const ARM_STOW = [0, 86, -86, 0].map((v) => v * D)
const ARM_WORK = [28, 38, -42, -78].map((v) => v * D)

const ease = (a: number, b: number, t: number) => {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)))
  return u * u * (3 - 2 * u)
}
const hubZ = (id: LegId, ang: number) => KNUCKLE_Z + LEGS[id].vy * Math.sin(ang) + LEGS[id].vz * Math.cos(ang)

type Pose = {
  dz: number
  legs: Record<LegId, number>
  link: number
  panelL: number
  panelR: number
  mast: number
  antenna: number
  head: number
  arm: number[]
}

function deployPose(t: number, arm = ARM_WORK): Pose {
  const s = ease(0.05, 0.5, t)
  const legs = { F: LEGS.F.fold * (1 - s), M: LEGS.M.fold * (1 - s), R: LEGS.R.fold * (1 - s) }
  const dz = Math.max(-BELLY_DROP, ...(['F', 'M', 'R'] as LegId[]).map((id) => WHEEL_R - hubZ(id, legs[id])))
  const h = ease(0.86, 1, t)
  const a = ease(0.8, 1, t)
  return {
    dz,
    legs,
    link: LINK_FOLD * (1 - s),
    panelL: Math.PI * (1 - ease(0.5, 0.66, t)),
    panelR: -Math.PI * (1 - ease(0.57, 0.74, t)),
    mast: (-Math.PI / 2) * (1 - ease(0.66, 0.84, t)),
    antenna: (-Math.PI / 2) * (1 - ease(0.72, 0.86, t)),
    head: 35 * D * Math.sin(h * Math.PI * 2) * (1 - h * 0.3),
    arm: ARM_STOW.map((p, i) => p + (arm[i] - p) * a),
  }
}

type Rig = {
  body: THREE.Object3D
  legs: Record<string, THREE.Object3D>
  wheels: Record<string, THREE.Object3D>
  links: THREE.Object3D[]
  panelsL: THREE.Object3D[]
  panelsR: THREE.Object3D[]
  mast: THREE.Object3D
  head: THREE.Object3D
  antennas: THREE.Object3D[]
  arm: THREE.Object3D[]
}

/** 姿勢を模型に。squash は車体の沈み込み（m）で、脚を少し回して表す */
function applyPose(rig: Rig, p: Pose, squash = 0) {
  rig.body.position.y = p.dz - squash
  for (const side of ['R', 'L']) {
    // 沈んだぶん、前の脚は前へ、中と後ろの脚は後ろへ開く（車輪は地面に着いたまま）
    rig.legs['F' + side].rotation.x = p.legs.F + squash / LEGS.F.vy
    rig.legs['M' + side].rotation.x = p.legs.M + squash / LEGS.M.vy
    rig.legs['R' + side].rotation.x = p.legs.R + squash / LEGS.R.vy
  }
  for (const l of rig.links) l.rotation.x = p.link
  // Blender の Y 軸まわり → three.js では -Z 軸まわり
  for (const o of rig.panelsL) o.rotation.z = -p.panelL
  for (const o of rig.panelsR) o.rotation.z = -p.panelR
  rig.mast.rotation.x = p.mast
  rig.head.rotation.y = p.head
  for (const a of rig.antennas) a.rotation.x = p.antenna
  const [yaw, a1, a2, a3] = p.arm
  rig.arm[0].rotation.y = -yaw
  rig.arm[1].rotation.x = a1
  rig.arm[2].rotation.x = a2 - a1
  rig.arm[3].rotation.x = a3 - a2
}

// ---- 地面の高さ（描いている地面の格子と同じ形で） --------------------------------------------

/**
 * 地面の格子（Terrain.geometry：中心ほど細かい円形の格子）の上での高さ。
 * terrain.height は本当の地形なので、格子の粗いところでは、描かれた地面と少しずれる。
 * 車輪が地面に浮いたり沈んだりしないよう、格子の 4 つの頂点から求める。
 */
function meshHeight(terrain: Terrain, x: number, z: number) {
  const RINGS = terrain.dem ? 190 : 150
  const SEG = terrain.dem ? 360 : 240
  const r = Math.hypot(x, z)
  const fi = RINGS * (r / FAR) ** (1 / 2.3)
  if (fi < 1) return terrain.height(x, z)
  const i0 = Math.floor(fi)
  const fr = fi - i0
  let a = Math.atan2(z, x)
  if (a < 0) a += Math.PI * 2
  const fj = (a / (Math.PI * 2)) * SEG
  const j0 = Math.floor(fj)
  const fa = fj - j0
  const at = (i: number, j: number) => {
    const rr = FAR * (i / RINGS) ** 2.3
    const aa = (j / SEG) * Math.PI * 2
    return terrain.height(Math.cos(aa) * rr, Math.sin(aa) * rr)
  }
  const h00 = at(i0, j0)
  const h01 = at(i0, j0 + 1)
  const h10 = at(i0 + 1, j0)
  const h11 = at(i0 + 1, j0 + 1)
  return (h00 * (1 - fa) + h01 * fa) * (1 - fr) + (h10 * (1 - fa) + h11 * fa) * fr
}

// ---- 車輪が巻き上げる砂ぼこり ---------------------------------------------------------------

class WheelDust {
  readonly points: THREE.Points
  readonly material: THREE.ShaderMaterial
  private geo = new THREE.BufferGeometry()
  private pos: Float32Array
  private vel: Float32Array
  private alpha: Float32Array
  private size: Float32Array
  private rot: Float32Array
  private vari: Float32Array
  private age: Float32Array
  private life: Float32Array
  private floor: Float32Array
  private next = 0

  constructor(readonly count: number, color: THREE.Color, private hasAir: boolean, private gravity: number, private wind: THREE.Vector3) {
    this.pos = new Float32Array(count * 3)
    this.vel = new Float32Array(count * 3)
    this.alpha = new Float32Array(count)
    this.size = new Float32Array(count)
    this.rot = new Float32Array(count)
    this.vari = new Float32Array(count)
    this.age = new Float32Array(count).fill(99)
    this.life = new Float32Array(count).fill(1)
    this.floor = new Float32Array(count)
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

  /** 1 つぶ。(x, y, z) は地面の上の点、(vx, vy, vz) は飛び出す勢い */
  puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number) {
    const j = this.next++ % this.count
    const i = j * 3
    this.pos[i] = x + (Math.random() - 0.5) * 0.3
    this.pos[i + 1] = y + 0.05 + Math.random() * 0.15
    this.pos[i + 2] = z + (Math.random() - 0.5) * 0.3
    this.vel[i] = vx + (Math.random() - 0.5) * 1.2
    this.vel[i + 1] = vy * (0.6 + Math.random() * 0.8)
    this.vel[i + 2] = vz + (Math.random() - 0.5) * 1.2
    this.floor[j] = y
    this.age[j] = 0
    this.rot[j] = Math.random() * Math.PI * 2
    this.vari[j] = Math.random() * 0.999
    this.life[j] = this.hasAir ? 2.5 + Math.random() * 3.5 : 0.6 + Math.random() * 0.6
    this.size[j] = size * (0.6 + Math.random() * 0.8)
  }

  update(dt: number) {
    const w = this.wind
    for (let j = 0; j < this.count; j++) {
      if (this.age[j] >= this.life[j]) {
        this.alpha[j] = 0
        continue
      }
      this.age[j] += dt
      const i = j * 3
      if (this.hasAir) {
        // 空気に引かれて勢いが落ち、風に流され、ゆっくり舞い上がる
        const k = Math.min(1, 1.8 * dt)
        this.vel[i] += (w.x - this.vel[i]) * k
        this.vel[i + 2] += (w.z - this.vel[i + 2]) * k
        this.vel[i + 1] += (0.25 - this.vel[i + 1]) * k * 0.8
      } else {
        this.vel[i + 1] -= 9.8 * this.gravity * dt
      }
      this.pos[i] += this.vel[i] * dt
      this.pos[i + 1] = Math.max(this.floor[j], this.pos[i + 1] + this.vel[i + 1] * dt)
      this.pos[i + 2] += this.vel[i + 2] * dt
      this.size[j] += dt * (this.hasAir ? 0.9 : 1.6)
      this.rot[j] += dt * 0.3
      const u = this.age[j] / this.life[j]
      const fadeIn = Math.min(1, this.age[j] / 0.12)
      this.alpha[j] = fadeIn * Math.max(0, 1 - u) ** 1.5 * (this.hasAir ? 0.38 : 0.2)
    }
    this.geo.attributes.position.needsUpdate = true
    this.geo.attributes.aAlpha.needsUpdate = true
    this.geo.attributes.aSize.needsUpdate = true
    this.geo.attributes.aRot.needsUpdate = true
    this.geo.attributes.aVar.needsUpdate = true
  }

  dispose() {
    this.geo.dispose()
    this.material.dispose()
  }
}

// ---- 走り ---------------------------------------------------------------------------------

/** 着陸船の 4 本の脚の足（ぶつからないように）。着陸船の模型の座標から */
function landerFeet(yaw: number) {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  return [
    [4.5, -5.7],
    [-4.5, -5.7],
    [4.5, 5.9],
    [-4.5, 5.9],
  ].map(([x, z]) => new THREE.Vector2(LANDER_POS.x + x * c + z * s, LANDER_POS.y - x * s + z * c))
}

type Drive = {
  x: number
  z: number
  y: number
  vy: number
  heading: number
  speed: number
  pitch: number
  roll: number
  grounded: boolean
  spin: number
  steer: number
  squash: number
  squashV: number
  arm: number
  still: number
  dropped: boolean
  burst: number
  hudT: number
  /** 採集の経過（秒）。-1 = 採集していない */
  sampleT: number
  sampleIdx: number
}

/** 採集できる岩の置き場所 */
type Site = { x: number; y: number; z: number; size: number; rot: number; seed: number; kind: RockSample }

/** 採集の段取り（秒）：アームを伸ばす → つかむ → 持ち上げて車体へ */
const REACH = 1.1
const GRIP = 1.7
const DONE = 2.8
const ARM_REACH = [0, 30, -62, -86].map((v) => v * D)

const PROPS = { cam: new THREE.Vector3(), look: new THREE.Vector3(), fwd: new THREE.Vector3(), tmp: new THREE.Vector3(), q: new THREE.Quaternion() }

export function Rover({
  terrain,
  dustColor,
  sky,
  landerYaw,
  prepare,
}: {
  terrain: Terrain
  dustColor: string
  sky: SkyNow
  landerYaw: number
  /** 地表の場面の空気遠近・雲の影を、模型の素材にかける */
  prepare: (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial
}) {
  const { scene } = useGLTF(url('rover-orv7.glb'))
  const group = useRef<THREE.Group>(null)
  const phase = useRover((r) => r.phase)
  const def = terrain.def
  const g = 9.8 * def.gravity

  const built = useMemo(() => {
    const model = scene.clone(true)
    const owned: { dispose: () => void }[] = []
    const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.7), toneMapped: false })
    owned.push(lamp)
    const mats = new Map<THREE.Material, THREE.Material>()
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      const src = mesh.material as THREE.MeshStandardMaterial
      if (!mats.has(src)) {
        if (src.name === 'Lamp') mats.set(src, lamp)
        else {
          const m = src.clone()
          m.envMapIntensity = 0.9
          if (src.name === 'Solar') {
            m.metalness = 0.4
            m.roughness = 0.22
          }
          prepare(m)
          owned.push(m)
          mats.set(src, m)
        }
      }
      mesh.material = mats.get(src)!
    })
    const get = (n: string) => model.getObjectByName(n)!
    const rig: Rig = {
      body: get('Body'),
      legs: Object.fromEntries(['FR', 'MR', 'RR', 'FL', 'ML', 'RL'].map((k) => [k, get('Leg_' + k)])),
      wheels: Object.fromEntries(['FR', 'MR', 'RR', 'FL', 'ML', 'RL'].map((k) => [k, get('Wheel_' + k)])),
      links: [get('Link_R'), get('Link_L')],
      panelsL: [get('Panel_L1'), get('Panel_L2')],
      panelsR: [get('Panel_R1'), get('Panel_R2')],
      mast: get('Mast'),
      head: get('Head'),
      antennas: [get('Antenna1'), get('Antenna2')],
      arm: [get('ArmYaw'), get('ArmUpper'), get('ArmFore'), get('ArmHand')],
    }
    for (const w of Object.values(rig.wheels)) w.rotation.order = 'YXZ'
    return { model, rig, owned }
  }, [scene, prepare])
  useEffect(() => () => built.owned.forEach((m) => m.dispose()), [built])

  const level = useLevel()
  const hasAir = !!def.sky
  const dust = useMemo(
    () => new WheelDust(level === 'high' ? 700 : level === 'medium' ? 450 : 220, new THREE.Color(dustColor), hasAir, def.gravity, windFor(def.id, hasAir)),
    [dustColor, level, hasAir, def],
  )
  useEffect(() => () => dust.dispose(), [dust])
  const dustBase = useMemo(() => new THREE.Color(dustColor), [dustColor])
  const feet = useMemo(() => landerFeet(landerYaw), [landerYaw])

  // ---- 採集できる岩：着陸地点のまわりにちらばらせる。1 つめは、ローバーが降りた正面の少し先に ----
  const sites = useMemo<Site[]>(() => {
    const kinds = samplesFor(def.id)
    const rnd = seeded(terrain.seed + 911)
    const n = Math.min(10, Math.max(6, kinds.length * 2))
    const h0 = landerYaw + Math.PI / 2
    const out: Site[] = []
    const push = (x: number, z: number) =>
      out.push({ x, z, y: meshHeight(terrain, x, z), size: 0.2 + rnd() * 0.12, rot: rnd() * Math.PI * 2, seed: Math.floor(rnd() * 1e6), kind: kinds[out.length % kinds.length] })
    push(LANDER_POS.x - Math.sin(h0) * 14, LANDER_POS.y - Math.cos(h0) * 14)
    for (let tries = 0; out.length < n && tries < 500; tries++) {
      const x = (rnd() * 2 - 1) * (ROVER_RANGE - 8)
      const z = (rnd() * 2 - 1) * (ROVER_RANGE - 8)
      if (Math.hypot(x - LANDER_POS.x, z - LANDER_POS.y) < 14) continue
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 20)) continue
      push(x, z)
    }
    return out
  }, [terrain, def.id, landerYaw])
  const rocks = useMemo(() => {
    const beaconGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 8, 1, true)
    beaconGeo.translate(0, 0.5, 0)
    const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.0, 0.45), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
    const items = sites.map((site) => {
      const geo = rockGeometry(site.seed, !!site.kind.round)
      const mat = prepare(new THREE.MeshStandardMaterial({ color: site.kind.color, roughness: 0.85 - (site.kind.gloss ?? 0) * 0.6, metalness: (site.kind.gloss ?? 0) * 0.3 }))
      return { geo, mat }
    })
    const chipMat = new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.7 })
    const chipGeo = rockGeometry(7, false)
    return { beaconGeo, beaconMat, items, chipMat, chipGeo }
  }, [sites, prepare])
  useEffect(
    () => () => {
      rocks.beaconGeo.dispose()
      rocks.beaconMat.dispose()
      rocks.chipGeo.dispose()
      rocks.chipMat.dispose()
      for (const it of rocks.items) {
        it.geo.dispose()
        it.mat.dispose()
      }
    },
    [rocks],
  )
  const beacons = useRef<(THREE.Mesh | null)[]>([])
  const chip = useRef<THREE.Mesh>(null)
  /** この着陸で、もう採った岩（目印を消す） */
  const taken = useRef(new Set<number>())
  const lights = useRef<THREE.SpotLight>(null)

  // 走りの状態。落とすたびに着陸船の真下から
  const st = useRef<Drive | null>(null)
  useEffect(() => {
    // i 番目の岩の手前（アームが届くところ）へ
    roverDebug.moveTo = (i) => {
      const d = st.current
      const site = sites[i]
      if (!d || !site) return
      Object.assign(d, { x: site.x + Math.sin(d.heading) * 1.1, z: site.z + Math.cos(d.heading) * 1.1, speed: 0 })
    }
    roverDebug.sites = () => sites.map(({ x, z }) => ({ x, z }))
    return () => {
      roverDebug.moveTo = undefined
      roverDebug.sites = undefined
    }
  }, [sites])
  useEffect(() => {
    if (phase !== 'drop') return
    const x = LANDER_POS.x
    const z = LANDER_POS.y
    st.current = {
      x,
      z,
      y: meshHeight(terrain, x, z) + 1.3,
      vy: 0,
      heading: landerYaw + Math.PI / 2,
      speed: 0,
      pitch: 0,
      roll: 0,
      grounded: false,
      spin: 0,
      steer: 0,
      squash: 0,
      squashV: 0,
      arm: 1,
      still: 0,
      dropped: false,
      burst: 0,
      hudT: 0,
      sampleT: -1,
      sampleIdx: -1,
    }
    taken.current.clear()
  }, [phase, terrain, landerYaw])

  useFrame((state, rawDt) => {
    const grp = group.current
    const s = st.current
    const { phase, since, view } = useRover.getState()
    if (!grp) return
    grp.visible = phase !== 'none' && !!s
    if (!grp.visible || !s) return
    const dt = Math.min(rawDt, 0.05)
    const T = roverNow() - since
    const rig = built.rig
    const fwd = PROPS.fwd.set(-Math.sin(s.heading), 0, -Math.cos(s.heading))

    // ---- 動き ----
    let pose: Pose
    if (phase === 'drop' || phase === 'deploy') {
      pose = deployPose(phase === 'deploy' ? Math.min(1, T / DEPLOY_SEC) : 0)
      const ground = meshHeight(terrain, s.x, s.z)
      if (!s.dropped) {
        s.vy -= g * dt
        s.y += s.vy * dt
        if (s.y <= ground) {
          s.y = ground
          s.squashV = Math.min(1.2, -s.vy) * 0.6
          s.vy = 0
          s.dropped = true
          s.burst = 1
        }
      } else s.y = ground
      if (phase === 'drop' && s.dropped && T > 1.4) setRoverPhase('deploy')
      if (phase === 'deploy' && T >= DEPLOY_SEC) setRoverPhase('drive')
    } else {
      // 運転
      const inp = roverInput
      const busy = s.sampleT >= 0
      const steerTarget = busy ? 0 : inp.steer
      s.steer += (steerTarget - s.steer) * Math.min(1, dt * 6)
      if (s.grounded) {
        const th = busy ? 0 : inp.throttle
        if (busy) s.speed *= 1 - Math.min(1, dt * 8)
        if (th > 0) s.speed += (s.speed < 0 ? 14 : 7 * Math.max(0.15, 1 - s.speed / ROVER_TOP)) * dt
        else if (th < 0) s.speed -= (s.speed > 0 ? 14 : 4) * dt
        else s.speed -= Math.sign(s.speed) * Math.min(Math.abs(s.speed), 2.2 * dt)
        // 坂：登りは遅く、下りは速く
        s.speed -= g * Math.sin(s.pitch) * dt * 0.6
        s.speed = THREE.MathUtils.clamp(s.speed, -6, ROVER_TOP)
        // 速いほど大回り。4 輪（前後）を逆向きに切るので、遅いときは小回りがきく
        const R = 2.6 + Math.abs(s.speed) * 0.32
        s.heading -= s.steer * (s.speed / R) * dt
        if (inp.jump && !busy) {
          // ぴょーん（重力の弱い星ほど高く、長く飛ぶ）
          s.vy = 3.2 + Math.abs(s.speed) * 0.08
          s.grounded = false
          s.squashV = -0.4
        }
      }
      inp.jump = false
      const prevGround = meshHeight(terrain, s.x, s.z)
      let nx = s.x + fwd.x * s.speed * dt
      let nz = s.z + fwd.z * s.speed * dt
      // 範囲の端と、着陸船の脚
      if (Math.abs(nx) > ROVER_RANGE || Math.abs(nz) > ROVER_RANGE) {
        nx = THREE.MathUtils.clamp(nx, -ROVER_RANGE, ROVER_RANGE)
        nz = THREE.MathUtils.clamp(nz, -ROVER_RANGE, ROVER_RANGE)
        s.speed *= 0.5
      }
      for (const f of feet) {
        const dx = nx - f.x
        const dz = nz - f.y
        const d = Math.hypot(dx, dz)
        if (d < 1.6 && d > 1e-4) {
          nx = f.x + (dx / d) * 1.6
          nz = f.y + (dz / d) * 1.6
          s.speed *= 0.7
        }
      }
      s.x = nx
      s.z = nz
      const ground = meshHeight(terrain, s.x, s.z)
      const groundVy = (ground - prevGround) / Math.max(dt, 1e-3)
      // 縦の動き：地面が落ちていく速さより遅く落ちれば宙に浮く（坂の頂上で飛び出す）
      s.vy -= g * dt
      s.y += s.vy * dt
      const wasAir = !s.grounded
      if (s.y <= ground) {
        const impact = Math.max(0, groundVy - s.vy)
        s.y = ground
        s.vy = Math.max(s.vy, Math.min(groundVy, 9))
        if (wasAir && impact > 1.2) {
          s.squashV = Math.min(1.5, impact * 0.18)
          s.burst = Math.min(1, impact / 5)
        }
        s.grounded = true
      } else s.grounded = s.y - ground < 0.03
      // 地面の傾き（前後・左右の 4 点）
      const sideX = -fwd.z
      const sideZ = fwd.x
      if (s.grounded) {
        const hF = meshHeight(terrain, s.x + fwd.x * 0.72, s.z + fwd.z * 0.72)
        const hB = meshHeight(terrain, s.x - fwd.x * 0.72, s.z - fwd.z * 0.72)
        const hR = meshHeight(terrain, s.x + sideX * 0.5, s.z + sideZ * 0.5)
        const hL = meshHeight(terrain, s.x - sideX * 0.5, s.z - sideZ * 0.5)
        const k = Math.min(1, dt * 14)
        s.pitch += (Math.atan2(hF - hB, 1.44) - s.pitch) * k
        s.roll += (Math.atan2(hR - hL, 1.0) - s.roll) * k
      } else {
        // 宙では少しずつ水平に
        s.pitch += (Math.min(0.25, Math.max(-0.35, s.vy * 0.04)) - s.pitch) * Math.min(1, dt * 1.2)
        s.roll *= 1 - Math.min(1, dt * 1.5)
      }
      s.spin -= (s.speed * dt) / WHEEL_R
      // 止まってしばらくするとアームを伸ばし、走り出すとたたむ
      s.still = Math.abs(s.speed) < 0.3 ? s.still + dt : 0
      s.arm += ((s.still > 1.5 ? 1 : 0) - s.arm) * Math.min(1, dt * (s.still > 1.5 ? 0.8 : 3))
      pose = deployPose(1)
      pose.arm = ARM_STOW.map((p, i) => p + (ARM_WORK[i] - p) * s.arm)

      // ---- 採集：アームの先が届く岩を探す。E／ボタンで採集 ----
      const reachX = s.x + fwd.x * 1.1 + sideX * 0.2
      const reachZ = s.z + fwd.z * 1.1 + sideZ * 0.2
      let near = -1
      let nearD = 0.95
      let next = -1
      let nextD = Infinity
      for (let i = 0; i < sites.length; i++) {
        if (taken.current.has(i)) continue
        const st2 = sites[i]
        const d = Math.hypot(st2.x - s.x, st2.z - s.z)
        if (d < nextD) {
          nextD = d
          next = i
        }
        const r = Math.hypot(st2.x - reachX, st2.z - reachZ)
        if (r < nearD && s.grounded && Math.abs(s.speed) < 0.8) {
          nearD = r
          near = i
        }
      }
      if (inp.sample && near >= 0 && !busy) {
        s.sampleT = 0
        s.sampleIdx = near
        s.still = 0
      }
      inp.sample = false
      if (s.sampleT >= 0) {
        s.sampleT += dt
        const site = sites[s.sampleIdx]
        // 岩の向き（ローバーの正面から右回り）に、肩を回す
        const dx = site.x - (s.x + sideX * 0.22)
        const dz = site.z - (s.z + sideZ * 0.22)
        const rel = Math.atan2(dx * sideX + dz * sideZ, dx * fwd.x + dz * fwd.z)
        const reach = [THREE.MathUtils.clamp(rel, -50 * D, 60 * D), ...ARM_REACH.slice(1)]
        const w = s.sampleT < REACH ? ease(0, REACH, s.sampleT) : s.sampleT < GRIP ? 1 : 1 - ease(GRIP, DONE, s.sampleT)
        pose.arm = pose.arm.map((p, i) => p + (reach[i] - p) * w)
        if (s.sampleT >= DONE) {
          taken.current.add(s.sampleIdx)
          // 採った岩は、このフレームの「近い岩」「次の岩」から外す（次の岩は、計器を次に書き換えるときに選び直す）
          near = -1
          if (next === s.sampleIdx) next = -1
          useSampleLog.getState().add(def.id, site.kind.id)
          useRover.setState({ result: site.kind.id })
          s.sampleT = -1
          s.sampleIdx = -1
        }
      }
      if (useRover.getState().canSample !== (near >= 0 && s.sampleT < 0) || useRover.getState().sampling !== s.sampleT >= 0)
        useRover.setState({ canSample: near >= 0 && s.sampleT < 0, sampling: s.sampleT >= 0 })
      // 砂ぼこり：走っている車輪から（速いほど多く、後ろへ）
      if (s.grounded && def.dust && Math.abs(s.speed) > 1) {
        const k = Math.min(1, Math.abs(s.speed) / ROVER_TOP)
        const n = Math.floor(dt * (level === 'low' ? 40 : 90) * k + Math.random())
        for (let i = 0; i < n; i++) {
          const side = Math.random() < 0.5 ? 1 : -1
          const back = Math.random() < 0.5 ? -0.72 : 0
          const px = s.x + sideX * 0.5 * side + fwd.x * back
          const pz = s.z + sideZ * 0.5 * side + fwd.z * back
          dust.puff(px, ground, pz, -fwd.x * s.speed * 0.25, 0.6 + k * 1.6, -fwd.z * s.speed * 0.25, 0.35 + k * 0.6)
        }
      }
      // 計器：1 秒に 12 回だけ書き換える
      s.hudT += dt
      if (s.hudT > 1 / 12) {
        s.hudT = 0
        const deg = (v: number) => Math.round((v * 180) / Math.PI)
        useRover.setState({
          kmh: Math.round(Math.abs(s.speed) * 3.6),
          hud: {
            hdg: ((Math.round((-s.heading * 180) / Math.PI) % 360) + 360) % 360,
            pitch: deg(s.pitch),
            roll: deg(s.roll),
            dist: Math.round(Math.hypot(s.x - LANDER_POS.x, s.z - LANDER_POS.y)),
            air: !s.grounded,
          },
          next:
            next >= 0
              ? {
                  dist: Math.round(nextD),
                  rel: Math.round(
                    (Math.atan2((sites[next].x - s.x) * sideX + (sites[next].z - s.z) * sideZ, (sites[next].x - s.x) * fwd.x + (sites[next].z - s.z) * fwd.z) * 180) / Math.PI,
                  ),
                }
              : null,
        })
      }
    }
    // 着地の砂ぼこり
    if (s.burst > 0 && def.dust) {
      const n = Math.round(30 * s.burst)
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const v = 1.5 + Math.random() * 2.5
        dust.puff(s.x + Math.cos(a) * 0.6, s.y, s.z + Math.sin(a) * 0.6, Math.cos(a) * v, 0.5 + Math.random(), Math.sin(a) * v, 0.6)
      }
      s.burst = 0
    }
    // サスペンションのばね（沈み込み → もどる）
    s.squashV += (-s.squash * 160 - s.squashV * 14) * dt
    s.squash += s.squashV * dt
    s.squash = THREE.MathUtils.clamp(s.squash, -0.05, 0.12)

    applyPose(rig, pose, s.squash)
    grp.position.set(s.x, s.y, s.z)
    grp.rotation.set(s.pitch, s.heading, s.roll, 'YXZ')
    for (const k of Object.keys(rig.wheels)) {
      const w = rig.wheels[k]
      w.rotation.x = s.spin
      w.rotation.y = k[0] === 'F' ? -s.steer * 0.35 : k[0] === 'R' ? s.steer * 0.35 : 0
    }
    roverFocus.set(s.x, s.y, s.z)

    // ---- 採集の小さなかけら：岩 → アームの先 → 車体の上の取り入れ口 ----
    const c = chip.current
    if (c) {
      c.visible = s.sampleT >= REACH * 0.9 && s.sampleT < DONE
      if (c.visible) {
        const site = sites[s.sampleIdx]
        built.model.updateMatrixWorld(true)
        const hand = rig.arm[3].localToWorld(PROPS.tmp.set(0, 0, -0.17))
        if (s.sampleT < GRIP) {
          const u = ease(REACH * 0.9, GRIP, s.sampleT)
          c.position.set(site.x, site.y + site.size * 0.8, site.z).lerp(hand, u)
        } else c.position.copy(hand)
        c.scale.setScalar(0.045 * (1 - ease(DONE - 0.25, DONE, s.sampleT)))
        ;(c.material as THREE.MeshStandardMaterial).color.set(site.kind.color)
      }
    }
    const tm = roverNow()
    beacons.current.forEach((b, i) => {
      if (!b) return
      b.visible = !taken.current.has(i) && phase === 'drive'
      if (!b.visible) return
      const d = Math.hypot(sites[i].x - s.x, sites[i].z - s.z)
      // 遠くからも見えるよう、遠いほど太く高く。近づくと薄く
      const k = THREE.MathUtils.clamp(d / 40, 0.6, 3)
      b.scale.set(k, 5 + k * 4, k)
      rocks.beaconMat.opacity = 0.22 + 0.12 * Math.sin(tm * 3)
    })

    // ---- ライト（夜は前照灯で地面を照らす） ----
    const sp = lights.current
    if (sp) {
      sp.intensity = sky.night * 60
      PROPS.tmp.set(0, 0.6, -0.7)
      grp.localToWorld(sp.position.copy(PROPS.tmp))
      grp.localToWorld(sp.target.position.set(0, -0.6, -8))
      sp.target.updateMatrixWorld()
    }

    // ---- 砂ぼこりの色と大きさ ----
    const cam = state.camera as THREE.PerspectiveCamera
    dust.material.uniforms.uScale.value = (state.size.height * state.viewport.dpr) / (2 * Math.tan((cam.fov * Math.PI) / 360))
    dust.update(dt)
    const lit = Math.max(0.15, Math.min(1, sky.sunDir.y * 3 + 0.2))
    dust.material.uniforms.uColor.value.copy(dustBase).multiplyScalar(lit * 0.95)
    dust.material.uniforms.uShadow.value.copy(dustBase).multiplyScalar(lit * 0.4 + 0.04)
    dust.material.uniforms.uSunView.value.copy(sky.sunDir).transformDirection(cam.matrixWorldInverse)

    // ---- カメラ ----
    const lphase = useLanding.getState().phase
    if (lphase !== 'surface') return
    const camPos = PROPS.cam
    const look = PROPS.look
    const k = 1 - Math.exp(-dt * 5)
    if (phase === 'drive' && view === 'cam') {
      // マストのカメラから（頭は隠す）
      rig.head.visible = false
      rig.head.getWorldPosition(camPos)
      rig.head.getWorldQuaternion(PROPS.q)
      cam.position.copy(camPos).add(PROPS.tmp.set(0, 0.03, -0.08).applyQuaternion(PROPS.q))
      cam.quaternion.copy(PROPS.q)
      if (cam.fov !== 72) {
        cam.fov = 72
        cam.updateProjectionMatrix()
      }
      return
    }
    rig.head.visible = true
    if (phase === 'drive' && s.sampleT >= 0) {
      // 採集中：右ななめ前から、アームが岩を拾うところを見せる
      const sx = -fwd.z
      const sz = fwd.x
      camPos.set(s.x + fwd.x * 2.4 + sx * 2.3, s.y + 1.25, s.z + fwd.z * 2.4 + sz * 2.3)
      look.set(s.x + fwd.x * 0.9 + sx * 0.2, s.y + 0.35, s.z + fwd.z * 0.9 + sz * 0.2)
    } else if (phase === 'drive') {
      // 後ろから追う。速いほど少し引いて低く
      const v = Math.min(1, Math.abs(s.speed) / ROVER_TOP)
      const back = 5.2 + v * 2.2
      camPos.set(s.x - fwd.x * back, s.y + 2.1 - v * 0.4, s.z - fwd.z * back)
      look.set(s.x + fwd.x * 2, s.y + 0.9, s.z + fwd.z * 2)
    } else {
      // 落下と展開：着陸船の腹の下を、外（ローバーの前のななめ）から見る。展開中はゆっくり寄る
      const a = s.heading + 0.45 - (phase === 'deploy' ? Math.min(1, T / DEPLOY_SEC) * 0.35 : 0)
      const dist = phase === 'deploy' ? 8 - Math.min(1, T / DEPLOY_SEC) * 2.5 : 8
      camPos.set(s.x - Math.sin(a) * dist, s.y + 1.3, s.z - Math.cos(a) * dist)
      look.set(s.x, s.y + 0.6, s.z)
    }
    const minY = meshHeight(terrain, camPos.x, camPos.z) + 0.6
    if (camPos.y < minY) camPos.y = minY
    const first = (cam.userData.roverCam ?? 0) < roverNow() - 0.5
    cam.userData.roverCam = roverNow()
    if (first) cam.position.copy(camPos)
    else cam.position.lerp(camPos, k)
    cam.lookAt(look)
    const fov = phase === 'drive' ? 58 + Math.min(1, Math.abs(s.speed) / ROVER_TOP) * 8 : 50
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov += (fov - cam.fov) * k
      cam.updateProjectionMatrix()
    }
  })

  return (
    <>
      <group ref={group} visible={false} name="surface-rover">
        <primitive object={built.model} />
      </group>
      <spotLight ref={lights} color="#fff1dc" angle={0.6} penumbra={0.6} distance={40} decay={2} intensity={0} />
      <primitive object={dust.points} />
      {sites.map((site, i) => (
        <group key={i} position={[site.x, site.y, site.z]}>
          <mesh geometry={rocks.items[i].geo} material={rocks.items[i].mat} scale={[site.size, site.size * 0.7, site.size * 0.9]} rotation={[0, site.rot, 0]} castShadow receiveShadow />
          <mesh
            ref={(el) => {
              beacons.current[i] = el
            }}
            geometry={rocks.beaconGeo}
            material={rocks.beaconMat}
            renderOrder={3}
            frustumCulled={false}
          />
        </group>
      ))}
      <mesh ref={chip} geometry={rocks.chipGeo} material={rocks.chipMat} visible={false} castShadow />
    </>
  )
}

useGLTF.preload(url('rover-orv7.glb'))
