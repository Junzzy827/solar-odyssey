import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { ShipModel, METERS_PER_UNIT } from '../ship/ShipModel'
import { bodies } from '../../state/registry'
import { ship } from '../../state/flight'
import { useStore } from '../../state/store'
import { useLevel } from '../../state/quality'
import { DOCK_ID, SF_TEXT, UNITS_PER_METER, dockName } from '../../data/sf'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'
import { useSpaceEnvOn } from '../SpaceLighting'
import { useSite } from './useSite'

// 地球の軌道の宇宙船ドック「天の湊（あまのみなと）」（オリジナルのデザイン。junji さんの設定画がもと）。
// 差し渡し約 5 km の輪と十字の基地。前の腕は大型艦の入るメインドック、後ろの腕は船を組み立てる船台。
// 形と質感は Blender で焼いた glb（tools/blender/build_spacedock.py）。模型の 1 = 5 km。
// 重いので、地球のそばに来るか目標にするまで読み込まない。遠くでは面を減らした版（Lite…）にする。

const URL = `${import.meta.env.BASE_URL}models/spacedock.glb`
/** glb の 1 が何 m か */
const GLB_M = 5000
/** 地球の中心からの距離（表示単位。地球の半径は 1.2、軌道エレベーターの駅は 2.3） */
const ORBIT = 3.6
/** 太陽の方向から、地球のまわりに回した角度（夕方の側。昼の地球を背にして見える） */
const ANGLE = 1.15
/** 黄道から上へ（約45°。月の軌道のラグランジュ点にある構造物と重ならないように） */
const LIFT = 1.0
/** 半径（m）。リングの外の腕の先まで */
const RADIUS_M = 2650
/** これより近いと（半径の何倍か）細かい版。はなれるときは少し遠くで切り替える */
const LOD_NEAR = 9
const LOD_FAR = 11
/** これより近いと、ドックの中の船と船台の火花を描く（表示単位） */
const DETAIL = 1.2
/** これより地球の近くに来たら読み込む（表示単位） */
const LOAD_DIST = 14

/** メインドックの中の真ん中（m。three の向き：口は -Z） */
const BAY: [number, number, number] = [0, -10, -1500]
/** 船台の溶接の火花（m） */
const SPARKS: [number, number, number][] = [
  [140, 60, 1200],
  [-150, 20, 1450],
  [90, -70, 1000],
  [-80, 110, 1650],
]

const earth = new THREE.Vector3()
const sun = new THREE.Vector3()
const toSun = new THREE.Vector3()
const dir = new THREE.Vector3()
const at = new THREE.Vector3()
const look = new THREE.Vector3()
const Y = new THREE.Vector3(0, 1, 0)

type Lod = { near: boolean }

