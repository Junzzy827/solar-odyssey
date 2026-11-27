import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { useLang } from '../../i18n/lang'
import { ui } from '../../i18n'
import { lowMemory } from '../../state/quality'
import { siteSky } from '../../data/siteSky'
import { igniteShuttle, markShuttleReady, openPadSpot, PAD_SPOTS, reachOrbit, setLaunchStage, shuttleDebug, shuttleInput, shuttleLaunch, useShuttle, type PadSpot } from '../../state/shuttle'
import { buildSite, GROUND_Y, moundHeight } from '../moonMission/launchSite'
import { buildFloodlights } from '../moonMission/launchLights'
import { buildSky } from '../moonMission/launchSky'
import { launchSkyRotation, newSky, type SkyNow } from '../moonMission/launchClock'
import { glowTexture, plumeGeometry, plumeMaterial } from '../moonMission/plume'
import { Smoke, SMOKE, STEAM } from '../moonMission/smoke'
import { encodeOutput } from '../moonMission/shaderOut'
import { cabinMaterial, flatMaterial, glassMaterial, useCabinMeta } from './cabinMaterial'
import { adiTexture, crtTexture, drawCrt, prepareAdi } from './screens'
import { setLaunchAudio } from './rumble'
import {
  AUTO_IGNITE_AFTER,
  COUNT_FROM,
  FILM_END,
  HOLD_AT,
  SKIP_FROM,
  SKIP_TO,
  SPARKLERS,
  SRB_SEP,
  SSME_START,
  STS61_LIFTOFF,
  WATER_ON,
  altitudeAt,
  downrangeAt,
  pitchAt,
  rollAt,
  shotAt,
  srbThrust,
  ssmeThrust,
  type LaunchShot,
} from './launchPlan'

// スペースシャトルの発射台と打ち上げ（STS-61、1993 年 12 月 2 日の夜明け前、39B）。
//
// 座標：1 単位 = 1 m。three の x が東、y が上、z が南。原点は外部タンクの中心線と移動発射台の甲板
// （tools/blender/build_shuttle_stack.py・build_shuttle_pad.py と同じ。発射台のまわりの土地は moonMission/launchSite）。
// 機体の組は (東へ進んだ距離, 高さ, 0) に置き、回転（ロール）と東への傾き（ピッチ）をかける。高さは 60 km まで
// なので、地球の丸みは入れない（遠くは夜の地面と海、星空）。
//
// 発射台（phase 'pad'）：ドラッグで回り、ホイール・2 本指で寄る。光る点で 3 つの部品を知る。
// 打ち上げ（phase 'launch'）：乗り込む → 席で秒読み → T−7 秒で点火のボタンを待つ → 映画のカット（launchPlan.ts）。

const base = import.meta.env.BASE_URL
const STACK_URL = `${base}models/shuttle-stack.glb`
const PAD_URL = `${base}models/shuttle-pad.glb`
const CABIN_URL = `${base}models/shuttle-cabin.glb`

/** 発射台の章の空：乗組員が乗り込むころ（打ち上げの 2 時間半前。時刻は見せ方の選択） */
const BOARD_MS = STS61_LIFTOFF - 2.5 * 3600_000
/** ロールの大きさ：真東へ打ち上げて、オービターをタンクの下（背中を下）にする（見積もり） */
const ROLL = Math.PI
/** 乗員室を機体の組に置く：乗員室の x（右）→ 南、y（天井）→ 西、z（後ろ）→ 下。原点はミッドデッキの床の後ろの壁 */
const CABIN_POS = new THREE.Vector3(-6.6, 30.7, 0)
const CABIN_Q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0)))
/** 船長の目（乗員室の座標） */
const EYE = new THREE.Vector3(-0.58, 3.4, -2.78)
/** 乗り込む通路の白い部屋（発射台の座標）と、ハッチの前 */
const ARM_START = new THREE.Vector3(-13, 35, -19)
const WHITE_ROOM = new THREE.Vector3(-11.2, 33.6, -6.5)
const HATCH = new THREE.Vector3(-6.9, 32.7, -2.2)
/** 乗り込みの長さ（秒）：通路を進む → 暗くなる → 席で明るくなる */
const BOARD_FLY = 3.4
const BOARD_DARK = 4.1
const BOARD_END = 4.9

/** 発射台の見どころ：光る点の位置（発射台の座標）と、選んだときのカメラ */
const SPOT_AT: Record<PadSpot, { p: THREE.Vector3; r: number; cam: { az: number; el: number; dist: number; focus: number } }> = {
  orbiter: { p: new THREE.Vector3(-9.5, 24, 0), r: 4, cam: { az: 265, el: 8, dist: 75, focus: 22 } },
  et: { p: new THREE.Vector3(0, 46, 0), r: 4.6, cam: { az: 120, el: 10, dist: 95, focus: 38 } },
  srb: { p: new THREE.Vector3(0, 28, 6.4), r: 2.2, cam: { az: 175, el: 4, dist: 70, focus: 24 } },
}

/** 発射台を回って見るカメラ（方位は北から東回り、度） */
const orbit = { az: 236, el: 6, dist: 170, focus: 30, tDist: 170, tFocus: 30, tAz: null as number | null, tEl: null as number | null }
const ORBIT_MIN = 28
const ORBIT_MAX = 650

const Y = new THREE.Vector3(0, 1, 0)
const Z = new THREE.Vector3(0, 0, 1)
const _v = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _v3 = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _c = new THREE.Color()
const ease = (x: number) => {
  const k = THREE.MathUtils.clamp(x, 0, 1)
  return k * k * (3 - 2 * k)
}

/** ms の発射場の空（星の向き・太陽・月） */
function skyAt(ms: number, out: SkyNow) {
  const s = siteSky(ms)
  out.sun.set(s.sun.x, s.sun.y, s.sun.z)
  out.moon.set(s.moon.x, s.moon.y, s.moon.z)
  out.moonLit = s.moonLit
  out.stars.copy(launchSkyRotation(ms))
  out.ms = ms
  out.lights = 1
  out.frost = 0
  out.crewArm = 1
  out.flipping = false
  return out
}

