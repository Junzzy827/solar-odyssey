import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { sim } from '../../state/registry'
import { useStore } from '../../state/store'
import { useLayout } from '../../state/useLayout'
import { FLEET_ID, SF_TEXT, UNITS_PER_METER, fleetName } from '../../data/sf'
import { EARTH_YEAR_SECONDS } from '../../data/scale'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'
import { useSite } from './useSite'

// 移民船団（オリジナルのデザイン）。街をまるごと載せた都市船が、護衛の補給船と並んで、
// 太陽から約1.8天文単位の道をゆっくり進む。都市船の背中には透明な丸屋根があり、中に森と街の灯が見える。
// 形は m で決め、UNITS_PER_METER で表示単位にする。

/** 太陽からの距離（天文単位）と、1周にかかる年数（ゆっくり見せるため、本物の軌道より遅い） */
const ORBIT_AU = 1.8
const LAP_YEARS = 6

type Member = { pos: [number, number, number]; length: number; city: boolean }

/** V 字の隊列（先頭が旗艦。+Z が進む向きのうしろ） */
const MEMBERS: Member[] = [
  { pos: [0, 0, 0], length: 8000, city: true },
  { pos: [-5200, 400, 6500], length: 5200, city: true },
  { pos: [5200, -300, 6500], length: 5200, city: true },
  { pos: [-9800, 200, 13000], length: 4200, city: true },
  { pos: [9800, 300, 13000], length: 4200, city: true },
  { pos: [-2600, 1600, 3500], length: 1400, city: false },
  { pos: [2600, -1500, 3500], length: 1400, city: false },
  { pos: [0, 1200, 11000], length: 1400, city: false },
]

const ahead = new THREE.Vector3()

function useParts() {
  return useMemo(() => {
    // 船体：細長い六角柱を、前をすぼめて
    const hull = new THREE.CylinderGeometry(0.06, 0.09, 1, 6, 1).rotateX(Math.PI / 2)
    const dome = new THREE.SphereGeometry(0.075, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 4.2)
    const city = new THREE.CircleGeometry(0.07, 32).rotateX(-Math.PI / 2).scale(1, 1, 4.1)
    // 街：緑の地面に、灯の点々
    const c = document.createElement('canvas')
    c.width = 128
    c.height = 512
    const g = c.getContext('2d')!
    g.fillStyle = '#2f5a35'
    g.fillRect(0, 0, 128, 512)
    let s = 5
    const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    for (let i = 0; i < 900; i++) {
      const v = rand()
      g.fillStyle = v < 0.5 ? '#ffd890' : v < 0.7 ? '#cfe8ff' : '#3d7a42'
      g.fillRect(rand() * 128, rand() * 512, 2 + rand() * 3, 2 + rand() * 3)
    }
    const cityMap = new THREE.CanvasTexture(c)
    cityMap.colorSpace = THREE.SRGBColorSpace
    return {
      hull,
      dome,
      city,
      engine: new THREE.CylinderGeometry(0.03, 0.04, 0.12, 12).rotateX(Math.PI / 2),
      glow: new THREE.CircleGeometry(0.03, 16),
      hullMat: new THREE.MeshStandardMaterial({ color: '#c9cdd6', metalness: 0.45, roughness: 0.45, emissive: '#252830', emissiveIntensity: 0.6 }),
      domeMat: new THREE.MeshStandardMaterial({ color: '#9fd0ff', metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.25, depthWrite: false }),
      cityMat: new THREE.MeshBasicMaterial({ map: cityMap }),
      glowMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 1.4, 2.6), toneMapped: false, side: THREE.DoubleSide }),
      lightMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.5, 0.3), toneMapped: false }),
      light: new THREE.SphereGeometry(0.006, 6, 6),
    }
  }, [])
}

/** 船1隻（長さ 1 で作り、length m に広げる。前は -Z） */
function CityShip({ member, parts }: { member: Member; parts: ReturnType<typeof useParts> }) {
  return (
    <group position={member.pos} scale={member.length}>
      <mesh geometry={parts.hull} material={parts.hullMat} />
      {member.city && (
        <>
          <mesh geometry={parts.city} material={parts.cityMat} position={[0, 0.06, 0.02]} />
          <mesh geometry={parts.dome} material={parts.domeMat} position={[0, 0.06, 0.02]} renderOrder={2} />
        </>
      )}
      {[-1, 1].map((x) => (
        <group key={x} position={[x * 0.11, -0.02, 0.42]}>
          <mesh geometry={parts.engine} material={parts.hullMat} />
          <mesh geometry={parts.glow} material={parts.glowMat} position={[0, 0, 0.065]} />
        </group>
      ))}
      <mesh geometry={parts.light} material={parts.lightMat} position={[0, 0.07, -0.5]} />
    </group>
  )
}

export function Fleet() {
  useLang()
  const group = useRef<THREE.Group>(null!)
  const label = useRef<HTMLSpanElement>(null)
  useHideBehindSun(label, group)
  const layout = useLayout()
  const size = 9000 * UNITS_PER_METER
  const moved = useSite(group, {
    id: FLEET_ID,
    radius: size,
    zoom: { start: size * 6, full: size * 2.5 },
    notice: { distance: size * 4, text: SF_TEXT.fleetFound },
  })
  const parts = useParts()

  useFrame(() => {
    const r = layout.au(ORBIT_AU)
    const a = 2.2 + (sim.time / (EARTH_YEAR_SECONDS * LAP_YEARS)) * Math.PI * 2
    const g = group.current
    g.position.set(Math.cos(a) * r, 1.5, -Math.sin(a) * r)
    // 進む向き（反時計回り）へ船首（-Z）を向ける
    ahead.set(-Math.sin(a), 0, -Math.cos(a)).multiplyScalar(-1).add(g.position)
    g.lookAt(ahead)
    moved()
  })

  return (
    <group ref={group}>
      <group scale={UNITS_PER_METER}>
        {MEMBERS.map((m, i) => (
          <CityShip key={i} member={m} parts={parts} />
        ))}
      </group>
      <Html position={[0, size * 0.6, 0]} center className="label" zIndexRange={LABEL_Z}>
        <span ref={label} onClick={() => useStore.getState().setTarget(FLEET_ID)}>
          {fleetName()}
        </span>
      </Html>
    </group>
  )
}
