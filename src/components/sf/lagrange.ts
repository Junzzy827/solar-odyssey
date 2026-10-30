import * as THREE from 'three'
import { bodies } from '../../state/registry'

// 地球と月のラグランジュ点。L4 は月の軌道の上で月より60度前、L5 は60度うしろ、L3 は地球をはさんで月の反対側、
// L2 は地球から見て月の向こう側（本物は月の約6万km先。距離を縮めて描いているので、月のすぐ先に置く）。
// 本物の月の軌道は少し傾いているので、月の動きから軌道の面の向き（法線）を求めて回す。

export type LagrangePoint = 'L2' | 'L3' | 'L4' | 'L5'

const earth = new THREE.Vector3()
const moon = new THREE.Vector3()
const rel = new THREE.Vector3()
const prevRel = new THREE.Vector3()
const cross = new THREE.Vector3()
const normal = new THREE.Vector3(0, 1, 0)
let hasPrev = false

/** 点の位置を out に入れる。地球か月がまだなければ false */
export function earthMoonPoint(point: LagrangePoint, out: THREE.Vector3) {
  const e = bodies.get('earth')
  const m = bodies.get('moon')
  if (!e || !m) return false
  e.object.getWorldPosition(earth)
  m.object.getWorldPosition(moon)
  rel.copy(moon).sub(earth)
  // 月の回る向き。月が動いたときだけ更新する（同じフレームに何度呼ばれても変わらない）
  if (hasPrev) {
    cross.crossVectors(prevRel, rel)
    if (cross.lengthSq() > 1e-12 * rel.lengthSq() ** 2) normal.copy(cross).normalize()
  }
  prevRel.copy(rel)
  hasPrev = true
  if (point === 'L2') {
    out.copy(moon).addScaledVector(rel.normalize(), m.radius * 2.2)
    return true
  }
  if (point === 'L3') rel.negate()
  else rel.applyAxisAngle(normal, point === 'L4' ? Math.PI / 3 : -Math.PI / 3)
  out.copy(earth).add(rel)
  return true
}
