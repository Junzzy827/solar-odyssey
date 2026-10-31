import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ports, type Port } from '../../state/registry'

// 小惑星基地に取りつけた宇宙船ドック（オリジナルのデザイン）。岩の表面から外へ張り出した骨組みの箱で、
// 外を向いた口から船がまっすぐ入る。中には照明の帯と、整備中の船が1隻。口の前には誘導灯が並ぶ。
// 周辺観察の「入港」で、口の手前まで自動で向かえる（ports に登録）。
// 寸法は m。置く側で、親の拡大を打ち消して m になるよう scale を渡す。向き：+Z が外（口の向き）

/** 箱の幅・高さ・奥行き（m）。いちばん大きい船も入る大きさ */
export const DOCK_W = 3200
export const DOCK_H = 1700
export const DOCK_D = 4200
/** 誘導灯の数と間隔（m） */
const LEADS = 8
const LEAD_GAP = 450
/** 入港の道順：口の前の待機点と、最後に止まる点（口からの距離 m） */
const APPROACH = 7000
const ENTRANCE = 700

const Z = new THREE.Vector3(0, 0, 1)
const local = new THREE.Vector3()

type Props = {
  /** この基地の id（周辺観察の「入港」で、この基地のドックを選ぶ） */
  owner: string
  /** 岩の表面の点（親の座標） */
  at: [number, number, number]
  /** 外向きの法線（親の座標） */
  normal: THREE.Vector3
  /** 親の座標の 1 が、この部品の何 m か（親の拡大を打ち消す） */
  scale: number
  /** 口のまわりで回す角度（箱の上を、だいたい上に向ける） */
  roll?: number
}

