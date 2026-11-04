import * as THREE from 'three'

// ローバーの車体のゆれ（サスペンション）。車輪は地面に着いたまま、車体だけが傾く。
//  ・曲がると外側へ傾く（横の加速度）
//  ・加速で前が上がり、ブレーキや衝突で前がのめる（前後の加速度）
//  ・岩や着地で車台が急に傾くと、車体は少し遅れてついてくる（慣性）→ ばねで、ゆらゆらともどる

/** 車体の傾きのばね（1/s²）と減衰（1/s）。1.5 Hz くらいで、2〜3 回ゆれて止まる */
const K = 90
const C = 8.5
const MAX_P = 0.14
const MAX_R = 0.17

export class Sway {
  /** 車台に対する車体の傾き（rad）。pitch は + で前が上がる、roll は + で右が上がる */
  pitch = 0
  roll = 0
  private pv = 0
  private rv = 0
  private aLong = 0
  private lastSpeed = NaN
  private lastP = NaN
  private lastR = NaN

  reset() {
    this.pitch = this.roll = this.pv = this.rv = this.aLong = 0
    this.lastSpeed = this.lastP = this.lastR = NaN
  }

  /**
   * speed：前向きの速さ（m/s）。aLat：右向きの横の加速度（m/s²、右に曲がると +）。
   * chassisP／chassisR：車台（車輪ごと）の傾き。grounded：車輪が地面に着いているか
   */
  step(dt: number, speed: number, aLat: number, chassisP: number, chassisR: number, grounded: boolean) {
    if (dt <= 0) return
    if (Number.isNaN(this.lastSpeed)) {
      this.lastSpeed = speed
      this.lastP = chassisP
      this.lastR = chassisR
    }
    // 前後の加速度（ぶつかったときの急ブレーキも入る。少しならして使う）
    const raw = THREE.MathUtils.clamp((speed - this.lastSpeed) / dt, -40, 20)
    this.aLong += (raw - this.aLong) * Math.min(1, dt * 12)
    this.lastSpeed = speed
    // 慣性：車台が急に傾くと、車体はそのぶん少し遅れる
    this.pitch -= (chassisP - this.lastP) * 0.45
    this.roll -= (chassisR - this.lastR) * 0.45
    this.lastP = chassisP
    this.lastR = chassisR
    // 傾きたい角度（宙では車輪が伸びきって、水平にもどる）。後ろ向きに走っているときは、前後が逆
    const dir = speed < -0.3 ? -1 : 1
    const tP = grounded ? THREE.MathUtils.clamp(this.aLong * 0.012 * dir, -0.1, 0.07) : 0
    const tR = grounded ? THREE.MathUtils.clamp(aLat * 0.0065, -0.13, 0.13) : 0
    this.pv += (-(this.pitch - tP) * K - this.pv * C) * dt
    this.rv += (-(this.roll - tR) * K - this.rv * C) * dt
    this.pitch = THREE.MathUtils.clamp(this.pitch + this.pv * dt, -MAX_P, MAX_P)
    this.roll = THREE.MathUtils.clamp(this.roll + this.rv * dt, -MAX_R, MAX_R)
  }

  /** 岩・着地などで、車体をゆらす（rad/s） */
  kick(pitchV: number, rollV: number) {
    this.pv += pitchV
    this.rv += rollV
  }
}
