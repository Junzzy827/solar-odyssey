import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { warpFx } from '../../state/flight'
import { bussardTexture, deflectorTexture, coilTexture, hullTextures, nameTexture, windowBandTexture } from './hullTextures'

// 自機「SV-01 ソーラーボイジャー」。円盤部・首・副船体・2本のナセルという構成は借りるが、
// 寸法と細部はオリジナル。長さ約1、前方は -Z。
// 首・副船体・パイロン・ナセルは Blender で一体成形したモデル（tools/blender/build_hull.py）を読み込む。
//
// 質感と発光は撮影用模型の資料を参考にしている：
// - 外板はパール塗装。青みと金色のパネルが入り混じり、光の当たり方で色が揺らぐ（iridescence）
// - バサードコレクター（ナセル先端）は赤く、内部がゆっくり渦を巻くように明滅
// - ワープコイルは途切れのない青い発光。ナセルの曲面に沿わせ、縁がにじむように消える
// - ディフレクターは銅色の皿に青い光
// - インパルスエンジンは赤、航行灯は左舷が赤・右舷が緑、白いストロボが約2秒おきに点滅

type Profile = [number, number][]

/** 断面の点列をなめらかにつなぎ、等間隔に並べ直してから回転体にする */
function lathe(profile: Profile, segments: number, samples = 96) {
  const curve = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y)))
  const points = curve.getSpacedPoints(samples).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y))
  const geometry = new THREE.LatheGeometry(points, segments)
  const rimIndex = points.reduce((best, p, i) => (p.x > points[best].x ? i : best), 0)
  /** 縁より下（bottom）または上（top）で、半径 r を通る位置のテクスチャ座標 v */
  const vAt = (r: number, side: 'top' | 'bottom') => {
    const range = side === 'bottom' ? [rimIndex, 0] : [rimIndex, samples]
    const step = side === 'bottom' ? -1 : 1
    for (let i = range[0]; i !== range[1]; i += step) if (points[i].x <= r) return i / samples
    return range[1] / samples
  }
  return { geometry, vRim: rimIndex / samples, vAt }
}

// 円盤部（下面中央 → 縁 → 上面中央の順で、法線が外を向く）
const SAUCER: Profile = [
  [0, -0.13], [0.05, -0.13], [0.1, -0.124], [0.16, -0.11], [0.3, -0.09], [0.5, -0.072], [0.75, -0.05],
  [0.92, -0.032], [0.985, -0.018], [1.0, -0.003], [0.985, 0.01], [0.92, 0.022], [0.75, 0.04],
  [0.5, 0.062], [0.25, 0.085], [0.11, 0.105], [0.075, 0.12], [0.05, 0.134], [0, 0.136],
]

// ブリッジ（円盤上面中央の段になった構造物。底 → 頂上）
const BRIDGE: Profile = [
  [0, 0], [0.034, 0], [0.035, 0.002], [0.031, 0.005], [0.0305, 0.0065], [0.024, 0.0085], [0.016, 0.0105],
  [0.0155, 0.012], [0.008, 0.0135], [0, 0.014],
]

const SAUCER_SCALE: [number, number, number] = [0.32, 0.32, 0.29]
const SAUCER_POS: [number, number, number] = [0, 0.07, -0.17]
const SECONDARY_Y = -0.085
const NACELLE_X = 0.2
const NACELLE_Y = 0.068
const NACELLE_Z = 0.14

function hullMaterial(tex: ReturnType<typeof hullTextures>, envMap: THREE.Texture, vertexColors = false) {
  return new THREE.MeshPhysicalMaterial({
    vertexColors,
    map: tex.map,
    bumpMap: tex.bumpMap,
    bumpScale: 1.2,
    emissiveMap: tex.emissiveMap,
    emissive: new THREE.Color(1.6, 1.5, 1.3),
    metalness: 0.2,
    roughness: 0.68,
    iridescence: 0.3,
    iridescenceIOR: 1.6,
    envMap,
    envMapIntensity: 0.3,
  })
}

