import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { eclipseById } from '../data/eclipses'
import { eclipseClock, useEclipse } from '../state/eclipse'
import { shadowGeometry } from '../data/moon'
import { bodies } from '../state/registry'
import { useLayout } from '../state/useLayout'

// 日食・月食を見るときのカメラ：地球と月が画面に収まるところに置いて、地球の公転についていく。見る向きはマウスや指で回せる

const OVERVIEW = new THREE.Vector3(0, 120, 220)
/** OVERVIEW の位置から全体が見える半径（Ship の全体マップと同じ） */
const OVERVIEW_FITS = 200
const UP = new THREE.Vector3(0, 1, 0)

/** パネルにかからない、画面の空いているところ（ピクセル） */
const free = { left: 0, right: 0, top: 0, bottom: 0 }

function measureFree(width: number, height: number) {
  const panel = document.querySelector('.eclipse-panel')?.getBoundingClientRect()
  const nav = document.querySelector('.nav-panel')?.getBoundingClientRect()
  // 横に広いパネルは画面の下（スマホの縦向き）、せまいパネルは左
  const bottom = panel && panel.width > width * 0.6
  free.left = panel && !bottom ? panel.right : 0
  free.bottom = panel && bottom ? panel.top : height
  // 右の航法コンピュータは、ひらいて縦に長いときは横を、たたんで小さいときは上をよける。左上の表示も上をよける
  const navTall = !!nav && nav.height > height / 2
  free.right = nav && navTall && nav.left > width / 2 ? nav.left : width
  const hud = document.querySelector('.hud')?.getBoundingClientRect()
  free.top = Math.max(nav && !navTall ? nav.bottom : 0, hud && hud.right > free.left + 1 ? hud.bottom : 0)
}

const right = new THREE.Vector3()
const upv = new THREE.Vector3()
const forward = new THREE.Vector3()
const rel = new THREE.Vector3()

/** focus から dir の向きにどれだけ離れれば、すべての球（中心と半径）が、空いているところ（tanX・tanY の広さ）に収まるか */
function fitDistance(focus: THREE.Vector3, dir: THREE.Vector3, spheres: [THREE.Vector3, number][], tanX: number, tanY: number) {
  forward.copy(dir).negate()
  right.crossVectors(forward, UP).normalize()
  upv.crossVectors(right, forward)
  let distance = 0
  for (const [center, radius] of spheres) {
    rel.copy(center).sub(focus)
    const z = rel.dot(forward)
    const margin = radius * 1.2
    distance = Math.max(distance, (Math.abs(rel.dot(right)) + margin) / tanX - z, (Math.abs(rel.dot(upv)) + margin) / tanY - z, margin * 2 - z)
  }
  return distance
}

const earth = new THREE.Vector3()
const moon = new THREE.Vector3()
const moonMid = new THREE.Vector3()
const moonStart = new THREE.Vector3()
const moonEnd = new THREE.Vector3()
const antiSun = new THREE.Vector3()
const side = new THREE.Vector3()
const dir = new THREE.Vector3()
const focus = new THREE.Vector3()

