import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { asteroids, bodies, registerBody, rockBreaks } from '../../../state/registry'
import { ship, standoff, thrustFx } from '../../../state/flight'
import { proximity } from '../../../state/proximity'
import { useStore } from '../../../state/store'
import { shipScale } from '../../../state/zoom'
import { collect, deliver, usePioneer } from '../../../state/pioneer'
import { FIELD_ID, GAS_BAND, total, GAS_MIN_SPEED, GAS_RATE, GAS_TOO_DEEP, rockYield, type Resource } from '../../../data/pioneer'
import { DOCK_ID } from '../../../data/sf'
import { ui } from '../../../i18n'

// 開拓の 3D の部分（開拓で遊んでいるあいだだけ読み込む）：
// - 小惑星帯の「採掘場」の目印（ワープの行き先。帯の岩の 1 つにくっついて回る）
// - 砕いた岩から出る資源のかけら。船へ吸い寄せられて、積み荷に入る
// - 木星の雲のすぐ上をかすめて飛ぶと、ガスがたまる
// - 天の湊のそばに来ると、積み荷を倉庫に納める

const FIELD_RADIUS = 0.2
/** かけらの数の上限（古いものから消える） */
const MAX_ORE = 96
/** この距離（表示単位）より近いかけらは船へ吸い寄せる。チャージビームが岩を砕ける距離（約 30）より少し広い */
const ATTRACT = 40
/** かけらが残る秒数 */
const ORE_LIFE = 90
const COLORS: Record<Resource, THREE.Color> = {
  metal: new THREE.Color(3.2, 1.9, 0.6),
  ice: new THREE.Color(0.9, 2.4, 3.4),
  gas: new THREE.Color(2.6, 1.6, 2.8),
}

type Ore = { pos: THREE.Vector3; vel: THREE.Vector3; resource: Resource; amount: number; born: number }

const tmp = new THREE.Vector3()
const earthPos = new THREE.Vector3()
const dockPos = new THREE.Vector3()
const m4 = new THREE.Matrix4()
const q = new THREE.Quaternion()
const sc = new THREE.Vector3()

