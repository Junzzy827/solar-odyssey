import * as THREE from 'three'
import type { MeshBVH } from 'three-mesh-bvh'

// 無重力でふわふわ浮かぶ一人称の動き（宇宙ステーション・スペースシャトルの中で共通に使う）。
// ほかの機能のファイルは読まない（あとで 2 つの場面で同じものを使えるように、ここだけで完結させる）。
//
// - 押すと、ゆっくり速くなり（加速 ACCEL）、手を放すと長くすべって、少しずつ止まる（DRAG：1 秒あたりの減り方）。
//   宇宙では空気の抵抗はほとんど無いが、ずっと止まらないと酔うので、ゆるい減速を入れている
// - 壁（本物のモジュールの形）とは、半径 RADIUS の球で当たり判定（three-mesh-bvh）。めりこんだら外へ押し出し、
//   壁に向かう速さだけ消して、壁にそってすべる。動きは小さな刻みに分けて、すり抜けない
// - 念のため、箱（bounds）の外へは出ない
// - 上下はいつも同じ（体を横に回さない：酔い止め）。宙返りのボタンで、ゆっくり 1 回だけ前に回る

export type FloatOptions = {
  /** 体の大きさ（当たり判定の球の半径 m） */
  radius?: number
  /** 押したときの加速（m/s²） */
  accel?: number
  /** いちばん速い速さ（m/s） */
  maxSpeed?: number
  /** 手を放したときの減り方（1 秒あたり。0.4 なら 2.5 秒で約 1/e） */
  drag?: number
  /** 壁に当たったときの、はね返り（0 = すべるだけ） */
  bounce?: number
  /** 宙返りにかかる秒数 */
  flipSeconds?: number
}

/** 動かす向き：x 右、y 上、z 前（それぞれ −1〜1）。見ている向きに対して */
export type FloatMove = { x: number; y: number; z: number }

const _v = new THREE.Vector3()
const _d = new THREE.Vector3()
const _p = new THREE.Vector3()
const _n = new THREE.Vector3()
const _inv = new THREE.Matrix4()
const _sphere = new THREE.Sphere()
const _tri = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _qf = new THREE.Quaternion()
const _e = new THREE.Euler(0, 0, 0, 'YXZ')
const X = new THREE.Vector3(1, 0, 0)

export class FloatController {
  readonly pos = new THREE.Vector3()
  readonly vel = new THREE.Vector3()
  /** 左右の向き（ラジアン、0 で −Z を見る）と、上下の向き */
  yaw = 0
  pitch = 0
  /** 宙返りの進み（0〜1、回っていなければ −1） */
  flipT = -1
  /** 最後のフレームで壁に触れていたか（音や、ゆれの合図に） */
  touching = false
  radius: number
  accel: number
  maxSpeed: number
  drag: number
  bounce: number
  flipSeconds: number
  private bvh: MeshBVH | null = null
  private toLocal = new THREE.Matrix4()
  private toWorld = new THREE.Matrix4()
  private scale = 1
  private bounds: THREE.Box3 | null = null

  constructor(opt: FloatOptions = {}) {
    this.radius = opt.radius ?? 0.3
    this.accel = opt.accel ?? 1.1
    this.maxSpeed = opt.maxSpeed ?? 1.25
    this.drag = opt.drag ?? 0.45
    this.bounce = opt.bounce ?? 0.15
    this.flipSeconds = opt.flipSeconds ?? 2.6
  }

  /** 当たり判定の形。matrixWorld はその形の置き場所（ふつうは単位行列） */
  setCollider(bvh: MeshBVH | null, matrixWorld?: THREE.Matrix4) {
    this.bvh = bvh
    this.toWorld.copy(matrixWorld ?? _inv.identity())
    this.toLocal.copy(this.toWorld).invert()
    this.scale = new THREE.Vector3().setFromMatrixScale(this.toWorld).x || 1
  }

  /** 出られない箱（体の中心が動ける範囲） */
  setBounds(box: THREE.Box3 | null) {
    this.bounds = box
  }

  /** 見回す（ラジアン） */
  look(dYaw: number, dPitch: number) {
    this.yaw -= dYaw
    this.pitch = THREE.MathUtils.clamp(this.pitch - dPitch, -1.45, 1.45)
  }

  /** 宙返りを始める（回っている間は何もしない） */
  flip() {
    if (this.flipT < 0) this.flipT = 0
  }

  /** 外から押される（物にぶつかった・ペダルをこいだ など） */
  push(dv: THREE.Vector3) {
    this.vel.add(dv)
  }

