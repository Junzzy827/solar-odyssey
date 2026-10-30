import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { asteroidGeometry, asteroidMaterial } from '../asteroidShape'
import { useStore } from '../../state/store'
import { ELEVATOR_ID, SF_TEXT, UNITS_PER_METER, elevatorName } from '../../data/sf'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'
import { useSite } from './useSite'

// 軌道エレベーター（オリジナルのデザイン）。赤道の海の上の基地から、静止軌道の駅を通って、
// その先のおもり（小惑星）までケーブルが伸びる。地球の自転と一緒に回る（静止軌道では、駅は地上から止まって見える）。
// 地球と月の距離を縮めて描いているので、駅とおもりの高さも縮めている（本物の静止軌道は高さ約3万6千km、月までの約10分の1）。

/** 地球の自転する部分の中での高さ（地球の中心から。地球の半径は 1.2） */
const EARTH_R = 1.2
const STATION_R = 2.3
const TOP_R = 2.85
/** 基地を置く経度（太平洋の赤道上） */
const LONGITUDE = -160

const rng = (seed: number) => {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

function Station() {
  useLang()
  const group = useRef<THREE.Group>(null!)
  const wheel = useRef<THREE.Group>(null!)
  const label = useRef<HTMLSpanElement>(null)
  useHideBehindSun(label, group)
  const size = 900 * UNITS_PER_METER
  const moved = useSite(group, {
    id: ELEVATOR_ID,
    radius: size * 1.5,
    zoom: { start: size * 10, full: size * 4 },
    notice: { distance: size * 7, text: SF_TEXT.elevatorFound },
  })
  const parts = useMemo(
    () => ({
      wheel: new THREE.TorusGeometry(750, 45, 16, 96),
      spoke: new THREE.CylinderGeometry(10, 10, 700, 6),
      hub: new THREE.CylinderGeometry(160, 160, 420, 24),
      ring: new THREE.TorusGeometry(160, 14, 8, 48),
      panel: new THREE.BoxGeometry(900, 4, 220),
      metal: new THREE.MeshStandardMaterial({ color: '#c3c7cf', metalness: 0.5, roughness: 0.4, emissive: '#2a2d33', emissiveIntensity: 0.5 }),
      panelMat: new THREE.MeshStandardMaterial({ color: '#1d2b4a', metalness: 0.4, roughness: 0.3, emissive: '#0c1630', emissiveIntensity: 0.5 }),
      window: new THREE.TorusGeometry(750, 47, 4, 96, Math.PI * 2),
      windowMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.1, 0.7), toneMapped: false, wireframe: true }),
    }),
    [],
  )
  useFrame((_, dt) => {
    // 回る輪（中で重さを感じる）
    wheel.current.rotation.y += Math.min(dt, 0.05) * 0.1
    moved()
  })
  return (
    <group ref={group} position={[STATION_R, 0, 0]}>
      {/* 駅：ケーブル（ここでは +X）の通る筒と、まわりを回る輪 */}
      <group scale={UNITS_PER_METER} rotation={[0, 0, Math.PI / 2]}>
        <mesh geometry={parts.hub} material={parts.metal} />
        <mesh geometry={parts.ring} material={parts.metal} position={[0, 210, 0]} rotation={[Math.PI / 2, 0, 0]} />
        <mesh geometry={parts.ring} material={parts.metal} position={[0, -210, 0]} rotation={[Math.PI / 2, 0, 0]} />
        <group ref={wheel}>
          <mesh geometry={parts.wheel} material={parts.metal} rotation={[Math.PI / 2, 0, 0]} />
          <mesh geometry={parts.window} material={parts.windowMat} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.3]} />
          {[0, 1, 2, 3].map((k) => (
            <mesh key={k} geometry={parts.spoke} material={parts.metal} position={[Math.cos((k * Math.PI) / 2) * 450, 0, Math.sin((k * Math.PI) / 2) * 450]} rotation={[0, -(k * Math.PI) / 2, Math.PI / 2]} />
          ))}
        </group>
        <mesh geometry={parts.panel} material={parts.panelMat} position={[0, 0, 1300]} />
        <mesh geometry={parts.panel} material={parts.panelMat} position={[0, 0, -1300]} />
      </group>
      <Html position={[0, size * 2, 0]} center className="label" zIndexRange={LABEL_Z}>
        <span ref={label} onClick={() => useStore.getState().setTarget(ELEVATOR_ID)}>
          {elevatorName()}
        </span>
      </Html>
    </group>
  )
}

