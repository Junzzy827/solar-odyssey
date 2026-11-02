import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { evaNow, useEva, evaInput } from '../../state/eva'
import { hullPoint } from './hull'
import {
  JOBS,
  RACK,
  hullFrame,
  jobDone,
  jobsRt,
  rackRt,
  stepU,
  useEvaJobs,
  useEvaLog,
  workLink,
  type JobRt,
  type JobUi,
} from '../../state/evaJobs'

// 修理ミッションの場面：故障の模型（手順の進みで形が変わる）、光の柱、部品棚、運んでいる部品。
// 作業の判定もここ（ツムギのツールの先が作業する点に届いて、正しいツールで E を押しているあいだ進む）。

const REACH = 2.2 // m：この距離まで近づくと、E で体を寄せて作業できる
const ease = (u: number) => {
  const v = Math.min(1, Math.max(0, u))
  return v * v * (3 - 2 * v)
}

function siteProps(site: { th: number; z: number }) {
  const m = hullFrame(site)
  const p = new THREE.Vector3()
  const q = new THREE.Quaternion()
  m.decompose(p, q, new THREE.Vector3())
  return { position: p, quaternion: q }
}

// ---- 光の柱 ----------------------------------------------------------------------

let pillarTex: THREE.CanvasTexture | null = null
function pillarTexture() {
  if (pillarTex) return pillarTex
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, 128)
  grad.addColorStop(0, 'rgba(0,0,0,1)')
  grad.addColorStop(0.55, 'rgba(70,70,70,1)')
  grad.addColorStop(0.92, 'rgba(230,230,230,1)')
  grad.addColorStop(1, 'rgba(255,255,255,1)')
  g.fillStyle = grad
  g.fillRect(0, 0, 4, 128)
  pillarTex = new THREE.CanvasTexture(c)
  return pillarTex
}

const PILLAR_H = 9
const UP = new THREE.Vector3(0, 1, 0)

/** 作業する所から外向きに立つ光の柱と、足もとの輪 */
function Pillar({ at, up, color, state }: { at: THREE.Vector3; up: THREE.Vector3; color: string; state: () => number }) {
  const g = useRef<THREE.Group>(null)
  const mats = useMemo(() => {
    const base = new THREE.Color(color)
    const mk = () => new THREE.MeshBasicMaterial({ map: pillarTexture(), color: base.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    return { outer: mk(), core: mk(), ring: new THREE.MeshBasicMaterial({ color: base.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), base }
  }, [color])
  useEffect(() => () => Object.values(mats).forEach((m) => (m as THREE.Material).dispose?.()), [mats])
  const quat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(UP, up), [up])
  const ring = useRef<THREE.Mesh>(null)
  const beam = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const k = state()
    const grp = g.current
    if (!grp) return
    grp.visible = k > 0.001
    if (!grp.visible) return
    // 近くでは薄くする（作業の手もとが見えるように）
    const d = workLink.body.distanceTo(at)
    const near = Math.min(1, Math.max(0.03, (d - 1.8) / 5))
    if (beam.current) beam.current.visible = d > 1.9
    const pulse = 0.8 + 0.2 * Math.sin(clock.elapsedTime * 3)
    mats.outer.color.copy(mats.base).multiplyScalar(0.55 * k * near * pulse)
    mats.core.color.copy(mats.base).multiplyScalar(1.3 * k * near)
    const r = 0.8 + 0.25 * ((clock.elapsedTime * 0.8) % 1)
    if (ring.current) ring.current.scale.setScalar(r)
    mats.ring.color.copy(mats.base).multiplyScalar(1.2 * k * (1.4 - r) * Math.min(1, Math.max(0.15, (d - 1.5) / 3)))
  })
  return (
    <group ref={g} position={at} quaternion={quat}>
      <group ref={beam}>
        <mesh position={[0, PILLAR_H / 2, 0]} material={mats.outer} renderOrder={5}>
          <cylinderGeometry args={[0.32, 0.32, PILLAR_H, 20, 1, true]} />
        </mesh>
        <mesh position={[0, PILLAR_H / 2, 0]} material={mats.core} renderOrder={5}>
          <cylinderGeometry args={[0.07, 0.07, PILLAR_H, 10, 1, true]} />
        </mesh>
      </group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} material={mats.ring} renderOrder={5}>
        <ringGeometry args={[0.36, 0.42, 40]} />
      </mesh>
    </group>
  )
}