export function AsteroidDock({ owner, at, normal, scale, roll = 0 }: Props) {
  const group = useRef<THREE.Group>(null!)
  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion().setFromUnitVectors(Z, normal.clone().normalize())
    return q.multiply(new THREE.Quaternion().setFromAxisAngle(Z, roll))
  }, [normal, roll])

  const parts = useMemo(() => {
    // 岩の影の側でも形がわかるよう、ドックの照明に照らされた分を少し自分で光らせる
    const frame = new THREE.MeshStandardMaterial({ color: '#59606b', metalness: 0.6, roughness: 0.45, emissive: '#1c2026' })
    const panel = new THREE.MeshStandardMaterial({ color: '#8d939c', metalness: 0.45, roughness: 0.55, emissive: '#2a2e35' })
    const hull = new THREE.MeshStandardMaterial({ color: '#d7dbe2', metalness: 0.35, roughness: 0.4, emissive: '#4a4c50' })
    const strip = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.85, 1.5), toneMapped: false })
    const lead = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.4, 2.4), toneMapped: false })
    const leadDim = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.06, 0.2, 0.35), toneMapped: false })
    const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.3, 0.2), toneMapped: false })
    const green = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 2.2, 0.5), toneMapped: false })
    return {
      frame,
      panel,
      hull,
      strip,
      lead,
      leadDim,
      red,
      green,
      box: new THREE.BoxGeometry(1, 1, 1),
      lamp: new THREE.SphereGeometry(1, 8, 6),
      // 整備中の船：細長い胴と、前の円盤
      body: new THREE.CylinderGeometry(150, 190, 1500, 16).rotateX(Math.PI / 2),
      saucer: new THREE.CylinderGeometry(520, 520, 90, 32),
    }
  }, [])
  useEffect(
    () => () => {
      for (const v of Object.values(parts)) (v as THREE.Material | THREE.BufferGeometry).dispose()
    },
    [parts],
  )

  // 入港の道順：口の正面の待機点へ寄ってから、口の手前へまっすぐ進む
  useEffect(() => {
    const g = group.current
    const toWorld = (x: number, y: number, z: number, out: THREE.Vector3) => out.set(x, y, z).applyMatrix4(g.matrixWorld)
    const port: Port = {
      owner,
      object: g,
      next(from, out, inward) {
        g.updateWorldMatrix(true, false)
        local.copy(from).applyMatrix4(new THREE.Matrix4().copy(g.matrixWorld).invert())
        toWorld(0, 0, 0, inward)
        inward.sub(toWorld(0, 0, 1, out)).normalize()
        const lined = Math.hypot(local.x, local.y) < 250 && local.z > DOCK_D + ENTRANCE * 0.5
        if (lined) {
          toWorld(0, 0, DOCK_D + ENTRANCE, out)
          return true
        }
        toWorld(0, 0, DOCK_D + APPROACH, out)
        return false
      },
    }
    ports.add(port)
    return () => {
      ports.delete(port)
    }
  }, [owner])

  // 誘導灯：口へ向かって光が流れる
  const leads = useRef<THREE.Mesh[]>([])
  useFrame(({ clock }) => {
    const k = Math.floor(clock.getElapsedTime() * 6) % (LEADS + 3)
    leads.current.forEach((m, i) => {
      if (m) m.material = LEADS - 1 - (i >> 1) === k ? parts.lead : parts.leadDim
    })
  })

  const { box, frame, panel, strip } = parts
  const hw = DOCK_W / 2
  const hh = DOCK_H / 2
  const beam = 110
  // 骨組みの輪（口と途中と奥）
  const rings = [0, DOCK_D / 3, (DOCK_D * 2) / 3, DOCK_D]
  return (
    <group ref={group} position={at} quaternion={quaternion} scale={scale}>
      {/* 奥の壁と床・天井 */}
      <mesh geometry={box} material={panel} position={[0, 0, 60]} scale={[DOCK_W, DOCK_H, 120]} />
      <mesh geometry={box} material={panel} position={[0, -hh, DOCK_D / 2]} scale={[DOCK_W, 80, DOCK_D]} />
      <mesh geometry={box} material={panel} position={[0, hh, DOCK_D / 2]} scale={[DOCK_W, 80, DOCK_D]} />
      {/* 床と天井の照明の帯 */}
      {[-0.3, 0.3].map((x) => (
        <group key={x}>
          <mesh geometry={box} material={strip} position={[x * DOCK_W, -hh + 50, DOCK_D / 2]} scale={[40, 20, DOCK_D * 0.95]} />
          <mesh geometry={box} material={strip} position={[x * DOCK_W, hh - 50, DOCK_D / 2]} scale={[40, 20, DOCK_D * 0.95]} />
        </group>
      ))}
      {/* 骨組み：四隅の長い梁と、輪 */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sy) => <mesh key={`${sx}${sy}`} geometry={box} material={frame} position={[sx * hw, sy * hh, DOCK_D / 2]} scale={[beam, beam, DOCK_D]} />),
      )}
      {rings.map((z) => (
        <group key={z} position={[0, 0, z]}>
          <mesh geometry={box} material={frame} position={[-hw, 0, 0]} scale={[beam, DOCK_H, beam]} />
          <mesh geometry={box} material={frame} position={[hw, 0, 0]} scale={[beam, DOCK_H, beam]} />
          <mesh geometry={box} material={frame} position={[0, -hh, 0]} scale={[DOCK_W, beam, beam]} />
          <mesh geometry={box} material={frame} position={[0, hh, 0]} scale={[DOCK_W, beam, beam]} />
        </group>
      ))}
      {/* 横の壁の斜めの筋交い */}
      {[-1, 1].map((sx) =>
        [0, 1, 2].map((i) => (
          <mesh
            key={`${sx}${i}`}
            geometry={box}
            material={frame}
            position={[sx * hw, 0, (DOCK_D / 3) * (i + 0.5)]}
            rotation={[Math.atan2(DOCK_H, DOCK_D / 3) * (i % 2 ? 1 : -1), 0, 0]}
            scale={[60, 60, Math.hypot(DOCK_H, DOCK_D / 3)]}
          />
        )),
      )}
      {/* 口の縁の灯（左は赤、右は緑） */}
      {[-1, 1].map((sx) =>
        [-1, 0, 1].map((sy) => (
          <mesh key={`${sx}${sy}`} geometry={parts.lamp} material={sx < 0 ? parts.red : parts.green} position={[sx * (hw + 90), sy * hh * 0.9, DOCK_D]} scale={55} />
        )),
      )}
      {/* 口の前へのびる誘導灯 */}
      {Array.from({ length: LEADS * 2 }, (_, i) => (
        <mesh
          key={i}
          ref={(m: THREE.Mesh | null) => {
            if (m) leads.current[i] = m
          }}
          geometry={parts.lamp}
          material={parts.leadDim}
          position={[(i % 2 ? 1 : -1) * hw * 0.8, -hh - 120, DOCK_D + 300 + (i >> 1) * LEAD_GAP]}
          scale={45}
        />
      ))}
      {/* 整備中の船と、それを支える腕 */}
      <group position={[-hw * 0.45, -hh * 0.25, DOCK_D * 0.45]}>
        <mesh geometry={parts.body} material={parts.hull} />
        <mesh geometry={parts.saucer} material={parts.hull} position={[0, 160, 650]} />
        <mesh geometry={box} material={frame} position={[0, -380, -300]} scale={[90, 500, 90]} />
        <mesh geometry={box} material={frame} position={[0, -380, 400]} scale={[90, 500, 90]} />
      </group>
    </group>
  )
}
