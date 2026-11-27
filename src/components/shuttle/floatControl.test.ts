import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { FloatController, createFloatInput } from './floatControl'

// 無重力の動き：押すと進み、離すと滑ってゆっくり止まり、壁を通り抜けない
function room() {
  // 内側を向いた 2 m の箱（当たり判定は面の向きに関係なく、玉と三角形の近さで調べる）
  return new THREE.BoxGeometry(2, 2, 2).toNonIndexed()
}

describe('FloatController', () => {
  it('押すと進み、最高の速さを超えない', () => {
    const c = new FloatController({ maxSpeed: 1 })
    c.setCollider(room())
    c.place(new THREE.Vector3(0, 0, 0.6), 0, 0)
    const inp = createFloatInput()
    inp.move.set(0, 0, 1)
    for (let i = 0; i < 30; i++) c.update(1 / 30, inp)
    expect(c.pos.z).toBeLessThan(0.6)
    expect(c.vel.length()).toBeLessThanOrEqual(1.0001)
  })

  it('壁の前で止まり、外へ出ない', () => {
    const c = new FloatController({ radius: 0.22, maxSpeed: 3, accel: 20 })
    c.setCollider(room())
    c.place(new THREE.Vector3(0, 0, 0), 0, 0)
    const inp = createFloatInput()
    inp.move.set(0, 0, 1)
    for (let i = 0; i < 300; i++) c.update(1 / 30, inp)
    expect(c.pos.z).toBeGreaterThan(-1 + 0.2)
    expect(Math.abs(c.pos.x)).toBeLessThan(1)
  })

  it('離すと、滑りながらゆっくり止まる', () => {
    const c = new FloatController()
    c.setCollider(room())
    c.place(new THREE.Vector3(0, 0, 0), 0, 0)
    c.vel.set(0.3, 0, 0)
    const inp = createFloatInput()
    c.update(1 / 30, inp)
    const v1 = c.vel.length()
    for (let i = 0; i < 30; i++) c.update(1 / 30, inp)
    expect(c.vel.length()).toBeGreaterThan(0)
    expect(c.vel.length()).toBeLessThan(v1)
  })
})
