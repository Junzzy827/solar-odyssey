import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { bodies } from '../../state/registry'
import { useStore } from '../../state/store'
import { JAPAN_TEXT, MOON_CITY_ID, moonCityName } from '../../data/sfJapan'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'
import { useSite } from './useSite'

// 月の都（『竹取物語』から。オリジナルのデザイン）。月の裏側の真ん中、クレーターの底にある光の都。
// 白い壁と淡い金の屋根の御殿、門、光る池、五重の塔。空には灯がいくつも浮かび、ゆっくり昇っていく。
// 月はいつも同じ面を地球へ向けているので、「地球と反対の向き」がいつも裏側の真ん中になる。
// 都の模型は1単位で作り、MODEL 倍して置く（さしわたし約0.2。月の表示の半径は約0.78）。

const MODEL = 0.01
const Y = new THREE.Vector3(0, 1, 0)
/** 目標にしたときに止まる点（都の真上、この高さ）。ここが低いと、地球側から来たワープが月の中で止まってしまう */
const ANCHOR = 1.0
/** 浮かぶ灯の数 */
const LANTERNS = 56

const moonPos = new THREE.Vector3()
const earthPos = new THREE.Vector3()
const up = new THREE.Vector3()

function glow(r: number, g: number, b: number) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), toneMapped: false })
}

/** 灯や後光に使う、まるくぼけた光 */
function softTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 寄棟の屋根（四角すいを横に広げる）。w×d の建物にのせる */
function Roof({ w, d, h, y, mat, geo }: { w: number; d: number; h: number; y: number; mat: THREE.Material; geo: THREE.BufferGeometry }) {
  return <mesh geometry={geo} material={mat} position={[0, y + h / 2, 0]} rotation={[0, Math.PI / 4, 0]} scale={[w * 0.78, h, d * 0.78]} />
}

function Hall({ x, z, w, d, h, parts }: { x: number; z: number; w: number; d: number; h: number; parts: Parts }) {
  return (
    <group position={[x, ground(x, z), z]}>
      <mesh geometry={parts.box} material={parts.base} position={[0, 0.12, 0]} scale={[w + 0.5, 0.24, d + 0.5]} />
      <mesh geometry={parts.box} material={parts.wall} position={[0, 0.24 + h / 2, 0]} scale={[w, h, d]} />
      {/* 窓のあかり：壁より少し外に、細い帯 */}
      <mesh geometry={parts.box} material={parts.window} position={[0, 0.24 + h * 0.55, 0]} scale={[w * 0.86, h * 0.22, d + 0.04]} />
      <mesh geometry={parts.box} material={parts.window} position={[0, 0.24 + h * 0.55, 0]} scale={[w + 0.04, h * 0.22, d * 0.8]} />
      <Roof w={w + 0.7} d={d + 0.7} h={h * 0.7} y={0.24 + h} mat={parts.roof} geo={parts.cone} />
    </group>
  )
}

/** 月の丸みに合わせた、地面の高さ（模型の単位） */
let SPHERE = 78
function ground(x: number, z: number) {
  return -(x * x + z * z) / (2 * SPHERE)
}

type Parts = ReturnType<typeof makeParts>