/** unitScale は自機に掛かっている拡大率（投光の届く距離を合わせるため） */
export function ShipModel({ unitScale = 1 }: { unitScale?: number }) {
  const { gl } = useThree()
  const root = useRef<THREE.Group>(null!)

  // すべての船体パーツに影を落とし、受けさせる
  useEffect(() => {
    root.current.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const basic = (mesh.material as THREE.Material).type === 'MeshBasicMaterial'
      mesh.castShadow = !basic
      mesh.receiveShadow = !basic
    })
  }, [])

  const envMap = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    return env
  }, [gl])

  const parts = useMemo(() => {
    const saucer = lathe(SAUCER, 128, 160)
    const r = saucer.vRim
    const saucerTex = hullTextures({
      width: 4096,
      height: 1024,
      seed: 11,
      windows: [
        { v: r - 0.035, density: 0.75 },
        { v: r - 0.06, density: 0.55 },
        { v: r + 0.035, density: 0.75 },
        { v: r + 0.065, density: 0.6 },
        { v: r + 0.12, density: 0.35 },
        { v: r + 0.2, density: 0.25 },
      ],
      details: [
        { v: saucer.vAt(0.86, 'top'), kind: 'phaser' },
        { v: saucer.vAt(0.86, 'bottom'), kind: 'phaser' },
        { v: saucer.vAt(0.6, 'top'), kind: 'hatch' },
        { v: saucer.vAt(0.42, 'top'), kind: 'hatch' },
        { v: saucer.vAt(0.62, 'bottom'), kind: 'hatch' },
        { v: saucer.vAt(0.5, 'top'), kind: 'groove' },
        { v: saucer.vAt(0.3, 'top'), kind: 'groove' },
        { v: saucer.vAt(0.18, 'top'), kind: 'groove' },
        { v: saucer.vAt(0.45, 'bottom'), kind: 'groove' },
        { v: saucer.vAt(0.25, 'bottom'), kind: 'groove' },
      ],
    })
    const secondaryTex = hullTextures({
      width: 2048,
      height: 1024,
      seed: 23,
      panelScale: 0.8,
      windows: [
        { v: 0.29, vertical: true, from: 0.12, to: 0.82, density: 0.7 },
        { v: 0.71, vertical: true, from: 0.12, to: 0.82, density: 0.7 },
        { v: 0.34, vertical: true, from: 0.15, to: 0.7, density: 0.5 },
        { v: 0.66, vertical: true, from: 0.15, to: 0.7, density: 0.5 },
      ],
    })
    const nacelleTex = hullTextures({ width: 512, height: 512, seed: 37, panelScale: 0.6, windows: [] })

    return {
      saucer: saucer.geometry,
      saucerMat: hullMaterial(saucerTex, envMap),
      // 一体成形モデルは頂点カラーに焼き込んだ環境遮蔽（AO）を持つ
      secondaryMat: hullMaterial(secondaryTex, envMap, true),
      nacelleMat: hullMaterial(nacelleTex, envMap, true),
      bridge: lathe(BRIDGE, 64, 64).geometry,
      bridgeMat: new THREE.MeshPhysicalMaterial({ color: '#c3c7ce', metalness: 0.15, roughness: 0.55, envMap, envMapIntensity: 0.3 }),
      bridgeWindows: windowBandTexture(),
      trimMat: new THREE.MeshPhysicalMaterial({ color: '#9aa0aa', metalness: 0.55, roughness: 0.35, envMap, envMapIntensity: 0.5 }),
      deflectorRimMat: new THREE.MeshPhysicalMaterial({ color: '#2b3442', metalness: 0.85, roughness: 0.3, envMap, envMapIntensity: 0.9 }),
      // バサードの外殻：薄く色の付いたガラス。発光体の上に映り込みとハイライトを乗せる
      bussardGlass: new THREE.MeshPhysicalMaterial({
        color: '#ff2a10',
        metalness: 0,
        roughness: 0.04,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        envMap,
        envMapIntensity: 1.2,
      }),
      deflector: deflectorTexture(),
      bussardL: bussardTexture(),
      bussardR: bussardTexture(),
      coil: coilTexture(),
      coilGeometry: coilBands(),
      coilHousing: coilBands(0.039, 1.06),
      housingMat: new THREE.MeshStandardMaterial({ color: '#1b2233', metalness: 0.6, roughness: 0.4 }),
      name: nameTexture('SV-01  SOLAR VOYAGER'),
    }
  }, [envMap])

  // 発光部（ワープ時に強める・明滅させる）
  const bussards = useRef<THREE.MeshBasicMaterial[]>([])
  const grilles = useRef<THREE.MeshBasicMaterial[]>([])
  const deflector = useRef<THREE.MeshBasicMaterial>(null!)
  const impulse = useRef<THREE.MeshBasicMaterial>(null!)
  const strobes = useRef<THREE.MeshBasicMaterial[]>([])
  const navLights = useRef<THREE.MeshBasicMaterial[]>([])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const w = warpFx.glow
    // バサード：赤い光がゆっくり脈打つ
    bussards.current.forEach((m, i) => {
      const swirl = 0.85 + 0.15 * Math.sin(t * 3 + i * 1.3) + 0.08 * Math.sin(t * 7.1 + i)
      const k = (0.9 + w * 1.2) * swirl
      m.color.setRGB(k * 1.7, k * 1.05, k)
      if (m.map) m.map.offset.x = (t * 0.15 * (i % 2 ? 1 : -1)) % 1
    })
    // ワープコイル：普段は穏やか、ワープ準備で明るく
    grilles.current.forEach((m) => m.color.setScalar(1.5 + w * 2 + 0.06 * Math.sin(t * 2.3)))
    // ディフレクター：ゆっくり呼吸するように明滅、ワープ準備で強く
    const d = (1.15 + w * 1.4) * (0.94 + 0.06 * Math.sin(t * 1.7))
    deflector.current.color.setRGB(d, d, d * 1.1)
    impulse.current.color.setRGB(w > 0 ? 0.6 : 1.8, 0.15, 0.08)
    // ストロボは約2秒おきに短く光る。航行灯はゆっくり明滅
    const flash = t % 2 < 0.08 ? 4 : 0.35
    strobes.current.forEach((m) => m.color.setRGB(flash, flash, flash))
    const nav = 0.7 + 0.5 * (Math.sin(t * Math.PI) > 0 ? 1 : 0)
    navLights.current.forEach((m, i) => (i % 2 === 0 ? m.color.setRGB(1.3 * nav, 0.04, 0.04) : m.color.setRGB(0.04, 1.3 * nav, 0.15)))
  })

  useEffect(
    () => () => {
      Object.values(parts).forEach((p) => {
        if (p instanceof THREE.BufferGeometry || p instanceof THREE.Material || p instanceof THREE.Texture) p.dispose()
      })
    },
    [parts],
  )

  const saucerTop = SAUCER_POS[1] + 0.136 * SAUCER_SCALE[1]
  const saucerBottom = SAUCER_POS[1] - 0.13 * SAUCER_SCALE[1]
  const rimX = SAUCER_SCALE[0]

  const glowMat = (ref: React.MutableRefObject<THREE.MeshBasicMaterial[]>) => (m: THREE.MeshBasicMaterial | null) => {
    if (m && !ref.current.includes(m)) ref.current.push(m)
  }

  return (
    <group ref={root}>
      <Floodlights unitScale={unitScale} saucerTop={saucerTop} />
      {/* 円盤部 */}
      <mesh geometry={parts.saucer} material={parts.saucerMat} position={SAUCER_POS} scale={SAUCER_SCALE} />
      {/* ブリッジ：段になった構造物と窓の帯、頂上の標識灯 */}
      <group position={[0, saucerTop - 0.004, SAUCER_POS[2] + 0.01]} scale={[1, 1, 1.15]}>
        <mesh geometry={parts.bridge} material={parts.bridgeMat} />
        <mesh position={[0, 0.0058, 0]}>
          <cylinderGeometry args={[0.0313, 0.0313, 0.0012, 64, 1, true]} />
          <meshBasicMaterial map={parts.bridgeWindows} transparent toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.0145, 0]}>
          <sphereGeometry args={[0.0018, 12, 12]} />
          <meshBasicMaterial color={new THREE.Color(0.9, 1.0, 1.3)} toneMapped={false} />
        </mesh>
      </group>
      {/* 下部センサードーム */}
      <mesh position={[0, saucerBottom + 0.002, SAUCER_POS[2]]} scale={[1, 0.6, 1]}>
        <sphereGeometry args={[0.02, 24, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        <meshBasicMaterial color={new THREE.Color(0.25, 0.35, 0.6)} toneMapped={false} />
      </mesh>
      {/* 船名（上面をスポットライトで照らしたように明るめに） */}
      <mesh position={[0, SAUCER_POS[1] + 0.07 * SAUCER_SCALE[1], SAUCER_POS[2] - 0.14]} rotation={[-Math.PI / 2 - 0.1, 0, 0]}>
        <planeGeometry args={[0.15, 0.019]} />
        <meshBasicMaterial map={parts.name} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      {/* インパルスエンジン：円盤上面の後ろ寄りに埋め込んだ箱と、後ろ向きに光る噴射口 */}
      <mesh position={[0, 0.0797, 0.079]} material={parts.bridgeMat}>
        <boxGeometry args={[0.075, 0.0045, 0.018]} />
      </mesh>
      <mesh position={[0, 0.0805, 0.0882]}>
        <planeGeometry args={[0.068, 0.0024]} />
        <meshBasicMaterial ref={impulse} toneMapped={false} />
      </mesh>

      {/* 首・副船体・パイロン・ナセル（一体成形） */}
      <Suspense fallback={null}>
        <EngineeringHull hullMat={parts.secondaryMat} nacelleMat={parts.nacelleMat} />
      </Suspense>

      {/* ディフレクター */}
      <mesh position={[0, SECONDARY_Y, -0.001]} scale={[1, 0.7, 1]} material={parts.deflectorRimMat}>
        <torusGeometry args={[0.041, 0.006, 12, 48]} />
      </mesh>
      <mesh position={[0, SECONDARY_Y, -0.002]} rotation={[0, Math.PI, 0]} scale={[1, 0.7, 1]}>
        <circleGeometry args={[0.038, 48]} />
        <meshBasicMaterial ref={deflector} map={parts.deflector} toneMapped={false} />
      </mesh>
      {/* シャトルベイ：副船体の平らな後端に、枠と明るい扉 */}
      <mesh position={[0, SECONDARY_Y + 0.005, 0.4953]}>
        <planeGeometry args={[0.036, 0.018]} />
        <meshStandardMaterial color="#3a3f48" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, SECONDARY_Y + 0.005, 0.4956]}>
        <planeGeometry args={[0.03, 0.013]} />
        <meshBasicMaterial color={new THREE.Color(0.75, 0.68, 0.52)} toneMapped={false} />
      </mesh>

      {[-1, 1].map((side) => {
        const nx = side * NACELLE_X
        return (
          <group key={side}>
            {/* バサードコレクター */}
            <mesh position={[nx, NACELLE_Y, NACELLE_Z + 0.022]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 1.35, 0.62]}>
              <sphereGeometry args={[0.033, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshBasicMaterial ref={glowMat(bussards)} map={side < 0 ? parts.bussardL : parts.bussardR} toneMapped={false} />
            </mesh>
            <mesh position={[nx, NACELLE_Y, NACELLE_Z + 0.022]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.03, 1.37, 0.64]} material={parts.bussardGlass}>
              <sphereGeometry args={[0.033, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
            </mesh>
            {/* ワープコイル：ナセルの曲面に沿った帯（内側・外側・上面） */}
            <mesh geometry={parts.coilHousing} material={parts.housingMat} position={[nx, NACELLE_Y, NACELLE_Z + 0.25]} />
            <mesh geometry={parts.coilGeometry} position={[nx, NACELLE_Y, NACELLE_Z + 0.25]}>
              <meshBasicMaterial ref={glowMat(grilles)} map={parts.coil} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
            </mesh>
            {/* ナセル後端のストロボ */}
            <mesh position={[nx, NACELLE_Y + 0.02, NACELLE_Z + 0.42]}>
              <sphereGeometry args={[0.004, 8, 8]} />
              <meshBasicMaterial ref={glowMat(strobes)} toneMapped={false} />
            </mesh>
          </group>
        )
      })}

      {/* 航行灯：円盤の縁の上下（左舷＝赤、右舷＝緑） */}
      {[1, -1].map((dy) =>
        [-1, 1].map((side) => (
          <mesh key={`${dy}${side}`} position={[side * rimX * 0.995, SAUCER_POS[1] + dy * 0.004, SAUCER_POS[2]]}>
            <sphereGeometry args={[0.003, 8, 8]} />
            <meshBasicMaterial ref={glowMat(navLights)} toneMapped={false} />
          </mesh>
        )),
      )}
    </group>
  )
}

