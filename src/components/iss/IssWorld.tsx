import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { MeshBVH } from 'three-mesh-bvh'
import { lowMemory } from '../../state/quality'
import { isTouchDevice } from '../../state/input'
import { issDebug, issInput, playSpot, useIss } from '../../state/iss'
import { acquireTex, releaseTex } from './texManager'
import { FloatController } from './floatControl'
import { IssEarth } from './IssEarth'
import { WaterBall } from './WaterBall'
import { Drifters } from './Drifters'
import { setIssAmbience } from './issAudio'
import { setAnchor, spotAnchors } from './anchors'

// ISS の中（いまは実験棟デスティニーの見本）。座標は m、原点はノード 1 の真ん中、+Y が天頂、−Z が前（tools/iss/README.md）。
// 部屋は Blender で焼いた光（ライトマップ）× 色の絵だけで描く（MeshBasic、照明の計算なし）。
// 窓の外の地球は別のシーンで、窓の形の型（ステンシル）の中だけに描く（IssEarth.tsx）。

const BASE = `${import.meta.env.BASE_URL}models/iss/`

type MatInfo = { tex: string | null; pc: number | null; phone: number | null; alpha: boolean; lamp: boolean; emissive: boolean }
type Manifest = {
  id: string
  key: string
  glb: string
  light: { pc: string; phone: string }
  lightIntensity: number
  materials: Record<string, MatInfo>
  bboxMin: [number, number, number]
  bboxMax: [number, number, number]
  hatches: { connector: string; to: string | null; center: [number, number, number] }[]
}

export type LoadedModule = {
  manifest: Manifest
  root: THREE.Group
  bvh: MeshBVH
  /** 自転こぎ（CEVIS）の部品と、その箱 */
  bike: THREE.Object3D | null
  bikeBox: THREE.Box3
  dispose: () => void
}

/**
 * 見本の印の場所（three の座標、m）。本物の窓は WORF のくぼみの底（y −2.1）にあるが、くぼみの中は焼いた光が届かず真っ黒で、
 * 部屋からは手前の金具に隠れて地球が見えない。そこで地球を見せる型は、床の穴（床の面 y −1.10〜−1.13、穴の半径 約 0.3 m）の
 * すぐ下に置く。型は穴より大きくてよい（穴の外は床が手前にあって隠す）
 */
export const WINDOW_AT = new THREE.Vector3(0.02, -1.145, -6.85)
export const WINDOW_R = 0.45
const WATER_AT = new THREE.Vector3(0.25, 0.15, -4.3)
/** 入ったときの場所と向き（後ろのハッチの前から、前を見る） */
const START = new THREE.Vector3(0, 0.05, -2.75)

const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)

/** モジュールを読む：形・色の絵・光の絵・当たり判定 */
export async function loadModule(id: string, phone: boolean, anisotropy: number): Promise<LoadedModule> {
  const manifest = (await (await fetch(`${BASE}${id}.json`)).json()) as Manifest
  const gltf = await gltfLoader.loadAsync(BASE + manifest.glb)
  const files: string[] = []
  const borrow = (file: string) => {
    files.push(file)
    return acquireTex(file, { anisotropy })
  }
  const lightFile = phone ? manifest.light.phone : manifest.light.pc
  const light = await borrow(lightFile)
  // 光の絵は 2 番目の UV（glTF の TEXCOORD_1 → three の uv1）
  light.channel = 1
  light.wrapS = light.wrapT = THREE.ClampToEdgeWrapping
  light.anisotropy = 1
  const mats = new Map<string, THREE.Material>()
  const owned: THREE.Material[] = []
  await Promise.all(
    Object.entries(manifest.materials).map(async ([name, m]) => {
      const size = phone ? m.phone : m.pc
      const map = m.tex && size ? await borrow(`tex/${m.tex}.${size}.webp`) : null
      const mat = new THREE.MeshBasicMaterial({
        map,
        // ランプの面は、光の絵を掛けずに明るく（暗くしない）
        lightMap: m.lamp ? null : light,
        lightMapIntensity: manifest.lightIntensity,
        color: m.lamp ? new THREE.Color(1.15, 1.12, 1.05) : new THREE.Color(1, 1, 1),
        alphaTest: m.alpha ? 0.5 : 0,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
      mat.name = name
      mats.set(name, mat)
      owned.push(mat)
    }),
  )
  const root = gltf.scene
  const geos: THREE.BufferGeometry[] = []
  let bike: THREE.Object3D | null = null
  root.updateMatrixWorld(true)
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (/CEVIS/i.test(o.name) && !bike) bike = o
    if (!mesh.isMesh) return
    const name = (mesh.material as THREE.Material).name
    const mat = mats.get(name)
    if (mat) mesh.material = mat
    mesh.matrixAutoUpdate = false
    // 当たり判定：形の位置だけを、置き場所の座標にして 1 つにまとめる
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', mesh.geometry.getAttribute('position'))
    if (mesh.geometry.index) g.setIndex(mesh.geometry.index)
    geos.push(g.applyMatrix4(mesh.matrixWorld))
  })
  const merged = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)))
  geos.forEach((g) => g.dispose())
  const bvh = new MeshBVH(merged)
  const bikeBox = new THREE.Box3()
  if (bike) bikeBox.setFromObject(bike)
  return {
    manifest,
    root,
    bvh,
    bike,
    bikeBox,
    dispose: () => {
      root.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (mesh.isMesh) mesh.geometry.dispose()
      })
      merged.dispose()
      owned.forEach((m) => m.dispose())
      files.forEach(releaseTex)
    },
  }
}


