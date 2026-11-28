import * as THREE from 'three'
import type { MeshBVH } from 'three-mesh-bvh'

// 無重力でふわふわ浮かぶ一人称の動き（宇宙ステーション・スペースシャトルの中で共通に使う）。
// ほかの機能のファイルは読まない（あとで 2 つの場面で同じものを使えるように、ここだけで完結させる）。
//
// - 押すと、ゆっくり速くなり（加速 ACCEL）、手を放すと長くすべって、少しずつ止まる（DRAG：1 秒あたりの減り方）。
//   宇宙では空気の抵抗はほとんど無いが、ずっと止まらないと酔うので、ゆるい減速を入れている
// - 壁（本物のモジュールの形）とは、半径 RADIUS の球で当たり判定（three-mesh-bvh）。めりこんだら外へ押し出し、
//   壁に向かう速さだけ消して、壁にそってすべる。動きは小さな刻みに分けて、すり抜けない
// - 念のため、箱（bounds）の外へは出ない。箱をいくつも渡すと（setRegions）、どれかの箱の中にいる間だけ動ける
//   （部屋が何個もつながったステーション：外へ出たら、最後に中にいた場所へもどす）
// - 当たり判定の形はいくつでも持てる（setColliders：読みこんだ部屋ごとの形。ハッチの口をまたいで、となりの部屋の壁へ
//   そのまま滑って移る）
// - 口の手助け（funnels）：口の筒の中を、口の向きに進んでいるときだけ、真ん中へ少し寄せる（ふちに引っかからない）
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

/** 当たり判定の形と、その置き場所（ふつうは単位行列） */
export type FloatCollider = { bvh: MeshBVH; matrixWorld?: THREE.Matrix4 }

/** 口の手助け：center を通り axis の向きの筒（半径 r、前後 depth m）。この中を axis の向きに進むと、真ん中へ寄る */
export type FloatFunnel = { center: THREE.Vector3; axis: THREE.Vector3; r: number; depth: number }

type Col = { bvh: MeshBVH; toLocal: THREE.Matrix4; toWorld: THREE.Matrix4; scale: number }

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
const _best = new THREE.Vector3()
const _bestP = new THREE.Vector3()
const X = new THREE.Vector3(1, 0, 0)

