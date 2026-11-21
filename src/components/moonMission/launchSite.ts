import * as THREE from 'three'
import { glowTexture } from './plume'

// 打ち上げの場面の「地面の組」に置く、発射台のまわりの土地：陸（西）・海（東）・炎の溝・コンクリートの広場・夜の町の明かり。
// 座標は地面の組の中（x 東、y 上、z 南、ロケットの根元が原点）。地面の組ごと、地球の自転と一緒に回る。

/** 移動発射台の甲板の下の、発射台の地面の高さ（m、ロケットの根元が 0） */
export const GROUND_Y = -13.8

/** 発射台のまわりの夜の明かり（町・道路）。西と南の陸に、ところどころ集まった町 */
function cityLightsGeometry(small: boolean) {
  const n = small ? 500 : 1400
  const pos = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const town = i % 7
    const cx = -9000 - town * 2600 + (town % 2) * 4000
    const cz = -12000 + town * 5200
    const r = 400 + Math.random() * (town === 3 ? 6000 : 2200)
    const a = Math.random() * Math.PI * 2
    pos[i * 3] = Math.min(-600, cx + Math.cos(a) * r)
    pos[i * 3 + 1] = GROUND_Y + 2
    pos[i * 3 + 2] = cz + Math.sin(a) * r
    const w = 0.7 + Math.random() * 0.3
    col[i * 3] = w
    col[i * 3 + 1] = w * (0.72 + Math.random() * 0.15)
    col[i * 3 + 2] = w * 0.45
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

export type LaunchSite = {
  group: THREE.Group
  /** 溝の炎の強さ k（0〜1）と時刻 t */
  update(k: number, t: number): void
  dispose(): void
}

export function buildSite(small: boolean): LaunchSite {
  const group = new THREE.Group()
  group.name = 'LaunchSite'
  const geos: THREE.BufferGeometry[] = []
  const mats: THREE.Material[] = []
  /** 地面に平らに寝かせた板 */
  const flat = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    geos.push(geo)
    mats.push(mat)
    const m = new THREE.Mesh(geo, mat)
    m.rotation.x = -Math.PI / 2
    m.position.set(x, y, z)
    group.add(m)
    return m
  }
  // 陸（西）と海（東）
  flat(new THREE.PlaneGeometry(30000, 60000), new THREE.MeshStandardMaterial({ color: '#1a1c16', roughness: 0.95 }), -15000, GROUND_Y, 0)
  flat(new THREE.PlaneGeometry(30000, 60000), new THREE.MeshStandardMaterial({ color: '#04070c', roughness: 0.18, metalness: 0.2 }), 15600, GROUND_Y - 0.5, 0)
  // 炎の溝（南北に走る深い溝）：上から見ると暗い穴。点火すると炎で満たされる
  flat(new THREE.PlaneGeometry(18, 70), new THREE.MeshBasicMaterial({ color: '#030303' }), 0, GROUND_Y + 0.12, 0)
  const fireMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#ff9a3a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  const trenchFire = flat(new THREE.PlaneGeometry(34, 80), fireMat, 0, GROUND_Y + 0.4, 0)
  trenchFire.visible = false
  // 発射台のコンクリートの広場
  flat(new THREE.CircleGeometry(180, 8), new THREE.MeshStandardMaterial({ color: '#5a5a56', roughness: 0.9 }), 0, GROUND_Y + 0.05, 0)
  // 町の明かり
  const cityGeo = cityLightsGeometry(small)
  const cityMat = new THREE.PointsMaterial({ vertexColors: true, size: 2.2, sizeAttenuation: false, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  geos.push(cityGeo)
  mats.push(cityMat)
  group.add(new THREE.Points(cityGeo, cityMat))

  return {
    group,
    update(k, t) {
      trenchFire.visible = k > 0.01
      fireMat.opacity = Math.min(1, k * 1.4) * (0.85 + 0.15 * Math.sin(t * 29))
    },
    dispose() {
      for (const g of geos) g.dispose()
      for (const m of mats) m.dispose()
    },
  }
}
