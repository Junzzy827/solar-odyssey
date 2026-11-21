import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Sky } from '../Sky'
import { textureUrl } from '../../data/textures'
import { PLANETS } from '../../data/bodies'
import { encounterRelative, type Encounter, type Trajectory } from '../../data/trajectory'
import { earthHelio, earthPrimeMeridian, moonGeocentric, poleOf, probeNow, type ProbeNow } from '../../data/probeView'
import { probeClock } from '../../state/probes'

// 探査機の模型の画面（右側）。探査機を真ん中に置き、まわりは本物の向きで並べる：
//  ・太陽の光の向き、星空（星表の本物の星）、地球の向き（大きなアンテナはいつも地球へ）
//  ・惑星のそばでは、その惑星を本物の見かけの大きさで、探査機の道すじ（惑星の重力で曲がる双曲線）と一緒に
//  ・太陽から見た速さの矢印（スイングバイで、のびて向きが変わる）
// 遠くの物は「同じ見かけの大きさのまま、近くに縮めて」置く（FAR の距離に、半径も同じ割合で）。
// 座標は画面の軸（黄道の x, 北, -y）。探査機の模型の1単位は1m。

const DAY_MS = 86_400_000
/** 遠くの物を置く距離（表示の単位） */
const FAR = 1000
/** 速さの矢印：1 km/s あたりの長さ（m） */
const ARROW_PER_KMS = 0.6
const ARROW_COLOR = new THREE.Color('#ffb347').multiplyScalar(1.6)

/** 黄道座標を画面の軸に */
const toScreen = (r: number[], out = new THREE.Vector3()) => out.set(r[0], r[2], -r[1])

/** 今の数字（毎フレーム。字幕や計器は、これを読む） */
export const probeLive: { now: ProbeNow | null } = { now: null }

/**
 * NASA の模型（Voyager Probe (B)）の向き：大きなアンテナの開いた側が +Y、磁力計のさおが +Z。
 * アンテナを地球へ向け、さおを黄道の北の側へ倒す
 */
const DISH = new THREE.Vector3(0, 1, 0)
const BOOM = new THREE.Vector3(0, 0, 1)

function ProbeModel({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  const group = useRef<THREE.Group>(null!)
  const model = useMemo(() => {
    const root = scene.clone(true)
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = mesh.material as THREE.MeshStandardMaterial
      // 元の模型は少しつやが強い。断熱材や塗装らしく
      mat.roughness = 0.62
      mat.metalness = 0.15
    })
    // 本体（アンテナの下の十角形の箱）を真ん中に
    const box = new THREE.Box3().setFromObject(root)
    root.position.set(-(box.min.x + box.max.x) / 2 * 0.6, -0.6, -(box.min.z + box.max.z) / 2 * 0.2)
    return root
  }, [scene])
  const m = new THREE.Matrix4()
  const toEarth = new THREE.Vector3()
  const north = new THREE.Vector3(0, 1, 0)
  const side = new THREE.Vector3()
  const up = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const local = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(DISH, BOOM), DISH, BOOM).invert()
  useFrame(() => {
    const now = probeLive.now
    if (!now) return
    const e = earthHelio(now.ms)
    toScreen([e[0] - now.r[0], e[1] - now.r[1], e[2] - now.r[2]], toEarth).normalize()
    // アンテナ → 地球、さお → 北（アンテナの向きに直角な成分）
    up.copy(north).addScaledVector(toEarth, -north.dot(toEarth))
    if (up.lengthSq() < 1e-6) up.set(1, 0, 0)
    up.normalize()
    side.crossVectors(toEarth, up)
    m.makeBasis(side, toEarth, up).multiply(local)
    q.setFromRotationMatrix(m)
    group.current.quaternion.slerp(q, 0.2)
  })
  return (
    <group ref={group}>
      <primitive object={model} />
    </group>
  )
}

