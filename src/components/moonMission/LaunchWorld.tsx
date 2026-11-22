import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { R_EARTH, PAD_LAT, OMEGA, altitude } from '../../data/saturnAscent'
import { sim, tickMission, useMoonMission, autoCam, missionNow, COUNT_FROM, TIMELAPSE } from '../../state/moonMission'
import { useExplorer } from '../../state/saturnExplorer'
import { musicTime } from '../../audio/missionMusic'
import { currentLevel, lowMemory } from '../../state/quality'
import { plumeGeometry, plumeMaterial } from './plume'
import { Smoke } from './smoke'
import { buildSite, GROUND_Y, LAND_Y } from './launchSite'
import { buildFloodlights } from './launchLights'
import { buildSky } from './launchSky'
import { launchSmoke } from './launchFx'
import { encodeOutput } from './shaderOut'
import { missionLook } from './MissionPost'
import { frostRocket, frostUniform } from './frost'
import { buildCutaway, CUT_ALL, SATURN_PARTS } from './saturnCutaway'
import { liveSky, skyNow } from './launchClock'
import { bindOrbit, explorerCamera, resetOrbit } from './explorerCam'
import { SaturnHotspots, SizeFigure } from './SaturnHotspots'
import { atmosphereMaterial, earthMaterial } from './earth'
import { buildCabin, CABIN_Y, CM_WIN_DIR, CM_WIN_EYE } from './cmCabin'
import { FILM_CUTS, FILM_END, filmCut, filmForce, filmRig, filmShake } from './launchFilm'

// 打ち上げの場面の 3D：（観察パートの夕方の発射台 →）夜の発射台（移動発射台・発射塔・照明・海）、サターンV、炎と煙、地球、月、星。
//
// 座標：ロケットをいつも原点に置く（遠くまで行っても数字が大きくならない）。
// three の x が東、y が打ち上げの瞬間の上、z が南。物理（data/saturnAscent）の (x: 上, y: 東) は three の (y, x) になる。
// 地上の物（発射台・地面・煙・照明）は「地面の組」に入れて、地球の自転と一緒に回す。

