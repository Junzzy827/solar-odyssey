import * as THREE from 'three'
import { PLANETS } from '../data/bodies'
import { named, t } from '../i18n/lang'
import { isTelescope, scopeName } from '../data/telescopes'
import { SF_OBJECTS, sfEntry } from '../data/sf'
import { RACE_TEXT, raceActive } from './race'
import { bodies } from './registry'
import { useStore } from './store'
import { playWarp, speak } from '../audio/sfx'
import { planetLongitude, simDays } from '../data/ephemeris'

const UP = new THREE.Vector3(0, 1, 0)

/** 自機の状態。毎フレーム書き換えるので React の state にはしない */
/** 自機の表示の大きさ（ShipModel の座標の1が、この長さになる） */
export const SHIP_SCALE = 0.3

export const ship = {
  position: new THREE.Vector3(30, 4, 70),
  quaternion: new THREE.Quaternion(),
  velocity: new THREE.Vector3(),
}

// 惑星は今日の本当の位置に並ぶので、出発点も地球と一緒に回して、最初の眺め（地球のそばから太陽を見る）を保つ。
// 4.78 は、惑星を決まった角度に並べていたころの地球の向き
{
  const turn = planetLongitude('earth', simDays(0)) - 4.78
  ship.position.applyAxisAngle(UP, turn)
  ship.quaternion.setFromAxisAngle(UP, turn)
}

/** 操縦の制限（レースのカウントダウン中は止める、スイングバイ後は最高速度を上げる） */
export const flightControl = { locked: false, speedScale: 1, releaseHold: false, holding: false }

/** ワープ演出の共有値（光の筋・ナセルの発光が参照する） */
export const warpFx = { intensity: 0, glow: 0, seconds: 3 }

export const CHARGE_SECONDS = 1.8
export const EXIT_SECONDS = 0.9

/** 到着点（目標の手前で止まる距離） */
export const standoff = (radius: number) => radius * 3 + 0.6

/** ワープ速度が上がるほど短時間で着く */
export const warpSeconds = (distance: number, factor: number) => THREE.MathUtils.clamp(distance / (factor * factor * 2), 1.5, 8)

const tmp = new THREE.Vector3()

export function distanceToBody(id: string) {
  const body = bodies.get(id)
  if (!body) return null
  body.object.getWorldPosition(tmp)
  return Math.max(0, tmp.distanceTo(ship.position) - body.radius)
}

export function engage() {
  const s = useStore.getState()
  if (!s.targetId || s.warpPhase !== 'idle') return
  if (raceActive()) {
    s.showToast(RACE_TEXT.noWarp)
    return
  }
  const distance = distanceToBody(s.targetId)
  if (distance === null) return
  warpFx.seconds = warpSeconds(distance, s.warpFactor)
  s.setAutopilot(false)
  s.setWarpPhase('charge')
  // 艦長の号令は、低く力強く（声の高さは 0〜2。下げすぎると機械のような声になる）
  speak(warpCall(s.targetId, s.warpFactor), { rate: 0.9, pitch: 0.5 })
  playWarp(CHARGE_SECONDS, warpFx.seconds)
}

/** 英語の掛け声で呼ぶ行き先の名前 */
const SPOKEN: Record<string, string> = { sun: 'the Sun', moon: 'the Moon', hubble: 'the Hubble Space Telescope', webb: 'the Webb Space Telescope', ...Object.fromEntries(SF_OBJECTS.map((e) => [e.id, e.spoken])) }
const spokenName = (id: string) => SPOKEN[id] ?? id[0].toUpperCase() + id.slice(1)

/** ワープの掛け声（艦長の号令。英語。セリフはこのアプリのオリジナル） */
function warpCall(id: string, factor: number) {
  const name = spokenName(id)
  const lines = [
    `Warp ${factor}. Set course for ${name}... Full speed ahead!`,
    `Course: ${name}. Warp ${factor}... Full speed ahead!`,
    `${name}, warp ${factor}. All hands... full speed ahead!`,
  ]
  return lines[Math.floor(Math.random() * lines.length)]
}

/** 天体の名前と、太陽からの実際の距離（衛星は親の惑星の距離） */
export function bodyInfo(id: string) {
  if (id === 'sun') return { name: t('太陽', 'Sun'), au: 0, parent: null as string | null }
  const sf = sfEntry(id)
  if (sf) return { name: sf.name(), au: 0, parent: null }
  if (isTelescope(id)) return { name: scopeName(id), au: 0, parent: null }
  for (const p of PLANETS) {
    if (p.id === id) return { name: named(p), au: p.distanceAu, parent: null }
    const moon = p.moons.find((m) => m.id === id)
    if (moon) return { name: named(moon), au: p.distanceAu, parent: named(p) }
  }
  // 任務の小惑星など、一時的に加わったもの
  const extra = bodies.get(id)
  if (extra) return { name: extra.name, au: 0, parent: null }
  return null
}

/** 太陽からの光の到達時間（分）と、探査機（秒速17km）での年数 */
export function travelFacts(au: number) {
  return { lightMinutes: au * 8.317, probeYears: (au * 149.6e6) / 17 / 3.156e7 }
}