export function EclipseScene() {
  const { open, eclipseId } = useEclipse()
  const eclipse = open ? eclipseById(eclipseId) : null
  const layout = useLayout()
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const controls = useRef<OrbitControlsImpl>(null)
  /** 選んだばかりで、まだカメラを置いていない */
  const framing = useRef(false)
  const lastEarth = useRef(new THREE.Vector3())
  const viewing = useRef(false)
  const earthR = layout.radius.get('earth')!
  const moonR = layout.radius.get('moon')!

  useEffect(() => {
    if (eclipse) {
      framing.current = true
      viewing.current = true
      return
    }
    if (!viewing.current) return
    viewing.current = false
    // 一覧にもどったり閉じたりしたら、全体マップの視点にもどす
    const fit = Math.max(1, Math.max(...layout.orbit.values()) / OVERVIEW_FITS)
    camera.position.copy(OVERVIEW).multiplyScalar(fit)
    camera.up.set(0, 1, 0)
    camera.lookAt(0, 0, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eclipse])

  // 説明のパネルにかからないよう、空いているところの真ん中に見せる
  useEffect(() => {
    if (!open) return
    return () => {
      camera.clearViewOffset()
      camera.updateProjectionMatrix()
    }
  }, [open, camera])
  useFrame(() => {
    if (!open) return
    measureFree(size.width, size.height)
    const x = size.width / 2 - (free.left + free.right) / 2
    const y = size.height / 2 - (free.top + free.bottom) / 2
    camera.setViewOffset(size.width, size.height, x, y, size.width, size.height)
  })

  // 天体を動かした後に、カメラを動かす
  useFrame(() => {
    const c = controls.current
    const e = bodies.get('earth')
    const m = bodies.get('moon')
    if (!eclipse || !c || !e || !m) return
    e.object.getWorldPosition(earth)
    if (framing.current) {
      framing.current = false
      m.object.getWorldPosition(moon)
      antiSun.copy(earth).normalize()
      side.crossVectors(UP, antiSun).normalize()
      const half = Math.tan((camera.fov * Math.PI) / 360)
      const tanX = (half * (free.right - free.left)) / size.height
      const tanY = (half * (free.bottom - free.top)) / size.height
      // 月は影を左右に横切っていく。食の深いころの位置と、その前後（日食は道の半分、月食は8割まで）が入るようにする
      rel.copy(moon).sub(earth)
      const swing = rel.dot(side) * (eclipse.kind === 'solar' ? 0.5 : 0.8)
      moonMid.copy(moon).addScaledVector(side, -rel.dot(side))
      moonStart.copy(moonMid).addScaledVector(side, swing)
      moonEnd.copy(moonMid).addScaledVector(side, -swing)
      const spheres: [THREE.Vector3, number][] = [[earth, earthR]]
      // 距離を本物に近づけて月が遠いときは、地球だけを見る
      const moonNear = rel.length() < earthR * 6
      if (moonNear) spheres.push([moonMid, moonR], [moonStart, moonR], [moonEnd, moonR])
      // 月は太陽と地球を結ぶ線を横切っていくので、カメラはその線の斜め上から見る（月は地球の手前や向こうを左右に動く）。
      // 影が地球の南側に落ちる食（月が線より南を通る）は、南の斜め下から
      const above = shadowGeometry(eclipseClock.peak).perp.y < -0.1 ? -1 : 1
      if (eclipse.kind === 'solar') {
        // 日食：太陽の側から、昼の地球と、その手前の月を見る
        focus.copy(earth)
        if (moonNear) focus.lerp(moon, 0.3)
        dir.copy(antiSun).multiplyScalar(-0.7).addScaledVector(UP, above * 0.7).addScaledVector(side, 0.2).normalize()
      } else {
        // 月食：太陽の側から地球ごしに、照らされた満月が地球の影に入っていくところを見る
        focus.copy(earth).lerp(moon, 0.55)
        dir.copy(antiSun).multiplyScalar(-0.55).addScaledVector(UP, above * 0.65).addScaledVector(side, 0.25).normalize()
      }
      camera.position.copy(focus).addScaledVector(dir, fitDistance(focus, dir, spheres, tanX, tanY))
      camera.up.set(0, 1, 0)
      c.target.copy(focus)
      lastEarth.current.copy(earth)
      c.update()
      return
    }
    // 地球の公転についていく（月は影の中を動いていくのが見える）
    dir.copy(earth).sub(lastEarth.current)
    lastEarth.current.copy(earth)
    camera.position.add(dir)
    c.target.add(dir)
    c.update()
  })

  if (!eclipse) return null
  return <OrbitControls ref={controls} makeDefault enablePan={false} minDistance={earthR * 1.6} maxDistance={Math.max(80, layout.moon.get('moon')!.radius * 4)} />
}