const base = import.meta.env.BASE_URL
const ROCKET_URL = `${base}models/saturn.glb`
const PAD_URL = `${base}models/launchpad.glb`
/** 発射台の地面の組の回る速さ（rad/s）：打ち上げの面の中での地球の自転 */
const SPIN = OMEGA * Math.cos((PAD_LAT * Math.PI) / 180)
/** 打ち上げの瞬間に地球の反対側にある太陽の向き（three の座標）。軌道に入って 20 分ほどで日の出になる向き */
const SUN = new THREE.Vector3(-0.5, -0.866, 0.16).normalize()
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
/** 最後に投影行列を作ったときの near */
let pcNear = 0.3
const _q = new THREE.Quaternion()
const Y = new THREE.Vector3(0, 1, 0)
const Z = new THREE.Vector3(0, 0, 1)
const _c1 = new THREE.Color()

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
  const [day, night, clouds, stars, moonTex] = useTexture([
    `${base}textures/${small ? '2k' : '4k'}_earth_daymap.jpg`,
    `${base}textures/${small ? '2k' : '4k'}_earth_nightmap.jpg`,
    `${base}textures/${small ? '2k' : '4k'}_earth_clouds.jpg`,
    `${base}textures/milky_way_glow.jpg`,
    `${base}textures/2k_moon.jpg`,
  ])
  useMemo(() => {
    for (const t of [day, night, stars, moonTex]) t.colorSpace = THREE.SRGBColorSpace
    for (const t of [day, night, clouds]) t.anisotropy = 4
  }, [day, night, clouds, stars, moonTex])
  const { camera, size, gl, scene } = useThree()
  // 夕方は遠くの陸と海が、地平線のもやにとける（夜と宇宙では濃さ 0）
  const fog = useMemo(() => new THREE.FogExp2('#000000', 0), [])
  useEffect(() => {
    const was = scene.fog
    scene.fog = fog
    return () => void (scene.fog = was)
  }, [scene, fog])
  // 観察パートの断面は、材質ごとの切り取り面を使う
  useEffect(() => {
    const was = gl.localClippingEnabled
    gl.localClippingEnabled = true
    return () => void (gl.localClippingEnabled = was)
  }, [gl])
  // 観察パートでは、画面をなぞってロケットのまわりを回る
  useEffect(() => bindOrbit(gl.domElement), [gl])

  // ---- 組み立て ----
  const parts = useMemo(() => {
    const root = rocket.scene.clone(true)
    const byName: Record<string, THREE.Object3D> = {}
    root.traverse((o) => {
      if (['S1', 'Ring', 'S2', 'S3', 'CSM', 'LES'].includes(o.name)) byName[o.name] = o
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (m && 'envMapIntensity' in m) m.envMapIntensity = 0.4
    })
    // 発射台では、冷たいタンクの外に霜が付いている（frost.ts）
    const frost = frostRocket(['S1', 'S2', 'S3'].map((n) => byName[n]).filter(Boolean))
    // 観察パートの断面（中のタンク・エンジン・着陸船）
    const cut = buildCutaway(root, frost.made)
    return { root, byName, frost, cut }
  }, [rocket])
  useEffect(
    () => () => {
      parts.frost.dispose()
      parts.cut.dispose()
    },
    [parts],
  )
  /** 断面の開きぐあい（0〜1）と、閉じるあいだも使う高さの帯 */
  const cutState = useRef({ open: 0, band: CUT_ALL as [number, number] })
  const pad = useMemo(() => {
    const root = padGltf.scene.clone(true)
    // 甲板の灰色は、照明の真下で白く飛ばないよう、鋼の暗い灰色にする（読み込んだ素材は複製してから変える）
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((x) => {
        // 穴の底の板と押さえの腕：炎の明かりで白く飛ばないよう、光を受けない黒に
        if (x.name === 'Dark') return new THREE.MeshBasicMaterial({ color: '#060606' })
        if (x.name !== 'Grey') return x
        const c = (x as THREE.MeshStandardMaterial).clone()
        c.color.multiplyScalar(0.4)
        c.roughness = 0.85
        return c
      })
      m.material = Array.isArray(m.material) ? mats : mats[0]
    })
    // 動く部品：塔の腕（Arm1〜Arm9）と、ロケットの押さえの腕（Hold1〜Hold4）。原点が回る軸
    const arms: THREE.Object3D[] = []
    const holds: { obj: THREE.Object3D; axis: THREE.Vector3 }[] = []
    root.traverse((o) => {
      if (/^Arm\d$/.test(o.name)) arms[Number(o.name[3]) - 1] = o
      if (/^Hold\d$/.test(o.name)) holds.push({ obj: o, axis: new THREE.Vector3(o.position.x, 0, o.position.z).normalize().cross(Y).negate() })
    })
    return { root, arms, holds }
  }, [padGltf])

  const plumes = useMemo(() => {
    const geo = plumeGeometry()
    // 打ち上げの世界の自前のシェーダーは、後処理のあるなしで明るさがそろうように仕上げる（shaderOut.ts）
    // 本物の夜の写真では、炎はほとんど白く（芯はわずかに青白く）、ふちだけ淡い黄色
    const f1 = encodeOutput(plumeMaterial({ core: '#ffffff', edge: '#ffe2b0', soft: 0.9 }))
    const big = encodeOutput(plumeMaterial({ core: '#fffbf2', edge: '#ffd598', soft: 1.2 }))
    const j2 = encodeOutput(plumeMaterial({ core: '#b8c4ff', edge: '#3a48d8', soft: 1.8 }))
    const les = encodeOutput(plumeMaterial({ core: '#fff0c0', edge: '#ff8a30', soft: 1.0 }))
    return { geo, f1, big, j2, les }
  }, [])
  const cabin = useMemo(() => buildCabin(), [])
  useEffect(() => () => cabin.dispose(), [cabin])
  const smoke = useMemo(() => {
    const sm = new Smoke(small ? 900 : 2800, GROUND_Y + 1)
    encodeOutput(sm.material)
    sm.points.renderOrder = 1
    return sm
  }, [small])
  useEffect(() => () => smoke.dispose(), [smoke])

  const earthMat = useMemo(() => encodeOutput(earthMaterial(day, night, clouds)), [day, night, clouds])
  const atmoMat = useMemo(() => encodeOutput(atmosphereMaterial()), [])
  const padQ = useMemo(() => padQuaternion(), [])

  // 発射台のまわりの土地・投光器・空（作業ごとに別のファイル）
  const site = useMemo(() => buildSite(small), [small])
  useEffect(() => () => site.dispose(), [site])
  const lights = useMemo(() => buildFloodlights(), [])
  useEffect(() => () => lights.dispose(), [lights])
  const sky = useMemo(() => buildSky(stars, moonTex), [stars, moonTex])
  useEffect(() => () => sky.dispose(), [sky])

  const ground = useRef<THREE.Group>(null)
  const rocketG = useRef<THREE.Group>(null)
  const earthM = useRef<THREE.Mesh>(null)
  const atmoM = useRef<THREE.Mesh>(null)
  const moonM = useRef<THREE.Mesh>(null)
  const f1 = useRef<THREE.Group>(null)
  const bigPlume = useRef<THREE.Mesh>(null)
  const j2s = useRef<THREE.Group>(null)
  const j3 = useRef<THREE.Mesh>(null)
  const lesFlame = useRef<THREE.Mesh>(null)
  const flameLight = useRef<THREE.PointLight>(null)
  const fill = useRef<THREE.DirectionalLight>(null)
  const camLight = useRef<THREE.PointLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const daySun = useRef<THREE.DirectionalLight>(null)
  const workLight = useRef<THREE.PointLight>(null)
  /** 水面に映すもの（毎フレーム書きかえる） */
  const waterSrc = useRef({
    lights: Array.from({ length: 4 }, () => ({ pos: new THREE.Vector3(), col: new THREE.Color() })),
    rocket: new THREE.Vector3(),
    rocketCol: new THREE.Color(),
  })
  /** 前のフレームの第1段の炎（水面に映す） */
  const s1Prev = useRef(0)
  const _mirrorCam = useMemo(() => new THREE.Vector3(), [])
  const debrisG = useRef<THREE.Group>(null)
  const debris = useRef<Debris[]>([])
  const ignite = useRef(0)
  const camState = useRef({ pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), fov: 40, init: false, prevCam: '' })
  /** 映画のカメラ：いまのカット、秒読みを始めてからの秒（離昇の後は実際の秒で進める）、カットの始まり */
  const filmS = useRef({ idx: 0, f: 0, cutAt: 0 })

  // 打ち上げのたびに、切り離した段をもとにもどす
  const phase = useMoonMission((s) => s.phase)
  useEffect(() => {
    if (phase === 'observe') resetOrbit()
    if (phase !== 'pad' && phase !== 'observe') return
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
    const ex = useExplorer.getState()
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
    // 空の時計：観察の夕方 → タイムラプス → 打ち上げの夜
    const observing = s.phase === 'observe' || s.phase === 'timelapse'
    const lapseU = s.phase === 'timelapse' ? THREE.MathUtils.clamp((missionNow() - s.since) / TIMELAPSE, 0, 1) : 0
    skyNow(s.phase, lapseU, liveSky)
    const sunY = liveSky.sun.y
    const dayK = THREE.MathUtils.smoothstep(sunY, -0.2, 0.06)
    const moonK = liveSky.moonLit * THREE.MathUtils.smoothstep(liveSky.moon.y, -0.02, 0.4)
    sky.update(camera, up, h, t, liveSky, observing)
    fog.density = observing ? 1.5e-4 * (0.3 + 0.7 * dayK) : 0
    fog.color.set('#05070b').lerp(_c1.set('#767b8a'), dayK)
    site.setDusk(observing ? dayK : 0, liveSky.lights)
    // 水面に映るもの：投光器の列、点火の炎、照らされたロケット
    if (ground.current) {
      const ws = waterSrc.current
      lights.lamps.forEach((l, i) => {
        ws.lights[i].pos.copy(l.pos)
        ws.lights[i].col.setRGB(0.85, 0.9, 1).multiplyScalar(l.on)
      })
      const fl = ws.lights[lights.lamps.length]
      fl.pos.set(0, GROUND_Y - 2, 0)
      fl.col.setRGB(1, 0.86, 0.68).multiplyScalar(s1Prev.current * 700)
      ground.current.worldToLocal(ws.rocket.set(0, 0, 0))
      // 柱は地面から機首まで（点火のあとは、炎と照らされた煙もロケットの下に光る）
      const rocketTop = ws.rocket.y + 110
      if (s1Prev.current > 0) ws.rocket.y = Math.min(ws.rocket.y, GROUND_Y)
      // ロケットの柱：照明に照らされた白、夕日の色、点火のあとは炎と照らされた煙の明るい柱（写真では水面に白い光の帯）
      ws.rocketCol.setRGB(0.55, 0.58, 0.64).multiplyScalar(liveSky.lights).add(_c1.setRGB(0.95, 0.72, 0.5).multiplyScalar(observing ? dayK * 0.9 : 0)).add(_c1.setRGB(1, 0.93, 0.85).multiplyScalar(s1Prev.current * 1.6))
      site.water.update({ ground: ground.current, camera, t, sun: liveSky.sun, moon: liveSky.moon, moonLit: liveSky.moonLit, dusk: observing ? Math.max(dayK, 0.15) : 0.15, lights: ws.lights, rocket: ws.rocket, rocketH: rocketTop - ws.rocket.y, rocketCol: ws.rocketCol, domeShown: observing })
    }
    lights.setOn(liveSky.lights)
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
    // 水に映る炎：地上に近いあいだ（高く上がると、遠くの小さな光）
    s1Prev.current = s1On * THREE.MathUtils.clamp(1 - h / 3000, 0.05, 1)
    const centerOff = a.stage === 0 && a.t >= 135.5
    if (f1.current) {
      f1.current.visible = s1On > 0
      f1.current.children.forEach((c, i) => {
        c.visible = !(i === 0 && centerOff)
        c.scale.set(1.8, 9 + 30 * expand + Math.sin(t * 40 + i) * 0.6, 1.8)
      })
    }
    plumes.f1.uniforms.uTime.value = t
    // 本物の F-1 の炎は、夜の写真ではほとんど白く飛ぶほどまぶしい（露出を下げても白く残る明るさ）
    plumes.f1.uniforms.uPower.value = 4 * s1On
    plumes.f1.uniforms.uExpand.value = expand * 0.4
    if (bigPlume.current) {
      bigPlume.current.visible = s1On > 0
      const len = 105 + 200 * expand
      bigPlume.current.scale.set(6.5 + 4 * expand, len * (s.phase === 'pad' ? 0.25 + 0.75 * ignite.current : 1), 5.5 + 4 * expand)
      bigPlume.current.position.y = -2
    }
    plumes.big.uniforms.uTime.value = t
    plumes.big.uniforms.uPower.value = (3 - 1.8 * expand) * s1On
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
      // 地上にいるあいだは、炎は溝の中を南北へ流れるので、明かりを低く置く（甲板の穴の壁が白く飛ばないように）
      flameLight.current.position.set(0, h < 200 ? -25 - 30 * (1 - h / 200) : -25, 0)
    }
    lights.group.visible = h < 20_000
    // 光の柱：点火の炎がまぶしいあいだは、目がくらんで薄く見える（作業5で露出と合わせる）
    lights.update(1 - 0.7 * (s1On > 0 ? ignite.current * THREE.MathUtils.clamp(1 - h / 3000, 0, 1) : 0), t)
    // 塔の腕：乗組員の通路（Arm9）は秒読みの 5 分前に退いている。第1段の腕（Arm1）は T-16.2 秒、
    // 残りは離昇の瞬間に、塔の西の角を軸に 90 度回って塔の面に退く（およそ 5 秒）。押さえの腕は離昇で外へ倒れて開く
    {
      const sinceLift = observing ? -1e3 : s.phase === 'pad' ? -s.countdown : a.t
      const ease = (x: number) => {
        const k = THREE.MathUtils.clamp(x, 0, 1)
        return k * k * (3 - 2 * k)
      }
      pad.arms.forEach((arm, i) => {
        if (!arm) return
        const k = i === 8 ? liveSky.crewArm : i === 0 ? ease((sinceLift + 16.2) / 5) : ease(sinceLift / 5)
        arm.rotation.y = (Math.PI / 2) * k
      })
      const open = ease(sinceLift / 0.6)
      for (const hd of pad.holds) hd.obj.quaternion.setFromAxisAngle(hd.axis, open * 0.5)
    }
    // 霜：離昇の揺れと風で、上がるにつれてはがれ落ちる
    frostUniform.value = THREE.MathUtils.clamp(1 - h / 2500, 0, 1) * liveSky.frost
    // 炎のまぶしさ（露出を下げる量。カメラが決まったあとで使う）
    const glare = s1On > 0 ? ignite.current * (1 - THREE.MathUtils.smoothstep(h, 4000, 30_000)) : 0
    // 溝の炎：点火から離昇のすぐ後まで（ロケットが高く上がると、溝にはもう届かない）
    site.update(s1On > 0 ? ignite.current * THREE.MathUtils.clamp(1 - h / 150, 0, 1) : 0, t)
    if (fill.current) {
      // 南の上から（three の z が南）。地球の向こうから照らさないよう、いつも局所の上寄り
      fill.current.position.copy(up).multiplyScalar(0.8).add(_v.set(0, 0, 0.6)).multiplyScalar(1000)
      // 地上の近くは本当の暗闇（ロケットは投光器だけで浮かぶ）。高く上がると、星明かり代わりの弱い光
      fill.current.intensity = THREE.MathUtils.lerp(0.06, 0.9, THREE.MathUtils.smoothstep(h, 3000, 20_000)) + 0.35 * moonK
    }
    if (workLight.current) {
      // エンジンを見るときだけ、甲板の作業灯（夕方の甲板の下は暗い）
      const want = s.phase === 'observe' && ex.part === 'f1' ? 160 : 0
      workLight.current.intensity += (want - workLight.current.intensity) * Math.min(1, dt * 3)
      _v3.set(camera.position.x, 0, camera.position.z).normalize()
      workLight.current.position.set(_v3.x * 11, 2.5, _v3.z * 11)
    }
    if (daySun.current) {
      // 低い夕日：地平線に近いほど赤く、沈むと消える
      daySun.current.position.copy(liveSky.sun).multiplyScalar(1000)
      daySun.current.intensity = observing ? 3.4 * THREE.MathUtils.smoothstep(sunY, -0.012, 0.05) : 0
      daySun.current.color.setRGB(1, 0.56 + 0.3 * THREE.MathUtils.smoothstep(sunY, 0, 0.2), 0.3 + 0.45 * THREE.MathUtils.smoothstep(sunY, 0, 0.2))
    }
    if (camLight.current) {
      // 機体カメラの見る先（切り離した段）を、少しだけ照らす
      camLight.current.intensity = s.cam === 'onboard' ? 4e4 : 0
      camLight.current.position.copy(nose).multiplyScalar(30).add(_v.set(0, 0, 14))
    }

    // ---- 煙 ----
    if (ground.current) launchSmoke({ smoke, ground: ground.current, nose, east, h, s1On, ignite: ignite.current, onPad: s.phase === 'pad', dt })
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
    let inside = false
    // 映画は曲の最初の区切りまで（途中から飛ばして来たときも、高く上がっていたら横からに）
    if (s.cam === 'film' && s.phase === 'ascent' && !s.camLocked && ((mt ?? 0) > FILM_END || a.t > 60)) autoCam('chase')
    if (observing) {
      fov = explorerCamera(dt, ex.part, lapseU > 0 ? THREE.MathUtils.smoothstep(lapseU, 0, 0.12) : 0, want, look)
      cs.up.set(0, 1, 0)
    } else if (s.cam === 'film' && ground.current) {
      const next = filmCut(fs.idx, fs.f, mt)
      if (next !== fs.idx) {
        fs.idx = next
        fs.cutAt = fs.f
        cs.init = false
      }
      const rig = filmRig(filmForce.shot ?? FILM_CUTS[fs.idx].shot, { ground: ground.current, rocket: rocketG.current!, nose, up, south, h, u: fs.f - fs.cutAt, groundY: GROUND_Y }, want, look, cs.up)
      fov = rig.fov
      // 揺れは、地上のカメラには音の速さで遅れて届く
      ground.current.getWorldPosition(_v3)
      const dist = rig.onGround ? want.distanceTo(_v3) : 0
      filmShakeAng = filmShake(sinceIgn, dist, h) * (rig.onGround ? 1 : 0.5)
      inside = !!rig.inside
      // 司令船の中は、機体ごと細かく震える（加速が強いほど）
      if (inside && sinceIgn !== null) filmShakeAng = 0.0035 * THREE.MathUtils.smoothstep(sinceIgn, 0, 6) * (a.accel / 9.8 + (h < 2000 ? 0.8 : 0))
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
      } else if (rocketG.current) {
        // 地球を回るあいだ：司令船の中から、前の窓ごしに（窓の枠・内張りも見える）
        rocketG.current.localToWorld(want.copy(CM_WIN_EYE).setY(CM_WIN_EYE.y + CABIN_Y))
        _v3.copy(CM_WIN_DIR).applyQuaternion(rocketG.current.quaternion)
        look.copy(want).add(_v3)
        inside = true
        fov = 74
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
    // 映画のカメラから自動で切りかわるときは、すっと寄らずにカットでつなぐ（映画の最後のカメラは地上で、ロケットは何 km も先にいる）
    if (cs.prevCam === 'film' && s.cam !== 'film') cs.init = false
    cs.prevCam = s.cam
    if (!cs.init) {
      cs.pos.copy(want)
      cs.look.copy(look)
      cs.fov = fov
      cs.init = true
    }
    const k = observing ? 1 : 1 - Math.exp(-dt * (s.cam === 'onboard' || s.cam === 'window' ? 20 : s.cam === 'film' ? 10 : 4))
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
    // 司令船の中にいるあいだは、外の明かり（炎・照明・空）を消して、計器盤の明かりだけにする
    cabin.show(inside)
    // 中にいるあいだは、司令船の外側（両面の殻）が窓の外をふさがないように隠す
    if (parts.byName.CSM) parts.byName.CSM.visible = !inside
    if (inside) {
      if (flameLight.current) flameLight.current.intensity = 0
      if (fill.current) fill.current.intensity = 0
    }
    lights.setInside(inside)
    // 露出：点火すると炎がまぶしいので、カメラの露出が下がる（本物の夜の打ち上げの写真のように、まわりは暗く沈み、
    // 炎と、炎に照らされた煙だけが浮かぶ）。高く上がって炎が遠く小さくなると戻る。カメラの自動露出らしく、少し遅れて追う
    const wantExp = inside || observing ? 1 : THREE.MathUtils.lerp(1, 0.32, glare)
    missionLook.exposure += (wantExp - missionLook.exposure) * Math.min(1, dt * (wantExp < missionLook.exposure ? 2.5 : 0.8))
    if (hemi.current) {
      hemi.current.intensity = inside ? 0.05 : THREE.MathUtils.lerp(0.12, 1.1, THREE.MathUtils.smoothstep(h, 3000, 20_000)) + (observing ? 0.9 * dayK + 0.25 * moonK : 0)
      // 夕方の空の光は青く、地面の照り返しは夕日の色
      hemi.current.color.set('#5a6a8a').lerp(_c1.set('#9cb2d8'), observing ? dayK : 0)
      hemi.current.groundColor.set('#120c08').lerp(_c1.set('#4a3426'), observing ? dayK : 0)
    }
    // 断面：選んだ部品の高さの帯か、全体を、カメラの側から開く
    {
      const p = SATURN_PARTS.find((x) => x.id === ex.part)
      const band = s.phase === 'observe' ? (p ? p.cut : ex.cutAll ? CUT_ALL : null) : null
      const c = cutState.current
      if (band && (band[0] !== c.band[0] || band[1] !== c.band[1])) {
        // 帯が変わったら、閉じてから開きなおす
        if (c.open < 0.05) c.band = band
      }
      const target = band && band[0] === c.band[0] && band[1] === c.band[1] ? 1 : 0
      c.open += (target - c.open) * Math.min(1, dt * (target ? 2.2 : 5))
      if (c.open < 0.002) c.open = 0
      parts.cut.set(_v3.copy(camera.position), c.band, c.open)
    }
    pc.near = inside ? 0.05 : 0.3
    if (Math.abs(pc.fov - cs.fov) > 0.01 || pc.near !== pcNear) {
      pcNear = pc.near
      pc.fov = cs.fov
      pc.updateProjectionMatrix()
    }
  })

  // 水面の鏡の絵（カメラを動かした後、画面を描く前）。煙・炎・ロケットが、波でゆがんで縦にのびて水に映る
  useFrame(() => {
    if (!ground.current) return
    camera.updateMatrixWorld()
    const near = ground.current.worldToLocal(_mirrorCam.copy(camera.position)).y < 30000
    site.water.renderMirror({ gl, scene, camera: camera as THREE.PerspectiveCamera, ground: ground.current, planeY: LAND_Y, on: near && currentLevel() !== 'low' && !small })
  })

  const sunlit = useMoonMission((s) => s.phase === 'orbit' || s.phase === 'tli' || s.phase === 'outbound')
  const observe = useMoonMission((s) => s.phase === 'observe')
  const showSize = useExplorer((s) => s.size)
  return (
    <>
      {/* 月の無い夜：ロケットの形がかすかに分かるくらいの、空からの光 */}
      <hemisphereLight ref={hemi} args={['#5a6a8a', '#120c08', 1.1]} />
      {/* 夜でも機体の形が読めるように、南の上から弱い青白い光（星明かり代わり） */}
      <directionalLight ref={fill} intensity={0.9} color="#9fb6e8" />
      <directionalLight position={SUN.clone().multiplyScalar(1000)} intensity={sunlit ? 2.2 : 0} />
      {/* 観察パートの夕日 */}
      <directionalLight ref={daySun} intensity={0} />
      {/* 星 */}
      <primitive object={sky.stars} />
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
        <primitive object={pad.root} />
        <primitive object={site.group} />
        <primitive object={smoke.points} />
        <primitive object={lights.group} />
      </group>
      {/* ロケット */}
      <group ref={rocketG}>
        <primitive object={parts.root} />
        <primitive object={parts.cut.interior} />
        <primitive object={cabin.group} />
        {observe && <SaturnHotspots />}
        {observe && showSize && <SizeFigure />}
        <pointLight ref={flameLight} color="#ffc88e" intensity={0} distance={0} decay={2} />
        <pointLight ref={workLight} color="#ffe6c4" intensity={0} distance={0} decay={2} />
        <group ref={f1} position={[0, 0.2, 0]}>
          {[
            [0, 0],
            [2.157, 2.157],
            [-2.157, 2.157],
            [-2.157, -2.157],
            [2.157, -2.157],
          ].map(([x, z], i) => (
            <mesh key={i} geometry={plumes.geo} material={plumes.f1} position={[x, 0, z]} renderOrder={4} />
          ))}
        </group>
        {/* 炎は煙のあとに描く（煙よりずっと明るいので、煙の手前・中でも光って見える） */}
        <mesh ref={bigPlume} geometry={plumes.geo} material={plumes.big} renderOrder={4} />
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
