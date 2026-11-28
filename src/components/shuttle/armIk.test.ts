import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { AIM_BOX, BERTH, EE, L1, LW, SHOULDER, clampAim, solveArm, type ArmAngles } from './armIk'

/** glb と同じ親子で腕を組み、角度を入れて、先の位置と向きを three に計算させる */
function arm(a: ArmAngles) {
  const yaw = new THREE.Object3D()
  yaw.position.copy(SHOULDER)
  const pitch = new THREE.Object3D()
  const elbow = new THREE.Object3D()
  elbow.position.set(0, 0, L1)
  const wrist = new THREE.Object3D()
  wrist.position.set(0, 0, LW)
  const ee = new THREE.Object3D()
  yaw.add(pitch)
  pitch.add(elbow)
  elbow.add(wrist)
  wrist.add(ee)
  yaw.rotation.y = a.yaw
  pitch.rotation.x = a.pitch
  elbow.rotation.x = a.elbow
  wrist.rotation.x = a.wrist
  ee.rotation.y = a.wristYaw
  yaw.updateMatrixWorld(true)
  const tip = ee.localToWorld(new THREE.Vector3(0, 0, EE))
  const dir = ee.localToWorld(new THREE.Vector3(0, 0, EE + 1)).sub(tip)
  return { tip, dir, elbow: elbow.getWorldPosition(new THREE.Vector3()) }
}

const angles = (): ArmAngles => ({ yaw: 0, pitch: 0, elbow: 0, wrist: 0, wristYaw: 0 })
// つかむ所（ハッブルが荷物室の上に浮かんでいるとき）、立てたとき、起こした所、その間のいくつか
const targets = [
  [0.3, 8.4, 12.3],
  [0, 3.9, 12.3],
  [0.9, 7.0, 10.0],
  [-1.5, 5, 8],
  [2.5, 9, 12],
]

describe('shuttle arm IK', () => {
  it('puts the tip on the target, pointing straight aft and level', () => {
    for (const p of targets) {
      const T = new THREE.Vector3(...p)
      const a = solveArm(T, angles())
      const r = arm(a)
      expect(r.tip.distanceTo(T)).toBeLessThan(1e-6)
      expect(r.dir.z).toBeCloseTo(1, 6)
      expect(Math.abs(r.dir.y)).toBeLessThan(1e-6)
      // ひじは肩と手首を結ぶ線より上に出る
      expect(r.elbow.y).toBeGreaterThan(SHOULDER.y)
    }
  })

  it('the stowed arm (all zero) lies along the sill, about 15 m long', () => {
    const r = arm(angles())
    expect(r.tip.toArray()).toEqual([SHOULDER.x, SHOULDER.y, SHOULDER.z + L1 + LW + EE])
    expect(L1 + LW + EE).toBeCloseTo(14.6, 6)
  })

  it('pulls a target that is too far back within reach, and inside the bay box', () => {
    const T = clampAim(new THREE.Vector3(0, 30, 60), null)
    expect(AIM_BOX.containsPoint(T)).toBe(true)
    const a = solveArm(T, angles())
    expect(arm(a).tip.distanceTo(T)).toBeLessThan(1e-4)
  })

  it('keeps a held Hubble above the stand and over it when low', () => {
    const grip = new THREE.Vector3(0, 2, -2.9)
    // 台より下、横へずれた所を狙っても、ハッブルの底は台の高さで、真上から 0.3 m 以内
    const T = clampAim(new THREE.Vector3(2, 0, 10), grip)
    const hub = T.clone().sub(grip)
    expect(hub.y).toBeCloseTo(BERTH.y, 6)
    expect(Math.hypot(hub.x - BERTH.x, hub.z - BERTH.z)).toBeLessThanOrEqual(0.3 + 1e-6)
    // 台の上の、立てる所そのものはそのまま
    const at = clampAim(BERTH.clone().add(grip), grip)
    expect(at.distanceTo(BERTH.clone().add(grip))).toBeLessThan(1e-9)
  })
})
