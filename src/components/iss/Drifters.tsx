import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { MeshBVH } from 'three-mesh-bvh'
import { FloatController } from './floatControl'

// くらしの小物：ペン・食べ物のパック・スプーン・小さなレンチ・テープ・タオルが、ゆっくり漂う。
// 体が近づくと、そっと押されて離れていき、くるくる回る。壁に当たると、やわらかくはね返る（当たり判定は体と同じ仕組み）。
// 部屋は照明の計算をしないので、小物の陰影は「マットキャップ」（光の当たり方を描いた丸い絵）で付ける。

type Item = { mesh: THREE.Object3D; body: FloatController; spin: THREE.Vector3 }

/** 白い部屋の天井の光に合わせた、上が明るく下がやや暗いマットキャップ */
function makeMatcap() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(52, 40, 6, 64, 64, 64)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.45, '#d9dde2')
  grad.addColorStop(0.85, '#8e959e')
  grad.addColorStop(1, '#5d636b')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** 小物を作る（大きさは本物くらい、m） */
function buildItems(matcap: THREE.Texture) {
  const own: { dispose: () => void }[] = []
  const mat = (color: string) => {
    const m = new THREE.MeshMatcapMaterial({ color, matcap, toneMapped: false })
    own.push(m)
    return m
  }
  const geo = <T extends THREE.BufferGeometry>(g: T) => {
    own.push(g)
    return g
  }
  const items: THREE.Object3D[] = []
  // ペン（青い軸と白いキャップ）
  const pen = new THREE.Group()
  pen.add(new THREE.Mesh(geo(new THREE.CylinderGeometry(0.0055, 0.0055, 0.12, 10)), mat('#2f5fb8')))
  const cap = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.006, 0.006, 0.035, 10)), mat('#f2f2f2'))
  cap.position.y = 0.07
  pen.add(cap)
  items.push(pen)
  // 食べ物のパック（銀色の袋と、色の帯）
  const pouch = new THREE.Group()
  pouch.add(new THREE.Mesh(geo(new THREE.BoxGeometry(0.11, 0.15, 0.025)), mat('#c9ccd0')))
  const band = new THREE.Mesh(geo(new THREE.BoxGeometry(0.112, 0.045, 0.027)), mat('#e0773a'))
  band.position.y = 0.02
  pouch.add(band)
  items.push(pouch)
  // スプーン
  const spoon = new THREE.Group()
  const handle = new THREE.Mesh(geo(new THREE.BoxGeometry(0.012, 0.12, 0.004)), mat('#d8dbe0'))
  handle.position.y = -0.03
  const bowl = new THREE.Mesh(geo(new THREE.SphereGeometry(0.02, 12, 8).scale(1, 1.4, 0.35)), mat('#d8dbe0'))
  bowl.position.y = 0.045
  spoon.add(handle, bowl)
  items.push(spoon)
  // 小さなレンチ
  const wrench = new THREE.Group()
  const shaft = new THREE.Mesh(geo(new THREE.BoxGeometry(0.014, 0.13, 0.006)), mat('#9aa1aa'))
  const head = new THREE.Mesh(geo(new THREE.TorusGeometry(0.016, 0.006, 6, 14, Math.PI * 1.6)), mat('#9aa1aa'))
  head.position.y = 0.075
  wrench.add(shaft, head)
  items.push(wrench)
  // ダクトテープ（灰色の輪）
  items.push(new THREE.Mesh(geo(new THREE.TorusGeometry(0.035, 0.014, 8, 20)), mat('#8d9196')))
  // 青いタオル（四角い布）
  items.push(new THREE.Mesh(geo(new THREE.BoxGeometry(0.2, 0.14, 0.006)), mat('#5a8fc9')))
  return { items, dispose: () => own.forEach((o) => o.dispose()) }
}

/** 漂う場所（three の座標 m）：実験棟の通路のあちこち */
const SPOTS: [number, number, number][] = [
  [-0.35, 0.35, -3.6],
  [0.45, -0.25, -5.2],
  [-0.2, 0.55, -6.2],
  [0.3, 0.4, -7.9],
  [-0.45, -0.3, -8.8],
  [0.15, -0.5, -9.6],
]

export function Drifters({ ctrl, bvh }: { ctrl: FloatController; bvh: MeshBVH }) {
  const set = useMemo(() => {
    const matcap = makeMatcap()
    const built = buildItems(matcap)
    const list: Item[] = built.items.map((mesh, i) => {
      const body = new FloatController({ radius: 0.06, accel: 0, maxSpeed: 0.8, drag: 0.04, bounce: 0.55 })
      body.pos.set(...SPOTS[i % SPOTS.length])
      // はじめから、ほんの少しだけ動いている
      body.vel.set(Math.sin(i * 2.1) * 0.02, Math.cos(i * 1.3) * 0.015, Math.sin(i * 0.7) * 0.02)
      mesh.rotation.set(i, i * 0.5, i * 0.3)
      return { mesh, body, spin: new THREE.Vector3(Math.sin(i) * 0.3, 0.2, Math.cos(i) * 0.25) }
    })
    return { list, matcap, dispose: built.dispose }
  }, [])
  useEffect(() => {
    set.list.forEach((it) => it.body.setCollider(bvh))
    return () => set.list.forEach((it) => it.body.setCollider(null))
  }, [set, bvh])
  useEffect(
    () => () => {
      set.dispose()
      set.matcap.dispose()
    },
    [set],
  )
  const away = useMemo(() => new THREE.Vector3(), [])
  const none = useMemo(() => ({ x: 0, y: 0, z: 0 }), [])
  useFrame((_, dt) => {
    dt = Math.min(dt, 0.05)
    for (const it of set.list) {
      // 体がふれたら、体の速さに合わせて押しやる（そっと）
      away.copy(it.body.pos).sub(ctrl.pos)
      const d = away.length()
      const reach = ctrl.radius + it.body.radius + 0.04
      if (d < reach) {
        away.divideScalar(Math.max(d, 1e-4))
        const push = 0.18 + ctrl.vel.length() * 0.7
        if (it.body.vel.dot(away) < push) it.body.vel.addScaledVector(away, push - Math.max(0, it.body.vel.dot(away)))
        it.body.pos.copy(ctrl.pos).addScaledVector(away, reach)
        it.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(4)
      }
      it.body.update(dt, none)
      it.spin.multiplyScalar(Math.exp(-dt * 0.15))
      it.mesh.position.copy(it.body.pos)
      it.mesh.rotation.x += it.spin.x * dt
      it.mesh.rotation.y += it.spin.y * dt
      it.mesh.rotation.z += it.spin.z * dt
    }
  })
  return (
    <>
      {set.list.map((it, i) => (
        <primitive key={i} object={it.mesh} />
      ))}
    </>
  )
}
