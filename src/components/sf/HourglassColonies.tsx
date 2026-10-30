import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { bodies } from '../../state/registry'
import { useStore } from '../../state/store'
import { HOURGLASS_ID, HOURGLASS_TEXT, hourglassName } from '../../data/sfHourglass'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'
import { useSite } from './useSite'

// 砂時計型コロニー群（オリジナルのデザイン）。太陽と地球の L5 点（地球と同じ軌道の上で、地球より60度うしろ）に、
// 10基が輪になって浮かぶ。1基は、2つのお椀を細いくびれ（宇宙港）で背中合わせにつないだ形で、長い軸（+Y）のまわりを回る。
// お椀の内側には畑・海・街の帯と、透明な窓の帯が交互に並ぶ。真ん中を細い柱が通る。
// 大きさは SITE_ZOOM のときに本物の比率：長さ 0.9 が約38km、いちばん広いところの半径 0.18 が約7.7km。
// 軽く描けるよう、10基は同じ形を InstancedMesh で並べる。

/** 1基の長さ・くびれの半径・お椀の縁の半径 */
const HEIGHT = 0.9
const WAIST = 0.028
const RIM = 0.18
/** 本物の1gの回転（半径7.7kmで約3分に1回転）：ω = √(g/r) */
const SPIN = Math.sqrt(9.8 / 7680)
/** 輪の半径と、並べる数 */
const RING = 1.5
const COUNT = 10
/** 地球の軌道の上で、地球より60度うしろ */
const BEHIND = -Math.PI / 3

const Y = new THREE.Vector3(0, 1, 0)
const earth = new THREE.Vector3()
const m = new THREE.Matrix4()
const q = new THREE.Quaternion()
const one = new THREE.Vector3(1, 1, 1)

/** お椀の形（くびれから縁へ）。中心から外へ、くびれ・ふくらみ・縁の順。上下対称 */
function profile() {
  const pts: THREE.Vector2[] = []
  const n = 48
  for (let i = 0; i <= n; i++) {
    const s = i / n // 0：上の縁、1：下の縁
    const y = (0.5 - s) * HEIGHT
    const k = Math.abs(y) / (HEIGHT / 2)
    // くびれからなめらかに広がって、縁の近くで少しすぼまる（お椀の口）
    const r = WAIST + (RIM - WAIST) * Math.pow(k, 1.35) * (1 - 0.08 * Math.pow(k, 8))
    pts.push(new THREE.Vector2(r, y))
  }
  return pts
}