/**
 * 船体を照らす投光器。撮影用模型や劇中の船と同じく、外板の一部を下や横から照らして
 * 光のたまりを作る。暗い宇宙でも形と大きさが分かる。
 */
function Floodlights({ unitScale, saucerTop }: { unitScale: number; saucerTop: number }) {
  const lights: { from: [number, number, number]; to: [number, number, number]; angle: number; intensity: number }[] = [
    // 円盤上面（船名のあたり）を後ろから
    { from: [0, saucerTop + 0.08, 0.1], to: [0, saucerTop - 0.01, -0.33], angle: 0.45, intensity: 0.7 },
    // 円盤の下面を首の付け根から
    { from: [0, -0.05, 0.1], to: [0, 0.03, -0.3], angle: 0.6, intensity: 0.6 },
    // 副船体の側面をパイロンから
    { from: [0.16, 0.05, 0.46], to: [0.02, -0.09, 0.18], angle: 0.5, intensity: 0.5 },
    { from: [-0.16, 0.05, 0.46], to: [-0.02, -0.09, 0.18], angle: 0.5, intensity: 0.5 },
  ]
  const targets = useMemo(() => lights.map((l) => {
    const o = new THREE.Object3D()
    o.position.set(...l.to)
    return o
  }), [saucerTop])
  return (
    <>
      {lights.map((l, i) => (
        <group key={i}>
          <primitive object={targets[i]} />
          <spotLight
            position={l.from}
            target={targets[i]}
            angle={l.angle}
            penumbra={0.8}
            distance={0.7 * unitScale}
            decay={1}
            // decay=1 なので明るさは距離に反比例する。縮小して置いても同じ見え方になるよう倍率を掛ける
            intensity={l.intensity * unitScale}
            color="#fff1dc"
          />
        </group>
      ))}
    </>
  )
}

