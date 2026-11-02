import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { lowMemory } from '../../state/quality'
import { MAP_KEYS, shrinkTexture } from '../surface/shrinkTexture'
import { radiatorFins } from '../../state/evaJobs'
import { ARC_W, SITE_SHAPES, dockSiteMatrix, evaSite, hullPoint, hullRoll, type Poly } from './hull'
import { hullTextures } from './hullTex'

// 船外の場面の、外壁のほかの作業場所。
// - アルカディアの発進路：2 本の舳先のあいだの溝。床・レール・左右の壁は細かい面を描き、その先は船の模型（焼いた glb）を実寸で置く
// - 天の湊のリングの下面：地球の側を向いた平らな面。足もとは細かい面、まわりはドックの模型を実寸で置く

const MODEL = (file: string) => `${import.meta.env.BASE_URL}models/${file}`
const TILE = 8

/** 模型の光る材質（宇宙の場面と同じ色） */
function liveMaterials() {
  return {
    Glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.95, 1.55), toneMapped: false }),
    Blue: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.22, 0.55, 1.4), toneMapped: false }),
    NavRed: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.06, 0.04), toneMapped: false }),
    NavGreen: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 1.4, 0.2), toneMapped: false }),
  } as Record<string, THREE.MeshBasicMaterial>
}

/** 遠くの背景にする、焼いた模型（実寸）。影は落とさない（影の届く範囲が狭いので、近くだけ影が出ると不自然） */
function Backdrop({ file, matrix }: { file: string; matrix: THREE.Matrix4 }) {
  const { scene } = useGLTF(MODEL(file))
  const built = useMemo(() => {
    const model = scene.clone(true)
    const live = liveMaterials()
    const owned: (THREE.Material | THREE.Texture)[] = [...Object.values(live)]
    const made = new Map<THREE.Material, THREE.Material>()
    model.traverse((o) => {
      if (/^Lite/.test(o.name)) o.visible = false
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = false
      mesh.receiveShadow = false
      const src = mesh.material as THREE.MeshStandardMaterial
      let m = made.get(src)
      if (!m) {
        if (src.name === 'Baked') {
          const b = src.clone()
          // 窓の明かり（焼いた発光）は宇宙の場面と同じ明るさ
          b.emissive.setRGB(1, 1, 1)
          b.emissiveIntensity = 1
          for (const key of MAP_KEYS) {
            const tex = b[key]
            if (!tex) continue
            tex.anisotropy = 8
            // スマホではテクスチャを縮める（宇宙の場面の分と二重に載るので）
            const small = lowMemory() ? shrinkTexture(tex, 1024) : null
            if (small) {
              b[key] = small
              owned.push(small)
            }
          }
          owned.push(b)
          m = b
        } else m = live[src.name] ?? live.Glow
        made.set(src, m)
      }
      mesh.material = m
    })
    model.matrixAutoUpdate = false
    return { model, live, owned }
  }, [scene])
  useEffect(() => {
    built.model.matrix.copy(matrix)
    built.model.matrixWorldNeedsUpdate = true
  }, [built, matrix])
  useEffect(() => () => built.owned.forEach((o) => o.dispose()), [built])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const beacon = 0.25 + 1.5 * Math.max(0, Math.sin(t * 1.9)) ** 6
    built.live.NavRed.color.setRGB(1.6 * beacon, 0.06 * beacon, 0.04 * beacon)
    const g = Math.sin(t * Math.PI) > 0 ? 1.4 : 0.5
    built.live.NavGreen.color.setRGB(0.05 * g, g, 0.15 * g)
  })
  return <primitive object={built.model} />
}