const _v = new THREE.Vector3()
const _ray = new THREE.Ray()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler(0, 0, 0, 'YXZ')

/** 名札を画面に置く：カメラの後ろ・遠すぎ・壁のかげは隠す */
function placeAnchors(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement, bvh: MeshBVH | null) {
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  for (const a of spotAnchors.values()) {
    if (!a.el) continue
    const d = a.pos.distanceTo(camera.position)
    _v.copy(a.pos).project(camera)
    let hide = _v.z > 1 || Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05 || d > a.range
    if (!hide && bvh) {
      _ray.origin.copy(camera.position)
      _ray.direction.copy(a.pos).sub(camera.position).normalize()
      const hit = bvh.raycastFirst(_ray, THREE.DoubleSide)
      if (hit && hit.distance < d - 0.12) hide = true
    }
    a.el.style.visibility = hide ? 'hidden' : 'visible'
    if (!hide) a.el.style.transform = `translate(${((_v.x + 1) / 2) * w}px, ${((1 - _v.y) / 2) * h}px)`
  }
}

export function IssWorld() {
  const moduleId = useIss((s) => s.module)
  const flips = useIss((s) => s.flips)
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const [mod, setMod] = useState<LoadedModule | null>(null)
  const ctrl = useMemo(() => {
    const c = new FloatController({ radius: 0.3 })
    c.pos.copy(START)
    return c
  }, [])

  // 読みこみ（スマホでは絵を小さく）
  useEffect(() => {
    let alive = true
    let loaded: LoadedModule | null = null
    const phone = lowMemory() || isTouchDevice()
    loadModule(moduleId, phone, phone ? 2 : Math.min(8, gl.capabilities.getMaxAnisotropy()))
      .then((m) => {
        if (!alive) return m.dispose()
        loaded = m
        ctrl.setCollider(m.bvh)
        const r = ctrl.radius
        const b = new THREE.Box3(new THREE.Vector3(...m.manifest.bboxMin), new THREE.Vector3(...m.manifest.bboxMax)).expandByScalar(-r)
        ctrl.setBounds(b)
        setMod(m)
      })
      .catch((e) => {
        console.error('[iss] load failed', e)
        if (alive) useIss.setState({ phase: 'none' })
      })
    return () => {
      alive = false
      ctrl.setCollider(null)
      loaded?.dispose()
    }
  }, [moduleId, gl, ctrl])

  // 読めたら、中へ（ひと呼吸おいて、絵が GPU に載ってから幕を上げる）
  useEffect(() => {
    if (!mod) return
    gl.compile(mod.root, camera)
    const t = setTimeout(() => {
      useIss.setState({ phase: 'inside' })
      issDebug.loaded = true
    }, 300)
    setIssAmbience(true)
    return () => {
      clearTimeout(t)
      setIssAmbience(false)
    }
  }, [mod, gl, camera])

  // 宙返り
  useEffect(() => {
    if (flips > 0) ctrl.flip()
  }, [flips, ctrl])

  // 印の場所（窓・自転車・水の玉）
  useEffect(() => {
    if (!mod) return
    const bikeTop = mod.bikeBox.isEmpty() ? new THREE.Vector3(-0.7, -0.5, -7.4) : mod.bikeBox.getCenter(new THREE.Vector3()).setY(mod.bikeBox.max.y + 0.12)
    setAnchor('bike', bikeTop, 5)
    setAnchor('window', WINDOW_AT.clone().setY(-0.95), 5)
    for (const h of mod.manifest.hatches) {
      // ハッチの「この先は、つぎのお楽しみ」：つなぎ目の少し手前
      const c = new THREE.Vector3(...h.center)
      const toward = c.z > -6 ? 0.45 : -0.45
      setAnchor(`hatch:${h.to}`, c.add(new THREE.Vector3(0, 0.25, -toward)), 2.2)
    }
  }, [mod])

  const crank = useRef<THREE.Group>(null)
  const pedalAngle = useRef(0)

  useFrame((state, dt) => {
    const s = useIss.getState()
    if (!mod) return
    // 操作：キー（x・z・上下）とスティックを足す
    if (issDebug.goto) {
      const [x, y, z, yaw, pitch] = issDebug.goto
      issDebug.goto = null
      ctrl.pos.set(x, y, z)
      ctrl.vel.set(0, 0, 0)
      ctrl.yaw = yaw
      ctrl.pitch = pitch
      if (!s.moved) useIss.setState({ moved: true })
    }
    const dbg = issDebug.move
    const busy = s.spot === 'bike'
    const move = dbg
      ? { x: dbg[0], y: dbg[1], z: dbg[2] }
      : {
          x: THREE.MathUtils.clamp(issInput.x + issInput.stickX, -1, 1),
          y: (issInput.up ? 1 : 0) - (issInput.down ? 1 : 0),
          z: THREE.MathUtils.clamp(issInput.z - issInput.stickY, -1, 1),
        }
    const pushing = Math.abs(move.x) + Math.abs(move.y) + Math.abs(move.z) > 0.05
    if (pushing && !s.moved) useIss.setState({ moved: true })
    ctrl.look(issInput.lookX, issInput.lookY)
    issInput.lookX = 0
    issInput.lookY = 0
    if (busy) {
      // 自転車に乗っている：こぐ場所へ寄って、ペダルに合わせて少しゆれる
      const b = mod.bikeBox
      const seat = b.isEmpty() ? new THREE.Vector3(-0.3, -0.1, -7.4) : new THREE.Vector3(b.max.x + 0.32, b.max.y + 0.42, (b.min.z + b.max.z) / 2 + 0.05)
      pedalAngle.current += dt * Math.PI * 2 * 1.1
      seat.y += Math.sin(pedalAngle.current * 2) * 0.012
      ctrl.pos.lerp(seat, 1 - Math.exp(-dt * 3))
      ctrl.vel.set(0, 0, 0)
    } else {
      if (s.spot === 'window' && !pushing) {
        // 窓へ：くぼみの真上へ寄って、下を向く
        const above = WINDOW_AT.clone().setY(-0.55)
        ctrl.pos.lerp(above, 1 - Math.exp(-dt * 1.6))
        ctrl.vel.multiplyScalar(0.9)
        ctrl.pitch += (-1.4 - ctrl.pitch) * (1 - Math.exp(-dt * 2))
      }
      pedalAngle.current += dt * 0.3
      ctrl.update(dt, move)
    }
    if (crank.current) crank.current.rotation.x = -pedalAngle.current
    ctrl.apply(camera)
    camera.updateMatrixWorld()
    const p = issDebug.pose
    _e.setFromQuaternion(ctrl.quaternion(_q), 'YXZ')
    p.x = ctrl.pos.x
    p.y = ctrl.pos.y
    p.z = ctrl.pos.z
    p.yaw = ctrl.yaw
    p.pitch = ctrl.pitch
    p.speed = ctrl.vel.length()
    placeAnchors(camera, state.gl.domElement, mod.bvh)
  })

  if (!mod) return null
  const bc = mod.bikeBox.isEmpty() ? new THREE.Vector3(-0.7, -0.75, -7.45) : mod.bikeBox.getCenter(new THREE.Vector3())
  return (
    <>
      <primitive object={mod.root} />
      {/* 自転こぎのペダル（模型には回る部品がないので、ここで足す）。クランクの軸は自転車の前の下のあたり */}
      <group ref={crank} position={[bc.x + 0.02, mod.bikeBox.isEmpty() ? -0.75 : mod.bikeBox.min.y + 0.17, mod.bikeBox.isEmpty() ? -7.1 : mod.bikeBox.max.z - 0.2]}>
        <Crank />
      </group>
      <WaterBall at={WATER_AT} ctrl={ctrl} onPoke={() => playSpot('water')} />
      <Drifters ctrl={ctrl} bvh={mod.bvh} />
      <IssEarth window={WINDOW_AT} radius={WINDOW_R} />
    </>
  )
}

