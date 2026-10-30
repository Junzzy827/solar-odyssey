import * as THREE from 'three'
import { COLONY_LENGTH as L, COLONY_PORT as PORT, COLONY_RADIUS as R } from '../../data/sf'
import { Batch, place, seeded } from './batch'

// スペースコロニーの細かな部品（ColonyModel にのせる）。どのコロニーも同じ形なので、いちど作って使い回す。
// - 窓の帯の格子（長さに沿った桟と、円周の桟）
// - 外板の縦通材と、機器の箱・アンテナ・航行灯
// - 両端の丸屋根の放射状の骨、太陽側の観測ドーム、港の筒の補強の輪と格納庫の灯り
// - 農業区画の温室（光る屋根）
// - 鏡の枠と裏の骨組み

const DEG = Math.PI / 180
const CAP = 0.03
const stripAngle = (i: number) => i * 60 * DEG

/** 円筒の外板の上の点に、外向き（半径の向き）をそろえて置く行列 */
function onHull(angle: number, y: number, radius: number, size: [number, number, number]) {
  // 箱の y を長さの向き、z を外向きにする
  return place([Math.sin(angle) * radius, y, Math.cos(angle) * radius], [0, angle, 0], size)
}

export type ColonyDetail = {
  frame: THREE.BufferGeometry
  equip: THREE.BufferGeometry
  lights: THREE.BufferGeometry
  greenhouse: THREE.BufferGeometry
}

let cached: ColonyDetail | null = null

