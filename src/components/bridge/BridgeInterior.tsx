import { useEffect, useMemo } from 'react'
import { createPortal, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ROOM } from '../../data/bridge'
import { bridgeEye } from '../../state/bridge'

/**
 * 艦橋の中の部屋。船は 1 単位が約 2 km の縮尺なので、16 m の部屋はそのままでは近すぎて描けない。
 * そこで宇宙をいつも通り描いたあと、奥行きだけ消して、m 単位の別のシーンとして部屋を重ねて描く。
 * 窓と天窓は部屋に穴が開いているだけなので、その向こうに先に描いた宇宙が見える。
 */
export function BridgeInterior() {
  const scene = useMemo(() => new THREE.Scene(), [])
  const camera = useMemo(() => new THREE.PerspectiveCamera(60, 1, 0.05, 60), [])

  useFrame(({ gl, camera: main }) => {
    const cam = main as THREE.PerspectiveCamera
    camera.fov = cam.fov
    camera.aspect = cam.aspect
    camera.updateProjectionMatrix()
    camera.position.copy(bridgeEye.pos)
    camera.quaternion.copy(bridgeEye.quaternion)
    const autoClear = gl.autoClear
    gl.autoClear = false
    gl.clearDepth()
    gl.render(scene, camera)
    gl.autoClear = autoClear
    // 後処理（ブルーム）のあとに描くので、優先度を上げる
  }, 2)

  return createPortal(<Room />, scene)
}

const SEGMENTS = 96
const FRONT = -Math.PI / 2
/** 楕円の壁の上の点（θ=-π/2 が正面、π/2 が後ろ） */
const onWall = (theta: number, inset = 0, out = new THREE.Vector3()) =>
  out.set((ROOM.rx - inset) * Math.cos(theta), 0, (ROOM.rz - inset) * Math.sin(theta))
const inWindow = (theta: number) => Math.abs(theta - FRONT) < ROOM.windowHalf

/** 壁の帯（θ の範囲 × 高さの範囲）。窓の部分は飛ばせる */
function wallBand(from: number, to: number, y0: number, y1: number, skip?: (theta: number) => boolean, inset = 0) {
  const pos: number[] = []
  const uv: number[] = []
  const steps = Math.max(2, Math.round((SEGMENTS * (to - from)) / (Math.PI * 2)))
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  for (let i = 0; i < steps; i++) {
    const t0 = from + ((to - from) * i) / steps
    const t1 = from + ((to - from) * (i + 1)) / steps
    if (skip && skip((t0 + t1) / 2)) continue
    onWall(t0, inset, a)
    onWall(t1, inset, b)
    pos.push(a.x, y0, a.z, b.x, y0, b.z, b.x, y1, b.z, a.x, y0, a.z, b.x, y1, b.z, a.x, y1, a.z)
    const u0 = i / steps
    const u1 = (i + 1) / steps
    uv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

function ellipseShape(inset = 0) {
  const s = new THREE.Shape()
  s.absellipse(0, 0, ROOM.rx - inset, ROOM.rz - inset, 0, Math.PI * 2, false, 0)
  return s
}

/** 後ろ半分の一段高い床（外は楕円の壁、内側は手すりの円弧） */
function deckGeometry() {
  const s = new THREE.Shape()
  const a0 = -0.12
  const a1 = Math.PI - a0
  const n = 48
  // 形は XY 平面で作って床に倒す（y が -z になる）
  for (let i = 0; i <= n; i++) {
    const th = a0 + ((a1 - a0) * i) / n
    const x = ROOM.rx * Math.cos(th)
    const z = ROOM.rz * Math.sin(th)
    if (i === 0) s.moveTo(x, -z)
    else s.lineTo(x, -z)
  }
  for (let i = n; i >= 0; i--) {
    const th = a0 + ((a1 - a0) * i) / n
    s.lineTo(ROOM.railR * Math.cos(th), -ROOM.railR * Math.sin(th))
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: ROOM.deck, bevelEnabled: false, curveSegments: 4 })
  g.rotateX(-Math.PI / 2)
  return g
}

/** 円弧に沿った管（手すり、窓枠） */
function arcTube(points: THREE.Vector3[], radius: number) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), points.length * 2, radius, 8, false)
}

