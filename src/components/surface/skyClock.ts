import * as THREE from 'three'
import { create } from 'zustand'
import type { SurfaceDef } from '../../data/surfaces'

// 地表の時間の流れ：天体が自転して、太陽と星が空を回る。昼と夜が巡る。
// 空の向きは「天体の北極（自転軸）」と「着陸地点の緯度」から決める。星表の星も太陽も同じ回転で動くので、
// 夕焼けのあとに出てくる星座は本物の並び（地球では北極星がちゃんと北の空にある）。

/** 1 日（日の出から次の日の出まで）の長さ（地球の時間で、時間）。逆回りの天体は負 */
const DAY_HOURS: Record<string, number> = {
  mercury: 4222.6, venus: -2802, earth: 24, moon: 708.7, mars: 24.66, phobos: 7.66, deimos: 30.3,
  io: 42.46, europa: 85.2, ganymede: 171.7, callisto: 400.5,
  mimas: 22.6, enceladus: 32.9, tethys: 45.3, dione: 65.7, rhea: 108.4, titan: 382.7, iapetus: 1903.9,
  miranda: 33.9, ariel: 60.5, umbriel: 99.5, titania: 208.9, oberon: 323.1,
  proteus: 26.9, triton: -141, pluto: -153.3, charon: -153.3,
}

/** 着陸地点の緯度（度）。地球はモニュメント・バレー、火星はゲール・クレーター */
const LATITUDE: Record<string, number> = { earth: 37, mars: -5.4, moon: 20, titan: 10, venus: 10, pluto: 25, triton: -20 }

export const dayHours = (id: string) => DAY_HOURS[id] ?? 24
export const latitude = (id: string) => LATITUDE[id] ?? 15

/** 黄道座標（このアプリの宇宙の向き）での方向 */
const ecl = (lonDeg: number, latDeg: number) => {
  const l = THREE.MathUtils.degToRad(lonDeg)
  const b = THREE.MathUtils.degToRad(latDeg)
  return new THREE.Vector3(Math.cos(b) * Math.cos(l), Math.sin(b), -Math.cos(b) * Math.sin(l))
}

/** 天体の北極の向き。地球は本物（黄道から 23.4° 傾く：北極星の方向）、ほかは黄道の北極で近似 */
function poleOf(id: string) {
  if (id === 'earth') return ecl(90, 90 - 23.44)
  if (id === 'mars') return ecl(352.9, 63.3)
  return new THREE.Vector3(0, 1, 0)
}

/** 太陽の方向（2026 年 10 月末：黄経およそ 218°） */
const SUN_APP = ecl(218, 0)

/** 時間の速さ（1 秒に進む時間）。'day' は 1 日を 1 分で */
export type TimeRate = 0 | 1 | 'day'

type ClockState = {
  rate: TimeRate
  /** 着陸してから進んだ時間（時間） */
  hours: number
  /** 地方の時刻（0〜24 の時）と、空の母惑星の満ち欠け（見えている昼側の割合）・満ちていく途中か */
  clock: number
  bodyLit: number
  waxing: boolean
  /** 時刻を飛ばす（次のフレームで Scene が読む）。null なら飛ばさない */
  seek: number | null
  setRate: (r: TimeRate) => void
}

export const useSkyClock = create<ClockState>((set) => ({
  rate: 1,
  hours: 0,
  clock: 9,
  bodyLit: 0,
  waxing: true,
  seek: null,
  setRate: (rate) => set({ rate }),
}))

/** 1 秒に進む時間（時間） */
export function hoursPerSecond(rate: TimeRate, id: string) {
  if (rate === 0) return 0
  if (rate === 'day') return Math.abs(dayHours(id)) / 60
  return 1
}

/** その天体の空の回り方 */
export class SkyFrame {
  readonly pole: THREE.Vector3
  private a: THREE.Vector3
  private b: THREE.Vector3
  readonly lat: number
  /** 画面の正面（-Z）から測った、北の方位 */
  readonly azOffset: number
  readonly day: number
  /** 着陸したときの自転の角度 */
  readonly theta0: number
  /** 地方 → 宇宙（黄道）の回転と、その逆 */
  readonly toApp = new THREE.Matrix4()
  readonly toLocal = new THREE.Matrix4()
  readonly quatToLocal = new THREE.Quaternion()
  private rotY = new THREE.Matrix4()
  /** 今の天頂の向き（宇宙の向きで） */
  private zen = new THREE.Vector3(0, 1, 0)