export function colonyDetail(mirrorAngle: number): ColonyDetail {
  if (cached) return cached
  const box = new THREE.BoxGeometry(1, 1, 1)
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 6)
  const ball = new THREE.SphereGeometry(1, 8, 6)
  const dome = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)
  const dish = new THREE.SphereGeometry(1, 12, 4, 0, Math.PI * 2, 0, 0.6)
  const frame = new Batch()
  const equip = new Batch()
  const lights = new Batch()
  const greenhouse = new Batch()
  const rand = seeded(41)

  // 窓の帯の格子
  const arc = new THREE.TorusGeometry(R * 1.001, 0.00055, 3, 16, 60 * DEG)
  for (const i of [1, 3, 5]) {
    const a = stripAngle(i)
    for (let d = -25; d <= 25; d += 5) {
      const big = d % 10 === 0
      frame.add(box, onHull(a + d * DEG, 0, R * 1.001, big ? [0.0016, L, 0.0016] : [0.0008, L, 0.0008]))
    }
    for (let k = 0; k <= 36; k++) frame.add(arc, place([0, -L / 2 + (k / 36) * L, 0], [0, a - 120 * DEG, 0]).multiply(place([0, 0, 0], [-Math.PI / 2, 0, 0])))
  }

  // 大地の帯の外板：縦通材、機器の箱、アンテナ、航行灯
  for (const i of [0, 2, 4]) {
    const a = stripAngle(i)
    for (const d of [-27, -18, -9, 0, 9, 18, 27]) frame.add(box, onHull(a + d * DEG, 0, R * 1.006, [0.0018, L, 0.0016]))
    for (let k = 0; k < 70; k++) {
      const ang = a + (rand() - 0.5) * 54 * DEG
      const y = (rand() - 0.5) * L * 0.94
      const h = 0.0012 + rand() * 0.003
      const w = 0.003 + rand() * 0.008
      const len = 0.006 + rand() * 0.03
      equip.add(box, onHull(ang, y, R * 1.006 + h / 2, [w, len, h]))
    }
    for (let k = 0; k < 4; k++) {
      const ang = a + (rand() - 0.5) * 40 * DEG
      const y = (rand() - 0.5) * L * 0.8
      const m = onHull(ang, y, R * 1.006, [1, 1, 1])
      equip.add(cyl, m.clone().multiply(place([0, 0, 0.006], [Math.PI / 2, 0, 0], [0.0007, 0.012, 0.0007])))
      equip.add(dish, m.clone().multiply(place([0, 0, 0.012], [-Math.PI / 2, 0, 0], [0.005, 0.003, 0.005])))
    }
    for (const d of [-29, 29]) for (let k = 0; k < 9; k++) lights.add(ball, onHull(a + d * DEG, -L / 2 + ((k + 0.5) / 9) * L, R * 1.008, [0.0011, 0.0011, 0.0011]))
  }

  // 太陽側の丸屋根：放射状の骨と、真ん中の観測ドーム・アンテナ
  const sunTop = L / 2 + CAP
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2
    const steps = 6
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps
      const t1 = (s + 1) / steps
      const p0 = new THREE.Vector2(R * Math.cos(t0 * Math.PI * 0.5), L / 2 + CAP * Math.sin(t0 * Math.PI * 0.5))
      const p1 = new THREE.Vector2(R * Math.cos(t1 * Math.PI * 0.5), L / 2 + CAP * Math.sin(t1 * Math.PI * 0.5))
      const mid = p0.clone().add(p1).multiplyScalar(0.5)
      const len = p0.distanceTo(p1)
      const tilt = Math.atan2(p1.y - p0.y, p1.x - p0.x)
      frame.add(box, place([Math.sin(a) * mid.x, mid.y + 0.0008, Math.cos(a) * mid.x], [0, a, 0]).multiply(place([0, 0, 0], [-tilt, 0, 0], [0.0016, 0.0014, len + 0.0005])))
    }
  }
  equip.add(dome, place([0, sunTop - 0.002, 0], [0, 0, 0], 0.014))
  equip.add(cyl, place([0, sunTop + 0.01, 0], [0, 0, 0], [0.0012, 0.03, 0.0012]))
  lights.add(ball, place([0, sunTop + 0.026, 0], [0, 0, 0], 0.0018))
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4
    equip.add(dish, place([Math.sin(a) * 0.045, sunTop - 0.004, Math.cos(a) * 0.045], [0, 0, 0], [0.008, 0.005, 0.008]))
  }

  // 港側の丸屋根の骨と、港の筒の補強・格納庫の灯り
  const portY = -L / 2 - CAP
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2
    const steps = 6
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps
      const t1 = (s + 1) / steps
      const p0 = new THREE.Vector2(PORT + (R - PORT) * Math.cos(t0 * Math.PI * 0.5), -L / 2 - CAP * Math.sin(t0 * Math.PI * 0.5))
      const p1 = new THREE.Vector2(PORT + (R - PORT) * Math.cos(t1 * Math.PI * 0.5), -L / 2 - CAP * Math.sin(t1 * Math.PI * 0.5))
      const mid = p0.clone().add(p1).multiplyScalar(0.5)
      const len = p0.distanceTo(p1)
      const tilt = Math.atan2(p1.y - p0.y, p1.x - p0.x)
      frame.add(box, place([Math.sin(a) * mid.x, mid.y - 0.0008, Math.cos(a) * mid.x], [0, a, 0]).multiply(place([0, 0, 0], [-tilt, 0, 0], [0.0016, 0.0014, len + 0.0005])))
    }
  }
  const tubeRing = new THREE.TorusGeometry(PORT * 1.03, 0.0012, 4, 48)
  for (let k = 0; k < 6; k++) frame.add(tubeRing, place([0, portY - 0.008 - k * 0.016, 0], [Math.PI / 2, 0, 0]))
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    // 格納庫の口（光る四角）と、そのまわりの枠
    lights.add(box, place([Math.sin(a) * PORT * 1.02, portY - 0.05, Math.cos(a) * PORT * 1.02], [0, a, 0], [0.008, 0.006, 0.001]))
    frame.add(box, place([Math.sin(a) * PORT * 1.03, portY - 0.05, Math.cos(a) * PORT * 1.03], [0, a, 0], [0.011, 0.009, 0.0006]))
  }

  // 農業区画の温室（輪のまわりに 24 棟。屋根が光る）
  const farmY = -L / 2 - CAP - 0.07
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2
    const m = place([Math.sin(a) * 0.26, farmY + 0.008, Math.cos(a) * 0.26], [0, a, 0])
    equip.add(box, m.clone().multiply(place([0, 0, 0], [0, 0, 0], [0.034, 0.012, 0.016])))
    greenhouse.add(cyl, m.clone().multiply(place([0, 0.006, 0], [0, 0, Math.PI / 2], [0.007, 0.032, 0.007])))
    lights.add(ball, m.clone().multiply(place([0.018, 0, 0], [0, 0, 0], 0.0012)))
  }

  // 鏡の枠と裏の骨組み（鏡の座標：板は XY、中心が y = L/2、裏が +z）
  const MW = R * 1.05
  for (const i of [1, 3, 5]) {
    frame.parent = place([0, 0, 0], [0, stripAngle(i), 0]).multiply(place([0, -L / 2, R * 1.04], [mirrorAngle, 0, 0]))
    for (const sx of [-1, 1]) frame.add(box, place([(sx * MW) / 2, L / 2, 0.001], [0, 0, 0], [0.0025, L, 0.0025]))
    for (let k = 0; k <= 8; k++) frame.add(box, place([0, (k / 8) * L, 0.0015], [0, 0, 0], [MW, 0.0018, 0.002]))
    // 裏のトラス（真ん中の背骨と、斜めの筋かい）
    frame.add(box, place([0, L / 2, 0.006], [0, 0, 0], [0.002, L, 0.002]))
    for (let k = 0; k < 8; k++) {
      const y0 = (k / 8) * L
      const y1 = ((k + 1) / 8) * L
      for (const sx of [-1, 1]) {
        const dx = (sx * MW) / 2
        const len = Math.hypot(dx, y1 - y0, 0.005)
        const mid: [number, number, number] = [dx / 2, (y0 + y1) / 2, 0.0035]
        frame.add(box, place(mid, [0, 0, -Math.atan2(dx, y1 - y0)], [0.0012, len, 0.0012]))
      }
    }
    // 支点の蝶番
    frame.add(cyl, place([0, 0, 0], [0, 0, Math.PI / 2], [0.004, MW * 0.9, 0.004]))
    frame.parent = new THREE.Matrix4()
  }

  cached = { frame: frame.build(), equip: equip.build(), lights: lights.build(), greenhouse: greenhouse.build() }
  for (const g of [box, cyl, ball, dome, dish, arc, tubeRing]) g.dispose()
  return cached
}
