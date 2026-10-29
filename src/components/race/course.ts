import * as THREE from 'three'
import { bodies } from '../../state/registry'
import { limitDistance } from '../../data/approach'
import { PLANETS } from '../../data/bodies'
import { CUBE_ID } from '../../data/cube'
import { isTelescope } from '../../data/telescopes'

// レースのコース。今の惑星の位置から道すじと輪（ゲート）を作り、
// 太陽や惑星・衛星にぶつからないように回り道の点を足す。

export type Obstacle = { pos: THREE.Vector3; safe: number }

const SAMPLES = 600

function closestSegment(points: THREE.Vector3[], p: THREE.Vector3) {
  const seg = new THREE.Line3()
  const q = new THREE.Vector3()
  let best = 0
  let bestD = Infinity
  for (let k = 0; k < points.length - 1; k++) {
    seg.set(points[k], points[k + 1]).closestPointToPoint(p, true, q)
    const d = q.distanceToSquared(p)
    if (d < bestD) {
      bestD = d
      best = k
    }
  }
  return best
}

const UP = new THREE.Vector3(0, 1, 0)

/** 点がほかの障害物からどれだけ離れているか（安全な距離に対する割合のいちばん小さいもの） */
function room(p: THREE.Vector3, obstacles: Obstacle[], skip: Obstacle) {
  let min = Infinity
  for (const o of obstacles) if (o !== skip) min = Math.min(min, p.distanceTo(o.pos) / o.safe)
  return min
}

/**
 * 障害物 o の中に入った点 p の代わりに通る点。横へ外す、上を越える、下をくぐる、反対の横へ外す、の順に
 * ためし、ほかの障害物にもかからない最初のものを選ぶ（衛星をよけて惑星に近づきすぎないように）
 */
function detourPoint(p: THREE.Vector3, o: Obstacle, side: THREE.Vector3, obstacles: Obstacle[]) {
  const away = p.clone().sub(o.pos).setY(0)
  if (away.lengthSq() < 1e-4) away.copy(side).setY(0)
  away.setLength(o.safe * 1.3)
  const candidates = [
    o.pos.clone().add(away).setY(p.y),
    new THREE.Vector3(p.x, o.pos.y + o.safe * 1.3, p.z),
    new THREE.Vector3(p.x, o.pos.y - o.safe * 1.3, p.z),
    o.pos.clone().sub(away).setY(p.y),
  ]
  let best = candidates[0]
  let bestRoom = -Infinity
  for (const c of candidates) {
    const r = room(c, obstacles, o)
    if (r >= 1.15) return c
    if (r > bestRoom) {
      best = c
      bestRoom = r
    }
  }
  return best
}

/**
 * 制御点を通る曲線を作り、障害物の安全な距離より内側を通るところがあれば、
 * いちばん深く入り込んだ所を外へ押し出した点を足して作り直す。
 */
export function detourCurve(input: THREE.Vector3[], obstacles: Obstacle[], maxIter = 32) {
  const points = input.map((p) => p.clone())
  // まず、障害物の中にある制御点（始点と終点のほか）を外へ出す
  for (let j = 1; j < points.length - 1; j++) {
    for (const o of obstacles) {
      if (points[j].distanceTo(o.pos) >= o.safe) continue
      const side = new THREE.Vector3().crossVectors(UP, points[j + 1].clone().sub(points[j - 1]))
      points[j].copy(detourPoint(points[j], o, side, obstacles))
    }
  }
  let curve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
  for (let iter = 0; iter < maxIter; iter++) {
    const samples = curve.getSpacedPoints(SAMPLES)
    let worst: { p: THREE.Vector3; o: Obstacle; depth: number; i: number } | null = null
    for (const o of obstacles) {
      samples.forEach((p, i) => {
        const depth = o.safe - p.distanceTo(o.pos)
        if (depth > 0 && (!worst || depth / o.safe > worst.depth / worst.o.safe)) worst = { p, o, depth, i }
      })
    }
    if (!worst) break
    const { p, o, i } = worst as { p: THREE.Vector3; o: Obstacle; i: number }
    // 真ん中を突き抜けるときは、進む向きの横へ
    const side = new THREE.Vector3().crossVectors(UP, curve.getTangentAt(i / SAMPLES))
    const detour = detourPoint(p, o, side, obstacles)
    const k = closestSegment(points, p)
    // すぐそばに制御点があれば、それを動かす（細かい折れ曲がりを作らない）
    const nearIndex = [k, k + 1].find((j) => j > 0 && j < points.length - 1 && points[j].distanceTo(detour) < o.safe * 0.6)
    if (nearIndex !== undefined) points[nearIndex].copy(detour)
    else points.splice(k + 1, 0, detour)
    curve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
  }
  return curve
}

/** 曲線がいちばん障害物に近づくところ（安全な距離に対する割合）。1 以上なら当たらない */
export function clearance(curve: THREE.Curve<THREE.Vector3>, obstacles: Obstacle[]) {
  let min = Infinity
  for (const p of curve.getSpacedPoints(SAMPLES)) for (const o of obstacles) min = Math.min(min, p.distanceTo(o.pos) / o.safe)
  return min
}

export const GATE_RADIUS = 1.3
const GATE_SPACING = 22
export const MAX_GATES = 64

export type Gate = { pos: THREE.Vector3; normal: THREE.Vector3; u: number; event: 'jupiter' | 'swingby' | null }
export type Course = { curve: THREE.CatmullRomCurve3; length: number; gates: Gate[] }

