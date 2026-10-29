import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PLANETS } from '../data/bodies'
import { ship } from '../state/flight'
import { proximity } from '../state/proximity'
import { useStore } from '../state/store'
import { shipScale } from '../state/zoom'

// 天体のそばで船の横を流れていく細かな塵（大気のある天体の低いところでは、空気の色の薄い霧）。
// 船の大きさの箱の中に散らばり、船が進むと後ろへ流れる。すぐそばを速く流れる粒と、
// ゆっくり動く遠くの地表との差で、惑星の大きさが伝わる。

const COUNT = 420
/** 粒を散らす箱の大きさ（船の長さに対する倍率） */
const BOX = 4
/** 光の筋の長さ（何秒分の移動か） */
const TRAIL_SECONDS = 0.06

const airColor = new Map(PLANETS.filter((p) => p.atmosphere).map((p) => [p.id, new THREE.Color(p.atmosphere)]))
const DUST = new THREE.Color('#d9dce6')

const anchor = new THREE.Vector3()
const moved = new THREE.Vector3()
const trail = new THREE.Vector3()
const tint = new THREE.Color()

export function SpaceDust() {
  const { mesh, geometry, local } = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 6), 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(COUNT * 6), 3).setUsage(THREE.DynamicDrawUsage))
    const m = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    const mesh = new THREE.LineSegments(g, m)
    mesh.frustumCulled = false
    // 箱の中の位置（箱の大きさを1とした割合）
    const local = new Float32Array(COUNT * 3).map(() => Math.random() - 0.5)
    return { mesh, geometry: g, local }
  }, [])
  const last = useMemo(() => ({ pos: new THREE.Vector3(), box: 0 }), [])

  useFrame(({ camera }) => {
    const st = useStore.getState()
    const rel = proximity.radius > 0 ? proximity.altitude / proximity.radius : Infinity
    const speed = ship.velocity.length()
    const box = shipScale() * BOX
    // 天体のそば（半径の2.5倍より低いところ）で、動いているときだけ
    const near = proximity.kind === 'object' ? 0 : 1 - THREE.MathUtils.smoothstep(rel, 0.6, 2.5)
    const amount = st.mode === 'flight' && st.warpPhase === 'idle' ? near * Math.min(1, speed / (box * 0.6)) : 0
    mesh.visible = amount > 0.01
    anchor.copy(camera.position)
    if (!mesh.visible) {
      last.pos.copy(anchor)
      last.box = box
      return
    }

    // カメラが動いた分だけ粒を後ろへずらし、箱からはみ出たら反対側へ回す
    moved.copy(anchor).sub(last.pos).divideScalar(box)
    if (last.box === 0 || moved.lengthSq() > 4) moved.set(0, 0, 0)
    last.pos.copy(anchor)
    last.box = box
    trail.copy(ship.velocity).multiplyScalar(-TRAIL_SECONDS)
    trail.clampLength(0, box * 0.3)

    // 大気の中の低いところでは空気の色、それ以外は白っぽい塵
    const air = proximity.id ? airColor.get(proximity.id) : undefined
    const inAir = air ? 1 - THREE.MathUtils.smoothstep(rel, 0.08, 0.3) : 0
    tint.copy(DUST).lerp(air ?? DUST, inAir).multiplyScalar(0.55 * amount)

    const pos = geometry.getAttribute('position') as THREE.BufferAttribute
    const col = geometry.getAttribute('color') as THREE.BufferAttribute
    for (let i = 0; i < COUNT; i++) {
      let x = local[i * 3] - moved.x
      let y = local[i * 3 + 1] - moved.y
      let z = local[i * 3 + 2] - moved.z
      x -= Math.round(x)
      y -= Math.round(y)
      z -= Math.round(z)
      local[i * 3] = x
      local[i * 3 + 1] = y
      local[i * 3 + 2] = z
      // 箱の縁に近い粒は薄くして、出入りが目立たないようにする。カメラのすぐ前の粒も、画面を横切る長い線にならないよう消す
      const r = Math.hypot(x, y, z)
      const fade = Math.max(0, 1 - r * 2) * THREE.MathUtils.smoothstep(r, 0.05, 0.15)
      pos.setXYZ(i * 2, x * box, y * box, z * box)
      pos.setXYZ(i * 2 + 1, x * box + trail.x, y * box + trail.y, z * box + trail.z)
      col.setXYZ(i * 2, tint.r * fade, tint.g * fade, tint.b * fade)
      col.setXYZ(i * 2 + 1, 0, 0, 0)
    }
    pos.needsUpdate = true
    col.needsUpdate = true
    mesh.position.copy(anchor)
  })

  return <primitive object={mesh} />
}
