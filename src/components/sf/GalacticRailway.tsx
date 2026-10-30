import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../../state/store'
import { useLayout } from '../../state/useLayout'
import { JAPAN_TEXT, RAILWAY_ID, railwayName } from '../../data/sfJapan'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'
import { useSite } from './useSite'

// 銀河鉄道（宮沢賢治『銀河鉄道の夜』から）。光のレールが、地球の近くから土星の外まで太陽系をゆったり一周する。
// 機関車1両と客車3両。窓には明かりがともり、煙突から星くずの煙がたなびく。
// 大きさは自機（全長 0.3）と並んで見えるくらいにしている。前は +Z。

/** レールの道すじ：太陽からの距離（天文単位）と、黄道面の上での向き（度）、高さ（表示単位） */
const ROUTE: [number, number, number][] = [
  [1.15, 0, 2],
  [1.8, 35, 6],
  [3.2, 70, 12],
  [5.6, 100, 18],
  [9.8, 130, 22],
  [11.5, 165, 16],
  [9.5, 200, 8],
  [6, 235, 2],
  [3.4, 270, -4],
  [1.9, 305, -2],
  [1.25, 335, 0],
]
/** 進む速さ（表示単位／秒）。自機の最高速の約3分の1なので、並んで飛べる */
const SPEED = 2.6
/** レールの幅と、車両の長さ */
const GAUGE = 0.07
const LOCO = 0.3
const COACH = 0.24
const COUPLING = 0.025
/** 枕木の間隔 */
const SLEEPER_STEP = 0.12
const SMOKE = 360

const UP = new THREE.Vector3(0, 1, 0)
const DEG = Math.PI / 180
const p = new THREE.Vector3()
const tan = new THREE.Vector3()
const side = new THREE.Vector3()
const look = new THREE.Vector3()
const stack = new THREE.Vector3()