/** 速さの矢印（太陽から見た速度の向き。長さは速さに比例）。スイングバイで、のびて向きが変わるのが見える */
function SpeedArrow() {
  const group = useRef<THREE.Group>(null!)
  const shaft = useRef<THREE.Mesh>(null!)
  const head = useRef<THREE.Mesh>(null!)
  const dir = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  useFrame(() => {
    const now = probeLive.now
    if (!now) return
    toScreen(now.v, dir).normalize()
    group.current.quaternion.setFromUnitVectors(up, dir)
    const len = Math.max(2, now.speed * ARROW_PER_KMS)
    shaft.current.scale.set(1, len, 1)
    shaft.current.position.y = len / 2
    head.current.position.y = len
  })
  return (
    <group ref={group}>
      <mesh ref={shaft} renderOrder={2}>
        <cylinderGeometry args={[0.1, 0.1, 1, 12, 1, true]} />
        <meshBasicMaterial color={ARROW_COLOR} toneMapped={false} transparent opacity={0.85} depthWrite={false} />
      </mesh>
      <mesh ref={head} renderOrder={2}>
        <coneGeometry args={[0.45, 1.4, 20]} />
        <meshBasicMaterial color={ARROW_COLOR} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** 太陽：光の向きと、まぶしい点 */
function SunLight() {
  const light = useRef<THREE.DirectionalLight>(null!)
  const glow = useRef<THREE.Sprite>(null!)
  const map = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255,250,235,1)')
    grad.addColorStop(0.15, 'rgba(255,236,190,0.9)')
    grad.addColorStop(1, 'rgba(255,200,120,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(c)
  }, [])
  const d = new THREE.Vector3()
  useFrame(() => {
    const now = probeLive.now
    if (!now) return
    toScreen(now.r, d).normalize().negate()
    light.current.position.copy(d).multiplyScalar(100)
    glow.current.position.copy(d).multiplyScalar(FAR * 1.6)
    // 遠くなるほど小さく（ただし見失わない大きさは残す）
    glow.current.scale.setScalar(FAR * 1.6 * Math.max(0.025, 0.18 / now.sunAu))
    // 太陽から遠いほど光は弱いが、本物どおりだと海王星では 900 分の 1 で真っ暗になるので、やわらげる
    light.current.intensity = 3.2 / Math.pow(Math.max(1, now.sunAu), 0.25)
  })
  return (
    <>
      <directionalLight ref={light} intensity={3} />
      <sprite ref={glow} renderOrder={-0.4}>
        <spriteMaterial map={map} blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} toneMapped={false} />
      </sprite>
    </>
  )
}

function PlanetSphere({ id, ms }: { id: string; ms: number }) {
  const url = textureUrl(id)!
  const map = useTexture(url)
  map.colorSpace = THREE.SRGBColorSpace
  const ringMap = useTexture(textureUrl('saturnRing')!)
  const planet = PLANETS.find((p) => p.id === id)!
  const spin = useRef<THREE.Group>(null!)
  const orient = useMemo(() => {
    const pole = toScreen(poleOf(id)).normalize()
    // 経度0の向き：地球は本物（その時刻の恒星時から）、ほかは自転の速さで回す
    const pm = id === 'earth' ? toScreen(earthPrimeMeridian(ms)) : new THREE.Vector3(1, 0, 0)
    pm.addScaledVector(pole, -pm.dot(pole)).normalize()
    const east = new THREE.Vector3().crossVectors(pm, pole)
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(pm, pole, east))
  }, [id, ms])
  useFrame(() => {
    if (id === 'earth') {
      spin.current.quaternion.setFromRotationMatrix(
        (() => {
          const pole = toScreen(poleOf('earth')).normalize()
          const pm = toScreen(earthPrimeMeridian(probeClock.ms))
          pm.addScaledVector(pole, -pm.dot(pole)).normalize()
          return new THREE.Matrix4().makeBasis(pm, pole, new THREE.Vector3().crossVectors(pm, pole))
        })(),
      )
    } else spin.current.quaternion.copy(orient).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ((probeClock.ms / 3_600_000) / planet.rotationHours) * Math.PI * 2))
  })
  const r = planet.radiusKm
  return (
    <group ref={spin}>
      <mesh scale={r}>
        <sphereGeometry args={[1, 96, 64]} />
        <meshStandardMaterial map={map} roughness={1} metalness={0} />
      </mesh>
      {planet.ring && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r * planet.ring.inner, r * planet.ring.outer, 192, 1]} />
          <meshStandardMaterial map={ringMap} alphaMap={ringMap} transparent side={THREE.DoubleSide} depthWrite={false} roughness={1} />
        </mesh>
      )}
    </group>
  )
}

/** 地球の月（打ち上げの場面） */
function Moon() {
  const map = useTexture(textureUrl('moon')!)
  map.colorSpace = THREE.SRGBColorSpace
  const mesh = useRef<THREE.Mesh>(null!)
  useFrame(() => toScreen(moonGeocentric(probeClock.ms), mesh.current.position))
  return (
    <mesh ref={mesh} scale={1737}>
      <sphereGeometry args={[1, 48, 32]} />
      <meshStandardMaterial map={map} roughness={1} />
    </mesh>
  )
}

