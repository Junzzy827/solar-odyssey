import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { atmosphereMaterial, earthMaterial } from '../moonMission/earth'
import { loadCatalog } from '../Sky'
import { currentLevel, lowMemory } from '../../state/quality'
import { shrinkTexture } from '../surface/shrinkTexture'
import { earthStartQuaternion } from './earthStart'

// 窓の外：実寸の地球（高さ 約 590 km。STS-61 の軌道 321 海里 ≒ 595 km、FACTS.md [M]）と星。
// 乗員室とは別の場面にして、遠くまで描けるカメラ（near 1 km）で先に描く（乗員室の near 3 cm とは奥行きの精度が合わないため）。
// 姿勢：荷物室を地球に向けている（地球は「頭の上」）。この向きは見せ方のために選んだもの（UNVERIFIED）。
// 地球は軌道の速さ（約 96 分で 1 周）で、機首の側から後ろへ流れていく。
// 軌道の傾きは 28.45°（FACTS.md [M]）。はじめの真下は大西洋のまん中（海と雲。国の位置には意味を持たせない）。

const base = import.meta.env.BASE_URL
const EARTH_R = 6_371_000
const ALT = 590_000
/** 太陽の向き（地球から見て乗員室の側＝地球の昼側にいる／地球の向こう＝夜側） */
const SUN_DAY = new THREE.Vector3(0.3, -0.5, -0.8).normalize()
const SUN_NIGHT = new THREE.Vector3(-0.25, 0.9, 0.35).normalize()
const ORBIT_RATE = (Math.PI * 2) / (96 * 60)
const INCLINATION = THREE.MathUtils.degToRad(28.45)
/** はじめの真下の点（北緯・東経、度） */
const START = { lat: 12, lon: -40 }
const X_AXIS = new THREE.Vector3(1, 0, 0)
const _q = new THREE.Quaternion()

export type OutsideHandle = {
  setAttitude: (e: THREE.Euler) => void
  render: (gl: THREE.WebGLRenderer, cam: THREE.PerspectiveCamera, dark: number, dt: number) => void
}