// ---- 共通の材質 ------------------------------------------------------------------

function useMats() {
  const mats = useMemo(
    () => ({
      white: new THREE.MeshStandardMaterial({ color: '#e7e6e1', roughness: 0.45, metalness: 0.15 }),
      metal: new THREE.MeshStandardMaterial({ color: '#b8bec7', roughness: 0.32, metalness: 0.75 }),
      dark: new THREE.MeshStandardMaterial({ color: '#2a2e35', roughness: 0.7, metalness: 0.3 }),
      orange: new THREE.MeshStandardMaterial({ color: '#e58a2c', roughness: 0.55, metalness: 0.1 }),
      scorch: new THREE.MeshStandardMaterial({ color: '#1e1a16', roughness: 0.95, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -3, depthWrite: false }),
      hole: new THREE.MeshBasicMaterial({ color: '#030304', polygonOffset: true, polygonOffsetFactor: -4 }),
      copper: new THREE.MeshStandardMaterial({ color: '#c8743a', roughness: 0.4, metalness: 0.8 }),
      cable: new THREE.MeshStandardMaterial({ color: '#30343a', roughness: 0.6, metalness: 0.1 }),
    }),
    [],
  )
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  return mats
}

/** 溶接のあと（熱いうちはオレンジに光って、冷えると焼けた金属の色） */
function beadMaterial() {
  return new THREE.MeshStandardMaterial({ color: '#8f8576', roughness: 0.5, metalness: 0.7, emissive: '#000' })
}
function heatColor(m: THREE.MeshStandardMaterial, heat: number) {
  const h = Math.min(1, heat)
  m.emissive.setRGB(2.4 * h, 0.8 * h * h, 0.15 * h * h * h)
}

function Lamp({ ok, position }: { ok: () => boolean; position: [number, number, number] }) {
  const m = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), [])
  useEffect(() => () => m.dispose(), [m])
  useFrame(({ clock }) => {
    if (ok()) m.color.setRGB(0.3, 2.2, 0.6)
    else m.color.setRGB(Math.sin(clock.elapsedTime * 5) > 0 ? 3 : 0.4, 0.15, 0.1)
  })
  return (
    <mesh position={position} material={m}>
      <sphereGeometry args={[0.018, 10, 8]} />
    </mesh>
  )
}

// ---- 故障 6 種の模型（外壁の局所座標：外向き +Y） ---------------------------------------------