/** ケーブルを上り下りする昇降機 */
function Climbers({ parts }: { parts: { car: THREE.BufferGeometry; carMat: THREE.Material; light: THREE.BufferGeometry; lightMat: THREE.Material } }) {
  const cars = useRef<THREE.Group[]>([])
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    cars.current.forEach((c, i) => {
      // 往復（本物は静止軌道まで数日かかる。ここでは1分ほど）
      const k = 0.5 - 0.5 * Math.cos(t * 0.05 + i * 2.1)
      c.position.x = EARTH_R + 0.02 + k * (STATION_R - EARTH_R - 0.05)
    })
  })
  return (
    <>
      {[0, 1, 2].map((i) => (
        <group
          key={i}
          ref={(g: THREE.Group | null) => {
            if (g) cars.current[i] = g
          }}
        >
          <group scale={UNITS_PER_METER} rotation={[0, 0, Math.PI / 2]}>
            <mesh geometry={parts.car} material={parts.carMat} />
            <mesh geometry={parts.light} material={parts.lightMat} position={[0, 70, 0]} />
          </group>
        </group>
      ))}
    </>
  )
}

/**
 * 地球の自転する部分の中に置く（地球の模様と一緒に回る）。
 * 自転する部分（PlanetBody の earth-spin）が見つかるまでは何も描かない
 */
export function SpaceElevator() {
  const { scene } = useThree()
  const [spin, setSpin] = useState<THREE.Object3D | null>(null)
  useEffect(() => {
    const find = () => setSpin(scene.getObjectByName('earth-spin') ?? null)
    find()
    const id = window.setInterval(() => !spin && find(), 500)
    return () => window.clearInterval(id)
  }, [scene, spin])
  const parts = useMemo(() => {
    const cableLength = TOP_R - EARTH_R
    const rock = new THREE.InstancedMesh(asteroidGeometry(rng(31), 4), asteroidMaterial(), 1)
    rock.setMatrixAt(0, new THREE.Matrix4().makeScale(1, 0.8, 0.9).multiplyScalar(1400 * UNITS_PER_METER).setPosition(TOP_R + 1000 * UNITS_PER_METER, 0, 0))
    rock.setColorAt(0, new THREE.Color('#857a6e'))
    return {
      cableLength,
      // 本物は幅1mほどのリボン。遠くからも見えるよう、細い線も重ねる
      cable: new THREE.CylinderGeometry(0.00015, 0.00015, cableLength, 6),
      cableMat: new THREE.MeshBasicMaterial({ color: '#9fb4cc' }),
      line: new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(EARTH_R, 0, 0), new THREE.Vector3(TOP_R, 0, 0)]),
      lineMat: new THREE.LineBasicMaterial({ color: '#7d93ad', transparent: true, opacity: 0.7 }),
      rock,
      platform: new THREE.CylinderGeometry(1500, 1700, 300, 32),
      platformMat: new THREE.MeshStandardMaterial({ color: '#9aa0a8', metalness: 0.4, roughness: 0.6 }),
      car: new THREE.BoxGeometry(80, 120, 80),
      carMat: new THREE.MeshStandardMaterial({ color: '#d6d9de', metalness: 0.4, roughness: 0.4, emissive: '#333', emissiveIntensity: 0.6 }),
      light: new THREE.SphereGeometry(20, 8, 8),
      lightMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.6, 0.3), toneMapped: false }),
    }
  }, [])
  if (!spin) return null
  // 自転する部分の座標：+Y が自転の軸、赤道は XZ 面。経度の向きにケーブルを伸ばす（ここでの +X）
  const lon = (LONGITUDE * Math.PI) / 180
  return createPortal(
    <group rotation={[0, Math.PI + lon, 0]}>
      <mesh geometry={parts.cable} material={parts.cableMat} position={[EARTH_R + parts.cableLength / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} />
      <lineSegments geometry={parts.line} material={parts.lineMat} />
      <primitive object={parts.rock} />
      <mesh geometry={parts.platform} material={parts.platformMat} position={[EARTH_R + 0.0005, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={UNITS_PER_METER} />
      <Climbers parts={parts} />
      <Station />
    </group>,
    spin,
  )
}
