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
      a.el.style.visibility = 'visible'
      a.el.style.transform = `translate(${((screen.x + 1) / 2) * size.width}px, ${((1 - screen.y) / 2) * size.height}px)`
    }
  })

  return null
}