/**
 * ワープコイルの帯。ナセル表面のわずかに外側に、側面2本と上面1本の曲面を作る。
 * 回転後の位置は x = r·sinθ、y = −r·cosθ（θ = π/2 が +x 側、π が上）
 */
function coilBands(radius = 0.0392, shrink = 1) {
  const bands: [number, number][] = [
    [Math.PI / 2, 1.0],
    [(Math.PI * 3) / 2, 1.0],
    [Math.PI, 0.7],
  ]
  const parts = bands.map(([center, width]) => {
    const g = new THREE.CylinderGeometry(radius, radius, 0.27 * shrink, 24, 1, true, center - (width * shrink) / 2, width * shrink)
    g.rotateX(Math.PI / 2)
    g.scale(1, 0.62, 1)
    return g
  })
  const merged = mergeGeometries(parts)!
  parts.forEach((g) => g.dispose())
  return merged
}

const HULL_URL = `${import.meta.env.BASE_URL}models/ship-hull.glb`
useGLTF.preload(HULL_URL)

/** Blender で生成した機関部。マテリアル名（Hull / Nacelle）で船体の質感を割り当てる */
function EngineeringHull({ hullMat, nacelleMat }: { hullMat: THREE.Material; nacelleMat: THREE.Material }) {
  const { scene } = useGLTF(HULL_URL)
  const meshes = useMemo(() => {
    const list: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = []
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const name = (mesh.material as THREE.Material).name
      list.push({ geometry: mesh.geometry, material: name === 'Nacelle' ? nacelleMat : hullMat })
    })
    return list
  }, [scene, hullMat, nacelleMat])
  return (
    <>
      {meshes.map((m, i) => (
        <mesh key={i} geometry={m.geometry} material={m.material} castShadow receiveShadow />
      ))}
    </>
  )
}