function HoleProp({ j }: { j: JobRt }) {
  const M = useMats()
  const bead = useMemo(beadMaterial, [])
  useEffect(() => () => bead.dispose(), [bead])
  const petals = useRef<THREE.Group>(null)
  const patch = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const beads = useRef<THREE.Group>(null)
  useFrame(() => {
    const cut = stepU(j, 0)
    petals.current?.children.forEach((c, k) => (c.visible = cut < (k + 1) / 8))
    if (ring.current) ring.current.visible = cut >= 1 && j.step < 3
    if (patch.current) patch.current.visible = j.step >= 3
    const w = stepU(j, 3)
    beads.current?.children.forEach((c, k) => {
      const f = Math.min(1, Math.max(0, w * 4 - k))
      c.visible = f > 0.01
      c.scale.x = Math.max(0.01, f)
    })
    heatColor(bead, j.heat)
  })
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} material={M.scorch}>
        <circleGeometry args={[0.34, 28]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} material={M.hole}>
        <circleGeometry args={[0.1, 20]} />
      </mesh>
      {/* めくれた縁 */}
      <group ref={petals}>
        {Array.from({ length: 8 }, (_, k) => {
          const a = (k / 8) * Math.PI * 2 + 0.3
          return (
            <group key={k} rotation={[0, -a, 0]}>
              <mesh position={[0.12, 0.03, 0]} rotation={[0, 0, 0.9 + (k % 3) * 0.2]} material={M.white} castShadow>
                <boxGeometry args={[0.07, 0.005, 0.06 + (k % 2) * 0.03]} />
              </mesh>
            </group>
          )
        })}
      </group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} material={M.metal}>
        <ringGeometry args={[0.1, 0.135, 28]} />
      </mesh>
      <mesh ref={patch} position={[0, 0.012, 0]} material={M.metal} castShadow receiveShadow>
        <boxGeometry args={[0.44, 0.014, 0.44]} />
      </mesh>
      {/* 溶接のあと：当て板の 4 辺（左から順に） */}
      <group ref={beads}>
        {[
          [0, -0.22, 0],
          [0.22, 0, Math.PI / 2],
          [0, 0.22, Math.PI],
          [-0.22, 0, -Math.PI / 2],
        ].map(([x, z, r], k) => (
          <group key={k} position={[x, 0.016, z]} rotation={[0, r, 0]}>
            <mesh position={[0.0, 0, 0]} material={bead}>
              <boxGeometry args={[0.46, 0.012, 0.02]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}

function PanelProp({ j }: { j: JobRt }) {
  const M = useMats()
  const hinge = useRef<THREE.Group>(null)
  const bolts = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const hold = ease(stepU(j, 0))
    const tight = stepU(j, 1)
    if (hinge.current) hinge.current.rotation.x = (1 - hold) * (0.26 + 0.05 * Math.sin(clock.elapsedTime * 1.3))
    bolts.current?.children.forEach((b) => {
      b.position.y = 0.024 + 0.03 * (1 - tight)
      b.rotation.y = tight * 18
    })
  })
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]} material={M.dark}>
        <planeGeometry args={[0.92, 0.62]} />
      </mesh>
      <group ref={hinge} position={[0, 0.012, 0.3]}>
        <group position={[0, 0, -0.3]}>
          <mesh material={M.white} castShadow receiveShadow>
            <boxGeometry args={[0.9, 0.022, 0.6]} />
          </mesh>
          <mesh position={[0, 0.012, 0.2]} material={M.orange}>
            <boxGeometry args={[0.9, 0.004, 0.06]} />
          </mesh>
          <group ref={bolts}>
            {[
              [-0.38, -0.24],
              [0.38, -0.24],
              [-0.38, 0.24],
              [0.38, 0.24],
            ].map(([x, z], k) => (
              <mesh key={k} position={[x, 0.04, z]} material={M.metal} castShadow>
                <cylinderGeometry args={[0.022, 0.022, 0.04, 6]} />
              </mesh>
            ))}
          </group>
        </group>
      </group>
    </group>
  )
}

