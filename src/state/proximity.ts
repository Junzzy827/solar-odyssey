import * as THREE from 'three'
import { approachKind, atmosphereAt, DIVE_DEPTH, limitDepthKm, radiusKm, SHIP_LENGTH_KM, type ApproachKind } from '../data/approach'
import { bodies } from './registry'
import { raceActive } from './race'

/** いちばん近い天体（高さは雲の上・地表からの距離。ガス惑星の中では負） */
export const proximity = {
  id: null as string | null,
  name: '',
  kind: 'rock' as ApproachKind,
  radius: 0,
  altitude: Infinity,
}

const p = new THREE.Vector3()
let speedFactor = 1

/** 天体ひとつ分の速さの上限（割合）。近づくほど下がり、ガス惑星の雲の中ではさらに遅い */
function factorFor(kind: ApproachKind, radius: number, altitude: number) {
  if (kind === 'object') return 1
  if (altitude < 0) return 0.035
  // 高さに比例して遅くなる（大きな天体ほど遠くから）。地表近くでは最高速の4%まで落とす
  return THREE.MathUtils.clamp(altitude / (radius * 2.5 + 1.5), 0.04, 1)
}

/** 天体の「そば」：半径の3倍まで（小さな衛星でも、ワープで着いた位置が入るよう少し足す） */
const nearRange = (radius: number) => radius * 3 + 1

/** 表示する天体を選ぶ順位：雲の中の惑星、そばにいる天体のうちいちばん近いもの、半径に対していちばん近い天体 */
function rank(altitude: number, radius: number) {
  if (altitude < 0) return -Infinity
  // 太陽を大きくすると、木星のそばでも「半径に対して」は太陽の方が近くなるので、そばにいる天体を先にする
  if (altitude < nearRange(radius)) return altitude - 1e6
  return altitude / radius
}

export function updateProximity(position: THREE.Vector3) {
  let best = Infinity
  speedFactor = 1
  proximity.id = null
  proximity.altitude = Infinity
  for (const body of bodies.values()) {
    body.object.getWorldPosition(p)
    const altitude = position.distanceTo(p) - body.radius
    const kind = approachKind(body.id)
    speedFactor = Math.min(speedFactor, factorFor(kind, body.radius, altitude))
    const score = rank(altitude, body.radius)
    if (score < best) {
      best = score
      proximity.id = body.id
      proximity.name = body.name
      proximity.kind = kind
      proximity.radius = body.radius
      proximity.altitude = altitude
    }
  }
}

/**
 * 近づくほど速さを落とす。巨大な天体のそばでは景色がゆっくり流れ、大きさが伝わる。
 * いちばん厳しい天体の上限を使う。
 */
export const approachSpeedFactor = () => (raceActive() ? 1 : speedFactor)

export type Near = {
  name: string
  kind: ApproachKind
  /** 地表・雲の上からの高さ（km）。雲の中では null */
  altitudeKm: number | null
  /** 雲の上からの深さ（km）と、そこでの気圧・温度 */
  dive: { km: number; bar: number; celsius: number } | null
  /** 直径が自機の何倍か・地球の何倍か */
  timesShip: number
  timesEarth: number
}

/** 表示用：天体のそばにいるときだけ返す */
export function nearInfo(prox: typeof proximity): Near | null {
  if (!prox.id || prox.kind === 'object' || prox.altitude > nearRange(prox.radius)) return null
  const km = radiusKm(prox.id)
  if (km === null) return null
  const kmPerUnit = km / prox.radius
  let dive: Near['dive'] = null
  if (prox.altitude < 0) {
    const depthKm = Math.min(1, -prox.altitude / (prox.radius * DIVE_DEPTH)) * limitDepthKm(prox.id)
    const air = atmosphereAt(prox.id, depthKm)
    if (air) dive = { km: depthKm, ...air }
  }
  return {
    name: prox.name,
    kind: prox.kind,
    altitudeKm: prox.altitude >= 0 ? prox.altitude * kmPerUnit : null,
    dive,
    timesShip: (km * 2) / SHIP_LENGTH_KM,
    timesEarth: km / 6_371,
  }
}