/** 部品の形の大きさ（部品の中の座標） */
function localBox(o: THREE.Object3D) {
  const box = new THREE.Box3()
  o.updateMatrixWorld(true)
  const inv = o.matrixWorld.clone().invert()
  o.traverse((c) => {
    const m = c as THREE.Mesh
    if (!m.isMesh) return
    m.geometry.computeBoundingBox()
    const b = m.geometry.boundingBox!.clone().applyMatrix4(_m4.multiplyMatrices(inv, m.matrixWorld))
    box.union(b)
  })
  return box
}
const _m4 = new THREE.Matrix4()

export function ShuttleLaunchWorld() {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const small = lowMemory()
  const stackGltf = useGLTF(STACK_URL)
  const padGltf = useGLTF(PAD_URL)
  const cabinGltf = useGLTF(CABIN_URL)
  const sfx = small ? '.phone' : ''
  const [milky, moonTex, atlas, lmDay, lmDark] = useTexture([
    `${base}textures/milky_way_glow.jpg`,
    `${base}textures/2k_moon.jpg`,
    `${base}models/shuttle-cabin.atlas${sfx}.webp`,
    `${base}models/shuttle-cabin.light-day${sfx}.webp`,
    `${base}models/shuttle-cabin.light-dark${sfx}.webp`,
  ])
  const meta = useCabinMeta()
  useMemo(() => {
    milky.colorSpace = THREE.SRGBColorSpace
    moonTex.colorSpace = THREE.SRGBColorSpace
  }, [milky, moonTex])

  // ---- 機体（オービター・外部タンク・固体ロケット 2 本・メインエンジン 3 基） ----
  const stack = useMemo(() => {
    const root = stackGltf.scene.clone(true)
    const by: Record<string, THREE.Object3D> = {}
    root.traverse((o) => {
      if (!by[o.name]) by[o.name] = o
      const m = o as THREE.Mesh
      if (m.isMesh) m.frustumCulled = false
    })
    const geo = plumeGeometry()
    // メインエンジンの炎：本物はほとんど透明で、うっすら青く、白い「ダイヤモンド」が並ぶ（見えるように少し強く）
    const ssmeMat = encodeOutput(plumeMaterial({ core: '#f4f2ff', edge: '#8a9cff', soft: 1.25 }))
    // 固体ロケットの炎：夜を昼に変える、白に近いだいだい
    const srbCore = encodeOutput(plumeMaterial({ core: '#ffffff', edge: '#ffd9a0', soft: 0.85 }))
    const srbBig = encodeOutput(plumeMaterial({ core: '#fff2dc', edge: '#ffa850', soft: 1.25 }))
    const ssme: { obj: THREE.Object3D; plume: THREE.Mesh; glow: THREE.Sprite }[] = []
    const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(0.85, 0.88, 1), depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, opacity: 0 })
    for (let i = 1; i <= 3; i++) {
      const obj = by[`SSME_${i}`]
      if (!obj) continue
      const b = localBox(obj)
      const r = Math.max(0.6, (b.max.x - b.min.x) / 2)
      const plume = new THREE.Mesh(geo, ssmeMat)
      plume.position.set((b.min.x + b.max.x) / 2, b.min.y + 0.1, (b.min.z + b.max.z) / 2)
      plume.scale.set(r * 0.92, 26, r * 0.92)
      plume.renderOrder = 4
      plume.visible = false
      obj.add(plume)
      const glow = new THREE.Sprite(glowMat)
      glow.position.copy(plume.position)
      glow.scale.setScalar(r * 5)
      glow.renderOrder = 5
      obj.add(glow)
      ssme.push({ obj, plume, glow })
    }
    const srb: { obj: THREE.Object3D; core: THREE.Mesh; big: THREE.Mesh; base: THREE.Vector3; q: THREE.Quaternion; side: number }[] = []
    const srbGlowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(1.6, 1.3, 0.95), depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false })
    for (const [name, side] of [['SRB_N', -1], ['SRB_S', 1]] as const) {
      const obj = by[name]
      if (!obj) continue
      const core = new THREE.Mesh(geo, srbCore)
      core.scale.set(1.85, 30, 1.85)
      core.position.set(0, -0.6, 0)
      core.renderOrder = 4
      const big = new THREE.Mesh(geo, srbBig)
      big.scale.set(2.3, 110, 2.3)
      big.position.set(0, -0.6, 0)
      big.renderOrder = 4
      core.visible = big.visible = false
      // 口のまぶしい光（下から見上げても、炎の根元がまぶしく光る）
      const glow = new THREE.Sprite(srbGlowMat)
      glow.position.set(0, -4, 0)
      glow.scale.setScalar(22)
      glow.renderOrder = 5
      obj.add(core, big, glow)
      srb.push({ obj, core, big, base: obj.position.clone(), q: obj.quaternion.clone(), side })
    }
    // 固体ロケットの切り離しの小さなロケット（前と後ろに 4 つずつ）の光
    const bsmMat = new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(1, 0.78, 0.45), depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, opacity: 0 })
    const bsm: THREE.Sprite[] = []
    for (const s of srb) {
      for (const y of [1.5, 41.5]) {
        const sp = new THREE.Sprite(bsmMat)
        sp.position.set(0, y, 0)
        sp.scale.setScalar(16)
        sp.renderOrder = 5
        s.obj.add(sp)
        bsm.push(sp)
      }
    }
    return { root, by, ssme, srb, bsm, mats: { ssmeMat, srbCore, srbBig, glowMat, bsmMat, srbGlowMat }, geo }
  }, [stackGltf])
  useEffect(
    () => () => {
      Object.values(stack.mats).forEach((m) => m.dispose())
      stack.geo.dispose()
    },
    [stack],
  )

  // ---- 発射台（移動発射台・固定の塔・通路・排気の腕・回る建屋・水の塔） ----
  const pad = useMemo(() => {
    const root = padGltf.scene.clone(true)
    const by: Record<string, THREE.Object3D> = {}
    root.traverse((o) => {
      if (!by[o.name]) by[o.name] = o
    })
    return { root, oaa: by['OAA'], gox: by['GOX'], oaaQ: by['OAA']?.quaternion.clone(), goxQ: by['GOX']?.quaternion.clone() }
  }, [padGltf])

  // ---- 乗員室（席から見る：焼いた光の部屋。秒読みのあいだは明かりをつけた夜） ----
  const cabin = useMemo(() => {
    atlas.colorSpace = THREE.SRGBColorSpace
    atlas.flipY = false
    atlas.anisotropy = 8
    for (const t of [lmDay, lmDark]) {
      t.colorSpace = THREE.NoColorSpace
      t.flipY = false
    }
    const mat = cabinMaterial(atlas, lmDay, lmDark, meta)
    mat.uniforms.uMix.value = 0.55
    const flat = flatMaterial(atlas, mat)
    const glass = glassMaterial()
    const owned: { dispose: () => void }[] = [mat, flat, glass]
    const root = cabinGltf.scene.clone(true)
    const crts: { tex: THREE.CanvasTexture; kind: number }[] = []
    const adi = adiTexture()
    owned.push(adi)
    let k = 0
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      if (o.name === 'collider' || o.name.startsWith('float_')) {
        // 地上では何も浮かない
        m.visible = false
      } else if (o.name.startsWith('screen_crt')) {
        const tex = crtTexture()
        drawCrt(tex, k, 0)
        crts.push({ tex, kind: k++ })
        const mm = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
        m.material = mm
        owned.push(mm, tex)
      } else if (o.name.startsWith('screen_mon')) {
        const mm = new THREE.MeshBasicMaterial({ color: '#0b1016', toneMapped: false })
        m.material = mm
        owned.push(mm)
      } else if (o.name.startsWith('adi_')) {
        prepareAdi(m)
        const mm = new THREE.MeshBasicMaterial({ map: adi, toneMapped: false })
        m.material = mm
        owned.push(mm)
      } else if (o.name.startsWith('glass')) {
        m.material = glass
        m.renderOrder = 2
      } else m.material = m.geometry.getAttribute('uv1') ? mat : flat
    })
    const group = new THREE.Group()
    group.add(root)
    group.position.copy(CABIN_POS)
    group.quaternion.copy(CABIN_Q)
    group.visible = false
    return { group, mat, crts, owned }
  }, [cabinGltf, atlas, lmDay, lmDark, meta])
  useEffect(() => () => cabin.owned.forEach((o) => o.dispose()), [cabin])

  // ---- 土地・投光器・空・煙 ----
  const site = useMemo(() => buildSite(small, 'shuttle'), [small])
  useEffect(() => () => site.dispose(), [site])
  const lights = useMemo(() => buildFloodlights(), [])
  useEffect(() => () => lights.dispose(), [lights])
  const sky = useMemo(() => buildSky(milky, moonTex), [milky, moonTex])
  useEffect(() => () => sky.dispose(), [sky])
  const smoke = useMemo(() => {
    const sm = new Smoke(small ? 1000 : 2600, GROUND_Y + 1)
    encodeOutput(sm.material)
    sm.points.renderOrder = 1
    return sm
  }, [small])
  useEffect(() => () => smoke.dispose(), [smoke])
  // 炎に照らされた空気の光（夜が昼のようになる）と、点火の前の火花
  const fx = useMemo(() => {
    const mk = (c: THREE.Color, order: number) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: c, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, opacity: 0 }))
      sp.renderOrder = order
      return sp
    }
    const halo = mk(new THREE.Color(1, 0.8, 0.5), 3)
    const sparks = Array.from({ length: 6 }, () => mk(new THREE.Color(1, 0.72, 0.35), 5))
    return { halo, sparks }
  }, [])
  useEffect(
    () => () => {
      fx.halo.material.dispose()
      fx.sparks.forEach((s) => s.material.dispose())
    },
    [fx],
  )
  const liveSky = useMemo(() => newSky(), [])
  const waterSrc = useMemo(
    () => ({
      lights: Array.from({ length: 5 }, () => ({ pos: new THREE.Vector3(), col: new THREE.Color() })),
      rocket: new THREE.Vector3(),
      rocketCol: new THREE.Color(),
    }),
    [],
  )

  const vehicle = useRef<THREE.Group>(null)
  const flame = useRef<THREE.PointLight>(null)
  const fill = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const work = useRef<THREE.PointLight>(null)
  const st = useRef({
    frames: 0,
    boardAt: 0,
    holdAt: -1,
    cut: -1,
    cutAt: 0,
    look: new THREE.Vector2(),
    pos: new THREE.Vector3(),
    tgt: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
    fov: 45,
    boardFrom: new THREE.Vector3(),
    boardLook: new THREE.Vector3(),
    shake: 0,
    sepPuffs: false,
    camOverride: null as null | { pos: THREE.Vector3; tgt: THREE.Vector3; fov: number },
    crtT: 0,
    /** 撮影用：時計を飛ばしたとき、その前の煙をまとめて進めておく（T 秒） */
    warm: null as number | null,
  })

  // 段階が変わったら、通路・腕・切り離した固体ロケットをもどす
  const phase = useShuttle((s) => s.phase)
  useEffect(() => {
    const S = st.current
    if (phase === 'pad') {
      orbit.az = 236
      orbit.el = 6
      orbit.dist = orbit.tDist = 170
      orbit.focus = orbit.tFocus = 30
      orbit.tAz = orbit.tEl = null
    }
    for (const s of stack.srb) {
      s.obj.position.copy(s.base)
      s.obj.quaternion.copy(s.q)
    }
    S.cut = -1
    S.holdAt = -1
    S.sepPuffs = false
    S.look.set(0, 0)
    // 乗り込みの始まりは、次のコマで場面の時計から決める（コマ送りの撮影でも同じ速さになるように）
    if (phase === 'launch') S.boardAt = -1
  }, [phase, stack])

  // 指・マウスで発射台を回る（発射台の章だけ）
  useEffect(() => {
    const el = gl.domElement
    const pts = new Map<number, { x: number; y: number }>()
    let pinch = 0
    const down = (e: PointerEvent) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 2) {
        const [a, b] = [...pts.values()]
        pinch = Math.hypot(a.x - b.x, a.y - b.y)
      }
    }
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId)
      if (!p) return
      const dx = e.clientX - p.x
      const dy = e.clientY - p.y
      p.x = e.clientX
      p.y = e.clientY
      if (useShuttle.getState().phase !== 'pad') return
      if (pts.size === 1) {
        orbit.tAz = orbit.tEl = null
        orbit.az -= dx * 0.28
        orbit.el = THREE.MathUtils.clamp(orbit.el + dy * 0.2, -4, 75)
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinch > 0 && d > 0) orbit.tDist = THREE.MathUtils.clamp(orbit.tDist * (pinch / d), ORBIT_MIN, ORBIT_MAX)
        pinch = d
      }
    }
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId)
      pinch = 0
    }
    const wheel = (e: WheelEvent) => {
      if (useShuttle.getState().phase !== 'pad') return
      orbit.tDist = THREE.MathUtils.clamp(orbit.tDist * Math.exp(e.deltaY * 0.0012), ORBIT_MIN, ORBIT_MAX)
      e.preventDefault()
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
    }
  }, [gl])

  // 見どころを選ぶと、その部品へ寄る
  const padSpot = useShuttle((s) => s.padSpot)
  useEffect(() => {
    if (!padSpot) {
      orbit.tDist = 170
      orbit.tFocus = 30
      return
    }
    const c = SPOT_AT[padSpot].cam
    orbit.tAz = c.az
    orbit.tEl = c.el
    orbit.tDist = c.dist
    orbit.tFocus = c.focus
  }, [padSpot])

  // 撮影・確かめ用の口
  useEffect(() => {
    shuttleDebug.padCam = (x, y, z, tx, ty, tz, fov = 45) => {
      st.current.camOverride = { pos: new THREE.Vector3(x, y, z), tgt: new THREE.Vector3(tx, ty, tz), fov }
    }
    shuttleDebug.launchAt = (t) => {
      st.current.camOverride = null
      if (useShuttle.getState().phase !== 'launch') return
      shuttleLaunch.t = t
      st.current.warm = t
      if (t > HOLD_AT && shuttleLaunch.ignitedAt === null) shuttleLaunch.ignitedAt = HOLD_AT
      setLaunchStage(t > HOLD_AT ? 'fire' : 'count')
      st.current.boardAt = -1e9
    }
    shuttleDebug.show = (name, on) => {
      const o = stack.by[name] ?? pad.root.getObjectByName(name)
      if (o) o.visible = on
    }
    return () => {
      delete shuttleDebug.padCam
      delete shuttleDebug.launchAt
      delete shuttleDebug.show
    }
  }, [stack, pad])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    // 場面の時計（コマ送りの撮影では、撮った時間だけ進む）
    const t = state.clock.elapsedTime
    const now = t
    const S = st.current
    const s = useShuttle.getState()
    if (S.frames < 4 && ++S.frames === 4) markShuttleReady()
    const veh = vehicle.current
    if (!veh) return
    if (S.warm !== null) {
      // 撮影用：飛ばした時刻までの煙を、描かずに 0.1 秒ずつ進める
      const end = S.warm
      S.warm = null
      for (let x = Math.max(end - 16, SSME_START); x < end; x += 0.1) {
        const p = pitchAt(x)
        const nose0 = _v3.set(Math.sin(p), Math.cos(p), 0)
        const hx = altitudeAt(x)
        const k = (ssmeThrust(0, x) + ssmeThrust(1, x) + ssmeThrust(2, x)) / 3
        shuttleSmoke(smoke, { tt: x, dt: 0.1, fired: true, h: hx, nose: nose0.clone(), veh: _v2.set(downrangeAt(x), hx, 0).clone(), srbK: srbThrust(x), ssmeAll: k, sepK: x - SRB_SEP })
        smoke.update(0.1)
      }
    }

    // ---- 打ち上げの時計 ----
    let tt = COUNT_FROM
    let boarding = false
    let boardK = 0
    if (s.phase === 'launch') {
      if (S.boardAt === -1) S.boardAt = now
      const since = now - S.boardAt
      if (s.stage === 'board') {
        boarding = true
        boardK = since
        if (since >= BOARD_END) setLaunchStage('count')
      } else {
        if (s.stage === 'count') {
          shuttleLaunch.t = Math.min(HOLD_AT, shuttleLaunch.t + dt)
          if (shuttleLaunch.t >= HOLD_AT) {
            setLaunchStage('hold')
            S.holdAt = now
          }
        } else if (s.stage === 'hold') {
          if (S.holdAt < 0) S.holdAt = now
          if (now - S.holdAt > AUTO_IGNITE_AFTER) igniteShuttle()
        } else if (s.stage === 'fire') {
          shuttleLaunch.t += dt
          // 地味な所を飛ばす（「2 分後」のカード）
          if (shuttleLaunch.t > SKIP_FROM && shuttleLaunch.t < SKIP_TO) {
            shuttleLaunch.t = SKIP_TO
            shuttleLaunch.skip = true
            smoke.update(30)
          }
          if (shuttleLaunch.t >= FILM_END) reachOrbit()
        }
        tt = shuttleLaunch.t
      }
    }
    const fired = s.phase === 'launch' && s.stage === 'fire'
    // 暗転：乗り込み（通路の先で暗くなり、席で明るくなる）と、映画の終わり
    let fade = 0
    if (boarding) fade = boardK < BOARD_FLY ? 0 : boardK < BOARD_DARK ? (boardK - BOARD_FLY) / (BOARD_DARK - BOARD_FLY) : 1 - (boardK - BOARD_DARK) / (BOARD_END - BOARD_DARK)
    if (fired && tt > FILM_END - 1.5) fade = (tt - (FILM_END - 1.5)) / 1.5
    shuttleLaunch.fade = THREE.MathUtils.clamp(fade, 0, 1)

    // ---- 空（星・月）：発射台の章は乗り込むころ、打ち上げは秒読みの時刻 ----
    skyAt(s.phase === 'launch' ? STS61_LIFTOFF + tt * 1000 : BOARD_MS, liveSky)

    // ---- 機体の位置と向き ----
    const h = altitudeAt(tt)
    const dr = downrangeAt(tt)
    veh.position.set(dr, h, 0)
    // 点火の「しなり」：メインエンジンの力で機体の先が少し傾き、T−0 にまっすぐへもどる（見せ方の誇張は少し）
    const twang = fired && tt < 0.5 ? Math.sin(THREE.MathUtils.clamp((tt - SSME_START) / (0 - SSME_START), 0, 1) * Math.PI) * 0.01 : 0
    _q.setFromAxisAngle(Y, ROLL * rollAt(tt))
    _q2.setFromAxisAngle(Z, -(pitchAt(tt) + twang))
    veh.quaternion.copy(_q2).multiply(_q)
    veh.updateMatrixWorld(true)
    const nose = _v.set(0, 1, 0).applyQuaternion(veh.quaternion)
    // 固体ロケットの切り離し：外へ離れながら、後ろへ遅れていく
    const sepK = tt - SRB_SEP
    for (const b of stack.srb) {
      if (sepK > 0) {
        b.obj.position.copy(b.base)
        b.obj.position.z += b.side * (2.2 * sepK + 0.4 * sepK * sepK)
        b.obj.position.y -= 9 * sepK * sepK
        b.obj.position.x += 0.6 * sepK * sepK
        b.obj.quaternion.copy(b.q).premultiply(_q.setFromAxisAngle(_v2.set(1, 0, 0), -b.side * 0.05 * sepK * sepK))
      } else {
        b.obj.position.copy(b.base)
        b.obj.quaternion.copy(b.q)
      }
    }
    const bsmK = sepK > 0 && sepK < 1.6 ? 1 - sepK / 1.6 : 0
    stack.mats.bsmMat.opacity = bsmK
    stack.bsm.forEach((b) => (b.visible = bsmK > 0))

    // ---- 炎 ----
    const air = Math.exp(-h / 7200)
    const expand = THREE.MathUtils.clamp(1 - air, 0, 1)
    const srbK = fired ? srbThrust(tt) : 0
    let ssmeAll = 0
    stack.ssme.forEach((e, i) => {
      const k = fired ? ssmeThrust(i, tt) : 0
      ssmeAll += k / 3
      e.plume.visible = k > 0.01
      // 点火の最初の一瞬は、口の中が明るく光る
      const start = SSME_START + (2 - i) * 0.12
      const flash = fired && tt > start && tt < start + 1.2 ? 1 - (tt - start) / 1.2 : 0
      e.glow.position.copy(e.plume.position)
      e.glow.scale.setScalar(4 + flash * 8 + k * 2)
      e.plume.scale.y = 26 * (0.4 + 0.6 * k) * (1 + expand * 1.5)
    })
    stack.mats.glowMat.opacity = fired ? Math.min(1, ssmeAll * 1.2) : 0
    stack.mats.ssmeMat.uniforms.uTime.value = t
    stack.mats.ssmeMat.uniforms.uPower.value = 1.3 * ssmeAll
    stack.mats.ssmeMat.uniforms.uExpand.value = expand * 1.6
    for (const b of stack.srb) {
      const on = srbK > 0 && sepK <= 0
      b.core.visible = b.big.visible = on
      b.big.scale.y = 110 * (1 + expand * 0.6)
    }
    stack.mats.srbGlowMat.opacity = sepK > 0 ? 0 : srbK
    stack.mats.srbCore.uniforms.uTime.value = t
    stack.mats.srbCore.uniforms.uPower.value = 4 * srbK
    stack.mats.srbCore.uniforms.uExpand.value = expand * 0.5
    stack.mats.srbBig.uniforms.uTime.value = t
    stack.mats.srbBig.uniforms.uPower.value = (2.6 - 1.4 * expand) * srbK
    stack.mats.srbBig.uniforms.uExpand.value = expand * 2.4
    // 炎の光の玉（空気が濃いあいだ）
    const tail = _v2.copy(veh.position).addScaledVector(nose, -25)
    fx.halo.position.copy(tail)
    fx.halo.scale.setScalar(260 + 200 * expand)
    fx.halo.material.opacity = srbK * 0.55 * (0.2 + 0.8 * air) * (0.93 + 0.07 * Math.sin(t * 29))
    fx.halo.visible = srbK > 0
    // 点火の前の火花（エンジンの下）
    const sparkOn = s.phase === 'launch' && s.stage !== 'board' && tt > SPARKLERS && tt < SSME_START + 1.5 ? 1 : 0
    fx.sparks.forEach((sp, i) => {
      sp.visible = sparkOn > 0
      if (!sp.visible) return
      const a = (i / 6) * Math.PI * 2 + t * 3
      sp.position.set(-9.6 + Math.cos(a) * 2.2, 3 + Math.random() * 0.8, Math.sin(a) * 2.6)
      sp.scale.setScalar(0.8 + Math.random() * 1.2)
      sp.material.opacity = 0.5 + Math.random() * 0.5
    })

    // ---- 煙と湯気 ----
    shuttleSmoke(smoke, { tt, dt, fired, h, nose, veh: veh.position, srbK, ssmeAll, sepK })
    smoke.material.uniforms.uFlame.value.copy(tail)
    smoke.material.uniforms.uFlamePower.value = srbK > 0 ? 1.4 * Math.max(0.15, 1 - h / 6000) : ssmeAll * 0.25
    smoke.material.uniforms.uAmb.value = 1
    smoke.update(dt)
    smoke.material.uniforms.uPx.value = size.height / (2 * Math.tan((camera.fov * Math.PI) / 360))

    // ---- 照らす光 ----
    if (flame.current) {
      // 固体ロケットの炎は機体の下、メインエンジンだけのあいだはエンジンの口のあたり
      if (srbK > 0) flame.current.position.copy(tail)
      else flame.current.position.set(dr - 9.5, h + 1, 0)
      flame.current.intensity = srbK * 1.1e6 * (0.88 + 0.12 * Math.sin(t * 37)) * (h < 3000 ? 1 : 0.4) + (srbK > 0 ? 0 : ssmeAll * 2.5e3)
    }
    if (fill.current) {
      // 月の光（STS-61 の夜は、満月を過ぎた明るい月）
      fill.current.position.copy(liveSky.moon).multiplyScalar(1000)
      fill.current.intensity = 0.25 + 0.6 * liveSky.moonLit * THREE.MathUtils.smoothstep(liveSky.moon.y, -0.02, 0.3)
    }
    if (hemi.current) hemi.current.intensity = 0.22 + 0.9 * THREE.MathUtils.smoothstep(h, 3000, 20_000)
    site.update(srbK * THREE.MathUtils.clamp(1 - h / 150, 0, 1), t)
    lights.setOn(1)
    lights.update(1 - 0.75 * srbK * THREE.MathUtils.clamp(1 - h / 3000, 0, 1), t)
    lights.group.visible = h < 20_000

    // ---- 通路と酸素の排気の腕：発射台の章では出ている。秒読み（T−31 秒）の前に退く ----
    const armsOut = s.phase === 'pad' || boarding
    if (pad.oaa && pad.oaaQ) pad.oaa.quaternion.copy(pad.oaaQ).multiply(_q.setFromAxisAngle(Y, armsOut ? 0 : -1.25))
    if (pad.gox && pad.goxQ) pad.gox.quaternion.copy(pad.goxQ).multiply(_q.setFromAxisAngle(Y, armsOut ? 0 : 1.2))

    // ---- カメラ ----
    let shot: LaunchShot | 'pad' | 'board' = 'pad'
    if (s.phase === 'launch') shot = boarding && boardK < BOARD_DARK ? 'board' : boarding ? 'seat' : shotAt(tt).shot
    const cutIdx = s.phase === 'launch' && !boarding ? shotAt(tt).index : -1
    if (cutIdx !== S.cut) {
      S.cut = cutIdx
      S.cutAt = tt
    }
    const u = tt - S.cutAt
    const inSeat = shot === 'seat' || shot === 'seatShake'
    cabin.group.visible = inSeat
    // 席の中では、オービターの外側は見えない（窓から外の景色だけ）
    if (stack.by['Orbiter']) stack.by['Orbiter'].visible = !inSeat
    if (stack.by['Doors']) stack.by['Doors'].visible = !inSeat
    let fov = 45
    const pos = S.pos
    const tgt = S.tgt
    const camUp = S.up.set(0, 1, 0)
    if (S.camOverride) {
      pos.copy(S.camOverride.pos)
      tgt.copy(S.camOverride.tgt)
      fov = S.camOverride.fov
    } else if (shot === 'pad') {
      const k = 1 - Math.exp(-dt * 2.2)
      orbit.dist += (orbit.tDist - orbit.dist) * k
      orbit.focus += (orbit.tFocus - orbit.focus) * k
      if (orbit.tAz !== null) {
        let d = orbit.tAz - orbit.az
        d -= 360 * Math.round(d / 360)
        orbit.az += d * k
        if (Math.abs(d) < 0.2) orbit.tAz = null
      }
      if (orbit.tEl !== null) {
        orbit.el += (orbit.tEl - orbit.el) * k
        if (Math.abs(orbit.tEl - orbit.el) < 0.05) orbit.tEl = null
      }
      // ゆっくり回り続ける（触るまで）
      if (!padSpot && orbit.tAz === null) orbit.az += dt * 1.2
      const az = THREE.MathUtils.degToRad(orbit.az)
      const el = THREE.MathUtils.degToRad(orbit.el)
      tgt.set(0, orbit.focus, 0)
      pos.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(orbit.dist).add(tgt)
      const r = Math.hypot(pos.x, pos.z)
      pos.y = Math.max(pos.y, r < 30 ? 9 : moundHeight(pos.x, pos.z) + 2.5)
      fov = 45
      S.boardFrom.copy(pos)
      S.boardLook.copy(tgt)
    } else if (shot === 'board') {
      // 通路の根元へ飛び、白い部屋を通ってハッチへ
      const k1 = ease(boardK / (BOARD_FLY * 0.55))
      const k2 = ease((boardK - BOARD_FLY * 0.55) / (BOARD_FLY * 0.45 + 0.7))
      pos.lerpVectors(S.boardFrom, ARM_START, k1).lerp(WHITE_ROOM, k2)
      tgt.lerpVectors(S.boardLook, HATCH, ease(boardK / (BOARD_FLY * 0.6)))
      fov = 45 + 10 * k2
    } else if (inSeat) {
      // 席：仰向けで空を見上げる。なぞると少し見回せる
      S.look.x = THREE.MathUtils.clamp(S.look.x - shuttleInput.lookX, -1.1, 1.1)
      S.look.y = THREE.MathUtils.clamp(S.look.y - shuttleInput.lookY, -0.7, 0.9)
      const dir = _v3.set(Math.sin(S.look.x) * Math.cos(S.look.y - 0.12), Math.sin(S.look.y - 0.12), -Math.cos(S.look.x) * Math.cos(S.look.y - 0.12))
      cabin.group.updateMatrixWorld(true)
      pos.copy(EYE).applyMatrix4(cabin.group.matrixWorld)
      tgt.copy(EYE).add(dir).applyMatrix4(cabin.group.matrixWorld)
      camUp.set(0, 1, 0).transformDirection(cabin.group.matrixWorld)
      fov = 64
    } else {
      fov = filmShot(shot, u, tt, veh, nose, pos, tgt, camUp)
    }
    shuttleInput.lookX = 0
    shuttleInput.lookY = 0
    // 揺れ：メインエンジンで小さく、固体ロケットで大きく、空気がいちばん強い所のあとは弱く
    const shakeWant = fired ? (ssmeAll * 0.25 + srbK * (tt < 70 ? 1 : 0.45)) * (inSeat ? 1 : shot === 'engines' || shot === 'tower' || shot === 'below' ? 0.6 : 0.15) : 0
    S.shake += (shakeWant - S.shake) * Math.min(1, dt * 6)
    const sh = S.shake * (inSeat ? 0.022 : 0.35)
    if (sh > 0) {
      pos.x += (Math.random() - 0.5) * sh
      pos.y += (Math.random() - 0.5) * sh
      pos.z += (Math.random() - 0.5) * sh
    }
    camera.position.copy(pos)
    camera.up.copy(camUp)
    camera.lookAt(tgt)
    if (Math.abs(camera.fov - fov) > 0.01 || camera.near !== (inSeat ? 0.03 : 0.3)) {
      camera.fov = fov
      camera.near = inSeat ? 0.03 : 0.3
      camera.far = 400_000
      camera.updateProjectionMatrix()
    }
    // まぶしさ：外から固体ロケットの炎を見ると、カメラの露出が下がる
    const glare = inSeat ? 0 : srbK * THREE.MathUtils.clamp(1 - h / 8000, 0.25, 1)
    gl.toneMappingExposure = 1 - 0.45 * glare

    sky.update(camera, Y, h, t, liveSky, false, glare)
    // 水面に映るもの
    lights.lamps.forEach((l, i) => {
      if (!waterSrc.lights[i]) return
      waterSrc.lights[i].pos.copy(l.pos)
      waterSrc.lights[i].col.setRGB(0.85, 0.9, 1).multiplyScalar(l.on)
    })
    const fl = waterSrc.lights[Math.min(lights.lamps.length, waterSrc.lights.length - 1)]
    fl.pos.set(dr, Math.max(GROUND_Y - 2, h - 30), 0)
    fl.col.setRGB(1, 0.86, 0.68).multiplyScalar(srbK * 700 * THREE.MathUtils.clamp(1 - h / 4000, 0.05, 1))
    waterSrc.rocket.set(dr, Math.min(h, GROUND_Y), 0)
    waterSrc.rocketCol.setRGB(0.55, 0.58, 0.64).add(_c.setRGB(1, 0.93, 0.85).multiplyScalar(srbK * 1.6 * THREE.MathUtils.clamp(1 - h / 3000, 0.05, 1)))
    site.water.update({ ground: state.scene, camera, t, sun: liveSky.sun, moon: liveSky.moon, moonLit: liveSky.moonLit, dusk: 0.15, lights: waterSrc.lights, rocket: waterSrc.rocket, rocketH: 60 + h, rocketCol: waterSrc.rocketCol, domeShown: false })

    // 席の明かり：秒読みのあいだは計器の明かり、点火のあとは窓から炎の光も
    cabin.mat.uniforms.uMix.value = 0.62 - 0.2 * srbK * (h < 20_000 ? 1 : 0.3)
    if (inSeat && now - S.crtT > 1) {
      S.crtT = now
      for (const c of cabin.crts) drawCrt(c.tex, c.kind, now)
    }
    if (work.current) {
      // 甲板の上のエンジンのカットだけ、作業灯（甲板の下・エンジンのまわりは投光器の光が届かず暗い）
      work.current.intensity = shot === 'engines' && srbK === 0 ? 220 : 0
      work.current.position.set(-20, 3, 9)
    }

    // ---- 音 ----
    setLaunchAudio({
      roar: fired ? Math.min(1, ssmeAll * 0.35 + srbK) * (h < 30_000 ? 1 : 0.6) * (shot === 'far' ? 0.55 : 1) : 0,
      crack: fired ? srbK * (h < 15_000 ? 1 : 0.3) : 0,
      inside: inSeat,
      wind: s.phase === 'pad' || (s.phase === 'launch' && !fired) ? 1 : 0,
    })
  })

  return (
    <>
      <hemisphereLight ref={hemi} args={['#5a6a8a', '#120c08', 0.22]} />
      <directionalLight ref={fill} intensity={0.4} color="#a8bce8" />
      <pointLight ref={work} color="#e8eeff" intensity={0} distance={0} decay={2} />
      <pointLight ref={flame} color="#ffc88e" intensity={0} distance={0} decay={2} />
      <primitive object={sky.stars} />
      <primitive object={site.group} />
      <primitive object={pad.root} />
      <primitive object={lights.group} />
      <primitive object={smoke.points} />
      <primitive object={fx.halo} />
      {fx.sparks.map((sp, i) => (
        <primitive key={i} object={sp} />
      ))}
      <group ref={vehicle}>
        <primitive object={stack.root} />
        <primitive object={cabin.group} />
      </group>
      <PadHotspots />
    </>
  )
}

