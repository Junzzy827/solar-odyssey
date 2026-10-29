import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { SHOTS, SHOT_SECONDS, type View } from '../../data/shipParts'
import { galleryAnchors, galleryGoal, stopAuto, useGallery } from '../../state/gallery'
import { SHIP_SCALE, ship } from '../../state/flight'

// 鑑賞モードのカメラ。視点は船の座標（ShipModel の座標）で持ち、船が向きを変えても一緒に回る

const GALLERY_FOV = 38
const MIN_DIST = 0.12
const MAX_DIST = 3.2

/** 今の視点。目標の視点（galleryGoal）へなめらかに近づく */
const current: View = { yaw: 0, pitch: 0.15, dist: 1, target: [0, 0, 0] }
let autoTime = 0

const rel = new THREE.Vector3()
const target = new THREE.Vector3()
const dir = new THREE.Vector3()
const up = new THREE.Vector3()
const inverse = new THREE.Quaternion()
const eye = new THREE.Vector3()
const toEye = new THREE.Vector3()
const side = new THREE.Vector3()
const screen = new THREE.Vector3()

/** この画面で名札を出す位置（画面のピクセル） */
const placing: { el: HTMLElement; x: number; y: number }[] = []
/** 名札の大きさ（文字が変わったとき＝言語を切り替えたときだけ測り直す） */
const labelSize = new WeakMap<HTMLElement, { w: number; h: number; text: string }>()
/** 点から名札までの間（CSS の .gallery-anchor button の left と同じ） */
const LABEL_GAP = 12

type Rect = [number, number, number, number]
/** 名札を置いてみる場所：点の右・左、それでも重なれば上下に一段ずつずらす */
const SPOTS: [boolean, number][] = [[false, 0], [true, 0], [false, -1], [false, 1], [true, -1], [true, 1], [false, -2], [false, 2]]

/** 名札が重なったり画面やパネルからはみ出したりしないように、右の名札から順に置き場所を決める */
function spreadLabels(width: number, panel: DOMRect | undefined) {
  placing.sort((a, b) => b.x - a.x)
  const placed: Rect[] = panel ? [[panel.left, panel.right, panel.top, panel.bottom]] : []
  const rect = (p: (typeof placing)[number], left: boolean, dy: number): Rect => {
    let s = labelSize.get(p.el)
    if (!s || s.text !== p.el.textContent) {
      const button = p.el.firstElementChild as HTMLElement | null
      s = { w: button?.offsetWidth ?? 0, h: button?.offsetHeight ?? 0, text: p.el.textContent ?? '' }
      labelSize.set(p.el, s)
    }
    const x0 = left ? p.x - LABEL_GAP - s.w : p.x - 4
    const x1 = left ? p.x + 4 : p.x + LABEL_GAP + s.w
    const y = p.y + dy * (s.h + 2)
    return [x0, x1, y - s.h / 2, y + s.h / 2]
  }
  const fits = (r: Rect) => r[0] >= 0 && r[1] <= width && !placed.some((q) => r[0] < q[1] && q[0] < r[1] && r[2] < q[3] && q[2] < r[3])
  for (const p of placing) {
    const [left, step] = SPOTS.find(([l, d]) => fits(rect(p, l, d))) ?? SPOTS[0]
    if (left !== p.el.classList.contains('left')) p.el.classList.toggle('left', left)
    const h = labelSize.get(p.el)?.h ?? 0
    p.el.style.setProperty('--dy', `${step * (h + 2)}px`)
    placed.push(rect(p, left, step))
  }
  placing.length = 0
}

/** 角度の差を -π〜π にする（遠回りせずに回る） */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const smooth = (t: number) => t * t * (3 - 2 * t)

/** おまかせの、今の時刻での視点 */
function autoView(t: number, out: View) {
  const shot = SHOTS[Math.floor(t / SHOT_SECONDS) % SHOTS.length]
  const k = smooth((t % SHOT_SECONDS) / SHOT_SECONDS)
  out.yaw = shot.from.yaw + wrap(shot.to.yaw - shot.from.yaw) * k
  out.pitch = THREE.MathUtils.lerp(shot.from.pitch, shot.to.pitch, k)
  out.dist = THREE.MathUtils.lerp(shot.from.dist, shot.to.dist, k)
  out.target = shot.from.target.map((v, i) => THREE.MathUtils.lerp(v, shot.to.target[i], k)) as View['target']
}