export function PioneerScene() {
  const field = useRef<THREE.Group>(null!)
  const ores = useRef<Ore[]>([])
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const state = useRef({ anchor: null as THREE.Vector3 | null, gasCarry: 0, gasNotice: false, deepNotice: false, spin: 0 })

  // 採掘場の目印を天体として登録する（ワープ・自動航行で行ける）
  useEffect(() => {
    return registerBody({
      id: FIELD_ID,
      get name() {
        return ui().pioneer.fieldName
      },
      radius: FIELD_RADIUS,
      object: field.current,
    })
  }, [])

  // 砕けた岩から、資源のかけらを出す
  useEffect(() => {
    const onBreak = (type: 0 | 1 | 2, size: number, at: THREE.Vector3) => {
      if (!usePioneer.getState().active) return
      const { resource, amount } = rockYield(type, size)
      // 1 個の岩から 1〜3 個のかけら（合計は amount）
      const n = Math.min(3, Math.max(1, Math.round(amount / 5)))
      const now = performance.now() / 1000
      for (let i = 0; i < n; i++) {
        const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.3 + Math.random() * 0.4)
        ores.current.push({ pos: at.clone().addScaledVector(v, size), vel: v, resource, amount: Math.round(amount / n), born: now })
      }
      if (ores.current.length > MAX_ORE) ores.current.splice(0, ores.current.length - MAX_ORE)
    }
    rockBreaks.add(onBreak)
    return () => {
      rockBreaks.delete(onBreak)
    }
  }, [])

  const geometry = useMemo(() => new THREE.OctahedronGeometry(1, 0), [])
  const material = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), [])

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1)
    const st = useStore.getState()
    const s = state.current

    // 目印の場所：小惑星帯の岩の 1 つ（帯と一緒に回る）。地球にいちばん近い向きの岩を、はじめに 1 回選ぶ
    const belt = asteroids.meshes[0]
    if (belt) {
      if (!s.anchor) {
        const e = bodies.get('earth')
        e?.object.getWorldPosition(earthPos)
        let best = -Infinity
        for (let i = 0; i < belt.count; i++) {
          belt.getMatrixAt(i, m4)
          tmp.setFromMatrixPosition(m4)
          if (tmp.lengthSq() === 0) continue
          // 地球の向きに近く、帯の上下のまん中に近い岩
          const score = (e ? tmp.clone().applyMatrix4(belt.matrixWorld).setY(0).normalize().dot(earthPos.clone().setY(0).normalize()) : 0) - Math.abs(tmp.y) * 0.2
          if (score > best) {
            best = score
            s.anchor = tmp.clone()
          }
        }
      }
      if (s.anchor) field.current.position.copy(s.anchor).applyMatrix4(belt.matrixWorld)
    }

    // かけら：漂い、近ければ船へ吸い寄せられる
    const now = performance.now() / 1000
    const unit = shipScale()
    const list = ores.current
    s.spin += dt * 2
    let w = 0
    for (let i = 0; i < list.length; i++) {
      const o = list[i]
      if (now - o.born > ORE_LIFE) continue
      tmp.copy(ship.position).sub(o.pos)
      const d = tmp.length()
      if (d < Math.max(unit * 1.5, 0.15) && st.warpPhase === 'idle') {
        collect(o.resource, o.amount)
        continue
      }
      if (d < ATTRACT && st.warpPhase === 'idle' && now - o.born > 0.6) {
        // 近いほど速く（遠くからでも数秒で届く）
        const pull = 4 + (ATTRACT - d) * 0.9
        o.vel.lerp(tmp.multiplyScalar(pull / d), Math.min(1, dt * 3))
      } else o.vel.multiplyScalar(1 - Math.min(1, dt * 0.5))
      o.pos.addScaledVector(o.vel, dt)
      list[w++] = o
    }
    list.length = w
    const im = mesh.current
    const size = Math.max(unit * 0.25, 0.03)
    for (let i = 0; i < w; i++) {
      const o = list[i]
      q.setFromAxisAngle(tmp.set(0.3, 1, 0.2).normalize(), s.spin + i)
      m4.compose(o.pos, q, sc.setScalar(size * (0.7 + Math.min(o.amount, 20) / 20)))
      im.setMatrixAt(i, m4)
      im.setColorAt(i, COLORS[o.resource])
    }
    im.count = w
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    im.visible = w > 0 && st.mode !== 'map'

    if (st.mode !== 'flight' || st.warpPhase !== 'idle') return

    // 木星の雲のすぐ上：速く飛んでいるあいだ、ガスがたまる
    if (proximity.id === 'jupiter' && proximity.radius > 0) {
      const h = proximity.altitude / proximity.radius
      if (h < GAS_TOO_DEEP) {
        if (!s.deepNotice) {
          s.deepNotice = true
          st.showToast(ui().pioneer.gasTooDeep)
        }
      } else if (h < GAS_BAND.high) {
        s.deepNotice = false
        if (thrustFx.speed >= GAS_MIN_SPEED) {
          if (!s.gasNotice) {
            s.gasNotice = true
            st.showToast(ui().pioneer.gasSkimming)
          }
          s.gasCarry += GAS_RATE * dt
          if (s.gasCarry >= 1) {
            const n = Math.floor(s.gasCarry)
            s.gasCarry -= n
            collect('gas', n)
          }
        }
      } else if (h > GAS_BAND.high * 4) {
        s.gasNotice = false
        s.deepNotice = false
      }
    }

    // 天の湊に着いたら（ワープで着く距離か、それより近く＝入港・係留）、積み荷を納める
    const dock = bodies.get(DOCK_ID)
    if (dock && total(usePioneer.getState().hold) > 0) {
      dock.object.getWorldPosition(dockPos)
      if (ship.position.distanceTo(dockPos) < standoff(dock.radius) * 1.25) deliver()
    }
  })

  return (
    <>
      <group ref={field} />
      <instancedMesh ref={mesh} args={[geometry, material, MAX_ORE]} frustumCulled={false} />
    </>
  )
}