/** 通過する惑星と、その重力で曲がる道すじ（惑星中心、km の空間を、見かけの大きさを保って縮める） */
function Encounter({ encounter, launch }: { encounter: Encounter; launch: boolean }) {
  const group = useRef<THREE.Group>(null!)
  const span = encounter.window * DAY_MS
  const { full, done, tail, times, pts } = useMemo(() => {
    const n = 1200
    const pts: THREE.Vector3[] = []
    const times: number[] = []
    for (let i = 0; i <= n; i++) {
      // 最接近のまわりほど細かく
      const s = (i / n) * 2 - 1
      const ms = encounter.ms + Math.sign(s) * Math.abs(s) ** 3 * span
      // 打ち上げの道すじは、打ち上げのあとだけ
      if (launch && ms < encounter.ms) continue
      times.push(ms)
      pts.push(toScreen(encounterRelative(encounter, ms).r))
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = (opacity: number) => new THREE.LineBasicMaterial({ color: 0xb59cff, transparent: true, opacity, depthWrite: false, toneMapped: false })
    // 通ったところの最後の点から、今の探査機までをつなぐ短い線（点と点の間が広いので、すき間が見えないように）
    const tail = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), mat(0.95))
    tail.frustumCulled = false
    return { full: new THREE.Line(geometry, mat(0.28)), done: new THREE.Line(geometry, mat(0.95)), tail, times, pts }
  }, [encounter, span, launch])
  useEffect(
    () => () => {
      full.geometry.dispose()
      tail.geometry.dispose()
    },
    [full, tail],
  )
  const rel = new THREE.Vector3()
  useFrame(() => {
    const now = probeLive.now
    if (!now?.rel || now.encounter !== encounter) {
      group.current.visible = false
      return
    }
    group.current.visible = true
    toScreen(now.rel, rel)
    const k = FAR / rel.length()
    group.current.scale.setScalar(k)
    group.current.position.copy(rel).multiplyScalar(-k)
    let i = 0
    while (i < times.length && times[i] < now.ms) i++
    done.geometry.setDrawRange(0, i)
    const end = tail.geometry.attributes.position as THREE.BufferAttribute
    const from = pts[Math.max(0, i - 1)]
    end.setXYZ(0, from.x, from.y, from.z)
    end.setXYZ(1, rel.x, rel.y, rel.z)
    end.needsUpdate = true
  })
  return (
    <group ref={group} visible={false}>
      <primitive object={full} />
      <primitive object={done} />
      <primitive object={tail} />
      <Suspense fallback={null}>
        <PlanetSphere id={encounter.body} ms={encounter.ms} />
        {encounter.body === 'earth' && <Moon />}
      </Suspense>
    </group>
  )
}

/** カメラ：しばらく触っていなければ、惑星が探査機の向こうに見える位置へ、ゆっくり回り込む */
function CameraRig({ controls }: { controls: React.RefObject<OrbitControlsImpl | null> }) {
  const camera = useThree((s) => s.camera)
  const touched = useRef(-1e9)
  useEffect(() => {
    const c = controls.current
    if (!c) return
    const on = () => (touched.current = performance.now())
    c.addEventListener('start', on)
    c.addEventListener('end', on)
    return () => {
      c.removeEventListener('start', on)
      c.removeEventListener('end', on)
    }
  }, [controls])
  const want = new THREE.Vector3()
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const north = new THREE.Vector3(0, 1, 0)
  useFrame((_, delta) => {
    const now = probeLive.now
    if (!now || performance.now() - touched.current < 6000) return
    const dist = camera.position.length()
    if (now.rel) {
      // 惑星の反対側の、少し横・上から（惑星が探査機の少し奥に見える。真うしろだと小さい惑星が模型に隠れる）
      toScreen(now.rel, a).normalize()
      b.crossVectors(a, north)
      if (b.lengthSq() < 1e-6) b.set(1, 0, 0)
      b.normalize()
      want.copy(a).addScaledVector(b, 0.22).addScaledVector(north, 0.16)
    } else {
      // 進む向きの斜め後ろから
      toScreen(now.v, b).normalize()
      a.crossVectors(b, north).normalize()
      want.copy(b).multiplyScalar(-0.55).addScaledVector(a, 0.75).addScaledVector(north, 0.35)
    }
    want.normalize().multiplyScalar(dist)
    camera.position.lerp(want, 1 - Math.exp(-delta * 0.6)).setLength(dist)
    camera.lookAt(0, 0, 0)
  })
  return null
}

function Live({ trajectory }: { trajectory: Trajectory }) {
  useFrame(() => {
    probeLive.now = probeNow(trajectory, probeClock.ms)
  }, -10)
  return null
}

export default function ProbeCamCanvas({ trajectory, model }: { trajectory: Trajectory; model: string }) {
  const controls = useRef<OrbitControlsImpl | null>(null)
  probeLive.now = probeNow(trajectory, probeClock.ms)
  const dpr = Math.min(window.devicePixelRatio, 1.5)
  return (
    <Canvas dpr={dpr} camera={{ position: [26, 10, 22], fov: 40, near: 0.1, far: 6000 }} gl={{ antialias: true }}>
      <Live trajectory={trajectory} />
      <Sky />
      <ambientLight intensity={0.12} />
      <SunLight />
      <Suspense fallback={null}>
        <ProbeModel url={`${import.meta.env.BASE_URL}models/${model}`} />
      </Suspense>
      <SpeedArrow />
      {trajectory.encounters.map((e, i) => (
        <Encounter key={e.ms} encounter={e} launch={i === 0} />
      ))}
      <OrbitControls ref={controls} enablePan={false} minDistance={12} maxDistance={90} />
      <CameraRig controls={controls} />
    </Canvas>
  )
}

