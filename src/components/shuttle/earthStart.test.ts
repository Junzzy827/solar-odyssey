import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { earthStartQuaternion } from './earthStart'

const rad = THREE.MathUtils.degToRad
/** 球の上の点（緯度・経度）。経度 0 が +X、北極が +Y */
const onBall = (lat: number, lon: number) => new THREE.Vector3(Math.cos(rad(lat)) * Math.cos(rad(lon)), Math.sin(rad(lat)), -Math.cos(rad(lat)) * Math.sin(rad(lon)))

describe('シャトルの窓の外の地球の向き', () => {
  it('えらんだ点が真下（地球の中心から見て −Y）に来る', () => {
    const q = earthStartQuaternion(12, -40, rad(28.45))
    const p = onBall(12, -40).applyQuaternion(q)
    expect(p.x).toBeCloseTo(0, 6)
    expect(p.y).toBeCloseTo(-1, 6)
    expect(p.z).toBeCloseTo(0, 6)
  })
  it('機首（−Z）の先は東よりで、少し北へ上がる', () => {
    const q = earthStartQuaternion(12, -40, rad(28.45))
    // 機首の向きにある地面の点：真下から −Z へ少し進んだ所を、球の中の向きへ戻す
    const ahead = new THREE.Vector3(0, -1, -0.05).normalize().applyQuaternion(q.clone().invert())
    const lat = THREE.MathUtils.radToDeg(Math.asin(ahead.y))
    const lon = THREE.MathUtils.radToDeg(Math.atan2(-ahead.z, ahead.x))
    expect(lon).toBeGreaterThan(-40)
    expect(lat).toBeGreaterThan(12)
    expect(lon + 40).toBeGreaterThan(lat - 12)
  })
  it('軌道を 1 周しても、緯度は軌道の傾き（28.45°）をこえない', () => {
    const q = earthStartQuaternion(12, -40, rad(28.45))
    const inv = q.clone().invert()
    let top = 0
    for (let i = 0; i < 360; i++) {
      const a = rad(i)
      // 場面の X のまわりに回る軌道の上の点
      const p = new THREE.Vector3(0, -Math.cos(a), -Math.sin(a)).applyQuaternion(inv)
      top = Math.max(top, Math.abs(THREE.MathUtils.radToDeg(Math.asin(p.y))))
    }
    expect(top).toBeGreaterThan(28.3)
    expect(top).toBeLessThan(28.6)
  })
})