export function GalleryCamera() {
  const { camera, gl, size } = useThree()

  // 鑑賞モードの画面に隠れないよう、船を空いている所の真ん中に映す（終わったら戻す）
  useEffect(() => () => (camera as THREE.PerspectiveCamera).clearViewOffset(), [camera])

  // 入ったときは、今のカメラの位置から始める（操縦席の後ろからなめらかに回り込む）
  useEffect(() => {
    inverse.copy(ship.quaternion).invert()
    rel.copy(camera.position).sub(ship.position).applyQuaternion(inverse).divideScalar(SHIP_SCALE)
    const d = Math.max(MIN_DIST, rel.length())
    current.dist = d
    current.yaw = Math.atan2(rel.x, rel.z)
    current.pitch = Math.asin(THREE.MathUtils.clamp(rel.y / d, -1, 1))
    current.target = [0, 0, 0]
    autoTime = 0
  }, [camera])

  // ドラッグで回す・ホイールで寄る／引く
  useEffect(() => {
    const el = gl.domElement
    let drag: { x: number; y: number } | null = null
    // 画面に触れている指（2本なら、指の間の広さで寄る／引く）
    const fingers = new Map<number, { x: number; y: number }>()
    let pinch = 0
    const spread = () => {
      const [a, b] = [...fingers.values()]
      return Math.hypot(a.x - b.x, a.y - b.y)
    }
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      el.setPointerCapture(e.pointerId)
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (fingers.size === 2) {
        drag = null
        pinch = spread()
      } else drag = { x: e.clientX, y: e.clientY }
    }
    // おまかせで動いていたら止めて、今の視点から続けて動かす
    const takeOver = () => {
      if (!useGallery.getState().auto) return
      Object.assign(galleryGoal, { ...current, target: [...current.target] })
      stopAuto()
    }
    const move = (e: PointerEvent) => {
      if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (fingers.size === 2) {
        const now = spread()
        if (pinch > 0 && now > 0) {
          takeOver()
          galleryGoal.dist = THREE.MathUtils.clamp((galleryGoal.dist * pinch) / now, MIN_DIST, MAX_DIST)
        }
        pinch = now
        return
      }
      if (!drag) return
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      drag = { x: e.clientX, y: e.clientY }
      if (dx === 0 && dy === 0) return
      takeOver()
      galleryGoal.yaw -= dx * 0.006
      galleryGoal.pitch = THREE.MathUtils.clamp(galleryGoal.pitch + dy * 0.005, -1.45, 1.45)
    }
    const end = (e: PointerEvent) => {
      fingers.delete(e.pointerId)
      drag = null
      pinch = 0
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      takeOver()
      galleryGoal.dist = THREE.MathUtils.clamp(galleryGoal.dist * Math.exp(e.deltaY * 0.0012), MIN_DIST, MAX_DIST)
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', end)
    el.addEventListener('pointercancel', end)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', end)
      el.removeEventListener('pointercancel', end)
      el.removeEventListener('wheel', wheel)
    }
  }, [gl])

  useFrame((_, rawDelta) => {
    // 描画が遅い機械でも、カメラの動きは実際の時間で進める
    const dt = Math.min(rawDelta, 0.25)
    const auto = useGallery.getState().auto
    if (auto) {
      autoTime += dt
      autoView(autoTime, galleryGoal)
    } else autoTime = 0

    // 目標の視点へ近づく（距離は割合で近づけると、寄るときも引くときも同じ感じになる）
    const k = 1 - Math.exp(-(auto ? 1.6 : 4) * dt)
    current.yaw += wrap(galleryGoal.yaw - current.yaw) * k
    current.pitch += (galleryGoal.pitch - current.pitch) * k
    current.dist *= (galleryGoal.dist / current.dist) ** k
    current.target = current.target.map((v, i) => v + (galleryGoal.target[i] - v) * k) as View['target']

    const cp = Math.cos(current.pitch)
    dir.set(Math.sin(current.yaw) * cp, Math.sin(current.pitch), Math.cos(current.yaw) * cp)
    target.fromArray(current.target)
    rel.copy(target).addScaledVector(dir, current.dist)
    // 船の座標から世界の座標へ
    target.multiplyScalar(SHIP_SCALE).applyQuaternion(ship.quaternion).add(ship.position)
    camera.position.copy(rel.multiplyScalar(SHIP_SCALE).applyQuaternion(ship.quaternion).add(ship.position))
    camera.up.copy(up.set(0, 1, 0).applyQuaternion(ship.quaternion))
    camera.lookAt(target)
    const cam = camera as THREE.PerspectiveCamera
    cam.fov += (GALLERY_FOV - cam.fov) * (1 - Math.exp(-3 * dt))
    const panel = document.querySelector('.gallery-panel')?.getBoundingClientRect()
    // 右にあるときは左へ、下にあるとき（狭い画面）は上へずらす
    const shiftX = panel && panel.left > size.width / 2 ? (size.width - panel.left) / 2 : 0
    const shiftY = panel && panel.top > size.height / 3 ? (size.height - panel.top) / 2 : 0
    cam.setViewOffset(size.width, size.height, shiftX, shiftY, size.width, size.height)
    cam.updateMatrixWorld()

    // 名札：動かしたばかりのカメラで画面の位置を決める（遅れて追いかけないように）
    eye.set(Math.sin(current.yaw) * cp, Math.sin(current.pitch), Math.cos(current.yaw) * cp).multiplyScalar(current.dist).add(target.fromArray(current.target))
    for (const a of galleryAnchors.values()) {
      // その部分の裏側から見ているときは消す
      const hidden = a.side !== null && toEye.subVectors(eye, side.fromArray(a.pos)).normalize().dot(side.fromArray(a.side).normalize()) < -0.2
      screen.fromArray(a.pos).multiplyScalar(SHIP_SCALE).applyQuaternion(ship.quaternion).add(ship.position).project(camera)
      if (hidden || screen.z > 1) {
        a.el.style.visibility = 'hidden'
        continue
      }
      const x = ((screen.x + 1) / 2) * size.width
      const y = ((1 - screen.y) / 2) * size.height
      a.el.style.visibility = 'visible'
      a.el.style.transform = `translate(${x}px, ${y}px)`
      if (!a.el.classList.contains('compare')) placing.push({ el: a.el, x, y })
    }
    spreadLabels(size.width, panel)
  })

  return null
}