/** 映画のカット（席以外）：カメラの位置・見る点・上の向きを決め、画角を返す */
function filmShot(shot: LaunchShot, u: number, tt: number, veh: THREE.Object3D, nose: THREE.Vector3, pos: THREE.Vector3, tgt: THREE.Vector3, up: THREE.Vector3) {
  const vp = veh.position
  up.set(0, 1, 0)
  switch (shot) {
    case 'night': {
      // 夜の発射台を南西から、ゆっくり回りながら（腕は退いて、機体だけが照らされて立つ）
      const az = THREE.MathUtils.degToRad(222 + u * 1.6)
      tgt.set(0, 30, 0)
      pos.set(Math.sin(az) * 150, 22, -Math.cos(az) * 150)
      return 42
    }
    case 'engines': {
      // 甲板の上、エンジンの斜め下から。湯気がわき、3 基が順に点く
      pos.set(-36 + u * 0.4, 3.6, 24 - u * 0.5)
      tgt.set(-9.5, 6.8, 0)
      return 40
    }
    case 'wide': {
      // 西南西 900 m から：固体ロケットの点火、発射
      pos.set(-330, moundHeight(-330, 420) + 6, 420)
      tgt.set(vp.x, Math.max(30, vp.y + 20), 0)
      return fovFor(pos, tgt, 150)
    }
    case 'tower': {
      // 固定の塔の南西の角から見上げる：機体が目の前を上がっていく
      pos.set(-12, 66, -17)
      tgt.copy(vp).addScaledVector(nose, 32)
      return 52
    }
    case 'below': {
      // 発射台の南西の地面から見上げる：回転（ロール）
      pos.set(-420, moundHeight(-420, 380) + 2, 380)
      tgt.copy(vp).addScaledVector(nose, -10)
      return fovFor(pos, tgt, 190)
    }
    case 'chase': {
      // 並んで飛ぶ：機体の南の斜め後ろから
      pos.copy(vp).add(_v2.set(-55 - u * 2, -30 - u * 1.5, 120 + u * 3))
      tgt.copy(vp).addScaledVector(nose, 12)
      return 38
    }
    case 'far': {
      // 遠くの海辺から：弧を描いて上がる炎と、残る煙の柱
      pos.set(-2400, 18, 3600)
      tgt.copy(vp).addScaledVector(nose, -250)
      return fovFor(pos, tgt, 1100)
    }
    case 'sep': {
      // 高さ 50 km：機体の横に並び、固体ロケットが離れていくのを見る
      const off = _v3.set(48, -22 - Math.max(0, tt - SRB_SEP) * 0.8, 26).applyQuaternion(veh.quaternion)
      pos.copy(vp).add(off)
      tgt.copy(vp).addScaledVector(nose, 8)
      up.copy(nose).lerp(Y, 0.4).normalize()
      return 46
    }
    default:
      tgt.copy(vp)
      pos.copy(vp).add(_v2.set(-100, 20, 100))
      return 45
  }
}

