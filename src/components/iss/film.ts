import * as THREE from 'three'
import type { Station, Vec3 } from './station'

// 撮影用の道（__sv.iss.film、tools/iss/flythrough.mjs）：きぼうの保管室 → きぼう → ハーモニー → デスティニー → ユニティ
// → トランクウィリティー → キューポラ。口の真ん中を通るなめらかな道（CatmullRom）を、一定の速さで進む。
// 時刻 t だけで場所と向きが決まる（1 コマずつ撮っても、同じ動きになる）

export type FilmPath = { curve: THREE.CatmullRomCurve3; length: number; dwell0: number; move: number; dwell1: number; duration: number }

/** 進む速さ（m/s）と、はじめ・終わりの止まる時間（秒） */
const SPEED = 0.75
const DWELL0 = 2.5
const DWELL1 = 6

const v = (p: Vec3) => new THREE.Vector3(p[0], p[1], p[2])

export function makeFilmPath(station: Station): FilmPath {
  const hatch = (from: string, to: string) => {
    const h = station.modules.find((m) => m.id === from)!.hatches.find((x) => x.to === to)!
    return { c: v(h.center), n: v(h.normal) }
  }
  const through = (from: string, to: string, k = 0.8) => {
    const h = hatch(from, to)
    return [h.c.clone().addScaledVector(h.n, -k), h.c.clone(), h.c.clone().addScaledVector(h.n, k)]
  }
  const jlp = station.modules.find((m) => m.id === 'jlp')!.center
  const pts: THREE.Vector3[] = [
    // きぼうの保管室の上の方から、下の口へ
    new THREE.Vector3(jlp[0] - 0.3, jlp[1] + 0.9, jlp[2] + 0.2),
    new THREE.Vector3(jlp[0], jlp[1] + 0.2, jlp[2]),
    ...through('jlp', 'jpm', 0.7),
    // きぼうの中を右舷へ（ハーモニーへ）
    new THREE.Vector3(-8.2, 0.15, -15.05),
    new THREE.Vector3(-5.5, 0.1, -15.05),
    ...through('jpm', 'node2'),
    // ハーモニーで後ろへ曲がって、デスティニーへ
    new THREE.Vector3(-0.35, 0.0, -14.4),
    new THREE.Vector3(0, 0.0, -12.6),
    ...through('node2', 'us_lab'),
    new THREE.Vector3(0, 0.08, -7.5),
    new THREE.Vector3(0, 0.05, -4.0),
    ...through('us_lab', 'node1'),
    // ユニティで左舷へ曲がって、トランクウィリティーへ
    new THREE.Vector3(-0.5, 0.0, -0.4),
    ...through('node1', 'node3'),
    new THREE.Vector3(-3.6, 0.05, 0.0),
    new THREE.Vector3(-5.6, -0.15, 0.0),
    // 下の口からキューポラへ
    new THREE.Vector3(-6.35, -0.9, 0.0),
    ...through('node3', 'cupola', 0.6),
    new THREE.Vector3(-6.43, -2.35, 0.05),
  ]
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5)
  const length = curve.getLength()
  const move = length / SPEED
  return { curve, length, dwell0: DWELL0, move, dwell1: DWELL1, duration: DWELL0 + move + DWELL1 }
}

const smooth = (x: number) => x * x * (3 - 2 * x)
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()

/** 道の u（0〜1）で、先の点を見るときの左右・上下の向き */
function lookAt(path: FilmPath, u: number) {
  const p = path.curve.getPointAt(u, new THREE.Vector3())
  // 1.4 m 先を見る。真上・真下へ進むところは、水平に離れた所が出るまで先を探す（向きがふらつかない）
  let yawDir: THREE.Vector3 | null = null
  let pitchDir: THREE.Vector3 | null = null
  for (let k = 1.4; k < 6; k += 0.4) {
    const q = path.curve.getPointAt(Math.min(1, u + k / path.length), _a)
    _b.copy(q).sub(p)
    if (!pitchDir) pitchDir = _b.clone()
    if (Math.hypot(_b.x, _b.z) > 0.6) {
      yawDir = _b.clone()
      break
    }
    if (u + k / path.length >= 1) break
  }
  const yd = yawDir ?? path.curve.getTangentAt(Math.min(u, 0.999))
  const yaw = Math.atan2(-yd.x, -yd.z)
  const pd = pitchDir ?? yd
  const pitch = THREE.MathUtils.clamp(Math.atan2(pd.y, Math.hypot(pd.x, pd.z)), -0.9, 0.9)
  return { p, yaw, pitch }
}

/** 時刻 t（秒）の場所と向き */
export function filmPose(path: FilmPath, t: number) {
  const { dwell0, move } = path
  if (t <= dwell0) {
    // はじめ：止まって、保管室の棚を少し見回す
    const l = lookAt(path, 0)
    const k = smooth(t / dwell0)
    return { pos: l.p, yaw: l.yaw + 0.7 * (1 - k), pitch: l.pitch * k }
  }
  if (t <= dwell0 + move) {
    // 進む：はじめと終わりはゆっくり
    // 速さの台形（はじめの a だけ加速、終わりの a だけ減速）
    const x = (t - dwell0) / move
    const a = 0.04
    const ease = x < a ? (x * x) / (2 * a * (1 - a)) : x > 1 - a ? 1 - ((1 - x) * (1 - x)) / (2 * a * (1 - a)) : (x - a / 2) / (1 - a)
    const l = lookAt(path, THREE.MathUtils.clamp(ease, 0, 1))
    return { pos: l.p, yaw: l.yaw, pitch: l.pitch }
  }
  // 終わり：キューポラで下を向いて、窓の外の地球を見る
  const l = lookAt(path, 1)
  const k = smooth(Math.min(1, (t - dwell0 - move) / 2.5))
  return { pos: l.p, yaw: l.yaw + 0.25 * k, pitch: l.pitch + (-1.3 - l.pitch) * k }
}