function CableProp({ j }: { j: JobRt }) {
  const M = useMats()
  const tube = useRef<THREE.Mesh>(null)
  const plug = useRef<THREE.Group>(null)
  const fray = useRef<THREE.Group>(null)
  const pts = useMemo(() => [new THREE.Vector3(0.18, 0.08, 0.05), new THREE.Vector3(0.42, 0.1, 0.02), new THREE.Vector3(0.55, 0.25, -0.25), new THREE.Vector3()], [])
  const curve = useMemo(() => new THREE.CatmullRomCurve3(pts), [pts])
  const socket = useMemo(() => new THREE.Vector3(0, 0.12, -0.2), [])
  const tmp = useMemo(() => ({ free: new THREE.Vector3(), t: new THREE.Vector3(), last: -1 }), [])
  useEffect(() => () => tube.current?.geometry.dispose(), [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const plugIn = ease(stepU(j, 1))
    tmp.free.set(0.62 + 0.05 * Math.sin(t * 0.9), 0.42 + 0.06 * Math.sin(t * 0.7 + 1), -0.42 + 0.05 * Math.cos(t * 0.8))
    pts[3].lerpVectors(tmp.free, socket, plugIn)
    pts[2].set(0.55 - 0.3 * plugIn, 0.25 + 0.05 * Math.sin(t * 0.8) * (1 - plugIn), -0.25 - 0.05 * plugIn)
    // 形は 1/30 秒ごとに作り直す
    if (tube.current && t - tmp.last > 1 / 30) {
      tmp.last = t
      tube.current.geometry.dispose()
      tube.current.geometry = new THREE.TubeGeometry(curve, 24, 0.016, 6, false)
    }
    if (plug.current) {
      plug.current.position.copy(pts[3])
      curve.getTangent(1, tmp.t)
      plug.current.quaternion.setFromUnitVectors(UP, tmp.t)
    }
    if (fray.current) fray.current.visible = stepU(j, 0) < 1
  })
  return (
    <group>
      <mesh position={[0, 0.1, 0]} material={M.white} castShadow receiveShadow>
        <boxGeometry args={[0.36, 0.2, 0.26]} />
      </mesh>
      <mesh position={[0, 0.12, -0.135]} rotation={[Math.PI / 2, 0, 0]} material={M.dark}>
        <cylinderGeometry args={[0.04, 0.045, 0.02, 14]} />
      </mesh>
      <mesh position={[0.12, 0.202, -0.08]} material={M.orange}>
        <boxGeometry args={[0.08, 0.006, 0.05]} />
      </mesh>
      <Lamp ok={() => jobDone(j)} position={[-0.12, 0.17, -0.132]} />
      <mesh ref={tube} material={M.cable} castShadow>
        <tubeGeometry args={[curve, 24, 0.016, 6, false]} />
      </mesh>
      <group ref={plug}>
        <mesh position={[0, 0.03, 0]} material={M.metal} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.07, 12]} />
        </mesh>
        <group ref={fray} position={[0, 0.075, 0]}>
          {[0, 1, 2, 3, 4].map((k) => (
            <mesh key={k} position={[Math.cos(k * 1.3) * 0.012, 0.02, Math.sin(k * 1.3) * 0.012]} rotation={[Math.sin(k) * 0.5, 0, Math.cos(k) * 0.5]} material={M.copper}>
              <boxGeometry args={[0.004, 0.04, 0.004]} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  )
}

function AntennaProp({ j }: { j: JobRt }) {
  const M = useMats()
  const sx = j.site.th > 0 ? -1 : 1
  const dish = useRef<THREE.Group>(null)
  const bolt = useRef<THREE.Mesh>(null)
  useFrame((_, dt) => {
    const turn = ease(stepU(j, 1))
    if (dish.current) {
      dish.current.rotation.y = 0.75 * (1 - turn)
      dish.current.rotation.z = -0.45 * (1 - turn)
    }
    if (bolt.current && workLink.contact && (j.step === 0 || j.step === 2) && !jobDone(j)) bolt.current.rotation.y += dt * 20 * (j.step === 0 ? -1 : 1)
  })
  return (
    <group>
      <mesh position={[0, 0.015, 0]} material={M.metal} receiveShadow>
        <cylinderGeometry args={[0.16, 0.18, 0.03, 16]} />
      </mesh>
      <mesh position={[0, 0.47, 0]} material={M.metal} castShadow>
        <cylinderGeometry args={[0.035, 0.045, 0.9, 10]} />
      </mesh>
      <mesh position={[0, 0.95, 0]} material={M.dark} castShadow>
        <boxGeometry args={[0.12, 0.12, 0.12]} />
      </mesh>
      <mesh ref={bolt} position={[sx * 0.075, 0.95, 0]} rotation={[0, 0, Math.PI / 2]} material={M.orange} castShadow>
        <cylinderGeometry args={[0.028, 0.028, 0.04, 6]} />
      </mesh>
      <group ref={dish} position={[0, 1.02, 0]}>
        <group rotation={[-0.7, 0, 0]}>
          <mesh position={[0, 0.18, 0]} rotation={[Math.PI, 0, 0]} material={M.white} castShadow>
            <sphereGeometry args={[0.42, 28, 8, 0, Math.PI * 2, 0, 0.62]} />
          </mesh>
          <mesh position={[0, 0.2, 0]} material={M.metal}>
            <cylinderGeometry args={[0.008, 0.008, 0.36, 6]} />
          </mesh>
          <mesh position={[0, 0.39, 0]} material={M.dark}>
            <cylinderGeometry args={[0.03, 0.02, 0.05, 10]} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

/** ひびの形（放熱板の面の上：y, z） */
const CRACK: [number, number][] = [
  [1.27, -1.62],
  [1.23, -1.5],
  [1.28, -1.38],
  [1.22, -1.24],
  [1.27, -1.1],
  [1.24, -0.98],
  [1.29, -0.84],
]

function RadiatorProp({ j }: { j: JobRt }) {
  const M = useMats()
  const sx = j.site.th > 0 ? -1 : 1
  const bead = useMemo(beadMaterial, [])
  useEffect(() => () => bead.dispose(), [bead])
  const stop = useRef<THREE.Mesh>(null)
  const beads = useRef<THREE.Group>(null)
  const segs = useMemo(
    () =>
      CRACK.slice(1).map(([y, z], k) => {
        const [y0, z0] = CRACK[k]
        return { y: (y + y0) / 2, z: (z + z0) / 2, len: Math.hypot(y - y0, z - z0), ang: Math.atan2(y - y0, z - z0) }
      }),
    [],
  )
  useFrame(() => {
    if (stop.current) stop.current.scale.setScalar(Math.max(0.01, stepU(j, 0)))
    const w = stepU(j, 1)
    beads.current?.children.forEach((c, k) => (c.visible = w * segs.length > k + 0.2))
    heatColor(bead, j.heat)
  })
  const x = sx * 0.043
  return (
    <group>
      {segs.map((s, k) => (
        <mesh key={k} position={[x, s.y, s.z]} rotation={[-s.ang, 0, 0]} material={M.hole}>
          <boxGeometry args={[0.004, 0.008, s.len + 0.01]} />
        </mesh>
      ))}
      <mesh ref={stop} position={[x + sx * 0.001, CRACK[CRACK.length - 1][0], CRACK[CRACK.length - 1][1] + 0.03]} rotation={[0, 0, Math.PI / 2]} material={M.hole}>
        <cylinderGeometry args={[0.018, 0.018, 0.004, 14]} />
      </mesh>
      <group ref={beads}>
        {segs.map((s, k) => (
          <mesh key={k} position={[x + sx * 0.004, s.y, s.z]} rotation={[-s.ang, 0, 0]} material={bead}>
            <boxGeometry args={[0.01, 0.026, s.len + 0.02]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function SensorProp({ j }: { j: JobRt }) {
  const M = useMats()
  const old = useRef<THREE.Group>(null)
  const fresh = useRef<THREE.Group>(null)
  const bolts = useRef<THREE.Group>(null)
  useFrame(() => {
    const out = stepU(j, 0)
    bolts.current?.children.forEach((b) => {
      b.position.y = 0.06 + 0.07 * out
      b.rotation.y = -out * 20
    })
    if (bolts.current) bolts.current.visible = j.step < 1 || jobDone(j)
    if (bolts.current && jobDone(j)) bolts.current.children.forEach((b) => (b.position.y = 0.06))
    const pull = ease(stepU(j, 1))
    if (old.current) {
      old.current.visible = j.step < 2
      old.current.position.y = 0.32 * pull
      old.current.scale.setScalar(1 - 0.7 * pull)
    }
    if (fresh.current) fresh.current.visible = jobDone(j)
  })
  const box = (ok: boolean) => (
    <>
      <mesh position={[0, 0.11, 0]} material={M.white} castShadow receiveShadow>
        <boxGeometry args={[0.24, 0.16, 0.24]} />
      </mesh>
      <mesh position={[0, 0.2, 0]} material={M.dark} castShadow>
        <sphereGeometry args={[0.07, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh position={[0, 0.13, -0.122]} material={ok ? M.orange : M.dark}>
        <boxGeometry args={[0.18, 0.03, 0.004]} />
      </mesh>
      <Lamp ok={() => ok} position={[0.09, 0.17, -0.122]} />
    </>
  )
  return (
    <group>
      <mesh position={[0, 0.015, 0]} material={M.dark} receiveShadow>
        <boxGeometry args={[0.42, 0.03, 0.42]} />
      </mesh>
      <group ref={old}>{box(false)}</group>
      <group ref={fresh}>{box(true)}</group>
      <group ref={bolts}>
        {[-0.17, 0.17].map((x) => (
          <mesh key={x} position={[x, 0.06, 0]} material={M.metal} castShadow>
            <cylinderGeometry args={[0.022, 0.022, 0.06, 6]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

const PROPS = { hole: HoleProp, panel: PanelProp, cable: CableProp, antenna: AntennaProp, radiator: RadiatorProp, sensor: SensorProp }

// ---- 部品棚 ----------------------------------------------------------------------

function Rack() {
  const M = useMats()
  const items = useRef<THREE.Group>(null)
  useFrame(() => {
    const g = items.current
    if (!g) return
    g.children.forEach((c) => {
      const kind = c.userData.kind as 'patch' | 'sensor'
      c.visible = (c.userData.n as number) >= jobsRt.rackTaken[kind]
    })
  })
  const W = 0.8
  const D = 0.45
  return (
    <group {...siteProps(RACK)}>
      {[
        [-W / 2, -D / 2],
        [W / 2, -D / 2],
        [-W / 2, D / 2],
        [W / 2, D / 2],
      ].map(([x, z], k) => (
        <mesh key={k} position={[x, 0.3, z]} material={M.metal} castShadow>
          <boxGeometry args={[0.03, 0.6, 0.03]} />
        </mesh>
      ))}
      {[0.04, 0.3, 0.56].map((y) => (
        <mesh key={y} position={[0, y, 0]} material={M.dark} castShadow receiveShadow>
          <boxGeometry args={[W + 0.03, 0.02, D + 0.03]} />
        </mesh>
      ))}
      <mesh position={[0, 0.45, -D / 2 - 0.02]} material={M.orange}>
        <boxGeometry args={[W, 0.06, 0.006]} />
      </mesh>
      <group ref={items}>
        {[0, 1, 2].map((n) => (
          <mesh key={`p${n}`} userData={{ kind: 'patch', n }} position={[0, 0.585 + n * 0.016, 0]} material={M.metal} castShadow>
            <boxGeometry args={[0.44, 0.014, 0.4]} />
          </mesh>
        ))}
        {[0, 1].map((n) => (
          <mesh key={`s${n}`} userData={{ kind: 'sensor', n }} position={[-0.2 + n * 0.4, 0.39, 0]} material={M.white} castShadow>
            <boxGeometry args={[0.24, 0.16, 0.24]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** 運んでいる部品：右手首の先に付いてくる */
function Carried() {
  const M = useMats()
  const patch = useRef<THREE.Mesh>(null)
  const sensor = useRef<THREE.Group>(null)
  const off = useMemo(() => ({ patch: new THREE.Matrix4().makeTranslation(0, -0.245, -0.02), sensor: new THREE.Matrix4().makeTranslation(0, -0.33, -0.02), m: new THREE.Matrix4() }), [])
  useFrame(() => {
    const c = jobsRt.carrying
    for (const [k, o] of [
      ['patch', patch.current],
      ['sensor', sensor.current],
    ] as const) {
      if (!o) continue
      o.visible = c === k
      if (!o.visible) continue
      off.m.multiplyMatrices(workLink.wrist, off[k])
      off.m.decompose(o.position, o.quaternion, o.scale)
    }
  })
  return (
    <>
      <mesh ref={patch} material={M.metal} castShadow>
        <boxGeometry args={[0.44, 0.014, 0.4]} />
      </mesh>
      <group ref={sensor}>
        <mesh material={M.white} castShadow>
          <boxGeometry args={[0.24, 0.16, 0.24]} />
        </mesh>
        <mesh position={[0, -0.08, 0]} rotation={[Math.PI, 0, 0]} material={M.dark}>
          <sphereGeometry args={[0.07, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      </group>
    </>
  )
}

// ---- 作業の判定 -------------------------------------------------------------------

/** 依頼 j の今の手順で、向かう先（部品棚か、故障の所） */
function targetOf(j: JobRt) {
  const st = JOBS[j.type].steps[j.step]
  return st?.kind === 'fetch' ? rackRt : j
}

export function EvaJobs() {
  const shift = useEvaJobs((s) => s.shift)
  const list = useMemo(() => jobsRt.list.slice(), [shift])
  const sim = useMemo(() => ({ assistT: 0, uiAt: 0, last: '' }), [])
  useEffect(() => {
    sim.assistT = 0
  }, [shift, sim])
  useEffect(
    () => () => {
      workLink.assist = false
      workLink.contact = false
    },
    [],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = useEva.getState()
    const now = evaNow()
    const carrying = jobsRt.carrying
    for (const j of jobsRt.list) j.heat = Math.max(0, j.heat - dt * 0.35)
    workLink.contact = false
    if (s.phase !== 'fly') {
      workLink.assist = false
      return
    }
    // ---- いちばん近い作業先 ----
    let best: JobRt | null = null
    let bestD = Infinity
    for (const j of jobsRt.list) {
      if (jobDone(j)) continue
      const st = JOBS[j.type].steps[j.step]
      if (carrying && !(st.kind === 'place' && st.carry === carrying)) continue
      if (!carrying && st.kind === 'place') continue
      const tg = targetOf(j)
      // 部品棚では、今のツールで取れる部品の依頼を先に
      const d = workLink.body.distanceTo(tg.P) - (st.tool === s.tool ? 0.01 : 0)
      if (d < bestD) {
        bestD = d
        best = j
      }
    }
    const near = !!best && bestD < REACH
    let need: JobUi['need'] = null
    let assist = false
    if (best && near && s.working && !s.swapping) {
      const st = JOBS[best.type].steps[best.step]
      if (st.tool !== s.tool) need = st.tool
      else {
        const tg = targetOf(best)
        assist = true
        workLink.P.copy(tg.P)
        workLink.A.copy(tg.A)
        workLink.U.copy(tg.U)
        sim.assistT += dt
        const tipD = workLink.tip.distanceTo(tg.P)
        if (tipD < 0.35 || sim.assistT > 1.6) {
          workLink.contact = true
          best.prog += dt / st.sec
          if (st.tool === 'welder' || st.tool === 'cutter') best.heat = Math.min(1.2, best.heat + dt * 2.2)
          if (best.prog >= 1) {
            best.prog = 0
            best.step++
            sim.assistT = 0
            if (st.kind === 'fetch' && st.carry) {
              jobsRt.carrying = st.carry
              jobsRt.rackTaken[st.carry]++
              useEvaJobs.setState({ carrying: st.carry })
            } else if (st.kind === 'place') {
              jobsRt.carrying = null
              useEvaJobs.setState({ carrying: null })
            }
            workLink.happyUntil = now + 0.9
            if (jobDone(best)) {
              workLink.happyUntil = now + 2.4
              useEvaLog.getState().add(best.type)
              useEvaJobs.setState({ card: jobsRt.list.indexOf(best) })
              evaInput.work = false
            }
          }
        }
      }
    } else sim.assistT = 0
    workLink.assist = assist

    // ---- 画面の表示（ときどき） ----
    if (now - sim.uiAt > 0.12) {
      sim.uiAt = now
      let focus = best ? jobsRt.list.indexOf(best) : -1
      if (focus < 0) focus = jobsRt.list.findIndex((j) => !jobDone(j))
      const fj = jobsRt.list[focus]
      const tg = fj ? targetOf(fj) : null
      const ui: JobUi = {
        jobs: jobsRt.list.map((j) => ({ type: j.type, step: j.step, done: jobDone(j), x: Math.round(j.P.x * 10) / 10, z: Math.round(j.P.z * 10) / 10 })),
        focus,
        dist: tg ? Math.round(workLink.body.distanceTo(tg.P) * 10) / 10 : 0,
        near: !!fj && fj === best && near,
        need,
        prog: fj ? Math.round(fj.prog * 50) / 50 : 0,
        toRack: !!fj && JOBS[fj.type].steps[fj.step]?.kind === 'fetch',
      }
      const key = JSON.stringify(ui)
      if (key !== sim.last) {
        sim.last = key
        useEvaJobs.setState({ ui })
      }
    }
  })

  return (
    <>
      <Rack />
      <Pillar at={rackRt.P} up={rackRt.U} color="#5fd4ff" state={() => (jobsRt.list.some((j) => !jobDone(j) && JOBS[j.type].steps[j.step]?.kind === 'fetch') && !jobsRt.carrying ? 1 : 0)} />
      {list.map((j, i) => {
        const Prop = PROPS[j.type]
        return (
          <group key={`${shift}-${i}`}>
            <group {...siteProps(j.site)}>
              <Prop j={j} />
            </group>
            <Pillar
              at={j.type === 'antenna' ? hullPoint(j.site.th, j.site.z) : j.P}
              up={j.U}
              color="#ffa844"
              state={() => {
                if (jobDone(j)) return 0
                const st = JOBS[j.type].steps[j.step]
                if (st.kind === 'fetch') return 0.25
                if (jobsRt.carrying && !(st.kind === 'place' && st.carry === jobsRt.carrying)) return 0.25
                return 1
              }}
            />
          </group>
        )
      })}
      <Carried />
    </>
  )
}
