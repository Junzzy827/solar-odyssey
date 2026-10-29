import { Suspense, useEffect, useMemo } from 'react'
import { createPortal, useFrame, useLoader } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { ROOM } from '../../data/bridge'
import { bridgeEye, useBridge, viewscreenInfo } from '../../state/bridge'
import { useStore } from '../../state/store'
import { bodies } from '../../state/registry'
import { isTouchDevice } from '../../state/input'

/**
 * 艦橋の中の部屋。船は 1 単位が約 2 km の縮尺なので、16 m の部屋はそのままでは近すぎて描けない。
 * そこで宇宙をいつも通り描いたあと、奥行きだけ消して、m 単位の別のシーンとして部屋を重ねて描く。
 * 窓と天窓は部屋に穴が開いているだけなので、その向こうに先に描いた宇宙が見える。
 */
export function BridgeInterior() {
  const scene = useMemo(() => new THREE.Scene(), [])
  const camera = useMemo(() => new THREE.PerspectiveCamera(60, 1, 0.05, 60), [])
  const viewscreen = useBridge((b) => b.viewscreen)
  const zoom = useMemo(() => new ZoomView(), [])
  useEffect(() => () => zoom.dispose(), [zoom])

  useFrame(({ gl, camera: main, scene: space }, dt) => {
    const cam = main as THREE.PerspectiveCamera
    // 拡大画面：窓の位置から目標（なければ正面）へ望遠のカメラを向けて、宇宙をもう一度描いておく
    if (useBridge.getState().viewscreen) zoom.render(gl, space, cam, dt)
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

  return createPortal(
    <Suspense fallback={null}>
      <Room viewscreen={viewscreen ? zoom.target.texture : null} />
    </Suspense>,
    scene,
  )
}

/** 拡大画面の幅と高さの比（正面の窓の弧の長さ ÷ 高さ） */
const SCREEN_ASPECT = (2 * ROOM.windowHalf * ((ROOM.rx + ROOM.rz) / 2) * 0.93) / (ROOM.windowTop - ROOM.windowBottom)
const WIDEST = 40 // 拡大画面のいちばん広い画角（度）
const NARROWEST = 0.05

/** 拡大画面のための望遠カメラと、描いた絵を受けとる板 */
class ZoomView {
  target: THREE.WebGLRenderTarget
  camera = new THREE.PerspectiveCamera(20, SCREEN_ASPECT, 0.0004, 200_000)
  private fov = WIDEST
  private p = new THREE.Vector3()
  private up = new THREE.Vector3()
  private fwd = new THREE.Vector3()

  constructor() {
    // スマホでは絵を小さめにして軽くする
    const w = isTouchDevice() ? 1024 : 1800
    this.target = new THREE.WebGLRenderTarget(w, Math.round(w / SCREEN_ASPECT), { colorSpace: THREE.SRGBColorSpace, samples: isTouchDevice() ? 0 : 4 })
  }

  render(gl: THREE.WebGLRenderer, space: THREE.Scene, eye: THREE.PerspectiveCamera, dt: number) {
    const st = useStore.getState()
    const target = st.targetId ? bodies.get(st.targetId) : undefined
    const cam = this.camera
    cam.position.copy(eye.position)
    this.up.set(0, 1, 0).applyQuaternion(eye.quaternion)
    cam.up.copy(this.up)
    let want: number
    if (target) {
      target.object.getWorldPosition(this.p)
      cam.lookAt(this.p)
      // 天体が画面の高さの 6 割ほどに映る画角
      const d = Math.max(this.p.distanceTo(cam.position), target.radius * 1.01)
      want = THREE.MathUtils.radToDeg(2 * Math.atan(target.radius / d)) / 0.6
    } else {
      // 目標がなければ、船の正面を 4 倍に
      this.fwd.set(0, 0, -1).applyQuaternion(eye.quaternion)
      cam.lookAt(this.p.copy(cam.position).add(this.fwd))
      want = 62 / 4
    }
    want = THREE.MathUtils.clamp(want, NARROWEST, WIDEST)
    this.fov += (want - this.fov) * (1 - Math.exp(-4 * Math.min(dt, 0.1)))
    cam.fov = this.fov
    // 惑星のそばで船が縮むときは、手前の限界も目のカメラに合わせる
    cam.near = eye.near
    cam.updateProjectionMatrix()
    viewscreenInfo.zoom = eye.fov / this.fov
    // 大画面は船の外のセンサーの映像という見立てなので、自分の船体は映さない
    const own = space.getObjectByName('ownship')
    if (own) own.visible = false
    const prev = gl.getRenderTarget()
    gl.setRenderTarget(this.target)
    gl.clear()
    gl.render(space, cam)
    gl.setRenderTarget(prev)
    if (own) own.visible = true
  }

  dispose() {
    this.target.dispose()
  }
}

const SEGMENTS = 96
const FRONT = -Math.PI / 2
/** 楕円の壁の上の点（θ=-π/2 が正面、π/2 が後ろ） */
const onWall = (theta: number, inset = 0, out = new THREE.Vector3()) =>
  out.set((ROOM.rx - inset) * Math.cos(theta), 0, (ROOM.rz - inset) * Math.sin(theta))

/** 壁ぞいの帯（θ の範囲 × 高さの範囲）。窓のガラスに使う */
function wallBand(from: number, to: number, y0: number, y1: number, inset = 0) {
  const pos: number[] = []
  const uv: number[] = []
  const steps = Math.max(2, Math.round((SEGMENTS * (to - from)) / (Math.PI * 2)))
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  for (let i = 0; i < steps; i++) {
    const t0 = from + ((to - from) * i) / steps
    const t1 = from + ((to - from) * (i + 1)) / steps
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

const MODEL_URL = `${import.meta.env.BASE_URL}models/bridge.glb`
const LIGHT_URL = `${import.meta.env.BASE_URL}models/bridge-light.jpg`

/** 画面の種類ごとに、どの絵を貼るか（横長の画面には横長の絵） */
const WIDE_SCREENS = ['screen_front', 'screen_tactical', 'screen_station']

/**
 * Blender で作った部屋（tools/blender/build_bridge.py）。照明は 1 枚の絵に焼き込んであるので、
 * 光の計算をせずに絵を貼るだけで描ける。画面と銘板には、ここで描いた絵を貼る
 */
function Room({ viewscreen }: { viewscreen: THREE.Texture | null }) {
  const gltf = useGLTF(MODEL_URL)
  const light = useLoader(THREE.TextureLoader, LIGHT_URL)

  const parts = useMemo(() => {
    light.flipY = false
    light.colorSpace = THREE.SRGBColorSpace
    light.anisotropy = 4
    const room = new THREE.MeshBasicMaterial({ map: light, toneMapped: false, side: THREE.DoubleSide })
    const plaque = new THREE.MeshBasicMaterial({ map: plaqueTexture(), toneMapped: false, color: new THREE.Color(0.85, 0.8, 0.72) })
    const screens: THREE.MeshBasicMaterial[] = []
    const scene = gltf.scene.clone(true)
    let n = 0
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      if (o.name.startsWith('screen')) {
        const wide = WIDE_SCREENS.some((w) => o.name.startsWith(w))
        const m = new THREE.MeshBasicMaterial({ map: panelTexture(++n, wide), toneMapped: false, side: THREE.DoubleSide })
        screens.push(m)
        o.material = m
      } else if (o.name.startsWith('plaque')) o.material = plaque
      else o.material = room
    })
    const screen = new THREE.MeshBasicMaterial()
    const glass = new THREE.MeshPhysicalMaterial({ color: '#a9c4dc', transparent: true, opacity: 0.06, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide })
    return {
      scene,
      materials: [room, plaque, glass, screen, ...screens],
      screen,
      glass,
      glassPane: wallBand(FRONT - ROOM.windowHalf, FRONT + ROOM.windowHalf, ROOM.windowBottom, ROOM.windowTop, 0.01),
    }
  }, [gltf, light])

  useEffect(
    () => () => {
      parts.materials.forEach((m) => {
        if (m !== parts.materials[0]) (m as THREE.MeshBasicMaterial).map?.dispose()
        m.dispose()
      })
      parts.glassPane.dispose()
    },
    [parts],
  )

  return (
    <>
      <primitive object={parts.scene} />
      {/* 正面の窓と天窓のガラス（ほんのり色が付くだけ。枠はなし）。拡大画面にすると、窓ガラスに望遠の絵を映す */}
      {viewscreen ? <ViewscreenPane geometry={parts.glassPane} material={parts.screen} texture={viewscreen} /> : <mesh geometry={parts.glassPane} material={parts.glass} />}
      <mesh position={[0, ROOM.height + 0.3, 0]} rotation={[Math.PI / 2, 0, 0]} material={parts.glass}>
        <circleGeometry args={[ROOM.skylight, 48]} />
      </mesh>
    </>
  )
}

function ViewscreenPane({ geometry, material, texture }: { geometry: THREE.BufferGeometry; material: THREE.MeshBasicMaterial; texture: THREE.Texture }) {
  useEffect(() => {
    material.map = texture
    material.needsUpdate = true
  }, [material, texture])
  return <mesh geometry={geometry} material={material} />
}