const world = (id: string) => {
  const b = bodies.get(id)
  if (!b) return null
  const pos = b.object.getWorldPosition(new THREE.Vector3())
  // 衛星や環まで含めた広がり（コースはこの外を回る）
  const planet = PLANETS.find((p) => p.id === id)
  let system = b.radius * (planet?.ring ? planet.ring.outer : 1)
  for (const m of planet?.moons ?? []) {
    const moon = bodies.get(m.id)
    if (moon) system = Math.max(system, moon.object.getWorldPosition(new THREE.Vector3()).distanceTo(pos) + moon.radius)
  }
  return { pos, radius: b.radius, system }
}

/**
 * 道すじが通ってはいけないところ：太陽と惑星・衛星。輪（ゲート）が体にかからないよう、
 * それぞれ近づける限界（土星は環の外側）に輪の大きさとゆとりを足す
 */
function obstacles(): Obstacle[] {
  const list: Obstacle[] = []
  for (const b of bodies.values()) {
    if (b.id === CUBE_ID || isTelescope(b.id)) continue
    const pos = b.object.getWorldPosition(new THREE.Vector3())
    const ring = PLANETS.find((p) => p.id === b.id)?.ring
    const body = Math.max(limitDistance(b.id, b.radius), b.radius * (ring ? ring.outer : 1))
    const margin = b.id === 'sun' ? 3 : PLANETS.some((p) => p.id === b.id) ? 1 : 0.4
    list.push({ pos, safe: body + GATE_RADIUS * 1.5 + margin })
  }
  return list
}

const angleOf = (v: THREE.Vector3) => Math.atan2(v.z, v.x)
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/**
 * 今の惑星の位置からコースを作る。
 * 火星 → 木星の横 → 土星の向こう側を回り込む弧（スイングバイ）→ 行きとは別の道すじで火星へ。
 */
export function buildCourse(): Course | null {
  const mars = world('mars')
  const jup = world('jupiter')
  const sat = world('saturn')
  if (!mars || !jup || !sat) return null
  const M = mars.pos.clone().setY(0)
  const J = jup.pos.clone().setY(0)
  const S = sat.pos.clone().setY(0)

  const toJ = J.clone().sub(M).normalize()
  const side = new THREE.Vector3().crossVectors(UP, toJ)
  const marsGap = Math.max(mars.radius * 4 + 2, mars.system + GATE_RADIUS + 2)
  const start = M.clone().addScaledVector(toJ, marsGap)
  const jFly = J.clone().addScaledVector(side, jup.radius * 3.2).setY(1.5)

  // 土星のまわりの弧：入ってくる向きと、火星へ戻る向きのあいだを、向こう側を通って回る
  const R = Math.max(sat.radius * 6, sat.system + GATE_RADIUS + 2) // 大きな船でも曲がり切れて、衛星の外を回る半径
  const inAng = angleOf(jFly.clone().sub(S))
  const outAng = angleOf(M.clone().sub(S))
  const farAng = angleOf(S.clone().sub(M))
  const ccw = ((outAng - inAng) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
  const cw = ccw - Math.PI * 2
  const midOf = (sweep: number) => inAng + sweep / 2
  const sweep = Math.abs(wrap(midOf(ccw) - farAng)) < Math.abs(wrap(midOf(cw) - farAng)) ? ccw : cw
  // 入口と出口は少し内側に寄せて、弧の大部分で土星のまわりを回る
  const arc: THREE.Vector3[] = []
  for (let i = 0; i <= 6; i++) {
    const a = inAng + sweep * (0.08 + 0.84 * (i / 6))
    arc.push(new THREE.Vector3(S.x + Math.cos(a) * R, -1 + Math.sin((i / 6) * Math.PI) * 2, S.z + Math.sin(a) * R))
  }
  const exit = arc[arc.length - 1]
  const back = M.clone().sub(exit)
  const backSide = new THREE.Vector3().crossVectors(UP, back).normalize()
  const backMid = exit.clone().lerp(M, 0.5)
  if (backSide.dot(jFly.clone().sub(backMid)) > 0) backSide.negate()
  backMid.addScaledVector(backSide, 14).setY(-2)
  const finish = M.clone().addScaledVector(back.clone().normalize().negate(), marsGap)

  const points = [start, start.clone().lerp(jFly, 0.5).setY(2.5), jFly, jFly.clone().lerp(arc[0], 0.5).setY(1), ...arc, backMid, finish.clone().lerp(backMid, 0.35), finish]
  // 太陽や惑星がちょうど道すじの上にあるときは、回り道をする
  const curve = detourCurve(points, obstacles())
  const length = curve.getLength()
  const n = THREE.MathUtils.clamp(Math.round(length / GATE_SPACING), 12, MAX_GATES)
  const gates: Gate[] = []
  for (let i = 0; i < n; i++) {
    const u = 0.004 + (0.996 * i) / (n - 1)
    gates.push({ pos: curve.getPointAt(u), normal: curve.getTangentAt(u), u, event: null })
  }
  const nearest = (p: THREE.Vector3) => gates.reduce((best, g, i) => (g.pos.distanceTo(p) < gates[best].pos.distanceTo(p) ? i : best), 0)
  gates[nearest(jFly)].event = 'jupiter'
  gates[nearest(arc[3])].event = 'swingby'
  return { curve, length, gates }
}
