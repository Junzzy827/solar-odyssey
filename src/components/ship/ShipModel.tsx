import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { warpFx } from '../../state/flight'
import { bussardTexture, deflectorTexture, grilleTexture, hullTextures, nameTexture } from './hullTextures'

// 自機「SV-01 ソーラーボイジャー」。円盤部・首・副船体・2本のナセルという構成は借りるが、
// 寸法と細部はオリジナル。長さ約1、前方は -Z。
//
// 質感と発光は撮影用模型の資料を参考にしている：
// - 外板はパール塗装。青みと金色のパネルが入り混じり、光の当たり方で色が揺らぐ（iridescence）
// - バサードコレクター（ナセル先端）は赤く、内部がゆっくり渦を巻くように明滅
// - ワープコイルは途切れのない青い発光
// - ディフレクターは銅色の皿に青い光
// - インパルスエンジンは赤、航行灯は左舷が赤・右舷が緑、白いストロボが約2秒おきに点滅

type Profile = [number, number][]

/** 断面の点列をなめらかにつなぎ、等間隔に並べ直してから回転体にする */
function lathe(profile: Profile, segments: number, samples = 96) {
  const curve = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y)))
  const points = curve.getSpacedPoints(samples).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y))
  const geometry = new THREE.LatheGeometry(points, segments)
  const rimIndex = points.reduce((best, p, i) => (p.x > points[best].x ? i : best), 0)
  return { geometry, vRim: rimIndex / samples }
}

// 円盤部（下面中央 → 縁 → 上面中央の順で、法線が外を向く）
const SAUCER: Profile = [
  [0, -0.13], [0.05, -0.13], [0.1, -0.124], [0.16, -0.11], [0.3, -0.09], [0.5, -0.072], [0.75, -0.05],
  [0.92, -0.032], [0.985, -0.018], [1.0, -0.003], [0.985, 0.01], [0.92, 0.022], [0.75, 0.04],
  [0.5, 0.062], [0.25, 0.085], [0.11, 0.105], [0.075, 0.12], [0.05, 0.134], [0, 0.136],
]

// 副船体（前端 → 後端）
const SECONDARY: Profile = [
  [0, 0], [0.042, 0.001], [0.054, 0.014], [0.062, 0.05], [0.064, 0.15], [0.06, 0.3], [0.052, 0.4], [0.042, 0.46], [0.028, 0.5], [0, 0.512],
]

// ナセル（前端 → 後端）
const NACELLE: Profile = [
  [0, 0], [0.024, 0.004], [0.033, 0.018], [0.037, 0.045], [0.038, 0.12], [0.038, 0.36], [0.035, 0.4], [0.028, 0.425], [0.013, 0.435], [0, 0.437],
]

const SAUCER_SCALE: [number, number, number] = [0.32, 0.32, 0.29]
const SAUCER_POS: [number, number, number] = [0, 0.07, -0.17]
const SECONDARY_Y = -0.085
const NACELLE_X = 0.2
const NACELLE_Y = 0.068
const NACELLE_Z = 0.14

/** 長い軸を Z 方向に向けた回転体（縦方向を flatten 倍に潰す） */
function alongZ(profile: Profile, flatten: number, segments = 64) {
  const { geometry } = lathe(profile, segments)
  geometry.scale(1, 1, flatten)
  geometry.rotateX(Math.PI / 2)
  return geometry
}

/** 2点を結ぶ板（パイロン）の位置と向き */
function strut(a: THREE.Vector3, b: THREE.Vector3) {
  const dir = b.clone().sub(a)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  return { position: a.clone().add(b).multiplyScalar(0.5), quaternion: q, length: dir.length() }
}