function DockModel({ lod, detail }: { lod: { current: Lod }; detail: boolean }) {
  const { scene } = useGLTF(URL)
  const level = useLevel()
  const built = useMemo(() => {
    const model = scene.clone(true)
    const full: THREE.Object3D[] = []
    const lite: THREE.Object3D[] = []
    const baked: THREE.MeshStandardMaterial[] = []
    const nav = {
      red: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.06, 0.04), toneMapped: false }),
      green: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 1.4, 0.2), toneMapped: false }),
    }
    const live: Record<string, THREE.Material> = {
      Glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.95, 1.55), toneMapped: false }),
      Blue: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.1, 2.2), toneMapped: false }),
      NavRed: nav.red,
      NavGreen: nav.green,
    }
    const made = new Map<THREE.Material, THREE.MeshStandardMaterial>()
    model.traverse((o) => {
      if (/^Lite/.test(o.name)) lite.push(o)
      else if (o.parent === model) full.push(o)
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const src = mesh.material as THREE.MeshStandardMaterial
      if (src.name === 'Baked') {
        let m = made.get(src)
        if (!m) {
          // 窓の明かりは Bloom で白飛びしない明るさに。StructureLook のパネルは足さない（焼いてある）
          m = src.clone()
          m.emissive.setRGB(1, 1, 1)
          m.emissiveIntensity = 1
          m.userData.normal = m.normalMap
          m.userData.noDetail = true
          for (const t of [m.map, m.normalMap, m.roughnessMap, m.emissiveMap]) if (t) t.anisotropy = 8
          made.set(src, m)
          baked.push(m)
        }
        mesh.material = m
      } else mesh.material = live[src.name] ?? live.Glow
    })
    lite.forEach((o) => (o.visible = false))
    return { model, full, lite, baked, nav, live }
  }, [scene])
  useSpaceEnvOn(built.baked)
  useEffect(() => {
    for (const m of built.baked) {
      m.normalMap = level === 'low' ? null : (m.userData.normal as THREE.Texture | null)
      m.needsUpdate = true
    }
  }, [built, level])
  useEffect(
    () => () => {
      built.baked.forEach((m) => m.dispose())
      Object.values(built.live).forEach((m) => m.dispose())
    },
    [built],
  )

  const sparks = useRef<THREE.Mesh[]>([])
  const spark = useMemo(
    () => ({ geo: new THREE.SphereGeometry(9, 8, 8), mat: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3.6), toneMapped: false }) }),
    [],
  )
  const shown = useRef<boolean | null>(null)
  useFrame(({ clock }) => {
    const near = lod.current.near
    if (shown.current !== near) {
      shown.current = near
      built.full.forEach((o) => (o.visible = near))
      built.lite.forEach((o) => (o.visible = !near))
    }
    const t = clock.getElapsedTime()
    // 赤い標識灯は、ゆっくり明るくなって消える。緑はメインドックの口の誘導灯
    const beacon = 0.25 + 1.5 * Math.max(0, Math.sin(t * 1.9)) ** 6
    built.nav.red.color.setRGB(1.6 * beacon, 0.06 * beacon, 0.04 * beacon)
    const g = Math.sin(t * Math.PI) > 0 ? 1.4 : 0.5
    built.nav.green.color.setRGB(0.05 * g, g, 0.15 * g)
    sparks.current.forEach((s, i) => s.scale.setScalar(Math.sin(t * (7 + i) + i * 2) + Math.sin(t * 19 + i) > 0.5 ? 1 + Math.random() : 0.01))
  })

  return (
    <group scale={UNITS_PER_METER}>
      <group scale={GLB_M}>
        <primitive object={built.model} />
      </group>
      {detail && (
        <>
          {/* メインドックで整備中の船（SV-01 と同じ型の SV-05） */}
          <group position={BAY} scale={METERS_PER_UNIT}>
            <ShipModel registry="SV-05" shipName="HOSHIKAZE" tint="#b7bcc4" floods={false} unitScale={METERS_PER_UNIT * UNITS_PER_METER} />
          </group>
          {SPARKS.map((p, i) => (
            <mesh
              key={i}
              ref={(m: THREE.Mesh | null) => {
                if (m) sparks.current[i] = m
              }}
              geometry={spark.geo}
              material={spark.mat}
              position={p}
            />
          ))}
        </>
      )}
    </group>
  )
}

export function SpaceDock() {
  useLang()
  const group = useRef<THREE.Group>(null!)
  const label = useRef<HTMLSpanElement>(null)
  useHideBehindSun(label, group)
  const size = RADIUS_M * UNITS_PER_METER
  const moved = useSite(group, {
    id: DOCK_ID,
    radius: size * 1.2,
    zoom: { start: size * 8, full: size * 3 },
    notice: { distance: size * 5, text: SF_TEXT.dockFound },
  })
  const [load, setLoad] = useState(false)
  const [detail, setDetail] = useState(false)
  const lod = useRef<Lod>({ near: false })

  useFrame(({ camera }) => {
    const e = bodies.get('earth')
    if (!e) return
    const g = group.current
    e.object.getWorldPosition(earth)
    const s = bodies.get('sun')
    if (s) s.object.getWorldPosition(sun)
    else sun.set(0, 0, 0)
    // 太陽の方向から、地球のまわりに ANGLE 回した方向の、少し上
    toSun.copy(sun).sub(earth).setY(0).normalize()
    dir.copy(toSun).applyAxisAngle(Y, ANGLE).addScaledVector(Y, LIFT).normalize()
    g.position.copy(earth).addScaledVector(dir, ORBIT)
    // 輪は黄道と平行。メインドックの口（-Z）を、地球のまわりを回る向きへ
    look.copy(earth).setY(g.position.y)
    g.lookAt(look)
    g.rotateY(-Math.PI / 2)
    moved()
    g.getWorldPosition(at)
    const d = camera.position.distanceTo(at)
    const L = lod.current
    L.near = d < size * (L.near ? LOD_FAR : LOD_NEAR)
    const close = ship.position.distanceTo(at) < DETAIL
    if (close !== detail) setDetail(close)
    if (!load && (ship.position.distanceTo(earth) < LOAD_DIST || useStore.getState().targetId === DOCK_ID)) setLoad(true)
  })

  return (
    <group ref={group}>
      {load && (
        <Suspense fallback={null}>
          <DockModel lod={lod} detail={detail} />
        </Suspense>
      )}
      <Html position={[0, size * 0.9, 0]} center className="label" zIndexRange={LABEL_Z}>
        <span ref={label} onClick={() => useStore.getState().setTarget(DOCK_ID)}>
          {dockName()}
        </span>
      </Html>
    </group>
  )
}