function makeCol(bvh: MeshBVH, matrixWorld?: THREE.Matrix4): Col {
  const toWorld = new THREE.Matrix4().copy(matrixWorld ?? _inv.identity())
  return { bvh, toWorld, toLocal: toWorld.clone().invert(), scale: new THREE.Vector3().setFromMatrixScale(toWorld).x || 1 }
}

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
  /** 口の手助け（ハッチの口など） */
  funnels: FloatFunnel[] = []
  private cols: Col[] = []
  private bounds: THREE.Box3 | null = null
  private regions: THREE.Box3[] | null = null
  private readonly lastInside = new THREE.Vector3()
  private hasInside = false

  constructor(opt: FloatOptions = {}) {
    this.radius = opt.radius ?? 0.3
    this.accel = opt.accel ?? 1.1
    this.maxSpeed = opt.maxSpeed ?? 1.25
    this.drag = opt.drag ?? 0.45
    this.bounce = opt.bounce ?? 0.15
    this.flipSeconds = opt.flipSeconds ?? 2.6
  }

  /** 当たり判定の形（1 つ）。matrixWorld はその形の置き場所（ふつうは単位行列） */
  setCollider(bvh: MeshBVH | null, matrixWorld?: THREE.Matrix4) {
    this.cols = bvh ? [makeCol(bvh, matrixWorld)] : []
  }

  /** 当たり判定の形（いくつでも）。いちばん近い面から押し出す */
  setColliders(list: FloatCollider[]) {
    this.cols = list.map((c) => makeCol(c.bvh, c.matrixWorld))
  }

  /** 出られない箱（体の中心が動ける範囲） */
  setBounds(box: THREE.Box3 | null) {
    this.bounds = box
  }

  /** 動ける範囲を箱のあつまりにする（どれかの箱の中なら動ける）。null で使わない */
  setRegions(boxes: THREE.Box3[] | null) {
    this.regions = boxes && boxes.length ? boxes : null
  }

  /** いまの場所が動ける範囲の中か（範囲を決めていなければ true） */
  inside(at: THREE.Vector3 = this.pos) {
    return !this.regions || this.regions.some((b) => b.containsPoint(at))
  }

  /** 別の場所へ飛ぶ（撮影・デバッグ）。速さは 0、最後に中にいた場所もそこにする */
  teleport(at: THREE.Vector3) {
    this.pos.copy(at)
    this.vel.set(0, 0, 0)
    this.lastInside.copy(at)
    this.hasInside = true
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
    // 口の手助け：筒の中を口の向きに進んでいるときだけ、口の真ん中の線へ少し寄せる
    for (const f of this.funnels) {
      _v.copy(this.pos).sub(f.center)
      const along = _v.dot(f.axis)
      if (Math.abs(along) > f.depth) continue
      _v.addScaledVector(f.axis, -along)
      const off = _v.length()
      if (off > f.r || off < 1e-3) continue
      const k = Math.min(1, Math.abs(this.vel.dot(f.axis)) * 3) * 1.6 * dt
      this.vel.addScaledVector(_v, -k)
    }

    // 小さな刻みで動かして、そのたびに壁から押し出す
    const step = this.vel.length() * dt
    const n = Math.max(1, Math.ceil(step / (this.radius * 0.4)))
    this.touching = false
    for (let i = 0; i < n; i++) {
      this.pos.addScaledVector(this.vel, dt / n)
      this.collide()
    }
    if (this.regions) {
      // 箱のどれにも入っていない（模型のすきまから外へ出かけた）：最後に中にいた場所へもどす
      if (this.inside()) {
        this.lastInside.copy(this.pos)
        this.hasInside = true
      } else if (this.hasInside) {
        this.pos.copy(this.lastInside)
        this.vel.multiplyScalar(-this.bounce)
      }
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

  /** 壁から押し出す（全部の形の中で、いちばん近い面の点から、半径ぶん離す）。壁へ向かう速さは消す */
  private collide() {
    if (!this.cols.length) return
    for (let iter = 0; iter < 4; iter++) {
      // いちばん近い面の点（ワールドの座標）と、その距離（ワールドの m）
      let best = Infinity
      for (const c of this.cols) {
        _p.copy(this.pos).applyMatrix4(c.toLocal)
        const r = this.radius / c.scale
        _sphere.set(_p, r)
        let cb = Infinity
        c.bvh.shapecast({
          intersectsBounds: (box) => box.intersectsSphere(_sphere),
          intersectsTriangle: (tri) => {
            tri.closestPointToPoint(_p, _tri)
            const d = _tri.distanceToSquared(_p)
            if (d < r * r && d < cb) {
              cb = d
              _n.copy(_tri)
            }
            return false
          },
        })
        if (cb === Infinity) continue
        const dw = Math.sqrt(cb) * c.scale
        if (dw < best) {
          best = dw
          _best.copy(_n).applyMatrix4(c.toWorld)
        }
      }
      if (best === Infinity) return
      this.touching = true
      // 押し出す向き：面の点 → 体の中心
      _v.copy(this.pos).sub(_best)
      if (best < 1e-6) _v.set(0, 1, 0)
      else _v.divideScalar(best)
      _bestP.copy(_best).addScaledVector(_v, this.radius + 1e-4)
      this.pos.copy(_bestP)
      // 壁へ向かう速さを消し（少しだけはね返す）、壁にそってすべる
      const into = this.vel.dot(_v)
      if (into < 0) this.vel.addScaledVector(_v, -into * (1 + this.bounce))
    }
  }

  /** 体の中心から見て、近くの壁までの距離（当たり判定の形がないときは Infinity） */
  clearance(at: THREE.Vector3, max = 2) {
    let best = Infinity
    for (const c of this.cols) {
      _p.copy(at).applyMatrix4(c.toLocal)
      const hit = c.bvh.closestPointToPoint(_p, undefined, 0, max / c.scale)
      if (hit) best = Math.min(best, hit.distance * c.scale)
    }
    return best
  }

  /** カメラに置く */
  apply(camera: THREE.Camera) {
    camera.position.copy(this.pos)
    this.quaternion(camera.quaternion)
  }
}
