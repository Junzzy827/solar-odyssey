import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { lowMemory } from '../../state/quality'
import { markShuttleReady, shuttleDebug, shuttleInput, useShuttle, type ShuttleSpot } from '../../state/shuttle'
import { FloatController, createFloatInput } from './floatControl'
import { cabinMaterial, flatMaterial, glassMaterial } from './cabinMaterial'
import { OutsideSky } from './outside'
import { adiTexture, crtTexture, drawCrt, monitorMaterial } from './screens'
import { shrinkTexture } from '../surface/shrinkTexture'
import { roomEnvironment } from '../telescope/parts'

// 乗員室の中身：焼いた部屋（色 × 光の地図、実行中の照明なし）、画面、浮いている小物、
// 外の地球・星（別の場面で先に描く）、オービターの外側と荷物室のハッブル、無重力の動き、見どころ。
// 座標は 1 単位 = 1 m。原点はミッドデッキの床の中心線上、乗員室の後ろの壁。前が -Z、上が +Y（tools/shuttle/cabin.md）。

const base = import.meta.env.BASE_URL
const CABIN_URL = `${base}models/shuttle-cabin.glb`
const ORBITER_URL = `${base}models/shuttle-orbiter.glb`
const HUBBLE_URL = `${base}models/hubble.glb`

/** 焼いたときの明るさの値（tools/blender/build_shuttle_cabin.py が書く shuttle-cabin.json と同じ形） */
type CabinMeta = { lightScale: { day: number; dark: number }; exposure: number }