const railPoints = (from: number, to: number, r: number, y: number) =>
  Array.from({ length: 33 }, (_, i) => {
    const th = from + ((to - from) * i) / 32
    return new THREE.Vector3(r * Math.cos(th), y, r * Math.sin(th))
  })

const wallPoints = (from: number, to: number, y: number, inset: number) =>
  Array.from({ length: 33 }, (_, i) => onWall(from + ((to - from) * i) / 32, inset).setY(y))

/**
 * コンソールの画面の絵（オリジナルの見た目：黒いガラスに、細い線と数字。水色と琥珀色）。
 * B3 で本物の飛行データを描く画面に置き換える
 */
function panelTexture(seed: number, wide = false) {
  const c = document.createElement('canvas')
  c.width = wide ? 512 : 256
  c.height = 128
  const g = c.getContext('2d')!
  let r = seed * 9301 + 49297
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280)
  g.fillStyle = '#04070b'
  g.fillRect(0, 0, c.width, c.height)
  g.strokeStyle = 'rgba(95, 211, 230, 0.35)'
  g.lineWidth = 1
  g.strokeRect(4.5, 4.5, c.width - 9, c.height - 9)
  const cols = wide ? 6 : 3
  const w = (c.width - 16) / cols
  for (let i = 0; i < cols; i++) {
    const x = 8 + i * w
    const kind = Math.floor(rnd() * 3)
    g.strokeStyle = 'rgba(95, 211, 230, 0.25)'
    g.strokeRect(x + 2.5, 12.5, w - 6, 104)
    if (kind === 0) {
      // 横棒の目盛り
      for (let k = 0; k < 7; k++) {
        g.fillStyle = rnd() < 0.25 ? '#f2b45a' : '#5fd3e6'
        g.fillRect(x + 8, 20 + k * 13, (w - 20) * (0.2 + rnd() * 0.8), 5)
      }
    } else if (kind === 1) {
      // 波形
      g.strokeStyle = '#5fd3e6'
      g.beginPath()
      for (let k = 0; k <= 40; k++) {
        const px = x + 6 + ((w - 14) * k) / 40
        const py = 64 + Math.sin(k * 0.5 + seed) * 18 * rnd()
        if (k === 0) g.moveTo(px, py)
        else g.lineTo(px, py)
      }
      g.stroke()
      g.fillStyle = '#f2b45a'
      g.font = '12px monospace'
      g.fillText((rnd() * 1000).toFixed(1), x + 8, 104)
    } else {
      // 数字の列
      g.font = '11px monospace'
      for (let k = 0; k < 7; k++) {
        g.fillStyle = k === 2 ? '#f2b45a' : 'rgba(170, 230, 240, 0.8)'
        g.fillText(`${(rnd() * 100).toFixed(0).padStart(2, '0')}.${(rnd() * 1000).toFixed(0).padStart(3, '0')}`, x + 8, 26 + k * 13)
      }
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** 入口の銘板 */
function plaqueTexture() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 512, 256)
  grad.addColorStop(0, '#b89a62')
  grad.addColorStop(0.5, '#e0c88e')
  grad.addColorStop(1, '#a78a55')
  g.fillStyle = grad
  g.fillRect(0, 0, 512, 256)
  g.strokeStyle = '#5a4527'
  g.lineWidth = 4
  g.strokeRect(10, 10, 492, 236)
  g.fillStyle = '#3d2e18'
  g.textAlign = 'center'
  g.font = 'bold 44px serif'
  g.fillText('SV-01', 256, 70)
  g.font = 'bold 34px serif'
  g.fillText('SOLAR VOYAGER', 256, 118)
  g.font = '22px serif'
  g.fillText('SURVEY VESSEL', 256, 158)
  g.font = 'italic 18px serif'
  g.fillText('“To see the worlds of the Sun for ourselves”', 256, 206)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function Room() {
  const parts = useMemo(() => {
    const beige = new THREE.MeshStandardMaterial({ color: '#cdbb9f', roughness: 0.8, side: THREE.DoubleSide })
    const beigeDark = new THREE.MeshStandardMaterial({ color: '#9d8b73', roughness: 0.8, side: THREE.DoubleSide })
    const carpet = new THREE.MeshStandardMaterial({ color: '#2c323c', roughness: 1 })
    const wood = new THREE.MeshStandardMaterial({ color: '#7b4a2b', roughness: 0.45, metalness: 0.05 })
    const frame = new THREE.MeshStandardMaterial({ color: '#3b3f46', roughness: 0.5, metalness: 0.4 })
    const leather = new THREE.MeshStandardMaterial({ color: '#6e4b3a', roughness: 0.6 })
    const consoleMat = new THREE.MeshStandardMaterial({ color: '#8f8270', roughness: 0.6 })
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 0.8, 0.58), toneMapped: false, side: THREE.DoubleSide })
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#a9c4dc',
      transparent: true,
      opacity: 0.07,
      roughness: 0.05,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const screens = Array.from({ length: 12 }, (_, i) => new THREE.MeshBasicMaterial({ map: panelTexture(i + 1, i >= 8), toneMapped: false }))
    const plaque = new THREE.MeshStandardMaterial({ map: plaqueTexture(), roughness: 0.35, metalness: 0.6 })
    const door = new THREE.MeshStandardMaterial({ color: '#5d5a55', roughness: 0.5, metalness: 0.3 })

    // 天井：楕円に天窓の穴
    const ceilingShape = ellipseShape()
    const hole = new THREE.Path()
    hole.absarc(0, 0, ROOM.skylight, 0, Math.PI * 2, true)
    ceilingShape.holes.push(hole)
    const ceiling = new THREE.ShapeGeometry(ceilingShape, 48)
    ceiling.rotateX(Math.PI / 2)
    const floor = new THREE.ShapeGeometry(ellipseShape(), 48)
    floor.rotateX(-Math.PI / 2)

    const railFrom = 0.42
    const railTo = Math.PI - railFrom
    return {
      beige, beigeDark, carpet, wood, frame, leather, consoleMat, glow, glass, screens, plaque, door,
      ceiling,
      floor,
      deck: deckGeometry(),
      wall: wallBand(-Math.PI, Math.PI, 0, ROOM.height, inWindow),
      // 壁の上のほうの、少し暗い帯と、間接照明の線
      wallUpper: wallBand(-Math.PI, Math.PI, 2.95, 3.0, inWindow, 0.02),
      baseLight: wallBand(-Math.PI, Math.PI, 0.06, 0.1, undefined, 0.03),
      coveLight: arcTube(wallPoints(-Math.PI, Math.PI, ROOM.height - 0.05, 0.35), 0.03),
      glassPane: wallBand(FRONT - ROOM.windowHalf, FRONT + ROOM.windowHalf, ROOM.windowBottom, ROOM.windowTop, undefined, 0.01),
      sill: arcTube(wallPoints(FRONT - ROOM.windowHalf, FRONT + ROOM.windowHalf, ROOM.windowBottom, 0.05), 0.07),
      header: arcTube(wallPoints(FRONT - ROOM.windowHalf, FRONT + ROOM.windowHalf, ROOM.windowTop, 0.05), 0.09),
      // 手すりの下の仕切りと、木の手すり
      partition: (() => {
        const pts = railPoints(railFrom, railTo, ROOM.railR, 0)
        const g = new THREE.BufferGeometry()
        const pos: number[] = []
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i]
          const b = pts[i + 1]
          const h = ROOM.deck + 0.95
          pos.push(a.x, 0, a.z, b.x, 0, b.z, b.x, h, b.z, a.x, 0, a.z, b.x, h, b.z, a.x, h, a.z)
        }
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
        g.computeVertexNormals()
        return g
      })(),
      rail: arcTube(railPoints(railFrom, railTo, ROOM.railR, ROOM.deck + 1.0), 0.075),
      railFrom,
      railTo,
    }
  }, [])

  useEffect(
    () => () => {
      Object.values(parts).forEach((p) => {
        if (Array.isArray(p)) p.forEach((m) => m.map?.dispose() ?? m.dispose())
        else if (p instanceof THREE.BufferGeometry || p instanceof THREE.Material) p.dispose()
      })
    },
    [parts],
  )

  // 窓の縦の桟
  const mullions = useMemo(() => {
    const n = 5
    return Array.from({ length: n }, (_, i) => {
      const th = FRONT - ROOM.windowHalf + ((i + 1) * 2 * ROOM.windowHalf) / (n + 1)
      const p = onWall(th, 0.05)
      return { p, rot: -th - Math.PI / 2 }
    })
  }, [])

  // 後ろの壁に並ぶステーションの画面（θ、画面の番号）
  const aftPanels = [0.95, 1.25, 1.57, 1.89, 2.19].map((th, i) => ({ th, screen: 8 + (i % 4) }))
  const sidePanels = [-0.55, -0.3, Math.PI + 0.3, Math.PI + 0.55].map((th, i) => ({ th, screen: 4 + i }))
  const doors = [0.55, Math.PI - 0.55]

  return (
    <>
      <hemisphereLight args={['#fff1dd', '#3a3530', 1.1]} />
      <ambientLight intensity={0.25} />
      <pointLight position={[0, 3.6, 0]} intensity={18} distance={14} color="#ffe6c4" />
      <pointLight position={[0, 3.6, 4]} intensity={12} distance={10} color="#ffe6c4" />
      <pointLight position={[0, 2.5, -4.5]} intensity={6} distance={8} color="#d8e6ff" />

      <mesh geometry={parts.floor} material={parts.carpet} />
      <mesh geometry={parts.deck} material={parts.carpet} />
      <mesh geometry={parts.wall} material={parts.beige} />
      <mesh geometry={parts.wallUpper} material={parts.beigeDark} />
      <mesh geometry={parts.baseLight} material={parts.glow} />
      <mesh geometry={parts.ceiling} position={[0, ROOM.height, 0]} material={parts.beige} />
      <mesh geometry={parts.coveLight} material={parts.glow} />

      {/* 正面の窓：ガラス、窓枠、縦の桟 */}
      <mesh geometry={parts.glassPane} material={parts.glass} />
      <mesh geometry={parts.sill} material={parts.frame} />
      <mesh geometry={parts.header} material={parts.frame} />
      {mullions.map(({ p, rot }, i) => (
        <mesh key={i} position={[p.x, (ROOM.windowBottom + ROOM.windowTop) / 2, p.z]} rotation={[0, rot, 0]} material={parts.frame}>
          <boxGeometry args={[0.08, ROOM.windowTop - ROOM.windowBottom, 0.12]} />
        </mesh>
      ))}

      {/* 天窓：ガラス、十字の桟、まわりの光の輪 */}
      <mesh position={[0, ROOM.height + 0.3, 0]} rotation={[Math.PI / 2, 0, 0]} material={parts.glass}>
        <circleGeometry args={[ROOM.skylight, 48]} />
      </mesh>
      <mesh position={[0, ROOM.height + 0.15, 0]} material={parts.beigeDark}>
        <cylinderGeometry args={[ROOM.skylight, ROOM.skylight, 0.3, 48, 1, true]} />
      </mesh>
      {[0, Math.PI / 2].map((r) => (
        <mesh key={r} position={[0, ROOM.height + 0.28, 0]} rotation={[0, r, 0]} material={parts.frame}>
          <boxGeometry args={[ROOM.skylight * 2, 0.06, 0.08]} />
        </mesh>
      ))}
      <mesh position={[0, ROOM.height - 0.02, 0]} rotation={[Math.PI / 2, 0, 0]} material={parts.glow}>
        <ringGeometry args={[ROOM.skylight + 0.05, ROOM.skylight + 0.15, 64]} />
      </mesh>

      {/* 後ろの一段高い床と、手すり */}
      <mesh geometry={parts.partition} material={parts.beigeDark} />
      <mesh geometry={parts.rail} material={parts.wood} />
      {/* 防御・センサー席（手すりの後ろ、真ん中） */}
      <group position={[0, ROOM.deck, ROOM.railR + 0.45]}>
        <mesh position={[0, 0.5, 0]} material={parts.consoleMat}>
          <boxGeometry args={[2.4, 1.0, 0.6]} />
        </mesh>
        <mesh position={[0, 1.02, -0.05]} rotation={[-0.35, 0, 0]} material={parts.screens[11]}>
          <planeGeometry args={[2.2, 0.45]} />
        </mesh>
      </group>

      {/* 艦長席と、左右の席 */}
      <Chair position={[0, 0, 0.62]} big material={parts.leather} trim={parts.consoleMat} />
      <Chair position={[-1.5, 0, 0.75]} rotY={-0.2} material={parts.leather} trim={parts.consoleMat} />
      <Chair position={[1.5, 0, 0.75]} rotY={0.2} material={parts.leather} trim={parts.consoleMat} />

      {/* 前の 2 席：操舵（左）と運用（右） */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 1.0, 0, -2.6]}>
          <mesh position={[0, 0.38, 0]} material={parts.consoleMat}>
            <boxGeometry args={[0.35, 0.76, 0.35]} />
          </mesh>
          <mesh position={[0, 0.8, 0]} rotation={[-0.3, 0, 0]} material={parts.consoleMat}>
            <boxGeometry args={[1.2, 0.06, 0.65]} />
          </mesh>
          <mesh position={[0, 0.835, 0]} rotation={[-0.3 - Math.PI / 2, 0, 0]} material={parts.screens[side < 0 ? 0 : 1]}>
            <planeGeometry args={[1.1, 0.55]} />
          </mesh>
          <Chair position={[0, 0, 0.85]} low material={parts.leather} trim={parts.consoleMat} />
        </group>
      ))}

      {/* 後ろと横の壁のステーション */}
      {[...aftPanels, ...sidePanels].map(({ th, screen }, i) => {
        const p = onWall(th, 0.08)
        const floorY = th > -0.12 && th < Math.PI + 0.12 ? ROOM.deck : 0
        return (
          <group key={i} position={[p.x, floorY, p.z]} rotation={[0, -th - Math.PI / 2, 0]}>
            <mesh position={[0, 1.55, 0]} material={parts.screens[screen]}>
              <planeGeometry args={[1.25, 0.65]} />
            </mesh>
            <mesh position={[0, 0.85, 0.2]} material={parts.consoleMat}>
              <boxGeometry args={[1.3, 0.08, 0.45]} />
            </mesh>
          </group>
        )
      })}

      {/* 左右の扉（昇降機）と、入口の銘板 */}
      {doors.map((th, i) => {
        const p = onWall(th, 0.04)
        return (
          <group key={th} position={[p.x, ROOM.deck, p.z]} rotation={[0, -th - Math.PI / 2, 0]}>
            <mesh position={[0, 1.2, 0]} material={parts.door}>
              <planeGeometry args={[1.4, 2.4]} />
            </mesh>
            <mesh position={[0, 1.2, -0.005]} material={parts.glow}>
              <planeGeometry args={[1.52, 2.52]} />
            </mesh>
            {i === 1 && (
              <mesh position={[1.25, 1.55, 0.01]} material={parts.plaque}>
                <planeGeometry args={[0.6, 0.3]} />
              </mesh>
            )}
          </group>
        )
      })}
    </>
  )
}

function Chair({
  position,
  rotY = 0,
  big = false,
  low = false,
  material,
  trim,
}: {
  position: [number, number, number]
  rotY?: number
  big?: boolean
  low?: boolean
  material: THREE.Material
  trim: THREE.Material
}) {
  const w = big ? 0.72 : 0.6
  const seatY = low ? 0.42 : 0.48
  const backH = low ? 0.55 : big ? 0.95 : 0.8
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, seatY / 2 - 0.05, 0]} material={trim}>
        <cylinderGeometry args={[0.16, 0.26, seatY - 0.1, 16]} />
      </mesh>
      <mesh position={[0, seatY, 0]} material={material}>
        <boxGeometry args={[w, 0.14, 0.6]} />
      </mesh>
      <mesh position={[0, seatY + backH / 2, 0.28]} rotation={[0.1, 0, 0]} material={material}>
        <boxGeometry args={[w, backH, 0.12]} />
      </mesh>
      {!low &&
        [-1, 1].map((s) => (
          <mesh key={s} position={[(s * (w + 0.1)) / 2, seatY + 0.2, 0.02]} material={trim}>
            <boxGeometry args={[0.1, 0.08, 0.56]} />
          </mesh>
        ))}
    </group>
  )
}
