import * as THREE from 'three'
import { approachKind, atmosphereAt, DIVE_DEPTH, limitDepthKm, radiusKm, SHIP_LENGTH_KM, type ApproachKind } from '../data/approach'
import { bodies, slowZones, zoomZones } from './registry'
import { raceActive } from './race'
import { shipZoom, zoneFactor } from './zoom'
import { MAX_SPEED } from './throttle'

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

/**
 * 離れるときの速さの下限：1秒に今の高さの何倍まで進めるか。
 * 大きな天体（実物大の木星や太陽）のそばでも、数秒で抜け出せるようにする（ないと、遅すぎて抜け出せない）
 */
const CLIMB_RATE = 1.6
/** 雲の中：1秒に半径の何倍まで進めるか（大きなガス惑星でも、潜った深さから数秒で出られる） */
const DIVE_RATE = 0.1

/** 天体ひとつ分の速さの上限（割合）。近づくほど下がり、ガス惑星の雲の中ではさらに遅い */
function factorFor(kind: ApproachKind, radius: number, altitude: number) {
  if (kind === 'object') return 1
  if (altitude < 0) return Math.max(0.03, (radius * DIVE_RATE) / MAX_SPEED)
  // 高さとともに遅くなる（大きな天体ほど遠くから）。低い軌道では地面がゆっくり流れるよう、最高速の2%まで落とす
  // （遅すぎると離れるのも見て回るのも時間がかかるので、落とし始めを近くし、落とし方もゆるめにしている）
  const slow = (altitude / (radius * 1.5 + 1)) ** 1.2
  return THREE.MathUtils.clamp(Math.max(slow, (altitude * CLIMB_RATE) / MAX_SPEED), 0.02, 1)
}

/** 天体の「そば」：半径の3倍まで（小さな衛星でも、ワープで着いた位置が入るよう少し足す） */
export const nearRange = (radius: number) => radius * 3 + 1

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
  // 縮める場所（スペースコロニーなど）では、縮めた分だけゆっくり（全部縮めると、1秒に船の約20〜30隻分）
  for (const zone of zoomZones) speedFactor = Math.min(speedFactor, 1 / zoneFactor(zone, position))
  // 速さだけを落とす場所：近いほど遅く（対数の上でなめらかに）
  for (const zone of slowZones) {
    zone.object.getWorldPosition(p)
    const k = 1 - THREE.MathUtils.smoothstep(position.distanceTo(p), zone.near, zone.far)
    speedFactor = Math.min(speedFactor, zone.factor ** k)
  }
}

/**
 * 近づくほど速さを落とす。巨大な天体のそばでは景色がゆっくり流れ、大きさが伝わる。
 * いちばん厳しい天体の上限を使う。
 */
export const approachSpeedFactor = () => (raceActive() ? 1 : speedFactor)

export type Near = {
  id: string
  name: string
  kind: ApproachKind
  /** 地表・雲の上からの高さ（km）。雲の中では null */
  altitudeKm: number | null
  /** 雲の上からの深さ（km）と、そこでの気圧・温度 */
  dive: { km: number; bar: number; celsius: number } | null
  /** 直径が自機の何倍か・地球の何倍か */
  timesShip: number
  timesEarth: number
  /** 接近ズームで船を何分の一に縮めて見せているか */
  zoom: number
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
    id: prox.id,
    name: prox.name,
    kind: prox.kind,
    altitudeKm: prox.altitude >= 0 ? prox.altitude * kmPerUnit : null,
    dive,
    timesShip: (km * 2) / SHIP_LENGTH_KM,
    timesEarth: km / 6_371,
    zoom: shipZoom.factor,
  }
}

/** その天体のそばにいるか（着陸先を選ぶとき、近い大きな惑星より目標の衛星を優先するため） */
export function isNear(id: string, position: THREE.Vector3) {
  const body = bodies.get(id)
  if (!body) return false
  body.object.getWorldPosition(p)
  const altitude = position.distanceTo(p) - body.radius
  return altitude >= 0 && altitude < nearRange(body.radius)
}
