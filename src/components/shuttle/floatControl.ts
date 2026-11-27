import * as THREE from 'three'
import { MeshBVH } from 'three-mesh-bvh'

// 無重力でただよう一人称の動き。ほかの機能のファイルは読まない（ISS など、別の乗り物の中でも使えるように）。
// ・押すとゆっくり速くなり、離してもしばらく滑る（空気の抵抗くらいの弱いブレーキ）。最高 約 1 m/s。
// ・頭を玉（半径 約 0.22 m）とみなして、壁の三角形から押し出す。ぶつかった向きの速さだけ消すので、壁に沿って滑る。
// ・速いときは細かく分けて動かすので、壁を通り抜けない。押し出しきれないときは前の場所へもどす（はまらない・外に出ない）。
// ・「上」はいつも部屋の上（+Y）。無重力でも、見回すたびに体が回ると酔うので、見回しは左右と上下だけ。

export type FloatInput = {
  /** 押す向き（カメラから見て）：x = 右、y = 上、z = 前。-1〜1 */
  move: THREE.Vector3
  /** 見回し（ラジアン）。読んだら 0 にもどす */
  lookX: number
  lookY: number
}

/** 穴を通るときの手助け：この円柱の中に入ると、中心へ少し寄せる（床の穴をすっと抜けられるように） */
export type Funnel = { x: number; z: number; r: number; y0: number; y1: number }

export type FloatOptions = {
  radius?: number
  /** 押したときの加速 m/s² */
  accel?: number
  /** 最高の速さ m/s */
  maxSpeed?: number
  /** 押していないときの減り方（1 秒で速さが何分の 1 になるか、の対数） */
  drag?: number
  /** 壁にぶつかったときに跳ね返る割合 */
  bounce?: number
}

export function createFloatInput(): FloatInput {
  return { move: new THREE.Vector3(), lookX: 0, lookY: 0 }
}

const _tmp = new THREE.Vector3()
const _cp = new THREE.Vector3()
const _push = new THREE.Vector3()
const _sphere = new THREE.Sphere()
const _box = new THREE.Box3()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler(0, 0, 0, 'YXZ')

export class FloatController {
  readonly pos = new THREE.Vector3()
  readonly vel = new THREE.Vector3()
  /** 左右の向き（ラジアン、0 = -Z を向く）と上下 */
  yaw = 0
  pitch = 0
  radius: number
  accel: number
  maxSpeed: number
  drag: number
  bounce: number
  funnels: Funnel[] = []
  /** 止める（見どころの席にいるあいだなど） */
  frozen = false
  /** 最後にぶつかった強さ（音や揺れに使える） */
  bump = 0
  private bvh: MeshBVH | null = null
  private inv = new THREE.Matrix4()
  private mat = new THREE.Matrix4()
  private safe = new THREE.Vector3()

  constructor(opt: FloatOptions = {}) {
    this.radius = opt.radius ?? 0.22
    this.accel = opt.accel ?? 0.9
    this.maxSpeed = opt.maxSpeed ?? 1.0
    this.drag = opt.drag ?? 0.55
    this.bounce = opt.bounce ?? 0.15
  }

  /** 当たり判定の形を渡す（見えない形。matrixWorld も使う） */
  setCollider(geometry: THREE.BufferGeometry, matrixWorld?: THREE.Matrix4) {
    this.bvh = new MeshBVH(geometry)
    this.mat.copy(matrixWorld ?? new THREE.Matrix4())
    this.inv.copy(this.mat).invert()
  }

  dispose() {
    this.bvh = null
  }

  /** 場所を置く（速さは 0 に） */
  place(p: THREE.Vector3, yaw = this.yaw, pitch = 0) {
    this.pos.copy(p)
    this.safe.copy(p)
    this.vel.set(0, 0, 0)
    this.yaw = yaw
    this.pitch = pitch
  }

