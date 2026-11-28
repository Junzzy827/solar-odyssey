import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { lowMemory } from '../../state/quality'
import { markShuttleReady, setArmReady, setOrbitStep, shuttleDebug, shuttleInput, useShuttle, type OrbitStep, type ShuttleSpot } from '../../state/shuttle'
import { FloatController, createFloatInput } from './floatControl'
import { cabinMaterial, flatMaterial, glassMaterial, useCabinMeta } from './cabinMaterial'
import { OutsideSky } from './outside'
import { BERTH, EE, L1, LW, SHOULDER, clampAim, solveArm } from './armIk'
import { adiTexture, crtTexture, drawCrt, monitorMaterial, prepareAdi } from './screens'
import { shrinkTexture } from '../surface/shrinkTexture'
import { roomEnvironment } from '../telescope/parts'

// 乗員室の中身：焼いた部屋（色 × 光の地図、実行中の照明なし）、画面、浮いている小物、
// 外の地球・星（別の場面で先に描く）、オービターの外側と荷物室のハッブル、無重力の動き、見どころ。
// 座標は 1 単位 = 1 m。原点はミッドデッキの床の中心線上、乗員室の後ろの壁。前が -Z、上が +Y（tools/shuttle/cabin.md）。

const base = import.meta.env.BASE_URL
const CABIN_URL = `${base}models/shuttle-cabin.glb`
const ORBITER_URL = `${base}models/shuttle-orbiter.glb`
const HUBBLE_URL = `${base}models/hubble.glb`

/** 見どころ：近づくとボタンが出る所と、入ったときの目の位置・向き */
const SPOTS: Record<ShuttleSpot, { at: THREE.Vector3; eye: THREE.Vector3; yaw: number; pitch: number }> = {
  seat: { at: new THREE.Vector3(-0.58, 3.2, -2.75), eye: new THREE.Vector3(-0.58, 3.4, -2.78), yaw: 0, pitch: -0.08 },
  // アームの台：窓のすぐ前から、少し下を見る（荷物室と、左の縁から起き上がる腕が見える。離れて上を向くと、ハッブルの胴しか見えなかった）
  // 目は窓のガラスのすぐ手前（窓は 37 × 28 cm と小さいので、離れると枠しか見えない）
  arm: { at: new THREE.Vector3(0.36, 3.4, -0.6), eye: new THREE.Vector3(0.34, 3.7, -0.17), yaw: Math.PI, pitch: -0.08 },
  bag: { at: new THREE.Vector3(0.95, 1.1, -2.25), eye: new THREE.Vector3(1.32, 1.15, -2.25), yaw: Math.PI / 2, pitch: 0.02 },
}
const NEAR_SPOT = 0.95
const SPAWN = new THREE.Vector3(0.1, 3.25, -1.2)
/** 床の穴（左右 2 つ）：中心 x、z、半径。ここを上下に通るときは中心へ少し寄せる */
const HOLES = [
  { x: -1.22, z: -1.355, r: 0.42, y0: 1.5, y1: 3.0 },
  { x: 1.22, z: -1.355, r: 0.42, y0: 1.5, y1: 3.0 },
]
/** 乗員室の外へ出てしまったときに戻すための箱 */
const INSIDE = new THREE.Box3(new THREE.Vector3(-2.0, -0.1, -5.2), new THREE.Vector3(2.0, 4.6, 0.2))

const v1 = new THREE.Vector3()
const v3 = new THREE.Vector3()
const vGoal = new THREE.Vector3()
const qY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
const smooth = (x: number) => x * x * (3 - 2 * x)

// ---- 軌道の章（段階 3）：扉、ハッブル、アーム ----
// 座標はオービターの glb と同じ（乗員室と共通。tools/blender/build_shuttle.py の X 右・Y 前・Z 上を、three の X・-Z・Y に読みかえたもの）
/** 起こしたアームの先が最初に止まる所（つかむ所の少し手前・下。ここから子どもが合わせる）。肩・腕の長さ・台は armIk.ts */
const READY = new THREE.Vector3(0.9, 7.0, 10.0)
const RAISE_SEC = 4
/** 扉が開ききった角度（172°）と、開く時間（本物は 1 枚 63 秒。ここでは 2 枚ずつ、まとめて 12 秒で） */
const DOOR_OPEN = THREE.MathUtils.degToRad(172)
const DOOR_SEC = 12
/** つかむ前に浮かんで待つ所（荷物室の後ろの真上）と、近づいてくる前の所（後ろ遠く） */
const HOVER = new THREE.Vector3(0.3, 6.4, 15.2)
const APPROACH_FROM = new THREE.Vector3(0.3, 9.5, 70)
const APPROACH_SEC = 10
/** つかむ所（グラップル・フィクスチャ）：ハッブルの底から 2 m 上、乗員室の側の面から突き出た棒の先（底の中心から見た位置。半径はモデルから） */
const FIXTURE_UP = 2.0
/** 届いたとみなす距離（m）。子ども向けに広め。近づくと少し吸い寄せる */
const GRAB_R = 0.4
const MAGNET_R = 1.3
/** アームの先の速さ（m/秒）。本物は荷物を持って秒速 6 cm（FACTS.md 3）。遊びとして速くしている */
const TIP_SPEED = 1.1
const TIP_SPEED_HELD = 0.7
/** 立てるときの時間（秒） */
const BERTH_SEC = 1.6

