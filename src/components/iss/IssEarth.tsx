import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { earthMaterial } from '../moonMission/earth'
import { currentLevel, lowMemory } from '../../state/quality'
import { isTouchDevice } from '../../state/input'
import { issDebug } from '../../state/iss'

// 部屋を描き、窓の外の地球（本物の大きさ、ステーションの 約 410 km 下）を窓の中にだけ描く。
// 部屋（m の大きさ、near 3 cm）と地球（数千 km 先）は、同じ奥行きの範囲では描けないので、2 回に分けて描く：
//   1. 部屋を描く。窓のガラスの形をした型（色は描かない）が、見えている所にだけステンシルの印 1 を付ける
//      （デスティニーの床の窓は丸い型、キューポラは模型の窓のガラスそのもの。moduleLoader.ts）
//   2. 奥行きだけ消して、地球を別のカメラ（near 100 m）で、印 1 の所にだけ描く
// だから、模型のすきまや部屋の外からは地球が見えない（窓の中だけ）。窓のある部屋を読んでいないときは、地球を作らない。
// 地球は、ステーションの前（−Z）へ飛ぶのに合わせて、足もとを後ろへ流れる（約 92 分で 1 周）。見本は昼の側

const R_EARTH = 6_371_000
const ALT = 410_000
/** 1 周の秒数 */
const ORBIT_SEC = 92.7 * 60
/** 太陽の向き（昼の側：真上より少し前・右から） */
const SUN = new THREE.Vector3(0.35, 0.9, -0.25).normalize()
/** はじめに真下に見える所（緯度・経度）：雲と海と陸がまじる、カリブ海の北 */
const START_LAT = 23
const START_LON = -76

const base = import.meta.env.BASE_URL

/** 地図の (緯度, 経度) が、three の球（SphereGeometry）のどの向きにあるか */
function lonLatDir(lat: number, lon: number) {
  const phi = ((lon + 180) / 360) * Math.PI * 2
  const b = THREE.MathUtils.degToRad(lat)
  return new THREE.Vector3(-Math.cos(phi) * Math.cos(b), Math.sin(b), Math.sin(phi) * Math.cos(b))
}

/** 窓：型（シーンの中のステンシルの物）と、その範囲（画面に入っているかを調べる） */
export type IssWindow = { id: string; sphere: THREE.Sphere }

/** 地球の絵。スマホは 1k に縮めて GPU に載せる（2k の昼と雲で 22 MB → 6 MB。窓は小さいので見た目はほぼ同じ） */
function earthTexture(url: string, small: boolean) {
  const tex = new THREE.Texture()
  tex.colorSpace = THREE.SRGBColorSpace
  new THREE.ImageLoader().load(url, (img) => {
    if (small && img.width > 1024) {
      const c = document.createElement('canvas')
      c.width = 1024
      c.height = 512
      c.getContext('2d')!.drawImage(img, 0, 0, 1024, 512)
      tex.image = c
    } else tex.image = img
    tex.needsUpdate = true
  })
  return tex
}

/** 地球の場面（窓のある部屋を読んだときだけ作る） */
function makeEarth() {
  const small = lowMemory() || isTouchDevice() || currentLevel() === 'low'
  {
    // 窓は小さい（見えるのは 200 km ほど）ので、PC でも 2k で足りる（4k だとテクスチャのメモリが 33 MB 増える）
    const day = earthTexture(`${base}textures/2k_earth_daymap.jpg`, small)
    day.anisotropy = 4
    const clouds = earthTexture(`${base}textures/2k_earth_clouds.jpg`, small)
    // 昼の側だけなので、夜の街あかりの絵は使わない（黒い 1 画素）
    const night = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
    night.needsUpdate = true
    const mat = earthMaterial(day, night, clouds, { scatter: true, steps: small ? 6 : 10 })
    mat.uniforms.uSun.value.copy(SUN)
    mat.uniforms.uLights.value = 0
    mat.uniforms.uR.value = R_EARTH
    // 窓の型の中（ステンシル 1）にだけ描く
    mat.stencilWrite = true
    mat.stencilRef = 1
    mat.stencilFunc = THREE.EqualStencilFunc
    mat.stencilZPass = THREE.KeepStencilOp
    mat.stencilFail = THREE.KeepStencilOp
    mat.stencilZFail = THREE.KeepStencilOp
    const ball = new THREE.Mesh(new THREE.SphereGeometry(R_EARTH, 160, 100), mat)
    const s = new THREE.Scene()
    s.background = null
    const spin = new THREE.Group()
    spin.position.set(0, -(R_EARTH + ALT), 0)
    spin.add(ball)
    s.add(spin)
    // はじめの真下の所を、ステーションの真下（−Y）へ向ける
    const q0 = new THREE.Quaternion().setFromUnitVectors(lonLatDir(START_LAT, START_LON), new THREE.Vector3(0, -1, 0))
    const cam = new THREE.PerspectiveCamera(60, 1, 100, 2e7)
    return { scene: s, spin, ball, mat, day, clouds, night, q0, cam }
  }
}

export function IssEarth({ windows }: { windows: IssWindow[] }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const need = windows.length > 0
  const earth = useMemo(() => (need ? makeEarth() : null), [need])
  useEffect(
    () => () => {
      if (!earth) return
      earth.ball.geometry.dispose()
      earth.mat.dispose()
      earth.day.dispose()
      earth.clouds.dispose()
      earth.night.dispose()
    },
    [earth],
  )

  const frustum = useMemo(() => new THREE.Frustum(), [])
  const pv = useMemo(() => new THREE.Matrix4(), [])
  const qx = useMemo(() => new THREE.Quaternion(), [])
  const X = useMemo(() => new THREE.Vector3(1, 0, 0), [])

  // 描くのはここ（部屋 → 窓の中の地球）。優先度 1 なので、R3F は自分では描かない
  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (earth) {
      // ステーションは −Z へ進む → 足もとの地面は +Z へ流れる（X 軸のまわりに回す）
      qx.setFromAxisAngle(X, (-t / ORBIT_SEC) * Math.PI * 2)
      earth.spin.quaternion.copy(qx).multiply(earth.q0)
      earth.spin.updateMatrixWorld(true)
      earth.mat.uniforms.uCenter.value.setFromMatrixPosition(earth.spin.matrixWorld)
    }

    const autoClear = gl.autoClear
    gl.autoClear = false
    // 1 コマ分の描画の数を数える（部屋と地球の 2 回をまとめて：__sv.iss.debug.frame）
    gl.info.autoReset = false
    gl.info.reset()
    gl.clear(true, true, true)
    gl.render(scene, camera)
    pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(pv)
    if (earth && windows.some((w) => frustum.intersectsSphere(w.sphere))) {
      const c = earth.cam
      c.fov = camera.fov
      c.aspect = camera.aspect
      c.updateProjectionMatrix()
      c.position.copy(camera.position)
      c.quaternion.copy(camera.quaternion)
      c.updateMatrixWorld()
      gl.clearDepth()
      gl.render(earth.scene, c)
    }
    gl.autoClear = autoClear
    issDebug.frame.calls = gl.info.render.calls
    issDebug.frame.triangles = gl.info.render.triangles
    issDebug.frame.textures = gl.info.memory.textures
    issDebug.frame.geometries = gl.info.memory.geometries
  }, 1)

  return null
}