/** 横断面の折れ線を前後に伸ばした面（pick で選んだ区間だけ）。表は折れ線の左（外）側 */
function profileGeometry(poly: Poly, z0: number, z1: number, nz: number, shift: (x: number, z: number) => number, pick: (i: number) => boolean) {
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  let along = 0
  for (let i = 0; i < poly.length - 1; i++) {
    const [ax, ay] = poly[i]
    const [bx, by] = poly[i + 1]
    const L = Math.hypot(bx - ax, by - ay)
    if (pick(i)) {
      const nx = -(by - ay) / L
      const ny = (bx - ax) / L
      const base = pos.length / 3
      for (let j = 0; j <= nz; j++) {
        const z = z0 + ((z1 - z0) * j) / nz
        for (const [x, y, u] of [
          [ax, ay, along],
          [bx, by, along + L],
        ]) {
          pos.push(x + shift(x, z), y, z)
          nor.push(nx, ny, 0)
          uv.push(u / TILE, z / TILE)
        }
      }
      for (let j = 0; j < nz; j++) {
        const a0 = base + j * 2
        const b0 = a0 + 1
        const a1 = a0 + 2
        const b1 = a0 + 3
        idx.push(a0, a1, b0, b0, a1, b1)
      }
    }
    along += L
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/** 床や壁に描く文字 */
function textTexture(lines: { text: string; size: number; y: number }[], color: string, w = 1024, h = 256) {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const c = cv.getContext('2d')!
  c.fillStyle = color
  c.textBaseline = 'middle'
  for (const l of lines) {
    c.font = `bold ${l.size}px "Helvetica Neue", Arial, sans-serif`
    c.fillText(l.text, 24, l.y)
  }
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function useHullMaterial(base: string, rough = 0.6, metal = 0.25) {
  const tex = useMemo(() => hullTextures(base), [base])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: tex.map, bumpMap: tex.bump, bumpScale: 1.2, roughness: rough, metalness: metal }), [tex, rough, metal])
  useEffect(
    () => () => {
      tex.map.dispose()
      tex.bump.dispose()
      mat.dispose()
    },
    [tex, mat],
  )
  return mat
}