  constructor(def: SurfaceDef) {
    this.pole = poleOf(def.id).normalize()
    const ref = Math.abs(this.pole.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    this.a = new THREE.Vector3().crossVectors(ref, this.pole).normalize()
    this.b = new THREE.Vector3().crossVectors(this.pole, this.a).normalize()
    // 母惑星にいつも同じ面を向けている衛星（と冥王星）：母惑星は空の同じ場所にとどまる。
    // 着陸地点は「母惑星がその高さに見える場所」とし、母惑星の真下の点の真夜中に太陽が真反対に来るようにする。
    // こうすると、真夜中に母惑星は満ちて（満地球）、昼には欠ける（新地球）。地球から見た月の満ち欠けと同じ周期
    const sb = def.skyBody
    const locked = !!sb && def.id !== 'earth'
    this.lat = THREE.MathUtils.degToRad(locked ? 90 - sb.el : latitude(def.id))
    this.azOffset = THREE.MathUtils.degToRad(locked ? sb.az + 180 : 0)
    this.rotY.makeRotationY(this.azOffset)
    this.day = dayHours(def.id)
    // 着陸した時刻：天体の設定の太陽の高さの、午前（太陽が昇っていく途中）
    const target = THREE.MathUtils.degToRad(def.sunEl)
    let best = 0
    let bestErr = Infinity
    const sun = new THREE.Vector3()
    const next = new THREE.Vector3()
    const dir = Math.sign(this.day)
    for (let i = 0; i < 720; i++) {
      const th = (i / 720) * Math.PI * 2
      this.set(th)
      sun.copy(SUN_APP).applyMatrix4(this.toLocal)
      this.set(th + dir * 0.01)
      next.copy(SUN_APP).applyMatrix4(this.toLocal)
      if (next.y < sun.y) continue
      const err = Math.abs(Math.asin(THREE.MathUtils.clamp(sun.y, -1, 1)) - target)
      if (err < bestErr) {
        bestErr = err
        best = th
      }
    }
    this.theta0 = best
    this.set(best)
  }

  /** 自転の角度 th のときの向きにする */
  set(th: number) {
    const ring = this.a.clone().multiplyScalar(Math.cos(th)).addScaledVector(this.b, Math.sin(th))
    const zen = ring.clone().multiplyScalar(Math.cos(this.lat)).addScaledVector(this.pole, Math.sin(this.lat)).normalize()
    const north = ring.clone().multiplyScalar(-Math.sin(this.lat)).addScaledVector(this.pole, Math.cos(this.lat)).normalize()
    const east = new THREE.Vector3().crossVectors(north, zen).normalize()
    this.zen.copy(zen)
    // 地方の向き：+X が東、+Y が真上、-Z が北
    this.toApp.makeBasis(east, zen, north.clone().negate()).multiply(this.rotY)
    this.toLocal.copy(this.toApp).transpose()
    this.quatToLocal.setFromRotationMatrix(this.toLocal)
  }

  /** 着陸してから hours 時間たったときの向き */
  at(hours: number) {
    this.set(this.theta0 + (hours / this.day) * Math.PI * 2)
  }

  /** 今の太陽の方向（地方） */
  sunLocal(out: THREE.Vector3) {
    return out.copy(SUN_APP).applyMatrix4(this.toLocal)
  }

  /** 地方の時刻（0〜24 の「時」）。太陽がいちばん高く昇るとき（南中）が 12 時 */
  localClock() {
    // 自転軸のまわりで、真上（天頂）から太陽までの角度（時角）を測る。天頂は自転と一緒に回り、太陽はとどまる
    const p = this.pole
    const z = this.zen.clone().addScaledVector(p, -this.zen.dot(p))
    const s = SUN_APP.clone().addScaledVector(p, -SUN_APP.dot(p))
    const h = Math.atan2(p.dot(new THREE.Vector3().crossVectors(z, s)), z.dot(s))
    return ((12 - (h / Math.PI) * 12 * Math.sign(this.day)) % 24 + 24) % 24
  }
}

/** 空に浮かぶ母惑星（地球から見た月など）の、見えている昼側の割合（0〜1） */
export function litFraction(sun: THREE.Vector3, body: THREE.Vector3) {
  const c = THREE.MathUtils.clamp(sun.dot(body) / (sun.length() * body.length()), -1, 1)
  // 太陽と同じ向きなら新月（0）、反対なら満月（1）
  return (1 - c) / 2
}
