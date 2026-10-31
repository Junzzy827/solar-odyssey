import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { colliders, ports, slowZones, type Port, type SlowZone } from '../../state/registry'
import { MAX_SPEED } from '../../state/throttle'
import { ship } from '../../state/flight'
import { useStore } from '../../state/store'

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

/** 壁から船の中心までの余白（m）。いちばん大きい船でも壁にめりこまない */
const MARGIN = 300
/** 奥の壁の手前で止まる位置（m） */
const BACK = 120 + MARGIN
/** ドックの中と口の前での最高速（m/s）。奥行きを約3秒で進む */
const DOCK_SPEED = DOCK_D / 3
/** 口の前の、速さを落とし始める距離（m） */
const SLOW_AHEAD = 3000

const Z = new THREE.Vector3(0, 0, 1)
const local = new THREE.Vector3()
const prev = new THREE.Vector3()
const inverse = new THREE.Matrix4()
const push = new THREE.Vector3()
const scaleV = new THREE.Vector3()

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

    // 壁の当たり判定：中に入ったら床・天井・横の壁・奥の壁で止まる。口からは出られる。
    // 前のフレームの位置（ドックの座標）から線で調べ、速くても壁をすり抜けない
    const last = { ok: false, at: new THREE.Vector3() }
    const hw = DOCK_W / 2 - MARGIN
    const hh = DOCK_H / 2 - MARGIN
    const within = (v: THREE.Vector3) => Math.abs(v.x) < DOCK_W / 2 && Math.abs(v.y) < DOCK_H / 2 && v.z > 0 && v.z < DOCK_D
    const collide = () => {
      if (!g.parent) return
      inverse.copy(g.matrixWorld).invert()
      local.copy(ship.position).applyMatrix4(inverse)
      prev.copy(last.ok ? last.at : local)
      let inside = within(prev)
      // 口の面を外から中へ横切ったか
      if (!inside && prev.z >= DOCK_D && local.z < DOCK_D) {
        const t = (prev.z - DOCK_D) / (prev.z - local.z)
        const x = prev.x + (local.x - prev.x) * t
        const y = prev.y + (local.y - prev.y) * t
        inside = Math.abs(x) < DOCK_W / 2 && Math.abs(y) < DOCK_H / 2
      }
      const warping = useStore.getState().warpPhase !== 'idle'
      if (inside && !warping) {
        const before = push.copy(local)
        local.x = THREE.MathUtils.clamp(local.x, -hw, hw)
        local.y = THREE.MathUtils.clamp(local.y, -hh, hh)
        if (local.z < BACK) local.z = BACK
        if (!before.equals(local)) {
          push.copy(local).applyMatrix4(g.matrixWorld).sub(ship.position)
          ship.position.add(push)
          // 壁へ向かう速さを消す
          if (push.lengthSq() > 0) {
            push.normalize()
            const into = ship.velocity.dot(push)
            if (into < 0) ship.velocity.addScaledVector(push, -into)
          }
        }
      }
      // 中と口の前では、ゆっくり
      const ahead = Math.abs(local.x) < DOCK_W && Math.abs(local.y) < DOCK_H && local.z > 0 && local.z < DOCK_D + SLOW_AHEAD
      if ((inside || ahead) && !warping) {
        const max = DOCK_SPEED * g.getWorldScale(scaleV).x
        const speed = ship.velocity.length()
        if (speed > max) ship.velocity.multiplyScalar(max / speed)
      }
      last.at.copy(local)
      last.ok = !warping
    }
    colliders.add(collide)
    // 近づくと操縦の最高速そのものを落とす（速さを後から縛るだけでは、1フレームで奥まで進んでしまう）
    g.updateWorldMatrix(true, false)
    const s = g.getWorldScale(scaleV).x
    const slow: SlowZone = { object: g, near: (DOCK_D + 500) * s, far: (DOCK_D + SLOW_AHEAD + 3000) * s, factor: Math.min(1, (DOCK_SPEED * s) / MAX_SPEED) }
    slowZones.add(slow)
    return () => {
      ports.delete(port)
      colliders.delete(collide)
      slowZones.delete(slow)
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