/** 見る点のまわり span m が、画面の高さに収まる画角（度） */
function fovFor(pos: THREE.Vector3, tgt: THREE.Vector3, span: number) {
  return THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(span / 2 / pos.distanceTo(tgt))), 4, 50)
}

/** 煙と湯気：水と点火の湯気、溝から噴き出す煙、上がっていく後ろに残る柱、切り離しの煙 */
function shuttleSmoke(sm: Smoke, c: { tt: number; dt: number; fired: boolean; h: number; nose: THREE.Vector3; veh: THREE.Vector3; srbK: number; ssmeAll: number; sepK: number }) {
  const { tt, dt, fired, h, nose, veh, srbK, ssmeAll } = c
  const n = (rate: number) => Math.floor(rate * dt + Math.random())
  if (!fired) return
  // 水：T−6.6 秒から甲板のノズルと炎の溝へ（白いしぶき）
  if (tt > WATER_ON && tt < 14) {
    for (let i = n(18); i > 0; i--) {
      const a = Math.random() * Math.PI * 2
      sm.emit(-3 + Math.cos(a) * 14, 1, Math.sin(a) * 12, Math.cos(a) * 3, 2 + Math.random() * 3, Math.sin(a) * 3, 3 + Math.random() * 3, 5, 1.4, STEAM)
    }
  }
  // メインエンジンの点火：水素の炎と水で、白い湯気の大きな雲が穴の下からわき上がり、北の溝へ流れ出る
  if (ssmeAll > 0.05 && h < 300) {
    for (let i = n(55 * ssmeAll); i > 0; i--) {
      const north = Math.random() < 0.6
      sm.emit(-9 + (Math.random() - 0.5) * 8, GROUND_Y + 4 + Math.random() * 6, north ? -40 - Math.random() * 30 : (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 14, 4 + Math.random() * 10, north ? -25 - Math.random() * 40 : (Math.random() - 0.5) * 20, 9 + Math.random() * 10, 12 + Math.random() * 8, 1.8, STEAM)
    }
  }
  // 固体ロケットの点火：溝の南北の出口から、炎に照らされた煙が地面をはって広がり、入道雲のように立ち上がる
  if (srbK > 0 && h < 900) {
    for (let i = n(70 * (1 - h / 900)); i > 0; i--) {
      const side = Math.random() < 0.5 ? -1 : 1
      const big = Math.random() < 0.18
      const out = (60 + Math.random() * 170) * (0.6 + 0.8 * Math.random())
      const sz = (20 + 26 * Math.exp((Math.random() - 0.5) * 1.6)) * (big ? 1.6 : 1)
      sm.emit((Math.random() - 0.5) * 24, GROUND_Y + 3, side * (45 + Math.random() * 50), (Math.random() - 0.5) * (big ? 46 : 30), big ? 14 + Math.random() * 26 : 2 + Math.random() * 14, side * out, sz, 26 + Math.random() * 22, big ? 2.2 : 1.6, Math.random() < 0.3 ? STEAM : SMOKE)
    }
    if (h < 60) {
      for (let i = n(16); i > 0; i--) {
        const a = Math.random() * Math.PI * 2
        sm.emit(Math.cos(a) * 12, 1.5, Math.sin(a) * 12, Math.cos(a) * 7, 3 + Math.random() * 4, Math.sin(a) * 7, 6 + Math.random() * 4, 7, 1.6, STEAM)
      }
    }
  }
  // 上がっていく後ろに残る、白い煙の柱（炎の先から下）
  if (srbK > 0 && h > 60 && h < 40_000) {
    for (let i = Math.ceil(dt * 34); i > 0; i--) {
      _v3.set((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8).add(veh).addScaledVector(nose, -120 - Math.random() * 60)
      sm.emit(_v3.x, _v3.y, _v3.z, (Math.random() - 0.5) * 4, -2, (Math.random() - 0.5) * 4, 18 + h * 0.004, 28, 1.6)
    }
  }
  // 切り離し：前と後ろの小さなロケットの煙
  if (c.sepK > 0 && c.sepK < 1.2) {
    for (let i = n(60); i > 0; i--) {
      const side = Math.random() < 0.5 ? -1 : 1
      _v3.set(0, Math.random() < 0.5 ? 3 : 42, side * (6.4 + c.sepK * 3)).applyMatrix4(_m4.compose(veh, _q.setFromUnitVectors(Y, nose), _v2.set(1, 1, 1)))
      sm.emit(_v3.x, _v3.y, _v3.z, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, side * 8, 5 + Math.random() * 4, 6, 2, STEAM)
    }
  }
}

/** 発射台の章：機体にそって光る 3 つの点（押すとカードと、その部品へ寄るカメラ） */
function PadHotspots() {
  useLang()
  const t = ui().shuttle
  const phase = useShuttle((s) => s.phase)
  const padSpot = useShuttle((s) => s.padSpot)
  const groups = useRef<(THREE.Group | null)[]>([])
  useFrame(({ camera }) => {
    // いつも機体のカメラ側のふちに置く（機体のかげに隠れないように）
    _v.set(camera.position.x, 0, camera.position.z).normalize()
    PAD_SPOTS.forEach((id, i) => {
      const g = groups.current[i]
      const a = SPOT_AT[id]
      if (g) g.position.copy(a.p).addScaledVector(_v, a.r)
    })
  })
  if (phase !== 'pad') return null
  return (
    <>
      {PAD_SPOTS.map((id, i) => (
        <group key={id} ref={(g) => (groups.current[i] = g)}>
          <Html zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
            <button className={`shuttle-dot ${padSpot === id ? 'on' : ''}`} onClick={() => openPadSpot(padSpot === id ? null : id)}>
              <i />
              <span>{t.pad.spot[id].name}</span>
            </button>
          </Html>
        </group>
      ))}
    </>
  )
}

/** 場面に入る前に、形を先に読み始める */
export function preloadShuttleLaunch() {
  useGLTF.preload(STACK_URL)
  useGLTF.preload(PAD_URL)
  useGLTF.preload(CABIN_URL)
}
