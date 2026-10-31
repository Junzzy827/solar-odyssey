import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { asteroidMaterial } from '../asteroidShape'
import { TOP_ENGINE_FACE, TOP_SIZE, TOP_UP, rockMesh, surfaceProbe, topGeometry } from './rockShapes'
import { AsteroidDock } from './AsteroidDock'
import { sim } from '../../state/registry'
import { useStore } from '../../state/store'
import { useLayout } from '../../state/useLayout'
import { UNITS_PER_METER } from '../../data/sf'
import { ENGINE_ROCK_ID, ENGINE_ROCK_TEXT, engineRockName } from '../../data/sfEngine'
import { EARTH_YEAR_SECONDS } from '../../data/scale'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'
import { useSite } from './useSite'

// 推進小惑星（オリジナルのデザイン）。上が平たく広がり下がすぼまったコマ形の岩（rockShapes.ts）に、
// 上の岩山とドーム形の居住区、採掘基地、うしろ（+Z）の平らな面に横一列の4基のプラズマエンジンを取りつけ、
// 火星と地球の軌道のあいだをゆっくり地球のほうへ運ばれていく。
// 武器はなく、採掘のための船として描く。形は m で決め、UNITS_PER_METER で表示単位にする。前は -Z。
// 基地として働く岩なので、スペースコロニー並みの大きさにする（形を GROW 倍。横の縁に宇宙船ドックは本物の大きさで）。

/** rockShapes の寸法の何倍で置くか（幅・高さとも約30km） */
const GROW = 4

/** 太陽からの距離（天文単位）：何年もかけて MIN から MAX のあいだを行き来する（近づくところを長く見せる） */
const MIN_AU = 1.12
const MAX_AU = 1.42
const DRIFT_YEARS = 9
/** 太陽のまわりを1周する年数（地球より遅いので、地球がときどき追いこす） */
const LAP_YEARS = 1.7

/** エンジンの横の位置（m）と、エンジンを並べる面での高さ */
const ENGINES = [-1350, -450, 450, 1350]
const ENGINE_Y = -80
/** ドームの居住区と採掘基地の位置（上面の上、x と z。高さは岩の表面に合わせる） */
const DOME_AT: [number, number] = [1300, -300]
const BASE_AT: [number, number] = [300, -2300]

function useParts() {
  return useMemo(() => {
    const geometry = topGeometry()
    const rocks = rockMesh(geometry, asteroidMaterial(), '#7f786c')
    // 建物は岩の表面の高さに置く
    const probe = surfaceProbe(geometry)
    const ground = ([x, z]: [number, number]) => probe({ x, y: 20000, z }, { x, y: -20000, z })?.pos.y ?? TOP_UP
    const dome: [number, number, number] = [DOME_AT[0], ground(DOME_AT), DOME_AT[1]]
    const base: [number, number, number] = [BASE_AT[0], ground(BASE_AT) + 175, BASE_AT[1]]
    // 宇宙船ドックは +X の縁の下の斜面（エンジンの面とも、前の採掘基地とも重ならない側）
    const dock = probe({ x: 20000, y: -1500, z: 300 }, { x: 0, y: -1500, z: 300 })

    const metal = new THREE.MeshStandardMaterial({ color: '#c3c7cf', metalness: 0.55, roughness: 0.4 })
    const dark = new THREE.MeshStandardMaterial({ color: '#4a4f58', metalness: 0.6, roughness: 0.5 })
    const accent = new THREE.MeshStandardMaterial({ color: '#d98a2b', metalness: 0.3, roughness: 0.5 })
    return {
      rocks,
      dock,
      dome,
      base,
      metal,
      dark,
      accent,
      // エンジン：釣鐘形のノズル（+Z 向きに開く）と、横一列に束ねる台
      nozzle: new THREE.CylinderGeometry(220, 380, 700, 20, 1, true).rotateX(-Math.PI / 2),
      nozzleBase: new THREE.CylinderGeometry(260, 260, 400, 16).rotateX(Math.PI / 2),
      mount: new THREE.BoxGeometry(3900, 900, 500),
      // 青白いプラズマ：中心の明るい円と、うしろへ細くなる光の筒
      core: new THREE.CircleGeometry(230, 20),
      plume: new THREE.ConeGeometry(300, 2800, 20, 1, true).rotateX(Math.PI / 2).translate(0, 0, 1400),
      coreMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 2.0, 2.8), toneMapped: false, side: THREE.DoubleSide }),
      plumeMat: new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.35, 0.6, 1.4),
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
      // 採掘基地：箱形の建物、塔、掘る腕、運び出す筒
      block: new THREE.BoxGeometry(1, 1, 1),
      tower: new THREE.CylinderGeometry(90, 120, 900, 8),
      dish: new THREE.SphereGeometry(300, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3),
      // ドーム形の居住区：丸い屋根と、窓の並ぶ土台
      domeTop: new THREE.SphereGeometry(650, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      domeBase: new THREE.CylinderGeometry(720, 780, 260, 32, 1, true),
      ribs: new THREE.CylinderGeometry(735, 795, 200, 24, 1, true),
      windows: new THREE.TorusGeometry(730, 22, 4, 48),
      glass: new THREE.MeshStandardMaterial({ color: '#5d6b66', metalness: 0.3, roughness: 0.35 }),
      windowMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.8, 1.1), toneMapped: false }),
      beacon: new THREE.SphereGeometry(45, 8, 8),
      beaconMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.4, 0.3), toneMapped: false }),
      lamp: new THREE.SphereGeometry(30, 6, 6),
      lampMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.2, 1.8), toneMapped: false }),
    }
  }, [])
}