export function ShuttleWorld() {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const scene = useThree((s) => s.scene)
  const phone = lowMemory()
  const cabin = useGLTF(CABIN_URL)
  const orbiter = useGLTF(ORBITER_URL)
  const hubble = useGLTF(HUBBLE_URL)
  const sfx = phone ? '.phone' : ''
  const [atlas, lmDay, lmDark] = useTexture([`${base}models/shuttle-cabin.atlas${sfx}.webp`, `${base}models/shuttle-cabin.light-day${sfx}.webp`, `${base}models/shuttle-cabin.light-dark${sfx}.webp`])
  const meta = useCabinMeta()

  // ---- 部屋と部品の材質 ----
  const parts = useMemo(() => {
    atlas.colorSpace = THREE.SRGBColorSpace
    atlas.flipY = false
    atlas.anisotropy = 8
    for (const t of [lmDay, lmDark]) {
      t.colorSpace = THREE.NoColorSpace
      t.flipY = false
    }
    const mat = cabinMaterial(atlas, lmDay, lmDark, meta)
    const flat = flatMaterial(atlas, mat)
    const glass = glassMaterial()
    const root = cabin.scene.clone(true)
    const screens: Record<string, THREE.Mesh> = {}
    const named: Record<string, THREE.Object3D> = {}
    let collider: THREE.Mesh | null = null
    const owned: { dispose: () => void }[] = [mat, flat, glass]
    root.traverse((o) => {
      named[o.name] = o
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.frustumCulled = o.name !== 'room'
      if (o.name === 'collider') {
        collider = m
        m.visible = false
      } else if (o.name.startsWith('screen_')) screens[o.name] = m
      else if (o.name.startsWith('adi_')) screens[o.name] = m
      else if (o.name.startsWith('glass')) {
        m.material = glass
        m.renderOrder = 2
      } else if (o.name.startsWith('float_')) m.material = flat
      else m.material = m.geometry.getAttribute('uv1') ? mat : flat
    })
    // 姿勢球：形の中心を原点にして回せるように（UV も作り直す）
    for (const id of ['adi_cdr', 'adi_plt']) if (screens[id]) prepareAdi(screens[id])
    // 画面：前の CRT 3 台・後ろの CRT 1 台は緑の文字、後ろのモニター 2 台は荷物室のカメラ
    const crts: { tex: THREE.CanvasTexture; kind: number }[] = []
    let k = 0
    for (const id of ['screen_crt1', 'screen_crt2', 'screen_crt3', 'screen_crt4']) {
      const m = screens[id]
      if (!m) continue
      const tex = crtTexture()
      drawCrt(tex, k, 0)
      crts.push({ tex, kind: k++ })
      const mm = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
      m.material = mm
      owned.push(mm, tex)
    }
    const adiTex = adiTexture()
    owned.push(adiTex)
    for (const id of ['adi_cdr', 'adi_plt']) {
      const m = screens[id]
      if (!m) continue
      const mm = new THREE.MeshBasicMaterial({ map: adiTex, toneMapped: false })
      m.material = mm
      owned.push(mm)
    }
    const mon = monitorMaterial()
    owned.push(mon.material, mon.target)
    for (const id of ['screen_mon1', 'screen_mon2']) if (screens[id]) screens[id].material = mon.material
    return { root, named, screens, collider: collider as THREE.Mesh | null, mat, crts, mon, owned }
  }, [cabin, atlas, lmDay, lmDark, meta])
  useEffect(() => () => parts.owned.forEach((o) => o.dispose()), [parts])

  // ---- オービターの外側（扉を開き、アームを少し上げる）とハッブル ----
  const outside = useMemo(() => {
    const root = orbiter.scene.clone(true)
    const owned: { dispose: () => void }[] = []
    const mats = new Map<THREE.Material, THREE.Material>()
    const arm: Record<string, THREE.Object3D> = {}
    const doors: { o: THREE.Object3D; sign: number }[] = []
    root.traverse((o) => {
      if (o.name.startsWith('rms_')) arm[o.name] = o
      // 扉（開け閉めは毎フレーム）。素材が 2 つある扉は、読み込むと「組（door_x）＋中の形（door_x_1, door_x_2）」になる。
      // 中の形まで回すと 2 回分（344°）回って、ほとんど閉じた扉が荷物室の上をふさいでいた → 組だけを回す
      if (o.name.startsWith('door_') && !o.parent?.name.startsWith('door_')) doors.push({ o, sign: o.name.includes('port') ? 1 : -1 })
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      // 照らし方は軽い Lambert で（金属の映り込みはいらない）
      const src = m.material as THREE.MeshStandardMaterial
      let lm = mats.get(src)
      if (!lm) {
        lm = new THREE.MeshLambertMaterial({ color: src.color?.clone() ?? new THREE.Color('#ddd'), emissive: src.emissive?.clone() ?? new THREE.Color(0) })
        mats.set(src, lm)
        owned.push(lm)
      }
      m.material = lm
    })
    // ハッブル：長い軸（元は +Y）をそのまま上（地球の側）へ立てて、荷物室の後ろに置く
    const env = roomEnvironment(gl)
    const hub = hubble.scene.clone(true)
    hub.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const src = m.material as THREE.MeshStandardMaterial
      const mm = src.clone()
      mm.envMap = env
      mm.envMapIntensity = 0.7
      // ハッブルは窓から 10 m 以上先なので、絵は小さくてよい（メモリ対策）
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap'] as const) {
        const t = mm[key]
        if (!t) continue
        const s = shrinkTexture(t, phone ? 256 : 512)
        if (s) {
          mm[key] = s
          owned.push(s)
        }
      }
      m.material = mm
      owned.push(mm)
    })
    const box = new THREE.Box3().setFromObject(hub)
    // ハッブルを「底の中心」を原点にした組に入れる（台に立てるとき、底の高さ 1.9 m：荷物室の縁の高さにある台の輪
    // tools/blender/build_shuttle.py の HUBBLE_BASE_Z の上。ハッブルは荷物室の幅いっぱいの太さなので、床の近くに置くと壁にめりこむ）
    hub.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2)
    const hubWrap = new THREE.Group()
    hubWrap.name = 'hubble'
    hubWrap.add(hub)
    hubWrap.position.copy(BERTH)
    root.add(hubWrap)
    // つかむ所：乗員室の側の面に、台の板と突き出た棒、目印の的（白い十字と黒い円。手首のカメラで狙う）
    const hubR = Math.min(2.4, (box.max.z - box.min.z) / 2)
    const fixture = new THREE.Group()
    fixture.name = 'hubble_fixture'
    fixture.position.set(0, FIXTURE_UP, -hubR)
    const fixMat = new THREE.MeshLambertMaterial({ color: '#c9ccd2' })
    const dark = new THREE.MeshBasicMaterial({ color: '#111' })
    const white = new THREE.MeshBasicMaterial({ color: '#f4f4f4' })
    owned.push(fixMat, dark, white)
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.08), fixMat)
    plate.position.z = -0.04
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.42, 10).rotateX(Math.PI / 2), fixMat)
    pin.position.z = -0.29
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), fixMat)
    knob.position.z = -0.5
    // 的：棒の少し上の板（本物は棒のそばの目印を、手首のカメラの十字と重ねて狙う）
    const target = new THREE.Group()
    target.position.set(0, 0.55, -0.1)
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24).rotateY(Math.PI), dark)
    const barH = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.04).rotateY(Math.PI), white)
    const barV = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.34).rotateY(Math.PI), white)
    barH.position.z = barV.position.z = -0.005
    target.add(disc, barH, barV)
    fixture.add(plate, pin, knob, target)
    for (const m of [plate, pin, knob, disc, barH, barV]) owned.push(m.geometry)
    hubWrap.add(fixture)
    /** 棒の先（つかむ輪の中心がここへ来ればよい）：底の中心から見た位置 */
    const grip = new THREE.Vector3(0, FIXTURE_UP, -hubR - 0.5)
    // 台の上の光る輪（立てる所の目印。立てる段のときだけ）
    const ringMat = new THREE.MeshBasicMaterial({ color: '#5fd4ff', transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide })
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.85, 2.3, 48).rotateX(-Math.PI / 2), ringMat)
    // 台の輪（fss_ring）と同じ高さだと隠れるので、少し上に浮かせる
    ring.position.copy(BERTH).add(new THREE.Vector3(0, 0.14, 0))
    ring.visible = false
    root.add(ring)
    owned.push(ringMat, ring.geometry)
    // つかむ輪の先の光（届くと明るくなる）
    const tipMat = new THREE.MeshBasicMaterial({ color: '#7dffb0', transparent: true, opacity: 0, depthWrite: false })
    const tipGlow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), tipMat)
    root.add(tipGlow)
    owned.push(tipMat, tipGlow.geometry)
    return { root, arm, doors, hubWrap, grip, ring, ringMat, tipGlow, tipMat, owned }
  }, [orbiter, hubble, gl, phone])
  useEffect(() => () => outside.owned.forEach((o) => o.dispose()), [outside])

  // ---- 無重力の動き ----
  const ctl = useMemo(() => {
    const c = new FloatController({ radius: 0.22 })
    c.funnels = HOLES
    return c
  }, [])
  const input = useMemo(() => createFloatInput(), [])
  useEffect(() => {
    const col = parts.collider
    if (col) {
      parts.root.updateMatrixWorld(true)
      ctl.setCollider(col.geometry, col.matrixWorld)
    }
    ctl.place(SPAWN, 0, -0.05)
    return () => ctl.dispose()
  }, [parts, ctl])

  // 読み終えたら幕を開ける（最初の数フレームはシェーダーの準備で止まるので、少し待つ）
  const frames = useRef(0)
  // 光の切り替え（0 = 昼、1 = 夜）と、見どころ・アームの状態
  const mix = useRef(useShuttle.getState().light === 'dark' ? 1 : 0)
  const st = useRef({ spot: null as ShuttleSpot | null, blend: 0, blendAt: 0, arrived: false, mixT: 0, from: new THREE.Vector3(), fromYaw: 0, fromPitch: 0, stick: new THREE.Vector2(), depth: 0, att: new THREE.Euler(), arm: { yaw: 0, pitch: 0, elbow: 0, wrist: 0, wristYaw: 0 }, crtT: 0, monT: 0, push: null as null | { v: THREE.Vector3; left: number }, orbit: null as OrbitStep | null, orbitAt: 0, doorK: 0, tip: new THREE.Vector3(), aim: new THREE.Vector3(), hubPos: new THREE.Vector3().copy(APPROACH_FROM), berthFrom: new THREE.Vector3(), armK: 0, pendingAim: null as THREE.Vector3 | null, armOn: false, raiseFrom: new THREE.Vector3(), focus: new THREE.Vector3(), hasFocus: false, lookIdle: 9 })
  const sky = useRef<{ setAttitude: (e: THREE.Euler) => void; render: (r: THREE.WebGLRenderer, cam: THREE.PerspectiveCamera, dark: number, dt: number) => void } | null>(null)
  const wristCam = useMemo(() => new THREE.PerspectiveCamera(55, 4 / 3, 0.05, 400), [])
  const pipEl = useRef<HTMLElement | null>(null)
  const bayCam = useMemo(() => {
    const c = new THREE.PerspectiveCamera(40, 4 / 3, 0.3, 120)
    // 荷物室の前の壁の上から、後ろのハッブルを見る
    c.position.set(-1.6, 2.9, 1.6)
    c.lookAt(0, 4.5, 15)
    return c
  }, [])

  useEffect(() => {
    shuttleDebug.place = (x, y, z, yaw = ctl.yaw, pitch = 0) => {
      // 見どころの外へ置く（見どころを出たときの「少し下がった所へ戻す」を、この置き場所で上書きしないように）
      useShuttle.setState({ spot: null })
      st.current.spot = null
      ctl.frozen = false
      ctl.place(new THREE.Vector3(x, y, z), yaw, pitch)
    }
    shuttleDebug.show = (name, on) => {
      const o = name === 'orbiter' ? outside.root : scene.getObjectByName(name)
      if (o) o.visible = on
    }
    shuttleDebug.pose = () => ({ pos: ctl.pos.toArray(), yaw: ctl.yaw, pitch: ctl.pitch })
    // 押す長さは場面の時間で数える（1 コマが重いヘッドレスでも、時計だけ進んで一度も押さずに終わらないように）
    shuttleDebug.push = (x, y, z, sec) => (st.current.push = { v: new THREE.Vector3(x, y, z), left: sec })
    shuttleDebug.info = () => {
      const i = gl.info
      let tex = 0
      const seen = new Set<THREE.Texture>()
      const add = (t: THREE.Texture | null | undefined) => {
        if (!t || seen.has(t)) return
        seen.add(t)
        const img = t.image as { width?: number; height?: number } | undefined
        if (img?.width && img.height) tex += img.width * img.height * 4 * (t.generateMipmaps ? 4 / 3 : 1)
      }
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
        if (!m) return
        for (const mm of Array.isArray(m) ? m : [m]) {
          for (const v of Object.values(mm as unknown as Record<string, unknown>)) if (v instanceof THREE.Texture) add(v)
          const u = (mm as THREE.ShaderMaterial).uniforms
          if (u) for (const x of Object.values(u)) if (x.value instanceof THREE.Texture) add(x.value)
        }
      })
      const skyInfo = (window as unknown as { __shuttleSkyTex?: () => number }).__shuttleSkyTex?.() ?? 0
      return { calls: i.render.calls, triangles: i.render.triangles, textures: i.memory.textures, geometries: i.memory.geometries, cabinTexMB: tex / 1048576, skyTexMB: skyInfo / 1048576 }
    }
    // 軌道の章：その段階へ飛ぶ（扉は開いた所、ハッブルは荷物室の上、アームは起こした所から）
    shuttleDebug.orbitTo = (step) => {
      const S = st.current
      S.doorK = step === 'doors' ? 0 : step === 'opening' ? S.doorK : 1
      if (step === 'grab' || step === 'berth' || step === 'done') {
        S.hubPos.copy(HOVER)
        S.armOn = true
        S.armK = 1
        S.aim.copy(step === 'grab' ? READY : v3.copy(HOVER).add(outside.grip))
      }
      setOrbitStep(step)
    }
    // 狙いは次のコマで入れる（ボタンを押した直後に呼ぶと、段階が変わったときの「先をつかむ所へ合わせる」で上書きされていた。CI の遅いコマで起きた）
    shuttleDebug.aimAt = (x, y, z) => void (st.current.pendingAim = new THREE.Vector3(x, y, z))
    shuttleDebug.arm = () => {
      const S = st.current
      const goal = v3.copy(S.orbit === 'berth' ? BERTH : S.hubPos).add(outside.grip)
      return { tip: S.tip.toArray(), target: goal.toArray(), dist: S.tip.distanceTo(goal), hub: S.hubPos.toArray() }
    }
    return () => {
      delete shuttleDebug.place
      delete shuttleDebug.pose
      delete shuttleDebug.info
      delete shuttleDebug.push
      delete shuttleDebug.orbitTo
      delete shuttleDebug.aimAt
      delete shuttleDebug.arm
    }
  }, [ctl, gl, scene, outside])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const t = performance.now() / 1000
    const s = useShuttle.getState()
    const S = st.current
    if (frames.current < 4 && ++frames.current === 4) markShuttleReady()

    // 入力：キー・スティック・上下のボタン
    const k = shuttleInput.keys
    const kx = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0)
    const kz = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0)
    const ax = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0)
    const az = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0)
    const ky = (k.has('Space') ? 1 : 0) - (k.has('ShiftLeft') || k.has('ShiftRight') ? 1 : 0)
    const sx = THREE.MathUtils.clamp(kx + ax + shuttleInput.stick.x, -1, 1)
    const sz = THREE.MathUtils.clamp(kz + az + shuttleInput.stick.z, -1, 1)
    input.lookX += shuttleInput.lookX
    input.lookY += shuttleInput.lookY
    shuttleInput.lookX = 0
    shuttleInput.lookY = 0

    // 見どころ：入る・出るときは、目をなめらかに運ぶ
    if (s.spot !== S.spot) {
      S.from.copy(ctl.pos)
      S.fromYaw = ctl.yaw
      S.fromPitch = ctl.pitch
      S.blend = 0
      S.blendAt = t
      S.arrived = false
      if (!s.spot && S.spot) {
        // 出たら、その場から少し下がった所でただよう
        const sp = SPOTS[S.spot]
        v1.set(Math.sin(sp.yaw), 0, Math.cos(sp.yaw)).multiplyScalar(0.25)
        ctl.place(sp.eye.clone().add(v1), sp.yaw, sp.pitch)
      }
      S.spot = s.spot
      ctl.frozen = !!s.spot
    }
    if (S.spot) {
      const sp = SPOTS[S.spot]
      // 時計で進める（重い端末でコマが飛んでも 1.2 秒で着く）
      S.blend = Math.min(1, (t - S.blendAt) / 1.2)
      const e = S.blend * S.blend * (3 - 2 * S.blend)
      ctl.pos.lerpVectors(S.from, sp.eye, e)
      if (S.blend < 1) {
        ctl.yaw = S.fromYaw + angleDiff(S.fromYaw, sp.yaw) * e
        ctl.pitch = S.fromPitch + (sp.pitch - S.fromPitch) * e
      } else {
        // 着いた最初のコマで、向きをぴったり合わせる（重い端末でコマが飛ぶと、途中の向きのまま止まっていた）
        if (!S.arrived) {
          S.arrived = true
          ctl.yaw = sp.yaw
          ctl.pitch = sp.pitch
        }
        // 席では見回しだけできる（向きは少しの範囲で）
        S.lookIdle = input.lookX || input.lookY ? 0 : S.lookIdle + dt
        ctl.yaw = sp.yaw + THREE.MathUtils.clamp(angleDiff(sp.yaw, ctl.yaw - input.lookX), -1.2, 1.2)
        ctl.pitch = THREE.MathUtils.clamp(ctl.pitch - input.lookY, -0.9, 0.9)
        // アームの台：しばらく見回さなければ、アームの先やハッブルの方へ目が向く（窓がせまく、腕がすぐ見えなくなるので）
        if (S.spot === 'arm' && S.hasFocus && S.lookIdle > 1.5) {
          v1.subVectors(S.focus, ctl.pos)
          const yawT = sp.yaw + THREE.MathUtils.clamp(angleDiff(sp.yaw, Math.atan2(-v1.x, -v1.z)), -1.2, 1.2)
          const pitchT = THREE.MathUtils.clamp(Math.atan2(v1.y, Math.hypot(v1.x, v1.z)), -0.9, 0.9)
          const e2 = Math.min(1, dt * 1.6)
          ctl.yaw += angleDiff(ctl.yaw, yawT) * e2
          ctl.pitch += (pitchT - ctl.pitch) * e2
        }
      }
      input.lookX = 0
      input.lookY = 0
      // 操縦かん・アームのにぎり（左は上下左右、右は前・手前）
      S.stick.lerp(v2(sx, sz), Math.min(1, dt * 6))
      S.depth += (THREE.MathUtils.clamp(ky + shuttleInput.lift, -1, 1) - S.depth) * Math.min(1, dt * 6)
    } else {
      S.stick.lerp(v2(0, 0), Math.min(1, dt * 4))
      S.depth *= Math.exp(-dt * 4)
      input.move.set(sx, ky + shuttleInput.lift, sz)
      if (S.push && S.push.left > 0) {
        input.move.copy(S.push.v)
        S.push.left -= dt
      }
      ctl.update(dt, input)
      if (!INSIDE.containsPoint(ctl.pos)) ctl.place(SPAWN, ctl.yaw, 0)
      // 近くの見どころ
      let near: ShuttleSpot | null = null
      let best = NEAR_SPOT
      for (const id of Object.keys(SPOTS) as ShuttleSpot[]) {
        const d = SPOTS[id].at.distanceTo(ctl.pos)
        if (d < best) {
          best = d
          near = id
        }
      }
      if (near !== s.near) useShuttle.setState({ near })
    }
    // いる階（見どころへ運ばれているあいだも合わせる：寝ぶくろへ下りたのに「フライトデッキ」のままだった）
    const deck = ctl.pos.y > 2.3 ? 'flight' : 'mid'
    if (deck !== s.deck) useShuttle.setState({ deck })
    ctl.apply(camera)

    // 船長の席：操縦かんを倒すと、機体がゆっくり傾き、窓の地平線と姿勢球が動く
    const stickObj = parts.named['rhc_cdr']
    if (stickObj) stickObj.rotation.set(S.spot === 'seat' ? -S.stick.y * 0.25 : 0, 0, S.spot === 'seat' ? -S.stick.x * 0.25 : 0)
    if (S.spot === 'seat') {
      S.att.x += -S.stick.y * dt * 0.12
      S.att.z += -S.stick.x * dt * 0.16
    } else {
      S.att.x *= Math.exp(-dt * 0.3)
      S.att.z *= Math.exp(-dt * 0.3)
    }
    S.att.x = THREE.MathUtils.clamp(S.att.x, -0.5, 0.5)
    S.att.z = THREE.MathUtils.clamp(S.att.z, -0.7, 0.7)
    sky.current?.setAttitude(S.att)
    for (const id of ['adi_cdr', 'adi_plt']) {
      const m = parts.screens[id]
      if (m) m.rotation.set(-S.att.x, 0, -S.att.z, 'ZXY')
    }

    // ---- 軌道の章：扉を開ける → ハッブルが来る → アームでつかむ → 荷物室に立てる ----
    if (s.orbit !== S.orbit) {
      S.orbit = s.orbit
      S.orbitAt = 0
      if (s.orbit === 'doors') {
        S.doorK = 0
        S.armOn = false
        S.armK = 0
        S.hubPos.copy(APPROACH_FROM)
      }
      if (s.orbit === 'grab' && !S.armOn) {
        // アームを荷物室の縁から起こす（今の先の位置から、つかむ所の手前へ）
        S.armOn = true
        S.armK = 0
        S.raiseFrom.copy(S.tip.lengthSq() ? S.tip : v1.set(SHOULDER.x, SHOULDER.y, SHOULDER.z + L1 + LW + EE))
      }
      if (s.orbit === 'berth') S.aim.copy(S.hubPos).add(outside.grip)
      if (s.orbit === 'done') S.berthFrom.copy(S.hubPos)
    }
    S.orbitAt += dt
    if (S.pendingAim) {
      S.aim.copy(S.pendingAim)
      S.pendingAim = null
    }
    if (S.orbit === 'opening') {
      S.doorK = Math.min(1, S.doorK + dt / DOOR_SEC)
      if (S.doorK >= 1) setOrbitStep('approach')
    }
    // 扉：右（stbd）が先、左（port）があと
    for (const d of outside.doors) {
      const k = d.sign < 0 ? THREE.MathUtils.clamp(S.doorK * 2, 0, 1) : THREE.MathUtils.clamp(S.doorK * 2 - 1, 0, 1)
      d.o.rotation.z = d.sign * DOOR_OPEN * smooth(k)
    }
    if (S.orbit === 'approach') {
      // 2 日後：後ろの遠くから、荷物室の上へゆっくり来る（最後はそっと止まる）
      const k = Math.min(1, S.orbitAt / APPROACH_SEC)
      S.hubPos.lerpVectors(APPROACH_FROM, HOVER, 1 - (1 - k) ** 3)
      if (k >= 1) setOrbitStep('grab')
    } else if (S.orbit === 'done') {
      // 固定：台の輪の上へ、すっと下りる
      if (S.orbitAt <= BERTH_SEC + 0.05) {
        S.hubPos.lerpVectors(S.berthFrom, BERTH, smooth(Math.min(1, S.orbitAt / BERTH_SEC)))
        S.aim.copy(S.hubPos).add(outside.grip)
      }
    }

    // アーム：先の狙い（aim）を動かし、2 本の腕の角度を毎回計算する（肩の左右・上下、ひじ、手首。手首から先は水平に保つ）
    const thc = parts.named['rms_thc']
    const rhc = parts.named['rms_rhc']
    const armSeat = S.spot === 'arm'
    if (thc) thc.rotation.set(armSeat ? -S.stick.y * 0.3 : 0, 0, armSeat ? -S.stick.x * 0.3 : 0)
    if (rhc) rhc.rotation.set(armSeat ? -S.depth * 0.3 : 0, 0, 0)
    const A = S.arm
    const holding = S.orbit === 'berth'
    vGoal.copy(holding ? BERTH : S.hubPos).add(outside.grip)
    if (S.armOn) {
      if (S.armK < 1) {
        S.armK = Math.min(1, S.armK + dt / RAISE_SEC)
        S.aim.lerpVectors(S.raiseFrom, READY, smooth(S.armK))
      } else if (armSeat && (S.orbit === 'grab' || holding || (S.orbit === 'done' && S.orbitAt > BERTH_SEC + 0.5))) {
        const sp = holding ? TIP_SPEED_HELD : TIP_SPEED
        // 見ている向きで動かす：左のにぎりで右・左・上・下、右のにぎりで前（奥）・手前
        v1.set(Math.cos(ctl.yaw), 0, -Math.sin(ctl.yaw)).multiplyScalar(S.stick.x * sp * dt)
        v3.set(-Math.sin(ctl.yaw), 0, -Math.cos(ctl.yaw)).multiplyScalar(S.depth * sp * dt)
        S.aim.add(v1).add(v3)
        S.aim.y += S.stick.y * sp * dt
        // 近くまで来たら、少し吸い寄せる（子ども向け。立てたあとは、はなして自由に動かせる）
        const d = S.aim.distanceTo(vGoal)
        if (d < MAGNET_R && S.orbit !== 'done') S.aim.lerp(vGoal, Math.min(1, dt * (0.6 + 2 * (1 - d / MAGNET_R))))
      }
      clampAim(S.aim, holding ? outside.grip : null)
      solveArm(S.aim, A)
    }
    if (outside.arm.rms_yaw) outside.arm.rms_yaw.rotation.y = A.yaw
    if (outside.arm.rms_pitch) outside.arm.rms_pitch.rotation.x = A.pitch
    if (outside.arm.rms_elbow) outside.arm.rms_elbow.rotation.x = A.elbow
    if (outside.arm.rms_wrist) outside.arm.rms_wrist.rotation.x = A.wrist
    // 手首の左右：先の筒（rms_ee）を手首のまわりに回す（手首から先が真後ろを向く）
    const wrist = outside.arm.rms_ee ?? outside.arm.rms_wrist
    if (wrist) {
      if (wrist !== outside.arm.rms_wrist) wrist.rotation.y = A.wristYaw
      outside.arm.rms_yaw?.updateMatrixWorld(true)
      outside.root.worldToLocal(wrist.localToWorld(S.tip.set(0, 0, EE)))
    }
    // つかんでいる間は、ハッブルがアームの先についていく
    if (holding) S.hubPos.copy(S.tip).sub(outside.grip)
    outside.hubWrap.position.copy(S.hubPos)
    // 届いたか：つかむ所まで / 台の輪の上まで
    let ready = false
    let glow = 0
    if (S.orbit === 'grab' && S.armK >= 1) {
      const d = S.tip.distanceTo(vGoal)
      ready = d < GRAB_R
      glow = ready ? 0.9 : d < 2 ? 0.25 + 0.35 * (1 - d / 2) : 0.2
    } else if (holding) {
      ready = Math.hypot(S.hubPos.x - BERTH.x, S.hubPos.z - BERTH.z) < 0.35 && S.hubPos.y - BERTH.y < 0.45
    }
    if (ready !== s.armReady) setArmReady(ready)
    outside.tipGlow.visible = glow > 0
    outside.tipGlow.position.copy(S.tip)
    outside.tipMat.opacity = glow * (0.75 + 0.25 * Math.sin(t * 6))
    outside.ring.visible = holding
    outside.ringMat.color.set(ready ? '#7dffb0' : '#5fd4ff')
    outside.ringMat.opacity = 0.7 + 0.2 * Math.sin(t * 4)
    // 目が向く先（アームの台で、見回していないとき）
    S.hasFocus = S.orbit !== 'doors'
    if (S.orbit === 'opening') S.focus.set(0, 2.5, 9)
    else if (S.orbit === 'approach') S.focus.copy(S.hubPos).add(v1.set(0, 5, 0))
    else if (S.orbit === 'grab') S.focus.copy(S.tip).lerp(vGoal, 0.5)
    else if (holding) S.focus.copy(S.hubPos).lerp(BERTH, 0.5).add(v1.set(0, 1.2, 0))
    else S.focus.copy(BERTH).add(v1.set(0, 4, 0))

    // 浮いている小物：ゆっくり回りながら、少しずつ漂う
    for (const [name, sp] of [['float_pen', 0.11], ['float_card', 0.07], ['float_pouch', 0.05]] as const) {
      const o = parts.named[name]
      if (!o) continue
      const base0 = (o.userData.base ??= o.position.clone()) as THREE.Vector3
      o.position.set(base0.x + Math.sin(t * sp * 2.1) * 0.06, base0.y + Math.sin(t * sp * 3.3 + 1) * 0.05, base0.z + Math.cos(t * sp * 1.7) * 0.06)
      o.rotation.set(t * sp * 1.3, t * sp, t * sp * 0.7)
    }

    // 明かり：昼 ↔ 夜（寝ぶくろの中では暗く）
    const wantDark = s.light === 'dark' || (S.spot === 'bag' && S.blend > 0.6) ? 1 : 0
    // 時計で進める（1.6 秒で切り替わる）
    const realDt = Math.min(0.5, t - (S.mixT || t))
    S.mixT = t
    mix.current += THREE.MathUtils.clamp(wantDark - mix.current, -realDt / 1.6, realDt / 1.6)
    parts.mat.uniforms.uMix.value = mix.current

    // 画面の文字：1 秒ごと（時計など）
    if (t - S.crtT > 1) {
      S.crtT = t
      for (const c of parts.crts) drawCrt(c.tex, c.kind, t)
    }

    // 描く：先に外（地球と星。遠くまで描けるカメラ）、奥行きを消して中（乗員室・オービター・ハッブル）
    gl.autoClear = false
    gl.clear()
    sky.current?.render(gl, camera, mix.current, dt)
    gl.clearDepth()
    // 荷物室のカメラ：ときどき撮ってモニターに
    if (t - S.monT > (phone ? 0.5 : 0.2)) {
      S.monT = t
      const vis = parts.mon.material.visible
      parts.mon.material.visible = false
      gl.setRenderTarget(parts.mon.target)
      gl.clear()
      gl.render(scene, bayCam)
      gl.setRenderTarget(null)
      parts.mon.material.visible = vis
    }
    gl.render(scene, camera)
    // 手首のカメラ：画面の小窓（HUD の枠 .shuttle-pip の所）に、アームの先から見た景色を描く
    const pipOn = S.spot === 'arm' && (S.orbit === 'grab' || S.orbit === 'berth') && wrist
    if (pipOn && !pipEl.current?.isConnected) pipEl.current = document.querySelector<HTMLElement>('.shuttle-pip-view')
    if (pipOn && pipEl.current?.isConnected) {
      const r = pipEl.current.getBoundingClientRect()
      const c = gl.domElement.getBoundingClientRect()
      if (r.width > 4 && r.height > 4) {
        // 手首から先の上、少し後ろ（つかむ所の上の的が、つかめる位置で真ん中に来る）
        wrist.localToWorld(wristCam.position.set(0, 0.55, 0.55))
        wrist.getWorldQuaternion(wristCam.quaternion).multiply(qY)
        wristCam.aspect = r.width / r.height
        wristCam.updateProjectionMatrix()
        const x = r.left - c.left
        const y = c.bottom - r.bottom
        gl.setViewport(x, y, r.width, r.height)
        gl.setScissor(x, y, r.width, r.height)
        gl.setScissorTest(true)
        gl.clear()
        sky.current?.render(gl, wristCam, mix.current, 0)
        gl.clearDepth()
        parts.root.visible = false
        outside.tipGlow.visible = false
        gl.render(scene, wristCam)
        parts.root.visible = true
        gl.setScissorTest(false)
        gl.setViewport(0, 0, c.width, c.height)
      }
    }
  }, 1)

  return (
    <>
      <primitive object={parts.root} />
      <primitive object={outside.root} />
      {/* オービターの外側だけを照らす光（乗員室は焼いた光なので影響しない） */}
      <SunLights mix={mix} />
      <OutsideSky ref={sky} />
    </>
  )
}

const _v2 = new THREE.Vector2()
const v2 = (x: number, y: number) => _v2.set(x, y)

/** a から b への、いちばん近い回り方の角度 */
function angleDiff(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/** 昼は太陽と地球の照り返し、夜は地球の街の明かりくらい */
function SunLights({ mix }: { mix: { current: number } }) {
  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  useFrame(() => {
    const d = mix.current
    if (sun.current) sun.current.intensity = 3.2 * (1 - d)
    if (hemi.current) hemi.current.intensity = 0.9 * (1 - d) + 0.08
  })
  return (
    <>
      <directionalLight ref={sun} position={[3, -5, -8]} intensity={3.2} />
      <hemisphereLight ref={hemi} args={['#7d9cc8', '#0a0c10', 0.9]} />
    </>
  )
}

/** 場面に入る前に、形と絵を先に読み始める */
export function preloadShuttle() {
  useGLTF.preload(CABIN_URL)
  useGLTF.preload(ORBITER_URL)
}

void v1