  /** 1 フレーム進める */
  update(dt: number, input: FloatInput) {
    dt = Math.min(dt, 0.1)
    this.yaw -= input.lookX
    this.pitch = THREE.MathUtils.clamp(this.pitch - input.lookY, -1.45, 1.45)
    input.lookX = 0
    input.lookY = 0
    if (this.frozen) {
      this.vel.set(0, 0, 0)
      return
    }
    // 押す向きを部屋の向きに直す（左右・前後は見ている向き、上下はいつも部屋の上下）
    const m = input.move
    const fwd = _tmp.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch))
    _push.set(0, 0, 0).addScaledVector(fwd, m.z)
    _push.x += Math.cos(this.yaw) * m.x
    _push.z += -Math.sin(this.yaw) * m.x
    _push.y += m.y
    const pushing = _push.lengthSq() > 1e-4
    if (pushing) {
      if (_push.lengthSq() > 1) _push.normalize()
      this.vel.addScaledVector(_push, this.accel * dt)
    }
    // ブレーキ：押していないときは弱く、押しているときはもっと弱く（長く滑る）
    this.vel.multiplyScalar(Math.exp(-(pushing ? this.drag * 0.4 : this.drag) * dt))
    const sp = this.vel.length()
    if (sp > this.maxSpeed) this.vel.multiplyScalar(this.maxSpeed / sp)
    // 穴の手助け：上下に動いているときだけ、円柱の中心へ少し寄せる
    for (const f of this.funnels) {
      if (this.pos.y < f.y0 || this.pos.y > f.y1) continue
      const dx = f.x - this.pos.x
      const dz = f.z - this.pos.z
      const d = Math.hypot(dx, dz)
      if (d > f.r || d < 1e-3) continue
      const k = Math.min(1, Math.abs(this.vel.y) * 3) * 1.6 * dt
      this.vel.x += dx * k
      this.vel.z += dz * k
    }
    // 細かく分けて動かす（1 回に半径の 1/4 まで）
    const step = this.vel.length() * dt
    const n = Math.max(1, Math.ceil(step / (this.radius * 0.25)))
    this.bump = 0
    for (let i = 0; i < n; i++) {
      this.pos.addScaledVector(this.vel, dt / n)
      this.collide()
    }
  }

  /** カメラを今の場所と向きにする */
  apply(camera: THREE.Camera) {
    camera.position.copy(this.pos)
    _e.set(this.pitch, this.yaw, 0, 'YXZ')
    camera.quaternion.setFromEuler(_e)
  }

  /** 見ている向き（単位ベクトル） */
  forward(out: THREE.Vector3) {
    _q.setFromEuler(_e.set(this.pitch, this.yaw, 0, 'YXZ'))
    return out.set(0, 0, -1).applyQuaternion(_q)
  }

  /** 玉を三角形から押し出す。数回くり返してもだめなら、前の安全な場所へもどす */
  private collide() {
    const bvh = this.bvh
    if (!bvh) return
    const r = this.radius
    const local = _cp.copy(this.pos).applyMatrix4(this.inv)
    let deep = false
    for (let iter = 0; iter < 4; iter++) {
      _sphere.set(local, r)
      let moved = false
      bvh.shapecast({
        intersectsBounds: (box) => {
          _box.copy(box)
          return _box.intersectsSphere(_sphere)
        },
        intersectsTriangle: (tri) => {
          tri.closestPointToPoint(_sphere.center, _tmp)
          const d = _tmp.distanceTo(_sphere.center)
          if (d >= r) return false
          // 中心が三角形の上にぴったり乗っていると向きが決まらないので、面の向きを使う
          const nrm = d > 1e-5 ? _push.copy(_sphere.center).sub(_tmp).divideScalar(d) : tri.getNormal(_push)
          _sphere.center.addScaledVector(nrm, r - d)
          if (r - d > r * 0.8) deep = true
          // 壁へ向かう速さを消し（少しだけ跳ね返る）、沿う向きの速さは残す
          const vn = this.vel.dot(nrm)
          if (vn < 0) {
            this.vel.addScaledVector(nrm, -vn * (1 + this.bounce))
            this.bump = Math.max(this.bump, -vn)
          }
          moved = true
          return false
        },
      })
      local.copy(_sphere.center)
      if (!moved) break
    }
    this.pos.copy(local).applyMatrix4(this.mat)
    if (deep && this.stillInside()) {
      // はまりそう：前の安全な場所へ
      this.pos.copy(this.safe)
      this.vel.multiplyScalar(-0.2)
    } else {
      this.safe.copy(this.pos)
    }
  }

  /** 今の玉が三角形に深く食い込んでいるか */
  private stillInside() {
    const bvh = this.bvh
    if (!bvh) return false
    const local = _tmp.copy(this.pos).applyMatrix4(this.inv)
    const target = { point: new THREE.Vector3(), distance: Infinity, faceIndex: -1 }
    bvh.closestPointToPoint(local, target, 0, this.radius)
    return target.distance < this.radius * 0.5
  }
}
