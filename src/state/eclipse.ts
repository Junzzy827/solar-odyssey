import { create } from 'zustand'
import * as THREE from 'three'
import { eclipseById } from '../data/eclipses'
import { greenwichSiderealTime, precession, shadowGeometry, EARTH_RADIUS_KM } from '../data/moon'
import { simTimeAt } from '../data/ephemeris'
import { sim } from './registry'
import { useStore } from './store'
import { useQuiz } from './quiz'
import { closeProbes } from './probes'

// 宇宙から見る日食・月食：その日時の惑星の位置にして、月と地球の自転を本物の向きにそろえ、影を描く。
// 影の形は本物の比率で計算する（画面の月の大きさや距離は見やすく変えてあるので、影の計算には使わない）

const SUN_KM = 696_000
const SUN_DISTANCE_KM = 1.496e8
const MOON_KM = 1737.4
/** 月の半径（地球の半径が単位） */
const MOON_IN_EARTH = MOON_KM / EARTH_RADIUS_KM
/** 再生するのは、食がいちばん深くなるときの前後この時間（月食は、月が濃い影に入る前から出たあとまで） */
const SPAN_MS = { solar: 3.2 * 3_600_000, lunar: 2.4 * 3_600_000 }
/** 再生の速さ：1秒に何分進むか */
const MINUTES_PER_SECOND = 5

type EclipseState = {
  open: boolean
  eclipseId: string | null
  playing: boolean
}

export const useEclipse = create<EclipseState>(() => ({ open: false, eclipseId: null, playing: false }))

/** 再生中の日時と、食がいちばん深くなる日時、その前後に再生する長さ（ミリ秒） */
export const eclipseClock = { ms: 0, peak: 0, span: 0 }
/** 開く前のシミュレーションの時間（閉じたら戻す） */
let savedTime = 0

/** 影の軸が地球（月食なら月）の中心にいちばん近づく時刻を、おおよその時刻の前後で探す */
function findPeak(approx: number) {
  let best = approx
  let gamma = Infinity
  for (let step = 600_000, from = approx - 12 * 3_600_000, to = approx + 12 * 3_600_000; step >= 1000; step /= 10) {
    for (let ms = from; ms <= to; ms += step) {
      const g = shadowGeometry(ms).gamma
      if (g < gamma) {
        gamma = g
        best = ms
      }
    }
    from = best - step
    to = best + step
  }
  return best
}

export function openEclipses() {
  closeProbes()
  useQuiz.setState({ open: false })
  const s = useStore.getState()
  if (document.pointerLockElement) document.exitPointerLock()
  if (!useEclipse.getState().open) savedTime = sim.time
  s.setLogOpen(false)
  s.setAutopilot(false)
  s.setMode('map')
  useEclipse.setState({ open: true, eclipseId: null, playing: false })
}

export function closeEclipses() {
  if (!useEclipse.getState().open) return
  sim.time = savedTime
  useEclipse.setState({ open: false, eclipseId: null, playing: false })
}

/** 食を選んで、始まる少し前から再生する */
export function playEclipse(id: string) {
  const eclipse = eclipseById(id)
  if (!eclipse) return
  eclipseClock.peak = findPeak(Date.parse(eclipse.at))
  eclipseClock.span = SPAN_MS[eclipse.kind]
  eclipseClock.ms = eclipseClock.peak - eclipseClock.span
  useEclipse.setState({ eclipseId: id, playing: true })
}

export function toggleEclipsePlay() {
  const e = useEclipse.getState()
  if (!e.eclipseId) return
  // 最後まで見たら、はじめから
  const { peak, span } = eclipseClock
  if (!e.playing && eclipseClock.ms >= peak + span) eclipseClock.ms = peak - span
  useEclipse.setState({ playing: !e.playing })
}

export function seekEclipse(ms: number) {
  const { peak, span } = eclipseClock
  eclipseClock.ms = Math.min(peak + span, Math.max(peak - span, ms))
}

/** 毎フレーム呼ぶ。食を見ているあいだは、シミュレーションの時間（その日時）を返す */
export function advanceEclipse(delta: number): number | null {
  const e = useEclipse.getState()
  if (!e.open || !e.eclipseId) {
    eclipseNow.active = false
    return null
  }
  if (e.playing) {
    eclipseClock.ms += delta * MINUTES_PER_SECOND * 60_000
    if (eclipseClock.ms >= eclipseClock.peak + eclipseClock.span) {
      eclipseClock.ms = eclipseClock.peak + eclipseClock.span
      useEclipse.setState({ playing: false })
    }
  }
  updateGeometry(eclipseById(e.eclipseId)!.kind, eclipseClock.ms)
  return simTimeAt(eclipseClock.ms)
}

/**
 * 今の影の様子（本物の比率）。perp は、太陽と地球を結ぶ線から月の中心までのずれ（地球の半径が単位、画面の軸）。
 * umbra・penumbra は本影・半影の半径（日食なら地球のところ、月食なら月のところ。地球の半径が単位。日食の本影が負なら金環）
 */