function makeParts() {
  const soft = softTexture()
  return {
    soft,
    box: new THREE.BoxGeometry(1, 1, 1),
    cone: new THREE.ConeGeometry(1, 1, 4, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
    disc: new THREE.CircleGeometry(1, 48),
    base: glow(0.62, 0.6, 0.56),
    wall: glow(1.05, 1.02, 0.95),
    window: glow(2.2, 1.55, 0.7),
    roof: glow(1.5, 1.15, 0.55),
    pond: glow(0.8, 1.3, 1.7),
    lamp: glow(2.4, 1.8, 0.9),
    floor: new THREE.MeshStandardMaterial({ color: '#6c6a66', roughness: 1, emissive: '#2a2618', emissiveIntensity: 0.5 }),
    rim: new THREE.MeshStandardMaterial({ color: '#85827c', roughness: 1 }),
    lanternMat: new THREE.PointsMaterial({
      map: soft,
      color: new THREE.Color(2.2, 1.4, 0.6),
      size: 0.009,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    haloMat: new THREE.SpriteMaterial({ map: soft, color: new THREE.Color(1.0, 0.82, 0.45), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  }
}

function City({ moonRadius }: { moonRadius: number }) {
  useLang()
  const group = useRef<THREE.Group>(null!)
  const anchor = useRef<THREE.Group>(null!)
  const lanternRef = useRef<THREE.Points>(null!)
  const label = useRef<HTMLSpanElement>(null)
  useHideBehindSun(label, group)
  const moved = useSite(anchor, { id: MOON_CITY_ID, radius: 0.05, notice: { distance: ANCHOR + 0.15, text: JAPAN_TEXT.moonCityFound } })
  SPHERE = moonRadius / MODEL

  const parts = useMemo(makeParts, [])
  const floorGeo = useMemo(() => {
    const R = moonRadius / MODEL
    // 都の下の、平らにならしたクレーターの底（月の表面より少しだけ上に、丸みをそろえた皿）
    return new THREE.SphereGeometry(R + 0.12, 64, 6, 0, Math.PI * 2, 0, Math.asin(12 / R))
  }, [moonRadius])
  const lanterns = useMemo(() => {
    const n = LANTERNS
    const pos = new Float32Array(n * 3)
    const seed = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const r = 1.5 + Math.random() * 8
      seed[i * 3] = Math.cos(a) * r
      seed[i * 3 + 1] = Math.random()
      seed[i * 3 + 2] = Math.sin(a) * r
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return { geo, seed }
  }, [])
  useEffect(
    () => () => {
      Object.values(parts).forEach((p) => (p as { dispose?: () => void }).dispose?.())
      floorGeo.dispose()
      lanterns.geo.dispose()
    },
    [parts, floorGeo, lanterns],
  )

  useFrame(({ clock }) => {
    const m = bodies.get('moon')
    const e = bodies.get('earth')
    const g = group.current
    if (!m || !e || !g) return
    m.object.getWorldPosition(moonPos)
    e.object.getWorldPosition(earthPos)
    up.copy(moonPos).sub(earthPos).normalize()
    g.position.copy(moonPos).addScaledVector(up, m.radius)
    g.quaternion.setFromUnitVectors(Y, up)

    // 灯はゆっくり昇り、高くなるほど薄れて、また下から現れる
    const t = clock.getElapsedTime()
    const p = lanterns.geo.attributes.position as THREE.BufferAttribute
    const s = lanterns.seed
    for (let i = 0; i < LANTERNS; i++) {
      const k = (s[i * 3 + 1] + t * 0.012) % 1
      const x = s[i * 3] + Math.sin(t * 0.2 + i) * 0.3
      const z = s[i * 3 + 2] + Math.cos(t * 0.17 + i * 1.3) * 0.3
      p.setXYZ(i, x, ground(x, z) + 0.6 + k * 6, z)
    }
    p.needsUpdate = true
    moved()
  })

  const lamps: [number, number][] = []
  for (let z = 1; z <= 4.4; z += 0.85) lamps.push([-0.9, z], [0.9, z])
  const tiers = [0, 1, 2, 3, 4]
  return (
    <group ref={group}>
      <group scale={MODEL}>
        <mesh geometry={floorGeo} material={parts.floor} position={[0, -SPHERE, 0]} />
        <mesh material={parts.rim} position={[0, ground(12, 0) + 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[12, 0.9, 8, 96]} />
        </mesh>
        {/* 塀に囲まれた御所 */}
        {[
          [0, 5, 10, 0.15],
          [0, -5.5, 10, 0.15],
          [-5, -0.25, 0.15, 10.5],
          [5, -0.25, 0.15, 10.5],
        ].map(([x, z, w, d], i) => (
          <mesh key={i} geometry={parts.box} material={parts.wall} position={[x, ground(x, z) + 0.3, z]} scale={[w, 0.6, d]} />
        ))}
        <Hall x={0} z={-1.6} w={4} d={2.4} h={1.3} parts={parts} />
        <Hall x={-3.1} z={0.6} w={1.5} d={2.4} h={0.9} parts={parts} />
        <Hall x={3.1} z={0.6} w={1.5} d={2.4} h={0.9} parts={parts} />
        <Hall x={-1.2} z={-4.2} w={2.6} d={1.3} h={0.85} parts={parts} />
        {/* 渡り廊下 */}
        {[
          [-2.2, -1.2, 0.9, 0.5],
          [2.2, -1.2, 0.9, 0.5],
          [0, -3.25, 0.5, 1.1],
        ].map(([x, z, w, d], i) => (
          <group key={i} position={[x, ground(x, z), z]}>
            <mesh geometry={parts.box} material={parts.wall} position={[0, 0.45, 0]} scale={[w, 0.5, d]} />
            <mesh geometry={parts.box} material={parts.roof} position={[0, 0.75, 0]} scale={[w + 0.15, 0.1, d + 0.2]} />
          </group>
        ))}
        {/* 門 */}
        <group position={[0, ground(0, 5), 5]}>
          {[-0.75, 0.75].map((x) => (
            <mesh key={x} geometry={parts.cyl} material={parts.wall} position={[x, 0.75, 0]} scale={[0.14, 1.5, 0.14]} />
          ))}
          <mesh geometry={parts.box} material={parts.roof} position={[0, 1.55, 0]} scale={[2.3, 0.12, 0.6]} />
          <Roof w={2.2} d={0.7} h={0.45} y={1.6} mat={parts.roof} geo={parts.cone} />
        </group>
        {/* 光る池 */}
        <mesh geometry={parts.disc} material={parts.pond} position={[0, ground(0, 2.4) + 0.06, 2.4]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.6, 1.0, 1]} />
        {/* 五重の塔 */}
        <group position={[3.4, ground(3.4, -3.6), -3.6]}>
          {tiers.map((k) => {
            const w = 1.0 - k * 0.12
            const y = 0.2 + k * 0.62
            return (
              <group key={k}>
                <mesh geometry={parts.box} material={parts.wall} position={[0, y + 0.2, 0]} scale={[w * 0.6, 0.4, w * 0.6]} />
                <Roof w={w * 1.25} d={w * 1.25} h={0.22} y={y + 0.4} mat={parts.roof} geo={parts.cone} />
              </group>
            )
          })}
          <mesh geometry={parts.cyl} material={parts.lamp} position={[0, 3.75, 0]} scale={[0.04, 0.9, 0.04]} />
        </group>
        {/* 門から御殿への道の灯籠 */}
        {lamps.map(([x, z], i) => (
          <mesh key={i} geometry={parts.box} material={parts.lamp} position={[x, ground(x, z) + 0.25, z]} scale={[0.14, 0.28, 0.14]} />
        ))}
        <points ref={lanternRef} geometry={lanterns.geo} material={parts.lanternMat} frustumCulled={false} />
        <sprite material={parts.haloMat} position={[0, 1.5, 0]} scale={[30, 30, 1]} />
      </group>
      <group ref={anchor} position={[0, ANCHOR, 0]} />
      <Html position={[0, 0.09, 0]} center className="label" zIndexRange={LABEL_Z}>
        <span ref={label} onClick={() => useStore.getState().setTarget(MOON_CITY_ID)}>
          {moonCityName()}
        </span>
      </Html>
    </group>
  )
}

/** 月が登録されるまでは何も描かない */
export function MoonCity() {
  const [radius, setRadius] = useState(0)
  useEffect(() => {
    if (radius) return
    const find = () => {
      const b = bodies.get('moon')
      if (b) setRadius(b.radius)
    }
    find()
    const id = window.setInterval(find, 500)
    return () => window.clearInterval(id)
  }, [radius])
  if (!radius) return null
  return <City moonRadius={radius} />
}