export const OutsideSky = forwardRef<OutsideHandle>(function OutsideSky(_, ref) {
  const phone = lowMemory()
  // PC（画質が「軽い」以外）は昼の地図を 4k に、雲を 2k のまま使う：真上の窓いっぱいに地球が見えるので、2k ではぼやけた
  const sharp = !phone && currentLevel() !== 'low'
  // スマホは小さい雲の絵（1024、109 KB）を読む：雲なしでは、真上の窓が青 1 色に見えた
  const [day0, night0, clouds0] = useTexture([
    `${base}textures/${sharp ? '4k' : '2k'}_earth_daymap.jpg`,
    `${base}textures/earth/bm_night_2k.jpg`,
    `${base}textures/${phone ? '1k' : '2k'}_earth_clouds.jpg`,
  ])
  const [stars, setStars] = useState<THREE.BufferGeometry | null>(null)
  useEffect(() => {
    let alive = true
    loadCatalog().then((g) => alive && setStars(g), () => {})
    return () => {
      alive = false
    }
  }, [])
  const world = useMemo(() => {
    // メモリ対策：夜の明かりは 1024 に縮める。雲は PC の「軽い」画質とスマホで 1024。スマホは昼の地図も 1024
    const owned: { dispose: () => void }[] = []
    const shrink = (t: THREE.Texture, n: number) => {
      const s = shrinkTexture(t, n)
      if (s) owned.push(s)
      return s ?? t
    }
    const day = phone ? shrink(day0, 1024) : day0
    const night = shrink(night0, 1024)
    const clouds = shrink(clouds0, sharp ? 2048 : 1024)
    day.colorSpace = THREE.SRGBColorSpace
    night.colorSpace = THREE.SRGBColorSpace
    day.anisotropy = 8
    const earth = earthMaterial(day, night, clouds, { scatter: true, steps: phone ? 8 : 12 })
    earth.uniforms.uR.value = EARTH_R
    earth.uniforms.uLights.value = 0.8
    const atmo = atmosphereMaterial({ scatter: true, steps: phone ? 8 : 12 })
    atmo.uniforms.uR.value = EARTH_R
    atmo.uniforms.uSky.value = 1
    owned.push(earth, atmo)
    const scene = new THREE.Scene()
    const pivot = new THREE.Group()
    scene.add(pivot)
    const center = new THREE.Group()
    center.position.set(0, EARTH_R + ALT, 0)
    pivot.add(center)
    const spin = new THREE.Group()
    // 地図のどこから見るか（前は南極の近くが真下に来ていて、窓の外が白っぽい 1 色に見えた）
    spin.quaternion.copy(earthStartQuaternion(START.lat, START.lon, INCLINATION))
    center.add(spin)
    const ballGeo = new THREE.SphereGeometry(EARTH_R, phone ? 128 : 192, phone ? 96 : 128)
    const airGeo = new THREE.SphereGeometry(EARTH_R + 100_000, 96, 64)
    owned.push(ballGeo, airGeo)
    const ball = new THREE.Mesh(ballGeo, earth)
    ball.frustumCulled = false
    spin.add(ball)
    const air = new THREE.Mesh(airGeo, atmo)
    air.frustumCulled = false
    center.add(air)
    const cam = new THREE.PerspectiveCamera(60, 1, 1000, 2e7)
    const starMat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float mag;
        attribute vec3 color;
        uniform float uDim;
        varying vec3 vColor;
        void main() {
          float flux = pow(10.0, -0.4 * (mag - 1.0) * 0.6);
          vColor = color * min(flux * 0.9, 2.0) * uDim;
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
          gl_Position.z = gl_Position.w * 0.999999;
          gl_PointSize = clamp(1.2 + 1.3 * sqrt(flux), 1.2, 4.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          gl_FragColor = vec4(vColor * exp(-r * r * 3.0), 1.0);
        }`,
      uniforms: { uDim: { value: 0.3 } },
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
    owned.push(starMat)
    const sun = new THREE.Vector3().copy(SUN_DAY)
    const att = new THREE.Quaternion()
    const texBytes = () => [day, night, clouds].reduce((n, t) => n + ((t.image as { width?: number }).width ?? 0) * ((t.image as { height?: number }).height ?? 0) * 4 * (4 / 3), 0)
    return { scene, pivot, center, spin, earth, atmo, cam, starMat, sun, att, owned, texBytes }
  }, [day0, night0, clouds0, phone, sharp])
  useEffect(() => {
    ;(window as unknown as { __shuttleSkyTex?: () => number }).__shuttleSkyTex = world.texBytes
    return () => {
      world.owned.forEach((o) => o.dispose())
      delete (window as unknown as { __shuttleSkyTex?: () => number }).__shuttleSkyTex
    }
  }, [world])
  useEffect(() => {
    if (!stars) return
    const pts = new THREE.Points(stars, world.starMat)
    pts.frustumCulled = false
    pts.renderOrder = -3
    pts.scale.setScalar(1000)
    world.pivot.add(pts)
    return () => {
      world.pivot.remove(pts)
    }
  }, [stars, world])

  useImperativeHandle(
    ref,
    () => ({
      setAttitude: (e) => {
        // 機体が傾く ＝ 外の景色が逆に傾く
        world.att.setFromEuler(e).invert()
        world.pivot.quaternion.copy(world.att)
      },
      render: (gl, cam, dark, dt) => {
        // 軌道の面に垂直な軸（場面の X）のまわりに回す：真下の地面が機首から後ろへ流れる
        world.spin.quaternion.premultiply(_q.setFromAxisAngle(X_AXIS, -ORBIT_RATE * dt))
        world.sun.copy(SUN_DAY).lerp(SUN_NIGHT, dark).normalize()
        // 太陽の向きも景色と一緒に傾ける
        const sunW = world.sun.clone().applyQuaternion(world.att)
        world.earth.uniforms.uSun.value.copy(sunW)
        world.atmo.uniforms.uSun.value.copy(sunW)
        world.pivot.updateMatrixWorld(true)
        world.center.getWorldPosition(world.earth.uniforms.uCenter.value)
        world.atmo.uniforms.uCenter.value.copy(world.earth.uniforms.uCenter.value)
        world.starMat.uniforms.uDim.value = 0.25 + 0.75 * dark
        const c = world.cam
        c.position.copy(cam.position)
        c.quaternion.copy(cam.quaternion)
        c.fov = cam.fov
        c.aspect = cam.aspect
        c.updateProjectionMatrix()
        gl.render(world.scene, c)
      },
    }),
    [world],
  )
  return null
})