/** 見どころ：近づくとボタンが出る所と、入ったときの目の位置・向き */
const SPOTS: Record<ShuttleSpot, { at: THREE.Vector3; eye: THREE.Vector3; yaw: number; pitch: number }> = {
  seat: { at: new THREE.Vector3(-0.58, 3.2, -2.75), eye: new THREE.Vector3(-0.58, 3.4, -2.78), yaw: 0, pitch: -0.08 },
  arm: { at: new THREE.Vector3(0.36, 3.4, -0.6), eye: new THREE.Vector3(0.3, 3.62, -0.62), yaw: Math.PI, pitch: 0.12 },
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
  const meta = useMeta()

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
    // 姿勢球：形の中心を原点にして回せるように
    for (const id of ['adi_cdr', 'adi_plt']) {
      const m = screens[id]
      if (!m) continue
      m.geometry = m.geometry.clone()
      m.geometry.computeBoundingSphere()
      const c = m.geometry.boundingSphere!.center.clone()
      m.geometry.translate(-c.x, -c.y, -c.z)
      m.position.add(c)
      // 球の UV：書き出した形の UV は全部 0 で、絵の左上の白だけが出ていた。頂点の向きから正距円筒の UV を作る
      const pos = m.geometry.getAttribute('position')
      const uv = new Float32Array(pos.count * 2)
      const d = new THREE.Vector3()
      for (let i = 0; i < pos.count; i++) {
        d.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize()
        uv[i * 2] = Math.atan2(d.x, d.z) / (Math.PI * 2) + 0.5
        uv[i * 2 + 1] = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) / Math.PI + 0.5
      }
      m.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    }
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
    root.traverse((o) => {
      if (o.name.startsWith('rms_')) arm[o.name] = o
      if (o.name.startsWith('door_')) o.rotation.z = (o.name.includes('port') ? 1 : -1) * THREE.MathUtils.degToRad(172)
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
    hub.position.set(-(box.min.x + box.max.x) / 2, 0.1 - box.min.y, 15.2 - (box.min.z + box.max.z) / 2)
    root.add(hub)
    return { root, arm, owned }
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
  const st = useRef({ spot: null as ShuttleSpot | null, blend: 0, blendAt: 0, arrived: false, mixT: 0, from: new THREE.Vector3(), fromYaw: 0, fromPitch: 0, stick: new THREE.Vector2(), stickR: new THREE.Vector2(), att: new THREE.Euler(), arm: { yaw: 0, pitch: 0, elbow: 0, wrist: 0 }, crtT: 0, monT: 0, push: null as null | { v: THREE.Vector3; until: number } })
  const sky = useRef<{ setAttitude: (e: THREE.Euler) => void; render: (r: THREE.WebGLRenderer, cam: THREE.PerspectiveCamera, dark: number, dt: number) => void } | null>(null)
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
    shuttleDebug.push = (x, y, z, sec) => (st.current.push = { v: new THREE.Vector3(x, y, z), until: performance.now() / 1000 + sec })
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
    return () => {
      delete shuttleDebug.place
      delete shuttleDebug.pose
      delete shuttleDebug.info
      delete shuttleDebug.push
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
        ctl.yaw = sp.yaw + THREE.MathUtils.clamp(angleDiff(sp.yaw, ctl.yaw - input.lookX), -1.2, 1.2)
        ctl.pitch = THREE.MathUtils.clamp(ctl.pitch - input.lookY, -0.9, 0.9)
      }
      input.lookX = 0
      input.lookY = 0
      // 操縦かん・アームのにぎり
      S.stick.lerp(v2(sx, sz), Math.min(1, dt * 6))
      S.stickR.lerp(v2(ax, az), Math.min(1, dt * 6))
    } else {
      S.stick.lerp(v2(0, 0), Math.min(1, dt * 4))
      S.stickR.lerp(v2(0, 0), Math.min(1, dt * 4))
      input.move.set(sx, ky + shuttleInput.lift, sz)
      if (S.push && t < S.push.until) input.move.copy(S.push.v)
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

    // アームの台：左のにぎり（並進）で肩、右のにぎり（回転）でひじと手首
    const thc = parts.named['rms_thc']
    const rhc = parts.named['rms_rhc']
    const armOn = S.spot === 'arm'
    if (thc) thc.rotation.set(armOn ? -S.stick.y * 0.3 : 0, 0, armOn ? -S.stick.x * 0.3 : 0)
    if (rhc) rhc.rotation.set(armOn ? -S.stickR.y * 0.3 : 0, 0, armOn ? -S.stickR.x * 0.3 : 0)
    const A = S.arm
    if (armOn) {
      // 入ったら、まずハッブルの方へ腕を起こす（手で動かせるのはそのあと）
      A.pitch = Math.max(-1.1, Math.min(0, A.pitch + (S.blend < 1 ? -0.25 * dt : 0) - S.stick.y * 0.18 * dt))
      A.yaw = THREE.MathUtils.clamp(A.yaw - S.stick.x * 0.15 * dt, -0.6, 0.6)
      A.elbow = THREE.MathUtils.clamp(A.elbow + (S.blend < 1 ? 0.35 * dt : 0) + S.stickR.y * 0.2 * dt, 0, 2.2)
      A.wrist = THREE.MathUtils.clamp(A.wrist + S.stickR.x * 0.3 * dt, -1, 1)
    }
    if (outside.arm.rms_yaw) outside.arm.rms_yaw.rotation.y = A.yaw
    if (outside.arm.rms_pitch) outside.arm.rms_pitch.rotation.x = A.pitch
    if (outside.arm.rms_elbow) outside.arm.rms_elbow.rotation.x = A.elbow
    if (outside.arm.rms_wrist) outside.arm.rms_wrist.rotation.x = -A.elbow * 0.5 + A.wrist

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

/** shuttle-cabin.json を読む（無ければ控えめな値） */
let metaCache: CabinMeta | null = null
let metaPromise: Promise<CabinMeta> | null = null
function useMeta(): CabinMeta {
  if (metaCache) return metaCache
  metaPromise ??= fetch(`${base}models/shuttle-cabin.json`)
    .then((r) => r.json() as Promise<CabinMeta>)
    .catch(() => ({ lightScale: { day: 20, dark: 1 }, exposure: 0.4 }))
    .then((m) => (metaCache = m))
  throw metaPromise
}

/** 場面に入る前に、形と絵を先に読み始める */
export function preloadShuttle() {
  useGLTF.preload(CABIN_URL)
  useGLTF.preload(ORBITER_URL)
}

void v1
