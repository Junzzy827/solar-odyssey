import * as THREE from 'three'

// シャトルのロボットアーム（RMS）の角度の計算。座標はオービターの glb と同じ（1 単位 = 1 m、前が -Z、上が +Y）。
// 腕の作り（tools/blender/build_shuttle.py）：rms_yaw（肩の左右、rotation.y）→ rms_pitch（肩の上下、rotation.x。負で起きる）
//   → rms_elbow（上腕の先 6.4 m、rotation.x。正で下へ曲がる）→ rms_wrist（下腕の先 7.1 m、rotation.x）→ rms_ee（先の筒、rotation.y、長さ 1.1 m）

/** アームの肩（左の縁） */
export const SHOULDER = new THREE.Vector3(-2.45, 2.25, 1.2)
/** 上腕・下腕・手首から先（つかむ輪の中心まで）の長さ。全長およそ 15 m（tools/shuttle/FACTS.md 3b） */
export const L1 = 6.4
export const LW = 7.1
export const EE = 1.1
/** ハッブルを立てる台（底の中心） */
export const BERTH = new THREE.Vector3(0, 1.9, 15.2)
/** アームの先が動ける箱（荷物室の上。乗員室や扉にめりこまないように） */
export const AIM_BOX = new THREE.Box3(new THREE.Vector3(-3.2, 2.7, 5), new THREE.Vector3(3.2, 13, 17))

export type ArmAngles = { yaw: number; pitch: number; elbow: number; wrist: number; wristYaw: number }

/**
 * 先（つかむ輪の中心）を T に置く角度。手首から先は、いつも真後ろ（+Z ＝ つかむ所の板）に水平に向ける。
 * 肩の左右で手首の方を向き、その縦の面の中で上腕と下腕の三角形を解く（ひじは上に出す）。届かない所は、届く所まで伸ばす。
 */
export function solveArm(T: THREE.Vector3, out: ArmAngles) {
  const dx = T.x - SHOULDER.x
  const dz = T.z - EE - SHOULDER.z
  out.yaw = Math.atan2(dx, dz)
  out.wristYaw = -out.yaw
  const h = Math.hypot(dx, dz)
  const v = T.y - SHOULDER.y
  const D = THREE.MathUtils.clamp(Math.hypot(h, v), Math.abs(L1 - LW) + 0.05, L1 + LW - 0.01)
  const phi = Math.atan2(v, h)
  const beta = Math.acos(THREE.MathUtils.clamp((L1 * L1 + D * D - LW * LW) / (2 * L1 * D), -1, 1))
  const gamma = Math.acos(THREE.MathUtils.clamp((L1 * L1 + LW * LW - D * D) / (2 * L1 * LW), -1, 1))
  out.pitch = -(phi + beta)
  out.elbow = Math.PI - gamma
  out.wrist = -(out.pitch + out.elbow)
  return out
}

/**
 * 狙いを、届く所・荷物室の上の箱の中に収める。grip（ハッブルの底の中心から見た、つかむ所の位置）があれば、
 * ハッブルを持っているので、ハッブルが台より下へ行かず、下ほど台の真上へ寄るように（荷物室の壁にめりこまない）
 */
export function clampAim(T: THREE.Vector3, grip: THREE.Vector3 | null) {
  AIM_BOX.clampPoint(T, T)
  if (grip) {
    const hx = T.x - grip.x - BERTH.x
    const hz = T.z - grip.z - BERTH.z
    const hy = Math.max(0, T.y - grip.y - BERTH.y)
    T.y = BERTH.y + grip.y + hy
    const r = 0.3 + 1.5 * hy
    const d = Math.hypot(hx, hz)
    if (d > r) {
      T.x = BERTH.x + grip.x + (hx * r) / d
      T.z = BERTH.z + grip.z + (hz * r) / d
    }
  }
  // 手首が届く長さより遠ければ、肩の方へ引き戻す（手首から先は真後ろ向きなので、手首の位置で考える）
  const dx = T.x - SHOULDER.x
  const dy = T.y - SHOULDER.y
  const dz = T.z - EE - SHOULDER.z
  const D = Math.hypot(dx, dy, dz)
  const max = L1 + LW - 0.05
  if (D > max) {
    const k = max / D
    T.set(SHOULDER.x + dx * k, SHOULDER.y + dy * k, SHOULDER.z + dz * k + EE)
  }
  return T
}
