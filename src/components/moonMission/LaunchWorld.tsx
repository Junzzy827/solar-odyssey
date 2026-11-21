import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { R_EARTH, PAD_LAT, OMEGA, altitude } from '../../data/saturnAscent'
import { sim, tickMission, useMoonMission, autoCam, COUNT_FROM } from '../../state/moonMission'
import { musicTime } from '../../audio/missionMusic'
import { lowMemory } from '../../state/quality'
import { plumeGeometry, plumeMaterial, glowTexture } from './plume'
import { Smoke, STEAM, ICE } from './smoke'
import { atmosphereMaterial, earthMaterial } from './earth'
import { FILM_CUTS, FILM_END, filmCut, filmForce, filmRig, filmShake } from './launchFilm'

// 打ち上げの場面の 3D：夜の発射台（移動発射台・発射塔・照明・海）、サターンV、炎と煙、地球、月、星。
//
// 座標：ロケットをいつも原点に置く（遠くまで行っても数字が大きくならない）。
// three の x が東、y が打ち上げの瞬間の上、z が南。物理（data/saturnAscent）の (x: 上, y: 東) は three の (y, x) になる。
// 地上の物（発射台・地面・煙・照明）は「地面の組」に入れて、地球の自転と一緒に回す。

const base = import.meta.env.BASE_URL
const ROCKET_URL = `${base}models/saturn.glb`
const PAD_URL = `${base}models/launchpad.glb`
/** 移動発射台の甲板の下の、発射台の地面の高さ（m、ロケットの根元が 0） */
const GROUND_Y = -13.8
/** 発射台の地面の組の回る速さ（rad/s）：打ち上げの面の中での地球の自転 */
const SPIN = OMEGA * Math.cos((PAD_LAT * Math.PI) / 180)
/** 打ち上げの瞬間に地球の反対側にある太陽の向き（three の座標）。軌道に入って 20 分ほどで日の出になる向き */
const SUN = new THREE.Vector3(-0.5, -0.866, 0.16).normalize()
/** 液体酸素の換気口（機体の高さ m、半径 m、1 秒に出す湯気の数）。発射台では白い蒸気が流れ出て、ゆっくり沈む */
const VENTS: [number, number, number][] = [
  [38, 5.2, 7],
  [63, 5.2, 6],
  [83, 3.4, 5],
]
/** dt 秒に平均 rate 個（端数は確率で） */
const count = (rate: number, dt: number) => Math.floor(rate * dt + Math.random())

/** 月の向きと距離（月へ向かう燃焼の先の、遠い所の向きに置く） */
const MOON_DIST = 384_400_000
const MOON_R = 1_737_400

/** 発射場（北緯 28.6°・西経 80.6°）を上に、東を +x、北を -z に向ける地球の向き */
function padQuaternion() {
  const lat = (PAD_LAT * Math.PI) / 180
  const lon = (-80.6 * Math.PI) / 180
  const p = new THREE.Vector3(Math.cos(lon) * Math.cos(lat), Math.sin(lat), -Math.sin(lon) * Math.cos(lat))
  const east = new THREE.Vector3(-Math.sin(lon), 0, -Math.cos(lon))
  const north = new THREE.Vector3(-Math.sin(lat) * Math.cos(lon), Math.cos(lat), Math.sin(lat) * Math.sin(lon))
  const south = north.clone().negate()
  const m = new THREE.Matrix4().makeBasis(east, p, south).transpose()
  return new THREE.Quaternion().setFromRotationMatrix(m)
}

/** 物理の点（上, 東）を、ロケットからの three の位置へ */
function toWorld(sx: number, sy: number, out: THREE.Vector3) {
  return out.set(sy - sim.a.y, sx - sim.a.x, 0)
}

const _v = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _v3 = new THREE.Vector3()
const _q = new THREE.Quaternion()
const Y = new THREE.Vector3(0, 1, 0)
const Z = new THREE.Vector3(0, 0, 1)

/** ロケットの局所の向き：上（地球の中心から）・東・機首 */
function frame() {
  const r = Math.hypot(sim.a.x, sim.a.y)
  const up = new THREE.Vector3(sim.a.y / r, sim.a.x / r, 0)
  const east = new THREE.Vector3(sim.a.x / r, -sim.a.y / r, 0)
  const th = (sim.pitch * Math.PI) / 180
  const nose = up.clone().multiplyScalar(Math.cos(th)).addScaledVector(east, Math.sin(th))
  return { up, east, nose }
}

type Debris = { name: string; obj: THREE.Object3D; x: number; y: number; vx: number; vy: number; t0: number; spin: THREE.Vector3; push: number; dir: THREE.Vector3 }