/** 帯の模様。u は回る向き、v は軸の向き。窓の帯は透明（アルファ 0） */
function stripTexture(inside: boolean) {
  const W = 1024
  const H = 512
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const bands = 6
  const bw = W / bands
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let b = 0; b < bands; b++) {
    const x0 = b * bw
    if (b % 2 === 1) continue // 窓の帯：透明のまま
    if (!inside) {
      // 外側：灰色の外板と、継ぎ目
      g.fillStyle = '#9da3ab'
      g.fillRect(x0, 0, bw, H)
      g.strokeStyle = 'rgba(60,64,72,0.5)'
      g.lineWidth = 2
      for (let y = 0; y < H; y += 16) g.strokeRect(x0, y, bw, 16)
      for (let x = x0; x < x0 + bw; x += 32) g.strokeRect(x, 0, 32, H)
      continue
    }
    // 内側：軸に沿って、縁の近く（外ほど重い）に畑、真ん中寄りに海、くびれの近くに街
    for (let y = 0; y < H; y += 4) {
      const k = Math.abs(y / H - 0.5) * 2 // 0：くびれ、1：縁
      let col: string
      if (k > 0.72) col = `hsl(${95 + rand() * 30}, ${35 + rand() * 20}%, ${28 + rand() * 12}%)`
      else if (k > 0.45) col = b === 2 ? `hsl(205, 55%, ${30 + rand() * 6}%)` : `hsl(${80 + rand() * 50}, 30%, ${30 + rand() * 10}%)`
      else col = `hsl(30, 8%, ${40 + rand() * 12}%)`
      g.fillStyle = col
      g.fillRect(x0, y, bw, 4)
    }
    // 畑の区画
    g.strokeStyle = 'rgba(40,50,20,0.35)'
    for (let i = 0; i < 40; i++) {
      const y = rand() < 0.5 ? rand() * H * 0.14 : H - rand() * H * 0.14
      g.strokeRect(x0 + rand() * bw, y, 10 + rand() * 30, 6 + rand() * 10)
    }
    // 街の明かり（くびれの近く）
    for (let i = 0; i < 260; i++) {
      const y = H / 2 + (rand() - 0.5) * H * 0.45
      g.fillStyle = `rgba(255, ${210 + rand() * 40}, 150, ${0.5 + rand() * 0.5})`
      g.fillRect(x0 + rand() * bw, y, 2, 2)
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

export function HourglassColonies() {
  useLang()
  const group = useRef<THREE.Group>(null!)
  const label = useRef<HTMLSpanElement>(null)
  useHideBehindSun(label, group)
  const moved = useSite(group, {
    id: HOURGLASS_ID,
    radius: RING + RIM,
    zoom: { start: 7, full: 3 },
    notice: { distance: 6, text: HOURGLASS_TEXT.found },
  })

  // 輪の上の位置（少しずつずらして、きっちりしすぎない並びに）と、回転の始まりの角度
  const layout = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, i) => {
        const a = (i / COUNT) * Math.PI * 2 + Math.sin(i * 2.7) * 0.12
        const r = RING * (1 + Math.sin(i * 1.9) * 0.08)
        return { pos: new THREE.Vector3(Math.cos(a) * r, Math.sin(i * 3.1) * 0.15, Math.sin(a) * r), phase: i * 0.7, tilt: Math.sin(i * 1.3) * 0.05 }
      }),
    [],
  )

  const parts = useMemo(() => {
    const shell = new THREE.LatheGeometry(profile(), 96)
    const inner = stripTexture(true)
    const outer = stripTexture(false)
    const make = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
      const mesh = new THREE.InstancedMesh(geometry, material, COUNT)
      mesh.frustumCulled = false
      return mesh
    }
    // 外板（外から見える面）と、内側の大地（中から見える面）。窓の帯は alphaTest で抜く
    const hullMat = new THREE.MeshStandardMaterial({ map: outer, alphaTest: 0.5, metalness: 0.4, roughness: 0.55, side: THREE.FrontSide, emissive: '#ffffff', emissiveMap: outer, emissiveIntensity: 0.07 })
    const landMat = new THREE.MeshStandardMaterial({ map: inner, alphaTest: 0.5, roughness: 0.9, side: THREE.BackSide, emissive: '#ffffff', emissiveMap: inner, emissiveIntensity: 0.08 })
    // 窓の帯のガラス：うっすら青く
    const glassMat = new THREE.MeshBasicMaterial({ color: '#8fc4ff', transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide })
    // 縁の輪・くびれの宇宙港・真ん中の柱
    const rim = new THREE.TorusGeometry(RIM * 0.92, 0.006, 8, 96)
    rim.rotateX(Math.PI / 2)
    const port = new THREE.CylinderGeometry(WAIST * 1.9, WAIST * 1.9, 0.035, 32)
    const shaft = new THREE.CylinderGeometry(0.004, 0.004, HEIGHT * 0.98, 8)
    const metal = new THREE.MeshStandardMaterial({ color: '#c9ccd2', metalness: 0.6, roughness: 0.4 })
    // 縁から差し出す鏡の板（窓の帯へ光を入れる）
    const mirror = new THREE.BoxGeometry(0.05, 0.002, 0.11)
    const mirrorMat = new THREE.MeshStandardMaterial({ color: '#e9eef5', metalness: 0.95, roughness: 0.1 })
    // 宇宙港の灯
    const beacon = new THREE.SphereGeometry(0.004, 8, 8)
    const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 0.6), toneMapped: false })
    return {
      textures: [inner, outer],
      hull: make(shell, hullMat),
      land: make(shell, landMat),
      glass: make(shell, glassMat),
      rimTop: make(rim, metal),
      rimBottom: make(rim, metal),
      port: make(port, metal),
      shaft: make(shaft, metal),
      mirrors: Array.from({ length: 3 }, () => [make(mirror, mirrorMat), make(mirror, mirrorMat)]).flat(),
      beacon: make(beacon, beaconMat),
    }
  }, [])

  useEffect(
    () => () => {
      parts.textures.forEach((t) => t.dispose())
      const all = [parts.hull, parts.land, parts.glass, parts.rimTop, parts.rimBottom, parts.port, parts.shaft, parts.beacon, ...parts.mirrors]
      all.forEach((mesh) => {
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
        mesh.dispose()
      })
    },
    [parts],
  )

  const spinQ = new THREE.Quaternion()
  const tiltQ = new THREE.Quaternion()
  const local = new THREE.Matrix4()
  const offset = new THREE.Matrix4()
  const X = new THREE.Vector3(1, 0, 0)

  useFrame(() => {
    const e = bodies.get('earth')
    if (!e) return
    e.object.getWorldPosition(earth)
    const g = group.current
    g.position.copy(earth).applyAxisAngle(Y, BEHIND)
    g.position.y += 0.6
    moved()

    // 本物と同じ速さで回す（約3分で1回転）
    const t = performance.now() / 1000
    layout.forEach((c, i) => {
      tiltQ.setFromAxisAngle(X, c.tilt)
      spinQ.setFromAxisAngle(Y, c.phase + t * SPIN)
      q.copy(tiltQ).multiply(spinQ)
      m.compose(c.pos, q, one)
      parts.hull.setMatrixAt(i, m)
      parts.land.setMatrixAt(i, m)
      parts.glass.setMatrixAt(i, m)
      parts.port.setMatrixAt(i, m)
      parts.shaft.setMatrixAt(i, m)
      parts.beacon.setMatrixAt(i, m)
      parts.rimTop.setMatrixAt(i, local.makeTranslation(0, HEIGHT / 2 - 0.004, 0).premultiply(m))
      parts.rimBottom.setMatrixAt(i, local.makeTranslation(0, -HEIGHT / 2 + 0.004, 0).premultiply(m))
      // 鏡：上下の縁から、窓の帯（帯 1・3・5）の外へ斜めに差し出す
      parts.mirrors.forEach((mesh, k) => {
        const band = Math.floor(k / 2)
        const top = k % 2 === 0
        const a = ((band * 2 + 1.5) / 6) * Math.PI * 2
        local.makeRotationY(-a)
        local.multiply(offset.makeTranslation(RIM * 1.15, (top ? 1 : -1) * (HEIGHT / 2 - 0.02), 0))
        local.multiply(offset.makeRotationZ(top ? -0.6 : 0.6))
        mesh.setMatrixAt(i, local.premultiply(m))
      })
    })
    const all = [parts.hull, parts.land, parts.glass, parts.rimTop, parts.rimBottom, parts.port, parts.shaft, parts.beacon, ...parts.mirrors]
    all.forEach((mesh) => (mesh.instanceMatrix.needsUpdate = true))
  })

  return (
    <group ref={group}>
      <primitive object={parts.land} />
      <primitive object={parts.hull} />
      <primitive object={parts.rimTop} />
      <primitive object={parts.rimBottom} />
      <primitive object={parts.port} />
      <primitive object={parts.shaft} />
      <primitive object={parts.beacon} />
      {parts.mirrors.map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
      <primitive object={parts.glass} renderOrder={2} />
      <Html position={[0, HEIGHT * 0.9, 0]} center className="label" zIndexRange={LABEL_Z}>
        <span ref={label} onClick={() => useStore.getState().setTarget(HOURGLASS_ID)}>
          {hourglassName()}
        </span>
      </Html>
    </group>
  )
}
