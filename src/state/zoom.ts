import * as THREE from 'three'
import { approachKind } from '../data/approach'
import { bodies } from './registry'
import { raceActive } from './race'
import { SHIP_SCALE } from './flight'

// 接近ズーム：天体に近づくほど、自機とカメラをなめらかに小さくする。
// ふだんの表示では地球の直径が船の8隻分ほどしかなく、近づいても「大きな船の横に地球儀」に見えてしまう。
// 低い軌道では船を最大で百分の一ほどに縮め、地平線が画面いっぱいに丸く広がるようにする。

/** 今の縮める割合（1 = 縮めない） */
export const shipZoom = { factor: 1 }

/** 自機の今の表示の大きさ（ShipModel の座標の1が、この長さになる） */
export const shipScale = () => SHIP_SCALE / shipZoom.factor

/** 縮め始める高さと、いちばん縮める高さ（天体の半径に対する割合） */
const START = 2.2
const FULL = 0.12

/** 天体ごとの、いちばん縮めたときの割合。大きな天体ほど強く縮める */
const maxFactor = (radius: number) => THREE.MathUtils.clamp(radius * 40, 1, 120)

const p = new THREE.Vector3()

/** その位置で縮めたい割合。近くの天体のうち、いちばん強いもの */
function wanted(position: THREE.Vector3) {
  if (raceActive()) return 1
  let best = 1
  for (const body of bodies.values()) {
    if (approachKind(body.id) === 'object') continue
    body.object.getWorldPosition(p)
    const rel = (position.distanceTo(p) - body.radius) / body.radius
    if (rel > START) continue
    const k = 1 - THREE.MathUtils.smoothstep(rel, FULL, START)
    best = Math.max(best, maxFactor(body.radius) ** k)
  }
  return best
}

/** 毎フレーム呼ぶ。急に変わらないよう、対数の上でなめらかに追いかける */
export function updateZoom(position: THREE.Vector3, dt: number, frozen: boolean) {
  if (frozen) return
  const to = Math.log(wanted(position))
  const now = Math.log(shipZoom.factor)
  shipZoom.factor = Math.exp(now + (to - now) * (1 - Math.exp(-4 * dt)))
}
