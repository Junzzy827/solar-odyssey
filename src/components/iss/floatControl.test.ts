import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { FloatController } from './floatControl'

const run = (c: FloatController, seconds: number, move = { x: 0, y: 0, z: 0 }) => {
  for (let t = 0; t < seconds; t += 1 / 60) c.update(1 / 60, move)
}

describe('FloatController', () => {
  it('前へ押すと −Z へ進み、手を放すとゆっくり止まる', () => {
    const c = new FloatController()
    run(c, 1, { x: 0, y: 0, z: 1 })
    expect(c.pos.z).toBeLessThan(-0.3)
    expect(Math.abs(c.pos.x)).toBeLessThan(1e-6)
    const v = c.vel.length()
    run(c, 1)
    // 1 秒で drag 0.45 ぶん減る（長くすべる）
    expect(c.vel.length()).toBeGreaterThan(v * 0.5)
    expect(c.vel.length()).toBeLessThan(v)
    run(c, 30)
    expect(c.vel.length()).toBe(0)
  })

  it('いちばん速い速さをこえない', () => {
    const c = new FloatController({ maxSpeed: 1 })
    run(c, 10, { x: 1, y: 1, z: 1 })
    expect(c.vel.length()).toBeLessThanOrEqual(1 + 1e-9)
  })

  it('壁をすり抜けない（速くても）', () => {
    // z = −2 にある大きな壁
    const wall = new THREE.PlaneGeometry(20, 20).translate(0, 0, -2)
    const c = new FloatController({ radius: 0.3, maxSpeed: 20, accel: 200 })
    c.setCollider(new MeshBVH(wall))
    run(c, 2, { x: 0, y: 0, z: 1 })
    expect(c.pos.z).toBeGreaterThan(-2 + 0.29)
    expect(c.touching).toBe(true)
  })

  it('箱の外へ出ない', () => {
    const c = new FloatController()
    c.setBounds(new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)))
    run(c, 5, { x: 1, y: 0, z: 0 })
    expect(c.pos.x).toBeLessThanOrEqual(1)
  })

  it('宙返りは 1 回だけで、終わると元の向き', () => {
    const c = new FloatController({ flipSeconds: 1 })
    const q0 = c.quaternion(new THREE.Quaternion()).clone()
    c.flip()
    run(c, 0.5)
    expect(c.quaternion(new THREE.Quaternion()).angleTo(q0)).toBeGreaterThan(1)
    run(c, 0.6)
    expect(c.flipT).toBe(-1)
    expect(c.quaternion(new THREE.Quaternion()).angleTo(q0)).toBeLessThan(1e-6)
  })
})