/** 依頼の「放熱板」を置く場所に立てる白い板（外壁の場面の放熱板と同じ形） */
export function RadiatorFins() {
  const fins = radiatorFins()
  return (
    <group>
      {fins.map((f, i) => (
        <group key={i} position={hullPoint(f.th, f.z, 1.6)} rotation={[0, 0, hullRoll(f.th)]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.08, 3.2, 7.5]} />
            <meshStandardMaterial color="#eceae4" roughness={0.35} metalness={0.15} />
          </mesh>
          {/* 支えの脚 */}
          {[-3, 0, 3].map((z) => (
            <mesh key={z} position={[0, -1.55, z]} castShadow>
              <boxGeometry args={[0.3, 0.12, 0.3]} />
              <meshStandardMaterial color="#8a9098" roughness={0.5} metalness={0.5} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

// ---- アルカディアの発進路 --------------------------------------------------------------

/** アルカディアの模型の 1 が何 m か（ships.ts の AS） */
const AS = 1.04 / 1252
/** エアロックを置いた所（Blender の m）：発進路のまんなか（y 150〜520 の 330 m）、床の上面 z = -14 */
const ARC_AT = { y: 330, z: -14 }

export function ArcadiaDeck() {
  const shape = SITE_SHAPES.arcadia
  const poly = shape.polys[0]
  const floorMat = useHullMaterial('#737a84', 0.65, 0.3)
  const wallMat = useHullMaterial('#d5d8dd', 0.5, 0.2)
  const railMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8d939b', roughness: 0.35, metalness: 0.75 }), [])
  const geos = useMemo(() => {
    const isFloor = (i: number) => poly[i][1] <= 1.01 && poly[i + 1][1] <= 1.01 && Math.abs(poly[i][0]) <= ARC_W + 0.01 && Math.abs(poly[i + 1][0]) <= ARC_W + 0.01
    const isRail = (i: number) => isFloor(i) && Math.min(Math.abs(poly[i][0]), Math.abs(poly[i + 1][0])) > 3.6 && Math.max(Math.abs(poly[i][0]), Math.abs(poly[i + 1][0])) < 5.4
    return {
      floor: profileGeometry(poly, -90, 90, 45, shape.shift, (i) => isFloor(i) && !isRail(i)),
      rail: profileGeometry(poly, -90, 90, 45, shape.shift, isRail),
      wall: profileGeometry(poly, -90, 90, 45, shape.shift, (i) => !isFloor(i)),
    }
  }, [poly, shape])
  const matrix = useMemo(() => new THREE.Matrix4().makeTranslation(0, -ARC_AT.z - 0.08, ARC_AT.y).multiply(new THREE.Matrix4().makeScale(1 / AS, 1 / AS, 1 / AS)), [])
  const deco = useMemo(
    () => ({
      deck: textTexture([{ text: 'MC-09', size: 200, y: 128 }], '#e8e2c8'),
      wall: textTexture(
        [
          { text: 'ARCADIA', size: 150, y: 100 },
          { text: 'LAUNCH DECK 1', size: 56, y: 210 },
        ],
        '#2d3a50',
      ),
    }),
    [],
  )
  // 左の壁（内へ傾いている）に貼る名前
  const wallDecal = useMemo(() => {
    const y = 9
    const z = -8
    const u = new THREE.Vector3(3.15, 26, 0).normalize()
    const n = new THREE.Vector3(26, -3.15, 0).normalize()
    const x = -(ARC_W - (3.15 * y) / 26) + shape.shift(-ARC_W, z)
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(u, n), u, n))
    return { position: new THREE.Vector3(x, y, z).addScaledVector(n, 0.04), quaternion: q }
  }, [shape])
  // 床の黄色い線（レールの外側）と、エアロックのまわりの縞
  const stripes = useMemo(() => {
    const out: { x: number; z: number; w: number; d: number; c: string }[] = []
    for (const s of [-1, 1]) out.push({ x: s * 6.2, z: 0, w: 0.14, d: 180, c: '#c9a43a' })
    for (let z = -88; z <= 88; z += 6) out.push({ x: 0, z, w: 0.12, d: 2.4, c: '#b8b2a0' })
    return out.filter((o) => !(o.x === 0 && Math.abs(o.z) < 3))
  }, [])
  useEffect(
    () => () => {
      Object.values(geos).forEach((g) => g.dispose())
      railMat.dispose()
      deco.deck.dispose()
      deco.wall.dispose()
    },
    [geos, railMat, deco],
  )
  return (
    <group>
      <Backdrop file="ship-arcadia.glb" matrix={matrix} />
      <mesh geometry={geos.floor} material={floorMat} receiveShadow />
      <mesh geometry={geos.rail} material={railMat} receiveShadow />
      <mesh geometry={geos.wall} material={wallMat} receiveShadow />
      {stripes.map((s, i) => (
        <mesh key={i} position={[s.x, 0.012, s.z]} receiveShadow>
          <boxGeometry args={[s.w, 0.01, s.d]} />
          <meshStandardMaterial color={s.c} roughness={0.7} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      ))}
      {/* 床の大きな文字（前から読める向き） */}
      <mesh position={[0, 0.015, -14]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[6.4, 1.6]} />
        <meshStandardMaterial map={deco.deck} transparent roughness={0.75} polygonOffset polygonOffsetFactor={-3} />
      </mesh>
      {/* 左の壁の名前 */}
      <mesh {...wallDecal}>
        <planeGeometry args={[16, 4]} />
        <meshStandardMaterial map={deco.wall} transparent roughness={0.6} polygonOffset polygonOffsetFactor={-3} />
      </mesh>
      {/* 壁の上の投光器（発進路を照らす） */}
      {[-30, 0, 30].flatMap((z) =>
        [-1, 1].map((sx) => (
          <group key={`${z}${sx}`} position={[sx * (ARC_W - 2.4) + shape.shift(sx * ARC_W, z), 20, z]}>
            <mesh>
              <boxGeometry args={[0.8, 0.4, 1.4]} />
              <meshBasicMaterial color={new THREE.Color(2.2, 2.1, 1.9)} toneMapped={false} />
            </mesh>
            {/* 光を出すのはまんなかの 2 つだけ（点光源が多いと、スマホで重い） */}
            {z === 0 && <pointLight intensity={40} distance={60} decay={1.3} color="#f2ecdf" position={[-sx * 1.5, -1, 0]} />}
          </group>
        )),
      )}
      <RadiatorFins />
    </group>
  )
}

// ---- 天の湊のリングの下面 --------------------------------------------------------------

const DOCK_GLB_M = 5000

/** 作業灯（下面に吊った四角い灯と、まわりを照らす光） */
function WorkLamp({ x, z, lit }: { x: number; z: number; lit: boolean }) {
  const p = hullPoint(x, z)
  return (
    <group position={p}>
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[0.9, 0.3, 0.5]} />
        <meshStandardMaterial color="#6b727c" roughness={0.5} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0.31, 0]}>
        <boxGeometry args={[0.75, 0.02, 0.36]} />
        <meshBasicMaterial color={new THREE.Color(2.4, 2.2, 1.9)} toneMapped={false} />
      </mesh>
      {lit && <pointLight position={[0, 1.2, 0]} intensity={18} distance={34} decay={1.5} color="#ffe9cc" />}
    </group>
  )
}

export function DockUnderside() {
  const shape = SITE_SHAPES.dock
  const poly = shape.polys[0]
  const mat = useHullMaterial('#a5abb3', 0.55, 0.3)
  const geos = useMemo(() => {
    const duct = (i: number) => poly[i][1] > 0.01 || poly[i + 1][1] > 0.01
    return { face: profileGeometry(poly, -160, 160, 80, shape.shift, (i) => !duct(i)), duct: profileGeometry(poly, -160, 160, 80, shape.shift, duct) }
  }, [poly, shape])
  const ductMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c6c3b8', roughness: 0.45, metalness: 0.35 }), [])
  const matrix = useMemo(() => {
    const site = dockSiteMatrix(evaSite.dockA).invert()
    return new THREE.Matrix4().makeTranslation(0, -0.1, 0).multiply(site).multiply(new THREE.Matrix4().makeScale(DOCK_GLB_M, DOCK_GLB_M, DOCK_GLB_M))
  }, [])
  const seg = Math.round(evaSite.dockA / (Math.PI / 8) - 0.5) + 1
  const deco = useMemo(
    () =>
      textTexture(
        [
          { text: 'AMANO-MINATO', size: 120, y: 90 },
          { text: `RING SECTION ${String(seg).padStart(2, '0')}  ·  SERVICE LOCK B`, size: 50, y: 200 },
        ],
        '#2a3442',
      ),
    [seg],
  )
  // 下面の帯（リングに沿った色の線と、作業場所の枠）
  const lines = useMemo(() => {
    const out: { x: number; z: number; w: number; d: number; c: string }[] = []
    for (const s of [-1, 1]) out.push({ x: s * 2.6, z: 0, w: 0.16, d: 100, c: '#c9a43a' })
    for (const s of [-1, 1]) out.push({ x: s * 32, z: 0, w: 0.5, d: 100, c: '#7c8794' })
    return out
  }, [])
  const blink = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(({ clock }) => {
    if (blink.current) blink.current.color.setRGB(Math.sin(clock.elapsedTime * 3) > 0.6 ? 4 : 0.25, 0.05, 0.05)
  })
  useEffect(
    () => () => {
      geos.face.dispose()
      geos.duct.dispose()
      ductMat.dispose()
      deco.dispose()
    },
    [geos, ductMat, deco],
  )
  return (
    <group>
      <Backdrop file="spacedock.glb" matrix={matrix} />
      <mesh geometry={geos.face} material={mat} receiveShadow />
      {lines.map((s, i) => (
        <mesh key={i} position={[s.x, 0.012, s.z]} receiveShadow>
          <boxGeometry args={[s.w, 0.01, s.d]} />
          <meshStandardMaterial color={s.c} roughness={0.7} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      ))}
      {/* リングに沿って走る配管の箱 */}
      <mesh geometry={geos.duct} material={ductMat} receiveShadow />
      <mesh position={[-7, 0.015, -6]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[12, 3]} />
        <meshStandardMaterial map={deco} transparent roughness={0.7} polygonOffset polygonOffsetFactor={-3} />
      </mesh>
      {[
        [8, 6],
        [-8, -14],
        [9, -24],
        [-9, 20],
      ].map(([x, z], i) => (
        <WorkLamp key={i} x={x} z={z} lit={i < 2} />
      ))}
      <mesh position={[0, 0.15, -34]}>
        <sphereGeometry args={[0.12, 12, 8]} />
        <meshBasicMaterial ref={blink} toneMapped={false} />
      </mesh>
      <RadiatorFins />
    </group>
  )
}