  /** 見ている向き（カメラの回転） */
  quaternion(out: THREE.Quaternion) {
    _e.set(this.pitch, this.yaw, 0, 'YXZ')
    out.setFromEuler(_e)
    if (this.flipT >= 0) {
      // ゆっくり始まり、ゆっくり終わる 1 回転（前へ）
      const s = this.flipT
      const a = (s - Math.sin(s * Math.PI * 2) / (Math.PI * 2)) * Math.PI * 2
      out.multiply(_qf.setFromAxisAngle(X, a))
    }
    return out
  }

  /** 1 フレーム進める。move は見ている向きに対する押す向き */
  update(dt: number, move: FloatMove) {
    dt = Math.min(dt, 0.1)
    if (this.flipT >= 0) {
      this.flipT += dt / this.flipSeconds
      if (this.flipT >= 1) this.flipT = -1
    }
    // 押す向き：左右・前後は見ている水平の向き＋上下の傾き、上下はいつも天井の向き
    _e.set(this.pitch, this.yaw, 0, 'YXZ')
    _q.setFromEuler(_e)
    _d.set(move.x, 0, -move.z).applyQuaternion(_q)
    _d.y += move.y
    const len = _d.length()
    if (len > 1) _d.divideScalar(len)
    if (len > 0.01) {
      this.vel.addScaledVector(_d, this.accel * dt)
    } else {
      this.vel.multiplyScalar(Math.exp(-this.drag * dt))
    }
    const sp = this.vel.length()
    if (sp > this.maxSpeed) this.vel.multiplyScalar(this.maxSpeed / sp)
    if (sp < 0.003 && len < 0.01) this.vel.set(0, 0, 0)

    // 小さな刻みで動かして、そのたびに壁から押し出す
    const step = this.vel.length() * dt
    const n = Math.max(1, Math.ceil(step / (this.radius * 0.4)))
    this.touching = false
    for (let i = 0; i < n; i++) {
      this.pos.addScaledVector(this.vel, dt / n)
      this.collide()
    }
    if (this.bounds) {
      const b = this.bounds
      for (const k of ['x', 'y', 'z'] as const) {
        if (this.pos[k] < b.min[k]) {
          this.pos[k] = b.min[k]
          if (this.vel[k] < 0) this.vel[k] *= -this.bounce
        } else if (this.pos[k] > b.max[k]) {
          this.pos[k] = b.max[k]
          if (this.vel[k] > 0) this.vel[k] *= -this.bounce
        }
      }
    }
  }

  /** 壁から押し出す（いちばん近い面の点から、半径ぶん離す）。壁へ向かう速さは消す */
  private collide() {
    const bvh = this.bvh
    if (!bvh) return
    for (let iter = 0; iter < 4; iter++) {
      _p.copy(this.pos).applyMatrix4(this.toLocal)
      const r = this.radius / this.scale
      _sphere.set(_p, r)
      let best = Infinity
      bvh.shapecast({
        intersectsBounds: (box) => box.intersectsSphere(_sphere),
        intersectsTriangle: (tri) => {
          tri.closestPointToPoint(_p, _tri)
          const d = _tri.distanceToSquared(_p)
          if (d < r * r && d < best) {
            best = d
            _n.copy(_tri)
          }
          return false
        },
      })
      if (best === Infinity) return
      this.touching = true
      // 押し出す向き：面の点 → 体の中心
      const d = Math.sqrt(best)
      _v.copy(_p).sub(_n)
      if (d < 1e-6) _v.set(0, 1, 0)
      else _v.divideScalar(d)
      _p.addScaledVector(_v, r - d + 1e-4)
      this.pos.copy(_p).applyMatrix4(this.toWorld)
      // 壁へ向かう速さを消し（少しだけはね返す）、壁にそってすべる
      _v.transformDirection(this.toWorld)
      const into = this.vel.dot(_v)
      if (into < 0) this.vel.addScaledVector(_v, -into * (1 + this.bounce))
    }
  }

  /** 体の中心から見て、近くの壁までの距離（当たり判定の形がないときは Infinity） */
  clearance(at: THREE.Vector3, max = 2) {
    const bvh = this.bvh
    if (!bvh) return Infinity
    _p.copy(at).applyMatrix4(this.toLocal)
    const hit = bvh.closestPointToPoint(_p, undefined, 0, max / this.scale)
    return hit ? hit.distance * this.scale : Infinity
  }

  /** カメラに置く */
  apply(camera: THREE.Camera) {
    camera.position.copy(this.pos)
    this.quaternion(camera.quaternion)
  }
}