export function LaunchWorld() {
  const rocket = useGLTF(ROCKET_URL)
  const padGltf = useGLTF(PAD_URL)
  const small = lowMemory()
  const [day, night, clouds, stars] = useTexture([
    `${base}textures/${small ? '2k' : '4k'}_earth_daymap.jpg`,
    `${base}textures/${small ? '2k' : '4k'}_earth_nightmap.jpg`,
    `${base}textures/${small ? '2k' : '4k'}_earth_clouds.jpg`,
    `${base}textures/2k_stars_milky_way.jpg`,
  ])
  useMemo(() => {
    for (const t of [day, night, stars]) t.colorSpace = THREE.SRGBColorSpace
    for (const t of [day, night, clouds]) t.anisotropy = 4
  }, [day, night, clouds, stars])
  const { camera, size } = useThree()

  // ---- 組み立て ----
  const parts = useMemo(() => {
    const root = rocket.scene.clone(true)
    const byName: Record<string, THREE.Object3D> = {}
    root.traverse((o) => {
      if (['S1', 'Ring', 'S2', 'S3', 'CSM', 'LES'].includes(o.name)) byName[o.name] = o
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (m && 'envMapIntensity' in m) m.envMapIntensity = 0.4
    })
    return { root, byName }
  }, [rocket])
  const pad = useMemo(() => {
    const root = padGltf.scene.clone(true)
    // 甲板の灰色は、照明の真下で白く飛ばないよう、鋼の暗い灰色にする（読み込んだ素材は複製してから変える）
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((x) => {
        if (x.name !== 'Grey') return x
        const c = (x as THREE.MeshStandardMaterial).clone()
        c.color.multiplyScalar(0.45)
        c.roughness = 0.85
        return c
      })
      m.material = Array.isArray(m.material) ? mats : mats[0]
    })
    return root
  }, [padGltf])

  const plumes = useMemo(() => {
    const geo = plumeGeometry()
    const f1 = plumeMaterial({ core: '#fff4d0', edge: '#ff7a1c', soft: 0.9 })
    const big = plumeMaterial({ core: '#ffd890', edge: '#ff5a10', soft: 1.4 })
    const j2 = plumeMaterial({ core: '#b8c4ff', edge: '#3a48d8', soft: 1.8 })
    const les = plumeMaterial({ core: '#fff0c0', edge: '#ff8a30', soft: 1.0 })
    return { geo, f1, big, j2, les }
  }, [])
  const smoke = useMemo(() => new Smoke(small ? 640 : 1800, GROUND_Y + 1), [small])
  useEffect(() => () => smoke.dispose(), [smoke])

  const earthMat = useMemo(() => earthMaterial(day, night, clouds), [day, night, clouds])
  const atmoMat = useMemo(() => atmosphereMaterial(), [])
  const padQ = useMemo(() => padQuaternion(), [])

  // 発射台のまわりの夜の明かり（町・道路）。地面の組の座標
  const cityLights = useMemo(() => {
    const n = small ? 500 : 1400
    const pos = new Float32Array(n * 3)
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      // 西と南の陸に、ところどころ集まった町
      const town = i % 7
      const cx = -9000 - town * 2600 + (town % 2) * 4000
      const cz = -12000 + town * 5200
      const r = 400 + Math.random() * (town === 3 ? 6000 : 2200)
      const a = Math.random() * Math.PI * 2
      pos[i * 3] = Math.min(-600, cx + Math.cos(a) * r)
      pos[i * 3 + 1] = GROUND_Y + 2
      pos[i * 3 + 2] = cz + Math.sin(a) * r
      const w = 0.7 + Math.random() * 0.3
      col[i * 3] = w
      col[i * 3 + 1] = w * (0.72 + Math.random() * 0.15)
      col[i * 3 + 2] = w * 0.45
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }, [small])

  // 照明の光の柱（地面から斜めにロケットを照らす）
  const beams = useMemo(() => {
    const out: { pos: THREE.Vector3; mid: THREE.Vector3; quat: THREE.Quaternion; len: number }[] = []
    for (const [x, z] of [
      [-260, 230],
      [240, 260],
      [-300, -200],
    ]) {
      const from = new THREE.Vector3(x, GROUND_Y + 2, z)
      const to = new THREE.Vector3(0, 60, 0)
      const d = to.clone().sub(from)
      const len = d.length()
      const quat = new THREE.Quaternion().setFromUnitVectors(Y, d.normalize())
      // 円柱は真ん中が原点なので、光の柱の真ん中に置く（太い側がロケット）
      out.push({ pos: from, mid: from.clone().addScaledVector(d, len / 2), quat, len })
    }
    return out
  }, [])
  const beamMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          #include <common>
          #include <logdepthbuf_pars_vertex>
          varying float vS; varying vec3 vN; varying vec3 vV;
          void main(){ vS = uv.y; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix*mv;
            #include <logdepthbuf_vertex>
          }`,
        fragmentShader: /* glsl */ `
          #include <common>
          #include <logdepthbuf_pars_fragment>
          uniform float uPower; varying float vS; varying vec3 vN; varying vec3 vV;
          void main(){
            #include <logdepthbuf_fragment>
            float a = pow(abs(dot(normalize(vN), normalize(vV))), 2.0) * (1.0 - vS) * 0.05 * uPower;
            gl_FragColor = vec4(vec3(0.75, 0.82, 1.0) * a, a);
          }`,
        uniforms: { uPower: { value: 1 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [],
  )

  const ground = useRef<THREE.Group>(null)
  const rocketG = useRef<THREE.Group>(null)
  const earthM = useRef<THREE.Mesh>(null)
  const atmoM = useRef<THREE.Mesh>(null)
  const moonM = useRef<THREE.Mesh>(null)
  const starsM = useRef<THREE.Mesh>(null)
  const f1 = useRef<THREE.Group>(null)
  const bigPlume = useRef<THREE.Mesh>(null)
  const j2s = useRef<THREE.Group>(null)
  const j3 = useRef<THREE.Mesh>(null)
  const lesFlame = useRef<THREE.Mesh>(null)
  const flameLight = useRef<THREE.PointLight>(null)
  const fill = useRef<THREE.DirectionalLight>(null)
  const camLight = useRef<THREE.PointLight>(null)
  const spots = useRef<THREE.Group>(null)
  const debrisG = useRef<THREE.Group>(null)
  const debris = useRef<Debris[]>([])
  const ignite = useRef(0)
  const camState = useRef({ pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), fov: 40, init: false })
  /** 映画のカメラ：いまのカット、秒読みを始めてからの秒（離昇の後は実際の秒で進める）、カットの始まり */
  const filmS = useRef({ idx: 0, f: 0, cutAt: 0 })

  // 打ち上げのたびに、切り離した段をもとにもどす
  const phase = useMoonMission((s) => s.phase)
  useEffect(() => {
    if (phase !== 'pad') return
    for (const d of debris.current) {
      parts.byName[d.name] && parts.root.add(parts.byName[d.name])
      parts.byName[d.name] && parts.byName[d.name].position.set(0, 0, 0)
      parts.byName[d.name] && parts.byName[d.name].quaternion.identity()
    }
    debris.current = []
    for (const n of Object.keys(parts.byName)) parts.byName[n].visible = true
    camState.current.init = false
    filmS.current = { idx: 0, f: 0, cutAt: 0 }
    ignite.current = 0
  }, [phase, parts])

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    tickMission(dt)
    const s = useMoonMission.getState()
    const a = sim.a
    const t = state.clock.elapsedTime
    const h = altitude(a)
    const { up, east, nose } = frame()

    // ---- 切り離し（物理の出来事を読む） ----
    for (const e of sim.events) {
      const name = e === 'stage1Sep' ? 'S1' : e === 'interstage' ? 'Ring' : e === 'les' ? 'LES' : e === 'stage2Sep' ? 'S2' : null
      if (!name || !parts.byName[name] || !debrisG.current || !rocketG.current) continue
      const obj = parts.byName[name]
      debrisG.current.add(obj)
      obj.position.set(0, 0, 0)
      obj.quaternion.copy(rocketG.current.quaternion)
      const spin = new THREE.Vector3((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.08)
      // 脱出塔は自分のロケットで前へ飛び出し、段間部と段は後ろへ離れていく
      const push = name === 'LES' ? 30 : name === 'Ring' ? -3 : -5
      debris.current.push({ name, obj, x: a.x, y: a.y, vx: a.vx, vy: a.vy, t0: a.t, spin, push, dir: nose.clone() })
      if (name === 'S1') {
        ignite.current = 0
        if (!s.camLocked) autoCam('onboard')
      }
    }
    sim.events.length = 0
    // 切り離した物は、自分の速さで飛びながら、空気に止められて離れていく
    for (const d of debris.current) {
      const age = a.t - d.t0
      const r = Math.hypot(d.x, d.y)
      const g = 3.986004e14 / (r * r)
      const rho = r - R_EARTH < 120_000 ? 1.225 * Math.exp(-(r - R_EARTH) / 7200) : 0
      const sp = Math.hypot(d.vx, d.vy)
      const drag = rho * sp * 0.004
      const kick = age < (d.name === 'LES' ? 4 : 1.2) ? d.push : 0
      const steps = Math.max(1, Math.ceil((dt * sim.warp) / 0.05))
      const hh = (dt * sim.warp) / steps
      for (let i = 0; i < steps; i++) {
        d.vx += (-g * (d.x / r) - drag * d.vx + kick * d.dir.y) * hh
        d.vy += (-g * (d.y / r) - drag * d.vy + kick * d.dir.x) * hh
        d.x += d.vx * hh
        d.y += d.vy * hh
      }
      toWorld(d.x, d.y, d.obj.position)
      _q.setFromAxisAngle(_v.copy(d.spin).normalize(), d.spin.length() * dt * sim.warp)
      d.obj.quaternion.premultiply(_q)
      d.obj.visible = d.obj.position.length() < 60_000
    }

    // ---- ロケット ----
    if (rocketG.current) rocketG.current.quaternion.setFromUnitVectors(Y, nose)

    // ---- 地面の組（発射台・地面・煙）：地球と一緒に回る ----
    const spinAng = SPIN * a.t
    const padX = R_EARTH * Math.cos(spinAng)
    const padY = R_EARTH * Math.sin(spinAng)
    if (ground.current) {
      toWorld(padX, padY, ground.current.position)
      ground.current.rotation.set(0, 0, -spinAng)
      ground.current.visible = h < 250_000
    }
    // ---- 地球 ----
    if (earthM.current && atmoM.current) {
      toWorld(0, 0, earthM.current.position)
      earthM.current.quaternion.setFromAxisAngle(Z, -spinAng).multiply(padQ)
      // 地上の近くでは、地面の組を見せる（地球の粗い地図は少し下げて重ならないように）
      earthM.current.scale.setScalar(h < 3000 ? 0.9997 : 1)
      atmoM.current.position.copy(earthM.current.position)
      earthMat.uniforms.uSun.value.copy(SUN)
      earthMat.uniforms.uNear.value = THREE.MathUtils.clamp(1 - h / 60_000, 0, 1)
      earthMat.uniforms.uNear2.value = THREE.MathUtils.clamp(1 - h / 2_000_000, 0, 1)
      earthMat.uniforms.uLights.value = THREE.MathUtils.smoothstep(h, 60_000, 900_000) * 0.85 + 0.15
      atmoMat.uniforms.uSun.value.copy(SUN)
    }
    if (moonM.current) {
      // 月：月へ向かう燃焼の向きのずっと先（燃焼が終わったあとの道の遠い所の向き）
      const ang = Math.atan2(a.y, a.x) + Math.PI
      toWorld(Math.cos(ang) * MOON_DIST, Math.sin(ang) * MOON_DIST, moonM.current.position)
      moonM.current.visible = s.phase === 'outbound' || s.phase === 'tli'
    }
    if (starsM.current) starsM.current.position.copy(camera.position)
    // 日の出：太陽が地平線の上に出たとき
    if (!sim.sunrise && s.phase === 'orbit' && up.dot(SUN) > -0.06) {
      sim.sunrise = true
      useMoonMission.setState({ caption: { key: 'sunrise', at: performance.now() / 1000 } })
    }

    // ---- 炎 ----
    const pressure = Math.exp(-h / 7200)
    const expand = THREE.MathUtils.clamp(1 - pressure, 0, 1)
    if (s.phase === 'pad' && s.ignitedAt !== null) ignite.current = THREE.MathUtils.clamp((s.ignitedAt - s.countdown) / (s.ignitedAt - 0.2), 0, 1)
    if (s.phase === 'ascent') ignite.current = 1
    const s1On = (s.phase === 'pad' ? ignite.current : 1) * (a.stage === 0 && a.thrust > 0 || (s.phase === 'pad' && ignite.current > 0) ? 1 : 0)
    const centerOff = a.stage === 0 && a.t >= 135.5
    if (f1.current) {
      f1.current.visible = s1On > 0
      f1.current.children.forEach((c, i) => {
        c.visible = !(i === 0 && centerOff)
        c.scale.set(1.8, 9 + 30 * expand + Math.sin(t * 40 + i) * 0.6, 1.8)
      })
    }
    plumes.f1.uniforms.uTime.value = t
    plumes.f1.uniforms.uPower.value = 1.6 * s1On
    plumes.f1.uniforms.uExpand.value = expand * 0.4
    if (bigPlume.current) {
      bigPlume.current.visible = s1On > 0
      const len = 70 + 230 * expand
      bigPlume.current.scale.set(5.5 + 4 * expand, len * (s.phase === 'pad' ? 0.25 + 0.75 * ignite.current : 1), 5.5 + 4 * expand)
      bigPlume.current.position.y = -2
    }
    plumes.big.uniforms.uTime.value = t
    plumes.big.uniforms.uPower.value = (1.0 - 0.5 * expand) * s1On
    plumes.big.uniforms.uExpand.value = expand * 2.2
    const s2On = a.stage === 1 && a.thrust > 0
    const s3On = a.stage === 2 && a.thrust > 0
    if (j2s.current) {
      j2s.current.visible = s2On
      j2s.current.children.forEach((c) => c.scale.set(1.05, 18 + 50 * expand, 1.05))
    }
    if (j3.current) {
      j3.current.visible = s3On
      j3.current.scale.set(1.1, 20 + 50 * expand, 1.1)
    }
    plumes.j2.uniforms.uTime.value = t
    plumes.j2.uniforms.uPower.value = 0.45
    plumes.j2.uniforms.uExpand.value = expand * 2.5
    if (lesFlame.current) {
      const les = debris.current.find((d) => d.name === 'LES')
      lesFlame.current.visible = !!les && a.t - les.t0 < 4
      if (les && lesFlame.current.visible) {
        lesFlame.current.position.copy(les.obj.position).addScaledVector(les.dir, 104.6)
        lesFlame.current.quaternion.setFromUnitVectors(Y, les.dir)
        lesFlame.current.scale.set(0.9, 14, 0.9)
      }
    }
    plumes.les.uniforms.uTime.value = t
    plumes.les.uniforms.uPower.value = 1.4
    if (flameLight.current) {
      flameLight.current.intensity = (s1On > 0 ? 2.5e6 * (0.85 + 0.15 * Math.sin(t * 37)) : 0) * (0.25 + 0.75 * ignite.current)
      flameLight.current.position.set(0, -25, 0)
    }
    if (spots.current) spots.current.visible = h < 20_000
    if (fill.current) {
      // 南の上から（three の z が南）。地球の向こうから照らさないよう、いつも局所の上寄り
      fill.current.position.copy(up).multiplyScalar(0.8).add(_v.set(0, 0, 0.6)).multiplyScalar(1000)
      fill.current.intensity = s.phase === 'pad' ? 0.15 : 0.9
    }
    if (camLight.current) {
      // 機体カメラの見る先（切り離した段）を、少しだけ照らす
      camLight.current.intensity = s.cam === 'onboard' ? 4e4 : 0
      camLight.current.position.copy(nose).multiplyScalar(30).add(_v.set(0, 0, 14))
    }

    // ---- 煙 ----
    const flameGround = _v
    if (ground.current) {
      ground.current.worldToLocal(flameGround.set(0, 0, 0).addScaledVector(nose, -20))
      smoke.material.uniforms.uFlame.value.copy(flameGround)
      smoke.material.uniforms.uFlamePower.value = s1On > 0 ? 1.4 * Math.max(0.15, 1 - h / 6000) : 0
      smoke.material.uniforms.uAmb.value = h < 20_000 ? 1 : 0
      // 液体酸素の冷たい蒸気：離昇まで、換気口から東西へ流れ出る
      if (s.phase === 'pad') {
        for (const [y, r, rate] of VENTS) {
          for (let i = count(rate, dt); i > 0; i--) {
            const side = Math.random() < 0.5 ? -1 : 1
            smoke.emit(side * r, y + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, side * (1.2 + Math.random() * 1.6), -0.3, (Math.random() - 0.5) * 1.2, 2 + Math.random() * 2, 6 + Math.random() * 3, 1.5, STEAM)
          }
        }
      }
      if (s1On > 0 && h < 600) {
        // 炎の溝から南北へ吹き出す。3 つに 1 つは、溝に撒く水の白い湯気
        const n = Math.ceil(dt * 70 * (1 - h / 600) * ignite.current)
        for (let i = 0; i < n; i++) {
          const side = Math.random() < 0.5 ? -1 : 1
          const steam = Math.random() < 0.33
          smoke.emit((Math.random() - 0.5) * 30, GROUND_Y + 4, side * (40 + Math.random() * 20), (Math.random() - 0.5) * 14, 2 + Math.random() * 6, side * (45 + Math.random() * 40), 22 + Math.random() * 18, 16 + Math.random() * 10, 1.4, steam ? STEAM : undefined)
        }
        // 甲板の穴のまわりからも、湯気が噴き上がる
        if (h < 60) {
          for (let i = count(14 * ignite.current, dt); i > 0; i--) {
            const ang = Math.random() * Math.PI * 2
            const r = 10 + Math.random() * 8
            smoke.emit(Math.cos(ang) * r, 1.5, Math.sin(ang) * r, Math.cos(ang) * 6, 3 + Math.random() * 4, Math.sin(ang) * 6, 5 + Math.random() * 4, 7, 1.6, STEAM)
          }
        }
      }
      // 氷のかけら：点火の揺れで、冷えた機体の霜がはがれて落ちる（離昇して少しのあいだ）
      if (s1On > 0 && ignite.current > 0.6 && h < 120) {
        for (let i = count(45, dt); i > 0; i--) {
          const ang = Math.random() * Math.PI * 2
          const r = 5.15
          _v2.copy(nose).multiplyScalar(6 + Math.random() * 70).addScaledVector(east, Math.cos(ang) * r).addScaledVector(Z, Math.sin(ang) * r)
          ground.current.worldToLocal(_v2)
          smoke.emit(_v2.x, _v2.y, _v2.z, Math.cos(ang) * (0.5 + Math.random() * 2), -1 - Math.random() * 3, Math.sin(ang) * (0.5 + Math.random() * 2), 0.5 + Math.random() * 0.6, 4, 0, ICE)
        }
      }
      if (s1On > 0 && h > 20 && h < 7000) {
        // 上がっていく後ろに残る煙の柱
        const n = Math.ceil(dt * 30)
        for (let i = 0; i < n; i++) {
          ground.current.worldToLocal(_v2.set((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10).addScaledVector(nose, -60 - Math.random() * 40))
          smoke.emit(_v2.x, _v2.y, _v2.z, (Math.random() - 0.5) * 4, -2, (Math.random() - 0.5) * 4, 16 + h * 0.004, 24, 1.8)
        }
      }
    }
    smoke.update(dt * Math.min(sim.warp, 3))
    smoke.material.uniforms.uPx.value = size.height / (2 * Math.tan(((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360))

    // ---- カメラ ----
    // 自動の切り替え：高く上がったら横から、切り離しの映像の後は横にもどす
    if (s.phase === 'ascent' && !s.camLocked) {
      if (s.cam === 'pad' && h > 4500) autoCam('chase')
      if (s.cam === 'onboard' && sim.sepAt.s1 > 0 && a.t - sim.sepAt.s1 > 14) autoCam('chase')
    }
    if ((s.phase === 'orbit' || s.phase === 'tli' || s.phase === 'outbound') && (s.cam === 'pad' || s.cam === 'film')) autoCam('chase')
    const cs = camState.current
    const want = _v
    const look = _v2
    let fov = 50
    const south = new THREE.Vector3().crossVectors(east, up)
    // 映画の時計：秒読みのあいだは秒読みから、離昇の後は実際の秒（早送りに引っぱられない）
    const fs = filmS.current
    if (s.phase === 'pad') fs.f = COUNT_FROM - s.countdown
    else if (s.phase === 'ascent') fs.f = Math.max(fs.f, COUNT_FROM) + dt
    // 曲の秒：流れていれば本当の位置、なければ点火からの秒
    const ignF = s.ignitedAt === null ? null : COUNT_FROM - s.ignitedAt
    const sinceIgn = ignF === null ? null : fs.f - ignF
    const mt = sinceIgn === null ? null : musicTime('jupiterOpening') ?? sinceIgn
    let filmShakeAng = 0
    if (s.cam === 'film' && s.phase === 'ascent' && !s.camLocked && ((mt ?? 0) > FILM_END || a.t > 120)) autoCam('chase')
    if (s.cam === 'film' && ground.current) {
      const next = filmCut(fs.idx, fs.f, mt)
      if (next !== fs.idx) {
        fs.idx = next
        fs.cutAt = fs.f
        cs.init = false
      }
      const rig = filmRig(filmForce.shot ?? FILM_CUTS[fs.idx].shot, { ground: ground.current, nose, up, south, h, u: fs.f - fs.cutAt, groundY: GROUND_Y }, want, look, cs.up)
      fov = rig.fov
      // 揺れは、地上のカメラには音の速さで遅れて届く
      ground.current.getWorldPosition(_v3)
      const dist = rig.onGround ? want.distanceTo(_v3) : 0
      filmShakeAng = filmShake(sinceIgn, dist, h) * (rig.onGround ? 1 : 0.5)
    } else if (s.cam === 'pad' && ground.current) {
      // 1.2 km 先の見物の場所から、望遠で追いかける
      ground.current.localToWorld(want.set(-700, GROUND_Y + 30, 1050))
      look.copy(nose).multiplyScalar(52)
      const dist = want.distanceTo(look)
      // 地上にいるあいだは塔とロケット全体、上がったら機体を大きく追う
      const half = s.phase === 'pad' || h < 120 ? 78 : 70
      fov = THREE.MathUtils.clamp((2 * Math.atan(half / dist) * 180) / Math.PI, 0.5, 32)
      cs.up.copy(up)
    } else if (s.cam === 'onboard') {
      // 第2段（切り離しの後は第3段）の横に付けたカメラで、後ろを見下ろす（本物の分離の映像の向き）
      const mount = a.stage === 0 ? 58 : 80
      want.copy(nose).multiplyScalar(mount).addScaledVector(south, 9)
      look.copy(nose).multiplyScalar(-90).addScaledVector(south, 16)
      fov = 62
      cs.up.copy(east)
    } else if (s.cam === 'window' && s.phase !== 'ascent') {
      // 司令船の窓：先端の少し下から外を見る。地球を回るときは地平線、月へ向かうときはふりかえって小さくなる地球
      want.copy(nose).multiplyScalar(104).addScaledVector(south, 2.2)
      if (s.phase === 'outbound') {
        const toEarth = toWorld(0, 0, new THREE.Vector3()).sub(want).normalize()
        look.copy(want).add(toEarth)
        fov = 40
      } else {
        look.copy(want).addScaledVector(nose, 1).addScaledVector(up, -0.2).addScaledVector(south, 0.25)
        fov = 58
      }
      cs.up.copy(up)
    } else {
      // 横から：軌道では少し離れて、地球が下に見えるように
      const far = s.phase === 'ascent' ? 190 : s.phase === 'outbound' ? 260 : 230
      want.copy(south).multiplyScalar(far).addScaledVector(nose, s.phase === 'outbound' ? 120 : 30).addScaledVector(up, s.phase === 'ascent' ? -15 : 40)
      look.copy(nose).multiplyScalar(s.phase === 'ascent' ? 35 : 50)
      // 月へ向かうときは、ロケットの向こうに小さくなっていく地球をふりかえる
      if (s.phase === 'outbound') {
        const toEarth = toWorld(0, 0, new THREE.Vector3()).normalize()
        // 第3段と宇宙船のまん中（機首の向きに 88 m）を画面に入れ、その向こうに地球
        want.copy(nose).multiplyScalar(88).addScaledVector(toEarth, -150).addScaledVector(south, 55).addScaledVector(up, 25)
        look.copy(nose).multiplyScalar(88).addScaledVector(toEarth, 260)
      }
      fov = 50
      cs.up.copy(up)
    }
    if (!cs.init) {
      cs.pos.copy(want)
      cs.look.copy(look)
      cs.fov = fov
      cs.init = true
    }
    const k = 1 - Math.exp(-dt * (s.cam === 'onboard' || s.cam === 'window' ? 20 : s.cam === 'film' ? 10 : 4))
    cs.pos.lerp(want, k)
    cs.look.lerp(look, k)
    cs.fov += (fov - cs.fov) * k
    // 揺れ：加速が強いほど、地上に近いほど
    const shake = s.cam === 'film' ? 0 : (s.phase === 'ascent' || (s.phase === 'pad' && ignite.current > 0) ? 1 : 0) * (s.cam === 'pad' ? 0.02 : 0.25) * (a.accel / 9.8 + (h < 2000 ? 1 : 0)) * (s.phase === 'pad' ? ignite.current : 1)
    camera.position.copy(cs.pos).add(_v.set(Math.sin(t * 53) * shake, Math.sin(t * 47 + 1) * shake, Math.sin(t * 59 + 2) * shake))
    camera.up.copy(cs.up)
    if (filmShakeAng > 0) {
      // 見る向きを、ふぞろいな速さで小さくゆらす（望遠でも近くでも、画面の上で同じくらいに見える）
      const d = cs.pos.distanceTo(cs.look) * filmShakeAng
      _v2.copy(cs.look).add(_v3.set((Math.sin(t * 31) + Math.sin(t * 17.3 + 2)) * d, (Math.sin(t * 27 + 1) + Math.sin(t * 13.7)) * d, (Math.sin(t * 23 + 3) + Math.sin(t * 19.1 + 1)) * d))
      camera.lookAt(_v2)
    } else camera.lookAt(cs.look)
    const pc = camera as THREE.PerspectiveCamera
    if (Math.abs(pc.fov - cs.fov) > 0.01) {
      pc.fov = cs.fov
      pc.updateProjectionMatrix()
    }
  })

  const sunlit = useMoonMission((s) => s.phase === 'orbit' || s.phase === 'tli' || s.phase === 'outbound')
  return (
    <>
      {/* 月の無い夜：ロケットの形がかすかに分かるくらいの、空からの光 */}
      <hemisphereLight args={['#5a6a8a', '#120c08', 1.1]} />
      {/* 夜でも機体の形が読めるように、南の上から弱い青白い光（星明かり代わり） */}
      <directionalLight ref={fill} intensity={0.9} color="#9fb6e8" />
      <directionalLight position={SUN.clone().multiplyScalar(1000)} intensity={sunlit ? 2.2 : 0} />
      {/* 星 */}
      <mesh ref={starsM} renderOrder={-10}>
        <sphereGeometry args={[5e9, 32, 16]} />
        <meshBasicMaterial map={stars} side={THREE.BackSide} depthWrite={false} color="#555" />
      </mesh>
      {/* 地球と大気 */}
      <mesh ref={earthM} material={earthMat}>
        <sphereGeometry args={[R_EARTH, small ? 96 : 192, small ? 48 : 96]} />
      </mesh>
      <mesh ref={atmoM} material={atmoMat}>
        <sphereGeometry args={[R_EARTH + 90_000, 96, 48]} />
      </mesh>
      <mesh ref={moonM} visible={false}>
        <sphereGeometry args={[MOON_R, 48, 24]} />
        <meshStandardMaterial color="#9a9890" roughness={1} />
      </mesh>
      {/* 地面の組 */}
      <group ref={ground}>
        <primitive object={pad} />
        {/* 陸（西）と海（東） */}
        <mesh rotation-x={-Math.PI / 2} position={[-15000, GROUND_Y, 0]}>
          <planeGeometry args={[30000, 60000]} />
          <meshStandardMaterial color="#1a1c16" roughness={0.95} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[15600, GROUND_Y - 0.5, 0]}>
          <planeGeometry args={[30000, 60000]} />
          <meshStandardMaterial color="#04070c" roughness={0.18} metalness={0.2} />
        </mesh>
        {/* 発射台のコンクリートの広場 */}
        <mesh rotation-x={-Math.PI / 2} position={[0, GROUND_Y + 0.05, 0]}>
          <circleGeometry args={[180, 8]} />
          <meshStandardMaterial color="#5a5a56" roughness={0.9} />
        </mesh>
        <points geometry={cityLights}>
          <pointsMaterial vertexColors size={2.2} sizeAttenuation={false} map={glowTexture()} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>
        <primitive object={smoke.points} />
        <group ref={spots}>
          {beams.map((b, i) => (
            <group key={i}>
              <mesh position={b.mid} quaternion={b.quat} material={beamMat}>
                <cylinderGeometry args={[16, 1.2, b.len, 20, 1, true]} />
              </mesh>
              <spotLight position={b.pos} angle={0.3} penumbra={0.7} intensity={1.6e6} distance={0} decay={2} color="#dfe6ff" />
            </group>
          ))}
        </group>
      </group>
      {/* ロケット */}
      <group ref={rocketG}>
        <primitive object={parts.root} />
        <pointLight ref={flameLight} color="#ff9a40" intensity={0} distance={0} decay={2} />
        <group ref={f1} position={[0, 0.2, 0]}>
          {[
            [0, 0],
            [2.157, 2.157],
            [-2.157, 2.157],
            [-2.157, -2.157],
            [2.157, -2.157],
          ].map(([x, z], i) => (
            <mesh key={i} geometry={plumes.geo} material={plumes.f1} position={[x, 0, z]} />
          ))}
        </group>
        <mesh ref={bigPlume} geometry={plumes.geo} material={plumes.big} />
        <group ref={j2s} position={[0, 46.6, 0]} visible={false}>
          {[
            [0, 0],
            [1.9, 1.9],
            [-1.9, 1.9],
            [-1.9, -1.9],
            [1.9, -1.9],
          ].map(([x, z], i) => (
            <mesh key={i} geometry={plumes.geo} material={plumes.j2} position={[x, 0, z]} />
          ))}
        </group>
        <mesh ref={j3} geometry={plumes.geo} material={plumes.j2} position={[0, 66.6, 0]} visible={false} />
      </group>
      <mesh ref={lesFlame} geometry={plumes.geo} material={plumes.les} visible={false} />
      <group ref={debrisG} />
      <pointLight ref={camLight} color="#cfdcff" intensity={0} distance={0} decay={2} />
    </>
  )
}

useGLTF.preload(ROCKET_URL)
useGLTF.preload(PAD_URL)