/** クランクとペダル：軸から 17 cm の腕が 2 本（反対向き）、先にペダル */
function Crank() {
  const parts = useMemo(() => {
    const metal = new THREE.MeshBasicMaterial({ color: '#5b6068', toneMapped: false })
    const black = new THREE.MeshBasicMaterial({ color: '#1d1f22', toneMapped: false })
    const arm = new THREE.BoxGeometry(0.025, 0.17, 0.03).translate(0, 0.085, 0)
    const axle = new THREE.CylinderGeometry(0.035, 0.035, 0.2, 16).rotateZ(Math.PI / 2)
    const pedal = new THREE.BoxGeometry(0.1, 0.025, 0.07)
    return { metal, black, arm, axle, pedal }
  }, [])
  useEffect(
    () => () => {
      Object.values(parts).forEach((p) => p.dispose())
    },
    [parts],
  )
  return (
    <>
      <mesh geometry={parts.axle} material={parts.metal} />
      <group position={[0.09, 0, 0]}>
        <mesh geometry={parts.arm} material={parts.metal} />
        <mesh geometry={parts.pedal} material={parts.black} position={[0.06, 0.17, 0]} />
      </group>
      <group position={[-0.09, 0, 0]} rotation={[Math.PI, 0, 0]}>
        <mesh geometry={parts.arm} material={parts.metal} />
        <mesh geometry={parts.pedal} material={parts.black} position={[-0.06, 0.17, 0]} />
      </group>
    </>
  )
}