export const eclipseNow = {
  active: false,
  kind: 'solar' as 'solar' | 'lunar',
  perp: new THREE.Vector3(),
  gamma: 0,
  umbra: 0,
  penumbra: 0,
  /** 地球の自転の角度（グリニッジの向き） */
  spin: 0,
}

const UP = new THREE.Vector3(0, 1, 0)

function updateGeometry(kind: 'solar' | 'lunar', ms: number) {
  const g = shadowGeometry(ms)
  const p = precession(ms)
  // その日の春分点が基準の向きを、画面（2000年の春分点が基準）の向きに
  eclipseNow.perp.set(g.perp.x, g.perp.y, g.perp.z).applyAxisAngle(UP, -p)
  eclipseNow.gamma = g.gamma
  eclipseNow.kind = kind
  eclipseNow.spin = greenwichSiderealTime(ms) - p
  if (kind === 'solar') {
    // 月の影：月から地球の表面までの距離で、本影はせまく（とどかなければ金環）、半影は広がる
    const x = g.moonKm - EARTH_RADIUS_KM
    eclipseNow.umbra = (MOON_KM * (1 - (x * (SUN_KM - MOON_KM)) / (SUN_DISTANCE_KM * MOON_KM))) / EARTH_RADIUS_KM
    eclipseNow.penumbra = (MOON_KM * (1 + (x * (SUN_KM + MOON_KM)) / (SUN_DISTANCE_KM * MOON_KM))) / EARTH_RADIUS_KM
  } else {
    // 地球の影：大気のぶん、2%ほど大きく見える
    const d = g.moonKm
    eclipseNow.umbra = 1.02 * (1 - (d * (SUN_KM - EARTH_RADIUS_KM)) / (SUN_DISTANCE_KM * EARTH_RADIUS_KM))
    eclipseNow.penumbra = 1.02 * (1 + (d * (SUN_KM + EARTH_RADIUS_KM)) / (SUN_DISTANCE_KM * EARTH_RADIUS_KM))
  }
  eclipseNow.active = true
}

/** 今どの段階か（説明の文を選ぶのに使う） */
export function eclipseStage(): 'none' | 'penumbral' | 'partial' | 'central' {
  const { kind, gamma, umbra, penumbra } = eclipseNow
  if (kind === 'solar') {
    if (gamma > 1 + penumbra) return 'none'
    if (gamma > 1 + Math.abs(umbra)) return 'partial'
    return 'central'
  }
  if (gamma > penumbra + MOON_IN_EARTH) return 'none'
  if (gamma > umbra + MOON_IN_EARTH) return 'penumbral'
  if (gamma > umbra - MOON_IN_EARTH) return 'partial'
  return 'central'
}

// ---- 画面の上の影 ----

/** 影を描く表面（地球・月）が共有する uniform。uShadowR は本影・半影の半径と、本影の中の暗さ */
export const eclipseUniforms = {
  uShadowOn: { value: 0 },
  uShadowC: { value: new THREE.Vector3() },
  uShadowD: { value: new THREE.Vector3(1, 0, 0) },
  uShadowR: { value: new THREE.Vector3() },
}

const sunDir = new THREE.Vector3()
const lateral = new THREE.Vector3()

/**
 * 地球の描画から毎フレーム呼ぶ。食を見ているあいだは、月を置く位置（地球の中心からのずれ）を out に入れて true を返し、
 * 影の uniform をそろえる。月は、太陽との線からのずれを本物の比率にして置く（その真後ろに影が落ちる）
 */
export function eclipseMoonOffset(earthW: THREE.Vector3, earthR: number, moonR: number, moonOrbit: number, out: THREE.Vector3) {
  const u = eclipseUniforms
  if (!eclipseNow.active) {
    u.uShadowOn.value = 0
    return false
  }
  sunDir.copy(earthW).negate().normalize()
  lateral.copy(eclipseNow.perp)
  lateral.addScaledVector(sunDir, -lateral.dot(sunDir))
  u.uShadowD.value.copy(sunDir).negate()
  if (eclipseNow.kind === 'solar') {
    // 日食：ずれは地球の大きさに合わせる。本影は本物（半径100km ほど）だと見えないので、少し大きめに
    // 月は少し太陽の側へ離して置く（ななめから見たとき、地球とその上の影に重ならないように）
    lateral.multiplyScalar(earthR)
    out.copy(sunDir).multiplyScalar(1.6 * moonOrbit).add(lateral)
    u.uShadowOn.value = 1
    u.uShadowC.value.copy(earthW).add(out)
    u.uShadowR.value.set(Math.max(0.03, Math.abs(eclipseNow.umbra) * 2) * earthR, eclipseNow.penumbra * earthR, eclipseNow.umbra > 0 ? 0.97 : 0.8)
  } else {
    // 月食：ずれと影の大きさを月の大きさに合わせる（月が影のどこを通るかを本物どおりに）
    const k = moonR / MOON_IN_EARTH
    lateral.multiplyScalar(k)
    out.copy(sunDir).multiplyScalar(-1.5 * moonOrbit).add(lateral)
    u.uShadowOn.value = 2
    u.uShadowC.value.copy(earthW)
    u.uShadowR.value.set(eclipseNow.umbra * k, eclipseNow.penumbra * k, 0)
  }
  return true
}
