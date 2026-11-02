import * as THREE from 'three'

// 船外の場面の外壁：乗っている船の背中のあたりを、メートル単位の大きな円筒の一部として描く。
// 円筒の軸は Z（前が -Z）。いちばん上（エアロックのあるところ）が y = 0。

export const HULL_R = 26
/** 外壁の長さの半分（m） */
export const HULL_HALF = 150
/** エアロック（背中のまんなか） */
export const AIRLOCK = { x: 0, z: 0, size: 1.5 }

/** 外壁の上の点と外向き：真上から右へ theta（ラジアン）回ったところ、前後 z */
export function hullPoint(theta: number, z: number, lift = 0, out?: THREE.Vector3) {
  const r = HULL_R + lift
  return (out ?? new THREE.Vector3()).set(r * Math.sin(theta), r * Math.cos(theta) - HULL_R, z)
}

export function hullNormal(theta: number, out?: THREE.Vector3) {
  return (out ?? new THREE.Vector3()).set(Math.sin(theta), Math.cos(theta), 0)
}

/** 点 p が外壁から r より近ければ、めりこんだ深さ（m、>0）を返し、normal に外向きを入れる */
export function hullClearance(p: THREE.Vector3, r: number, normal: THREE.Vector3) {
  if (Math.abs(p.z) > HULL_HALF) return 0
  const dx = p.x
  const dy = p.y + HULL_R
  const d = Math.hypot(dx, dy)
  const depth = HULL_R + r - d
  if (depth <= 0) return 0
  // エアロックの穴の中（発進・回収のとき）は当たらない
  if (Math.abs(p.x - AIRLOCK.x) < AIRLOCK.size / 2 && Math.abs(p.z - AIRLOCK.z) < AIRLOCK.size / 2 && p.y < 0.2) return 0
  normal.set(dx / d, dy / d, 0)
  return depth
}