const ahead = new THREE.Vector3()

export function EngineAsteroid() {
  useLang()
  const group = useRef<THREE.Group>(null!)
  const label = useRef<HTMLSpanElement>(null)
  useHideBehindSun(label, group)
  const layout = useLayout()
  const size = TOP_SIZE * GROW * UNITS_PER_METER
  const moved = useSite(group, {
    id: ENGINE_ROCK_ID,
    radius: size,
    zoom: { start: size * 5, full: size * 2.2 },
    notice: { distance: size * 4, text: ENGINE_ROCK_TEXT.found },
  })
  const parts = useParts()
  useEffect(
    () => () => {
      parts.rocks.geometry.dispose()
      ;(parts.rocks.material as THREE.Material).dispose()
      parts.rocks.dispose()
    },
    [parts],
  )

  useFrame(({ clock }) => {
    const years = sim.time / EARTH_YEAR_SECONDS
    const k = 0.5 + 0.5 * Math.cos((years / DRIFT_YEARS) * Math.PI * 2)
    const r = layout.au(MIN_AU + (MAX_AU - MIN_AU) * k)
    const a = 0.9 + (years / LAP_YEARS) * Math.PI * 2
    const g = group.current
    g.position.set(Math.cos(a) * r, -0.8, -Math.sin(a) * r)
    // 進む向き（反時計回り）へ前（-Z）を向け、少し内側（地球の軌道のほう）へ傾ける
    ahead.set(-Math.sin(a), 0, -Math.cos(a)).addScaledVector(g.position, 0.15 / r).multiplyScalar(-1).add(g.position)
    g.lookAt(ahead)
    moved()
    const t = clock.getElapsedTime()
    // プラズマは少しゆらぐ
    parts.plumeMat.opacity = 0.2 + 0.05 * Math.sin(t * 7.3) + 0.03 * Math.sin(t * 17.1)
    const on = t % 2.4 < 0.15 || (t % 2.4 > 0.4 && t % 2.4 < 0.55)
    parts.beaconMat.color.setRGB(on ? 2.6 : 0.25, on ? 0.4 : 0.04, on ? 0.3 : 0.03)
  })

  return (
    <group ref={group}>
      <group scale={UNITS_PER_METER * GROW}>
        <primitive object={parts.rocks} />

        {/* うしろ（+Z）の平らな面に、横一列のエンジン */}
        {parts.dock && <AsteroidDock owner={ENGINE_ROCK_ID} at={parts.dock.pos.toArray()} normal={parts.dock.normal} scale={1 / GROW} />}

        <group position={[0, ENGINE_Y, TOP_ENGINE_FACE]}>
          <mesh geometry={parts.mount} material={parts.dark} position={[0, 0, 100]} />
          {ENGINES.map((x, i) => (
            <group key={i} position={[x, 0, 300]}>
              <mesh geometry={parts.nozzleBase} material={parts.metal} position={[0, 0, 100]} />
              <mesh geometry={parts.nozzle} material={parts.dark} position={[0, 0, 650]} />
              <mesh geometry={parts.core} material={parts.coreMat} position={[0, 0, 500]} />
              <mesh geometry={parts.plume} material={parts.plumeMat} position={[0, 0, 960]} renderOrder={2} />
            </group>
          ))}
          <mesh geometry={parts.beacon} material={parts.beaconMat} position={[-2050, 0, 300]} />
          <mesh geometry={parts.beacon} material={parts.beaconMat} position={[2050, 0, 300]} />
        </group>

        {/* 上の岩山のそばの、ドーム形の居住区 */}
        <group position={parts.dome}>
          <mesh geometry={parts.domeBase} material={parts.dark} position={[0, 30, 0]} />
          <mesh geometry={parts.ribs} material={parts.metal} position={[0, 20, 0]} />
          <mesh geometry={parts.windows} material={parts.windowMat} rotation={[Math.PI / 2, 0, 0]} position={[0, 60, 0]} />
          <mesh geometry={parts.domeTop} material={parts.glass} position={[0, 160, 0]} />
          <mesh geometry={parts.beacon} material={parts.beaconMat} position={[0, 830, 0]} />
        </group>

        {/* 前のほうの採掘基地 */}
        <group position={parts.base}>
          <mesh geometry={parts.block} material={parts.metal} scale={[900, 350, 700]} />
          <mesh geometry={parts.block} material={parts.accent} scale={[500, 250, 500]} position={[-650, 120, 300]} />
          <mesh geometry={parts.block} material={parts.metal} scale={[400, 500, 400]} position={[600, 150, 250]} />
          <mesh geometry={parts.tower} material={parts.metal} position={[0, 600, 0]} />
          <mesh geometry={parts.dish} material={parts.metal} position={[0, 1100, 0]} rotation={[-0.7, 0, 0]} />
          <mesh geometry={parts.beacon} material={parts.beaconMat} position={[0, 1080, 0]} />
          {/* 掘りだした岩を運ぶ筒（基地から前へ） */}
          <mesh geometry={parts.block} material={parts.accent} scale={[120, 120, 1600]} position={[300, -150, -900]} />
          {[-1, 0, 1].map((i) => (
            <mesh key={i} geometry={parts.lamp} material={parts.lampMat} position={[i * 350, 190, -360]} />
          ))}
        </group>
      </group>
      <Html position={[0, size * 1.1, 0]} center className="label" zIndexRange={LABEL_Z}>
        <span ref={label} onClick={() => useStore.getState().setTarget(ENGINE_ROCK_ID)}>
          {engineRockName()}
        </span>
      </Html>
    </group>
  )
}
