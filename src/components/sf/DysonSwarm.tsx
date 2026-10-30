import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useLayout } from '../../state/useLayout'
import { useStore } from '../../state/store'
import { DYSON_ID, SF_TEXT, dysonName } from '../../data/sf'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'
import { useSite } from './useSite'

// ダイソン・スウォーム（オリジナルのデザイン）。太陽のまわりの傾いた輪の上に、何千もの集光衛星が並んで回る。
// それぞれ金色の受光面を太陽へ向け、裏は青い放熱板。太陽をまだ一部しか囲んでいない「建設の途中」の姿。

/** 輪の数と、1つの輪の衛星の数 */
const RINGS = 7
const PER_RING = 900
/** 輪の半径：太陽の半径の何倍か（水星の軌道より内側におさめる） */
const RING_FROM = 1.7
const RING_TO = 2.6

const rng = (seed: number) => {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

type Ring = { speed: number; mesh: THREE.InstancedMesh; group: THREE.Group }

const m = new THREE.Matrix4()
const q = new THREE.Quaternion()
const p = new THREE.Vector3()
const s = new THREE.Vector3()
const toSun = new THREE.Vector3()
const Z = new THREE.Vector3(0, 0, 1)

export function DysonSwarm() {
  useLang()
  const layout = useLayout()
  const sun = layout.sun
  const marker = useRef<THREE.Group>(null!)
  const label = useRef<HTMLSpanElement>(null)
  useHideBehindSun(label, marker)
  const moved = useSite(marker, { id: DYSON_ID, radius: sun * 0.3, notice: { distance: sun * 1.2, text: SF_TEXT.dysonFound } })

  const parts = useMemo(() => {
    // 表（+Z、太陽向き）は金色の受光面、裏は青い放熱板。同じ形を2回描くため、形に2つのグループを作る
    const panel = new THREE.PlaneGeometry(1, 0.62)
    panel.clearGroups()
    panel.addGroup(0, Infinity, 0)
    panel.addGroup(0, Infinity, 1)
    const front = new THREE.MeshStandardMaterial({ color: '#e0b25a', metalness: 0.85, roughness: 0.25, emissive: '#5a3a10', emissiveIntensity: 0.35, side: THREE.FrontSide })
    const back = new THREE.MeshStandardMaterial({ color: '#203a6a', metalness: 0.5, roughness: 0.4, emissive: '#0a1a3a', emissiveIntensity: 0.5, side: THREE.BackSide })
    return { panel, materials: [front, back] }
  }, [])
  useEffect(
    () => () => {
      parts.panel.dispose()
      parts.materials.forEach((mat) => mat.dispose())
    },
    [parts],
  )

  const rings = useMemo<Ring[]>(() => {
    const rand = rng(42)
    return Array.from({ length: RINGS }, (_, i) => {
      const radius = sun * (RING_FROM + ((RING_TO - RING_FROM) * i) / (RINGS - 1))
      const group = new THREE.Group()
      const mesh = new THREE.InstancedMesh(parts.panel, parts.materials, PER_RING)
      // 輪の一部（およそ6〜8割）だけに並べる。まだ建設の途中
      const arc = 0.6 + rand() * 0.25
      const start = rand() * Math.PI * 2
      for (let k = 0; k < PER_RING; k++) {
        const a = start + (k / PER_RING) * Math.PI * 2 * arc + (rand() - 0.5) * 0.004
        const r = radius * (1 + (rand() - 0.5) * 0.05)
        p.set(Math.cos(a) * r, (rand() - 0.5) * sun * 0.09, -Math.sin(a) * r)
        // 受光面（+Z）を太陽（輪の中心）へ向ける
        toSun.copy(p).negate().normalize()
        q.setFromUnitVectors(Z, toSun)
        const size = sun * (0.011 + rand() * 0.006)
        m.compose(p, q, s.set(size, size, size))
        mesh.setMatrixAt(k, m)
      }
      mesh.frustumCulled = false
      group.add(mesh)
      group.rotation.set((rand() - 0.5) * 1.2, rand() * Math.PI * 2, 0, 'YXZ')
      // 内側の輪ほど速い（ケプラーの法則：周期は半径の1.5乗に比例）
      return { speed: 0.02 * Math.pow(RING_FROM / (radius / sun), 1.5), mesh, group }
    })
  }, [sun, parts])
  useEffect(() => () => rings.forEach((r) => r.mesh.dispose()), [rings])

  useFrame((_, dt) => {
    const st = useStore.getState()
    // 時間を止めると止まる。速くしても、目で追える速さまでにする
    const k = st.timeScale > 0 ? Math.min(dt, 0.05) * Math.min(1, st.timeScale * 60) : 0
    rings.forEach((r) => (r.mesh.rotation.y += r.speed * k))
    // 目標の目印は、真ん中の輪の衛星のそば
    const mid = rings[Math.floor(RINGS / 2)]
    mid.mesh.updateMatrixWorld()
    mid.mesh.getMatrixAt(PER_RING >> 1, m)
    marker.current.position.setFromMatrixPosition(m).applyMatrix4(mid.mesh.matrixWorld)
    moved()
  })

  return (
    <>
      {rings.map((r, i) => (
        <primitive key={i} object={r.group} />
      ))}
      <group ref={marker}>
        <Html position={[0, sun * 0.15, 0]} center className="label" zIndexRange={LABEL_Z}>
          <span ref={label} onClick={() => useStore.getState().setTarget(DYSON_ID)}>
            {dysonName()}
          </span>
        </Html>
      </group>
    </>
  )
}