/** 窓の明かりの絵（暗い車体に、あたたかい色の窓が並ぶ） */
function windowTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 32
  const g = c.getContext('2d')!
  g.fillStyle = '#1b2440'
  g.fillRect(0, 0, 256, 32)
  for (let i = 0; i < 8; i++) {
    const grad = g.createLinearGradient(0, 6, 0, 26)
    grad.addColorStop(0, '#ffe7a8')
    grad.addColorStop(1, '#f2a24a')
    g.fillStyle = grad
    g.fillRect(8 + i * 31, 7, 22, 18)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** レールに沿った位置と向き（s：道のり） */
function place(curve: THREE.CatmullRomCurve3, length: number, s: number, obj: THREE.Object3D) {
  const u = (((s % length) + length) % length) / length
  curve.getPointAt(u, p)
  curve.getTangentAt(u, tan)
  obj.position.copy(p)
  obj.lookAt(look.copy(p).add(tan))
}

export function GalacticRailway() {
  useLang()
  const layout = useLayout()
  const loco = useRef<THREE.Group>(null!)
  const coaches = useRef<THREE.Group[]>([])
  const label = useRef<HTMLSpanElement>(null)
  const travelled = useRef(0)
  useHideBehindSun(label, loco)
  const moved = useSite(loco, { id: RAILWAY_ID, radius: 0.35, notice: { distance: 2.5, text: JAPAN_TEXT.railwayFound } })

  // レールの道すじ（距離のスライダーで太陽系を広げると、一緒に広がる）
  const track = useMemo(() => {
    const points = ROUTE.map(([au, deg, y]) => {
      const r = layout.au(au)
      return new THREE.Vector3(Math.cos(deg * DEG) * r, y, -Math.sin(deg * DEG) * r)
    })
    const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal')
    const length = curve.getLength()
    const count = Math.ceil(length / SLEEPER_STEP)
    // 2本のレール（細い光の管）と、遠くからも見える淡い線
    const rail = (offset: number) => {
      const pts = curve.getSpacedPoints(Math.ceil(length * 4)).map((q, i, all) => {
        const next = all[(i + 1) % all.length]
        side.copy(next).sub(q).normalize().cross(UP).normalize()
        return q.clone().addScaledVector(side, offset)
      })
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), pts.length, 0.004, 4, true)
    }
    const line = new THREE.BufferGeometry().setFromPoints(curve.getSpacedPoints(1200))
    // 枕木：光の板を一定の間隔で
    const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(GAUGE * 1.7, 0.004, 0.018), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.75, 1.4), toneMapped: false, transparent: true, opacity: 0.55 }), count)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const target = new THREE.Object3D()
    for (let i = 0; i < count; i++) {
      place(curve, length, i * SLEEPER_STEP, target)
      target.position.y -= 0.006
      q.copy(target.quaternion)
      m.compose(target.position, q, new THREE.Vector3(1, 1, 1))
      sleepers.setMatrixAt(i, m)
    }
    sleepers.frustumCulled = false
    return { curve, length, left: rail(-GAUGE / 2), right: rail(GAUGE / 2), line, sleepers }
  }, [layout])
  useEffect(
    () => () => {
      track.left.dispose()
      track.right.dispose()
      track.line.dispose()
      track.sleepers.geometry.dispose()
      ;(track.sleepers.material as THREE.Material).dispose()
      track.sleepers.dispose()
    },
    [track],
  )

  const parts = useMemo(() => {
    const navy = new THREE.MeshStandardMaterial({ color: '#22305a', metalness: 0.5, roughness: 0.4, emissive: '#16204a', emissiveIntensity: 0.6 })
    const gold = new THREE.MeshStandardMaterial({ color: '#d8b45c', metalness: 0.9, roughness: 0.3, emissive: '#6a4e14', emissiveIntensity: 0.7 })
    const windows = windowTexture()
    return {
      navy,
      gold,
      black: new THREE.MeshStandardMaterial({ color: '#1a1a20', metalness: 0.6, roughness: 0.5, emissive: '#101018', emissiveIntensity: 0.5 }),
      red: new THREE.MeshStandardMaterial({ color: '#9a2e2a', metalness: 0.4, roughness: 0.5, emissive: '#3a0e0c', emissiveIntensity: 0.6 }),
      lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 1.6), toneMapped: false }),
      windowMat: new THREE.MeshBasicMaterial({ map: windows, color: new THREE.Color(1.5, 1.4, 1.25), toneMapped: false }),
      windows,
      boiler: new THREE.CylinderGeometry(0.034, 0.034, 0.17, 20).rotateX(Math.PI / 2),
      band: new THREE.TorusGeometry(0.0345, 0.003, 6, 24),
      smokebox: new THREE.CylinderGeometry(0.036, 0.036, 0.02, 20).rotateX(Math.PI / 2),
      chimney: new THREE.CylinderGeometry(0.016, 0.01, 0.05, 12),
      dome: new THREE.SphereGeometry(0.015, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      cab: new THREE.BoxGeometry(0.08, 0.075, 0.07),
      cabRoof: new THREE.BoxGeometry(0.09, 0.008, 0.08),
      frame: new THREE.BoxGeometry(0.066, 0.016, 0.28),
      wheel: new THREE.CylinderGeometry(0.026, 0.026, 0.008, 18).rotateZ(Math.PI / 2),
      small: new THREE.CylinderGeometry(0.014, 0.014, 0.008, 12).rotateZ(Math.PI / 2),
      catcher: new THREE.ConeGeometry(0.035, 0.03, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4),
      tender: new THREE.BoxGeometry(0.072, 0.06, 0.08),
      headlamp: new THREE.SphereGeometry(0.009, 12, 8),
      coach: new THREE.BoxGeometry(0.074, 0.06, COACH),
      roof: new THREE.CylinderGeometry(0.039, 0.039, COACH, 16, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2),
      strip: new THREE.PlaneGeometry(COACH * 0.92, 0.024),
      bogie: new THREE.BoxGeometry(0.05, 0.014, 0.05),
    }
  }, [])

  // 星くずの煙：煙突から出た粒が、レールの上に残ってゆっくり広がって消える
  const smoke = useMemo(() => {
    const positions = new Float32Array(SMOKE * 3)
    const colors = new Float32Array(SMOKE * 3)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const material = new THREE.PointsMaterial({ size: 0.022, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    return { points, positions, colors, age: new Float32Array(SMOKE).fill(99), drift: new Float32Array(SMOKE * 3), next: 0, tint: Array.from({ length: SMOKE }, (_, i) => new THREE.Color().setHSL(0.12 + (i % 7) * 0.07, 0.6, 0.75)) }
  }, [])

  const rails = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 1.2, 2.2), toneMapped: false }), [])
  const lineMat = useMemo(() => new THREE.LineBasicMaterial({ color: '#7fa6ff', transparent: true, opacity: 0.35 }), [])

  useFrame(({ clock }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05)
    const running = useStore.getState().timeScale > 0
    if (running) travelled.current += dt * SPEED
    const s = travelled.current
    place(track.curve, track.length, s, loco.current)
    coaches.current.forEach((c, i) => place(track.curve, track.length, s - LOCO / 2 - COUPLING - COACH / 2 - i * (COACH + COUPLING), c))
    moved()
    // レールがゆらめくように光る
    const t = clock.getElapsedTime()
    rails.color.setRGB(0.8 + 0.2 * Math.sin(t * 1.3), 1.2 + 0.2 * Math.sin(t * 1.1), 2.2)
    // 煙：走っているあいだ、煙突から粒を出す
    const sm = smoke
    if (running) {
      loco.current.localToWorld(stack.set(0, 0.13, 0.09))
      for (let k = 0; k < 3; k++) {
        const i = sm.next
        sm.next = (sm.next + 1) % SMOKE
        sm.age[i] = 0
        sm.positions.set([stack.x, stack.y, stack.z], i * 3)
        sm.drift.set([(Math.random() - 0.5) * 0.05, 0.03 + Math.random() * 0.04, (Math.random() - 0.5) * 0.05], i * 3)
      }
    }
    for (let i = 0; i < SMOKE; i++) {
      sm.age[i] += dt
      const a = sm.age[i]
      const fade = a > 6 ? 0 : (1 - a / 6) * 1.6
      sm.positions[i * 3] += sm.drift[i * 3] * dt
      sm.positions[i * 3 + 1] += sm.drift[i * 3 + 1] * dt
      sm.positions[i * 3 + 2] += sm.drift[i * 3 + 2] * dt
      const c = sm.tint[i]
      sm.colors[i * 3] = c.r * fade
      sm.colors[i * 3 + 1] = c.g * fade
      sm.colors[i * 3 + 2] = c.b * fade
    }
    sm.points.geometry.attributes.position.needsUpdate = true
    sm.points.geometry.attributes.color.needsUpdate = true
  })

  const P = parts
  const wheelX = 0.036
  return (
    <>
      <mesh geometry={track.left} material={rails} frustumCulled={false} />
      <mesh geometry={track.right} material={rails} frustumCulled={false} />
      <primitive object={track.sleepers} />
      <lineLoop geometry={track.line} material={lineMat} />
      <primitive object={smoke.points} />

      {/* 機関車（前は +Z） */}
      <group ref={loco}>
        <mesh geometry={P.frame} material={P.black} position={[0, 0.03, 0]} />
        <mesh geometry={P.boiler} material={P.navy} position={[0, 0.075, 0.035]} />
        {[-0.03, 0.02, 0.07].map((z) => (
          <mesh key={z} geometry={P.band} material={P.gold} position={[0, 0.075, z]} />
        ))}
        <mesh geometry={P.smokebox} material={P.black} position={[0, 0.075, 0.13]} />
        <mesh geometry={P.chimney} material={P.black} position={[0, 0.125, 0.1]} />
        <mesh geometry={P.dome} material={P.gold} position={[0, 0.105, 0.02]} />
        <mesh geometry={P.headlamp} material={P.lamp} position={[0, 0.098, 0.142]} />
        <mesh geometry={P.catcher} material={P.red} position={[0, 0.022, 0.155]} />
        <mesh geometry={P.cab} material={P.navy} position={[0, 0.085, -0.075]} />
        <mesh geometry={P.cabRoof} material={P.gold} position={[0, 0.126, -0.075]} />
        <mesh geometry={P.strip} material={P.windowMat} position={[0.041, 0.095, -0.075]} rotation={[0, Math.PI / 2, 0]} scale={[0.25, 1, 1]} />
        <mesh geometry={P.strip} material={P.windowMat} position={[-0.041, 0.095, -0.075]} rotation={[0, -Math.PI / 2, 0]} scale={[0.25, 1, 1]} />
        <mesh geometry={P.tender} material={P.navy} position={[0, 0.06, -0.155]} />
        {[1, -1].map((sd) => (
          <group key={sd}>
            {[0.065, 0.005, -0.055].map((z) => (
              <mesh key={z} geometry={P.wheel} material={P.red} position={[sd * wheelX, 0.026, z]} />
            ))}
            <mesh geometry={P.small} material={P.red} position={[sd * wheelX, 0.014, 0.12]} />
            <mesh geometry={P.small} material={P.red} position={[sd * wheelX, 0.014, -0.15]} />
          </group>
        ))}
        <Html position={[0, 0.25, 0]} center className="label" zIndexRange={LABEL_Z}>
          <span ref={label} onClick={() => useStore.getState().setTarget(RAILWAY_ID)}>
            {railwayName()}
          </span>
        </Html>
      </group>

      {/* 客車3両：窓の明かりの帯と、丸い屋根 */}
      {[0, 1, 2].map((i) => (
        <group
          key={i}
          ref={(g: THREE.Group | null) => {
            if (g) coaches.current[i] = g
          }}
        >
          <mesh geometry={P.coach} material={P.navy} position={[0, 0.06, 0]} />
          <mesh geometry={P.roof} material={P.gold} position={[0, 0.088, 0]} scale={[1, 0.45, 1]} />
          <mesh geometry={P.strip} material={P.windowMat} position={[0.0375, 0.068, 0]} rotation={[0, Math.PI / 2, 0]} />
          <mesh geometry={P.strip} material={P.windowMat} position={[-0.0375, 0.068, 0]} rotation={[0, -Math.PI / 2, 0]} />
          <mesh geometry={P.bogie} material={P.black} position={[0, 0.02, COACH * 0.32]} />
          <mesh geometry={P.bogie} material={P.black} position={[0, 0.02, -COACH * 0.32]} />
        </group>
      ))}
    </>
  )
}