function hullMaterial(tex: ReturnType<typeof hullTextures>, envMap: THREE.Texture) {
  return new THREE.MeshPhysicalMaterial({
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

export function ShipModel() {
  const { gl } = useThree()

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
      width: 2048,
      height: 512,
      seed: 11,
      windows: [
        { v: r - 0.035, density: 0.75 },
        { v: r - 0.06, density: 0.55 },
        { v: r + 0.035, density: 0.75 },
        { v: r + 0.065, density: 0.6 },
        { v: r + 0.12, density: 0.35 },
        { v: r + 0.2, density: 0.25 },
      ],
    })
    const secondaryTex = hullTextures({
      width: 1024,
      height: 512,
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
      secondary: alongZ(SECONDARY, 0.7),
      nacelle: alongZ(NACELLE, 0.62, 48),
      saucerMat: hullMaterial(saucerTex, envMap),
      secondaryMat: hullMaterial(secondaryTex, envMap),
      nacelleMat: hullMaterial(nacelleTex, envMap),
      trimMat: new THREE.MeshPhysicalMaterial({ color: '#9aa0aa', metalness: 0.55, roughness: 0.35, envMap, envMapIntensity: 0.5 }),
      copperMat: new THREE.MeshPhysicalMaterial({ color: '#b87333', metalness: 0.9, roughness: 0.3, envMap, envMapIntensity: 0.8 }),
      deflector: deflectorTexture(),
      bussardL: bussardTexture(),
      bussardR: bussardTexture(),
      grille: grilleTexture(),
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
      m.color.setRGB(k, k * 0.9, k * 0.9)
      if (m.map) m.map.offset.x = (t * 0.15 * (i % 2 ? 1 : -1)) % 1
    })
    // ワープコイル：普段は穏やか、ワープ準備で明るく
    grilles.current.forEach((m) => m.color.setRGB(0.5 + w * 1.2, 0.8 + w * 1.4, 1.4 + w * 2))
    deflector.current.color.setRGB(0.55 + w * 0.6, 0.85 + w * 0.8, 1.6 + w * 1.4)
    impulse.current.color.setRGB(w > 0 ? 0.6 : 1.8, 0.15, 0.08)
    // ストロボは約2秒おきに短く光る。航行灯はゆっくり明滅
    const flash = t % 2 < 0.08 ? 4 : 0
    strobes.current.forEach((m) => m.color.setRGB(flash, flash, flash))
    const nav = 0.7 + 0.5 * (Math.sin(t * Math.PI) > 0 ? 1 : 0)
    navLights.current.forEach((m, i) => (i % 2 === 0 ? m.color.setRGB(2 * nav, 0.05, 0.05) : m.color.setRGB(0.05, 2 * nav, 0.2)))
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
  const rimZ = SAUCER_SCALE[2]

  const pylon = (side: number) =>
    strut(new THREE.Vector3(side * 0.045, SECONDARY_Y + 0.01, 0.34), new THREE.Vector3(side * (NACELLE_X - 0.02), NACELLE_Y - 0.01, 0.37))

  const glowMat = (ref: React.MutableRefObject<THREE.MeshBasicMaterial[]>) => (m: THREE.MeshBasicMaterial | null) => {
    if (m && !ref.current.includes(m)) ref.current.push(m)
  }

  return (
    <group>
      {/* 円盤部 */}
      <mesh geometry={parts.saucer} material={parts.saucerMat} position={SAUCER_POS} scale={SAUCER_SCALE} />
      {/* ブリッジと上部センサー */}
      <mesh position={[0, saucerTop - 0.002, SAUCER_POS[2] + 0.01]} scale={[1, 0.45, 1.1]} material={parts.trimMat}>
        <sphereGeometry args={[0.024, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh position={[0, saucerTop + 0.006, SAUCER_POS[2] + 0.005]}>
        <sphereGeometry args={[0.005, 12, 12]} />
        <meshBasicMaterial color={new THREE.Color(1.2, 1.4, 2)} toneMapped={false} />
      </mesh>
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
      {/* インパルスエンジン（円盤後縁） */}
      <mesh position={[0, SAUCER_POS[1] + 0.012, SAUCER_POS[2] + rimZ * 0.93]}>
        <boxGeometry args={[0.08, 0.006, 0.01]} />
        <meshBasicMaterial ref={impulse} toneMapped={false} />
      </mesh>

      {/* 首 */}
      <Neck material={parts.secondaryMat} top={saucerBottom + 0.01} bottom={SECONDARY_Y + 0.03} />

      {/* 副船体とディフレクター */}
      <mesh geometry={parts.secondary} material={parts.secondaryMat} position={[0, SECONDARY_Y, 0.0]} />
      <mesh position={[0, SECONDARY_Y, -0.001]} scale={[1, 0.7, 1]} material={parts.copperMat}>
        <torusGeometry args={[0.041, 0.006, 12, 48]} />
      </mesh>
      <mesh position={[0, SECONDARY_Y, -0.002]} rotation={[0, Math.PI, 0]} scale={[1, 0.7, 1]}>
        <circleGeometry args={[0.038, 48]} />
        <meshBasicMaterial ref={deflector} map={parts.deflector} toneMapped={false} />
      </mesh>
      {/* シャトルベイ（後端） */}
      <mesh position={[0, SECONDARY_Y + 0.004, 0.507]}>
        <planeGeometry args={[0.03, 0.012]} />
        <meshBasicMaterial color={new THREE.Color(1.4, 1.3, 1.1)} toneMapped={false} />
      </mesh>

      {[-1, 1].map((side) => {
        const p = pylon(side)
        const nx = side * NACELLE_X
        return (
          <group key={side}>
            <RoundedBox args={[0.012, p.length, 0.085]} radius={0.005} position={p.position} quaternion={p.quaternion} material={parts.secondaryMat} />
            <mesh geometry={parts.nacelle} material={parts.nacelleMat} position={[nx, NACELLE_Y, NACELLE_Z]} />
            {/* バサードコレクター */}
            <mesh position={[nx, NACELLE_Y, NACELLE_Z + 0.022]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 1.35, 0.62]}>
              <sphereGeometry args={[0.033, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshBasicMaterial ref={glowMat(bussards)} map={side < 0 ? parts.bussardL : parts.bussardR} toneMapped={false} />
            </mesh>
            {/* ワープコイル（内側・外側・上面） */}
            {[-1, 1].map((face) => (
              <mesh key={face} position={[nx + face * 0.0383, NACELLE_Y, NACELLE_Z + 0.25]} rotation={[0, face * (Math.PI / 2), 0]}>
                <planeGeometry args={[0.27, 0.014]} />
                <meshBasicMaterial ref={glowMat(grilles)} map={parts.grille} toneMapped={false} side={THREE.DoubleSide} />
              </mesh>
            ))}
            <mesh position={[nx, NACELLE_Y + 0.0238, NACELLE_Z + 0.25]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
              <planeGeometry args={[0.27, 0.014]} />
              <meshBasicMaterial ref={glowMat(grilles)} map={parts.grille} toneMapped={false} />
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
            <sphereGeometry args={[0.0045, 8, 8]} />
            <meshBasicMaterial ref={glowMat(navLights)} toneMapped={false} />
          </mesh>
        )),
      )}
    </group>
  )
}

/** 円盤と副船体をつなぐ、後ろに傾いた首 */
function Neck({ material, top, bottom }: { material: THREE.Material; top: number; bottom: number }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(-0.07, top)
    shape.lineTo(0.06, top)
    shape.quadraticCurveTo(0.14, (top + bottom) / 2, 0.2, bottom)
    shape.lineTo(0.03, bottom)
    shape.quadraticCurveTo(-0.02, (top + bottom) / 2, -0.07, top)
    const depth = 0.04
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 4, curveSegments: 16 })
    g.translate(0, 0, -depth / 2)
    g.rotateY(-Math.PI / 2)
    return g
  }, [top, bottom])
  return <mesh geometry={geometry} material={material} />
}
