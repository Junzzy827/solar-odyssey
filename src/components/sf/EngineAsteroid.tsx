import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { asteroidGeometry, asteroidMaterial } from '../asteroidShape'
import { sim } from '../../state/registry'
import { useStore } from '../../state/store'
import { useLayout } from '../../state/useLayout'
import { UNITS_PER_METER } from '../../data/sf'
import { ENGINE_ROCK_ID, ENGINE_ROCK_TEXT, engineRockName } from '../../data/sfEngine'
import { EARTH_YEAR_SECONDS } from '../../data/scale'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'
import { useSite } from './useSite'

// 推進小惑星（オリジナルのデザイン）。長さ約7km の岩に、前の端の採掘基地、上に伸びた柱の先の回る居住リング、
// うしろの端の6基のプラズマエンジンを取りつけ、火星と地球の軌道のあいだをゆっくり地球のほうへ運ばれていく。
// 武器はなく、採掘のための船として描く。形は m で決め、UNITS_PER_METER で表示単位にする。前は -Z。

/** 太陽からの距離（天文単位）：何年もかけて MIN から MAX のあいだを行き来する（近づくところを長く見せる） */
const MIN_AU = 1.12
const MAX_AU = 1.42
const DRIFT_YEARS = 9
/** 太陽のまわりを1周する年数（地球より遅いので、地球がときどき追いこす） */
const LAP_YEARS = 1.7

const rng = (seed: number) => {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

const ENGINES: [number, number][] = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2 + Math.PI / 6
  return [Math.cos(a) * 1150, Math.sin(a) * 950]
})

function useParts() {
  return useMemo(() => {
    const rand = rng(4242)
    const rocks = new THREE.InstancedMesh(asteroidGeometry(rand, 5), asteroidMaterial(), 3)
    const m = new THREE.Matrix4()
    const put = (i: number, pos: [number, number, number], rot: [number, number, number], scale: [number, number, number], color: string) => {
      m.compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale))
      rocks.setMatrixAt(i, m)
      rocks.setColorAt(i, new THREE.Color(color))
    }
    // 本体は前後に長く（岩の細長い向き x を z にそろえる）、こぶを2つ
    put(0, [0, 0, 0], [0.1, Math.PI / 2, 0.2], [3300, 2200, 2300], '#857a70')
    put(1, [1100, 900, -1900], [0.6, 1.1, 0.3], [1200, 900, 1000], '#766d65')
    put(2, [-1000, -700, 1500], [1.2, 0.4, 0.8], [1100, 800, 900], '#8d8377')
    rocks.castShadow = rocks.receiveShadow = true

    const metal = new THREE.MeshStandardMaterial({ color: '#c3c7cf', metalness: 0.55, roughness: 0.4 })
    const dark = new THREE.MeshStandardMaterial({ color: '#4a4f58', metalness: 0.6, roughness: 0.5 })
    const accent = new THREE.MeshStandardMaterial({ color: '#d98a2b', metalness: 0.3, roughness: 0.5 })
    return {
      rocks,
      metal,
      dark,
      accent,
      // エンジン：釣鐘形のノズル（+Z 向きに開く）と、それを束ねる骨組み
      nozzle: new THREE.CylinderGeometry(220, 380, 700, 20, 1, true).rotateX(-Math.PI / 2),
      nozzleBase: new THREE.CylinderGeometry(260, 260, 400, 16).rotateX(Math.PI / 2),
      frame: new THREE.TorusGeometry(1350, 60, 6, 32),
      strut: new THREE.BoxGeometry(80, 80, 1300),
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
      // 居住リング：柱の先で回る輪と、4本のスポーク
      mast: new THREE.CylinderGeometry(70, 70, 1800, 8),
      ring: new THREE.TorusGeometry(900, 110, 10, 48),
      spoke: new THREE.CylinderGeometry(30, 30, 1800, 6).rotateZ(Math.PI / 2),
      windows: new THREE.TorusGeometry(900, 30, 4, 48),
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
  const ring = useRef<THREE.Group>(null!)
  const label = useRef<HTMLSpanElement>(null)
  useHideBehindSun(label, group)
  const layout = useLayout()
  const size = 5200 * UNITS_PER_METER
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
    // 居住リングは1分あたり約1回転（本物の大きさなら、外側で地球の約0.7倍の重さ）
    ring.current.rotation.y = t * 0.105
    // プラズマは少しゆらぐ
    parts.plumeMat.opacity = 0.2 + 0.05 * Math.sin(t * 7.3) + 0.03 * Math.sin(t * 17.1)
    const on = t % 2.4 < 0.15 || (t % 2.4 > 0.4 && t % 2.4 < 0.55)
    parts.beaconMat.color.setRGB(on ? 2.6 : 0.25, on ? 0.4 : 0.04, on ? 0.3 : 0.03)
  })

  return (
    <group ref={group}>
      <group scale={UNITS_PER_METER}>
        <primitive object={parts.rocks} />

        {/* うしろの端のエンジン群（岩に打ちこんだ骨組みで束ねる） */}
        <group position={[0, 0, 3500]}>
          <mesh geometry={parts.frame} material={parts.dark} />
          {ENGINES.map(([x, y], i) => (
            <group key={i} position={[x, y, 0]}>
              <mesh geometry={parts.strut} material={parts.dark} position={[-x * 0.45, -y * 0.45, -500]} rotation={[0, 0, Math.atan2(y, x)]} />
              <mesh geometry={parts.nozzleBase} material={parts.metal} position={[0, 0, -100]} />
              <mesh geometry={parts.nozzle} material={parts.dark} position={[0, 0, 450]} />
              <mesh geometry={parts.core} material={parts.coreMat} position={[0, 0, 300]} />
              <mesh geometry={parts.plume} material={parts.plumeMat} position={[0, 0, 760]} renderOrder={2} />
            </group>
          ))}
        </group>

        {/* 前の端の採掘基地 */}
        <group position={[0, 1300, -2700]}>
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

        {/* 上に伸びた柱の先で回る居住リング */}
        <group position={[-300, 1900, 600]}>
          <mesh geometry={parts.mast} material={parts.metal} position={[0, 400, 0]} />
          <group ref={ring} position={[0, 1300, 0]}>
            <mesh geometry={parts.ring} material={parts.metal} rotation={[Math.PI / 2, 0, 0]} />
            <mesh geometry={parts.windows} material={parts.windowMat} rotation={[Math.PI / 2, 0, 0]} scale={[1.0, 1.0, 1.0]} position={[0, 100, 0]} />
            <mesh geometry={parts.spoke} material={parts.metal} />
            <mesh geometry={parts.spoke} material={parts.metal} rotation={[0, Math.PI / 2, 0]} />
          </group>
          <mesh geometry={parts.beacon} material={parts.beaconMat} position={[0, 1500, 0]} />
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
