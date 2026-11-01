import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { SurfaceDef } from '../../data/surfaces'
import type { SkyNow } from './skyNow'
import type { Terrain } from './terrain'
import { gritMaterial, puffMaterial, windFor } from './landerFx'
import { weatherNow } from './weather'

// 砂嵐とつむじ風の見た目（天気の強さは weather.ts）。
// ・飛砂：カメラのまわりの細かい砂つぶが、風下へ地面すれすれを流れる
// ・砂のもや：大きな薄いかたまりが、地面を這うように流れていく（流れの向きと速さが見える）
// ・つむじ風：遠くに立ちのぼる、細い砂の柱。回りながらゆっくり移動する
// 動きは本当の時間（秒）で進める（時間を早送りしても、砂が目で追えない速さにならないように）

const BOX = 40 // 飛砂を置く範囲（カメラから ±m）
const SHEET_BOX = 180

type Parts = {
  sand: THREE.Points
  sheets: THREE.Points
  devils: THREE.Points
  sandMat: THREE.ShaderMaterial
  puffMat: THREE.ShaderMaterial
  devilMat: THREE.ShaderMaterial
  nSand: number
  nSheet: number
}

const DEVILS = 2
const DEVIL_PUFFS = 30

function makePoints(n: number, attrs: string[], mat: THREE.ShaderMaterial) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
  for (const a of attrs) geo.setAttribute(a, new THREE.BufferAttribute(new Float32Array(n), 1))
  const p = new THREE.Points(geo, mat)
  p.frustumCulled = false
  p.renderOrder = 2
  return p
}

export function Weather({ def, terrain, sky, light }: { def: SurfaceDef; terrain: Terrain; sky: SkyNow; light: boolean }) {
  const color = useMemo(() => new THREE.Color(def.hazeColor), [def.hazeColor])
  const wind = useMemo(() => windFor(def.id, true).normalize(), [def.id])
  const parts = useMemo<Parts>(() => {
    const nSand = light ? 500 : 1400
    const nSheet = light ? 50 : 120
    const sandMat = gritMaterial(color)
    const puffMat = puffMaterial(color)
    const devilMat = puffMaterial(color)
    const puffAttrs = ['aAlpha', 'aSize', 'aRot', 'aVar']
    const p: Parts = {
      sand: makePoints(nSand, ['aAlpha', 'aSize'], sandMat),
      sheets: makePoints(nSheet, puffAttrs, puffMat),
      devils: makePoints(DEVILS * DEVIL_PUFFS, puffAttrs, devilMat),
      sandMat,
      puffMat,
      devilMat,
      nSand,
      nSheet,
    }
    // はじめの位置をばらまく
    const rnd = Math.random
    const sp = p.sand.geometry.attributes.position.array as Float32Array
    const ss = p.sand.geometry.attributes.aSize.array as Float32Array
    for (let i = 0; i < nSand; i++) {
      sp[i * 3] = (rnd() * 2 - 1) * BOX
      sp[i * 3 + 1] = -Math.log(1 - rnd() * 0.98) * 0.5
      sp[i * 3 + 2] = (rnd() * 2 - 1) * BOX
      ss[i] = 0.025 + rnd() * 0.05
    }
    const hp = p.sheets.geometry.attributes.position.array as Float32Array
    const hs = p.sheets.geometry.attributes.aSize.array as Float32Array
    const hr = p.sheets.geometry.attributes.aRot.array as Float32Array
    const hv = p.sheets.geometry.attributes.aVar.array as Float32Array
    for (let i = 0; i < nSheet; i++) {
      hp[i * 3] = (rnd() * 2 - 1) * SHEET_BOX
      hp[i * 3 + 2] = (rnd() * 2 - 1) * SHEET_BOX
      hs[i] = 6 + rnd() * 12
      hr[i] = rnd() * Math.PI * 2
      hv[i] = rnd() * 0.999
    }
    const dr = p.devils.geometry.attributes.aRot.array as Float32Array
    const dv = p.devils.geometry.attributes.aVar.array as Float32Array
    for (let i = 0; i < DEVILS * DEVIL_PUFFS; i++) {
      dr[i] = rnd() * Math.PI * 2
      dv[i] = rnd() * 0.999
    }
    return p
  }, [color, light])
  useEffect(
    () => () => {
      for (const o of [parts.sand, parts.sheets, parts.devils]) o.geometry.dispose()
      parts.sandMat.dispose()
      parts.puffMat.dispose()
      parts.devilMat.dispose()
    },
    [parts],
  )

  // つむじ風の柱：中心の位置・高さ・寿命
  const devils = useMemo(
    () =>
      Array.from({ length: DEVILS }, (_, k) => ({
        x: 0,
        z: 0,
        h: 300,
        age: 0,
        life: 0,
        amt: 0,
        seed: k * 7.3,
      })),
    [],
  )

  const camDir = useMemo(() => new THREE.Vector3(), [])
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const w = weatherNow
    const s = w.storm
    const cam = state.camera as THREE.PerspectiveCamera
    const cx = cam.position.x
    const cz = cam.position.z
    const scale = (state.size.height * state.viewport.dpr) / (2 * Math.tan((cam.fov * Math.PI) / 360))
    const sunDir = sky.sunDir
    cam.getWorldDirection(camDir)
    const fwd = Math.max(0, camDir.dot(sunDir)) ** 3
    // 砂嵐の中は日が陰るので、砂も暗く。夜は見えない
    const sunLit = Math.max(0.12, Math.min(1, sunDir.y * 3 + 0.2)) * (1 - 0.85 * sky.night)
    // 砂嵐の中の砂は、空全体からの散った光で明るい（まわりのもやと同じくらいの明るさ）
    const lit = sunLit + (0.95 * (1 - sky.night) - sunLit) * Math.min(1, s * 1.5)

    // 飛砂：風の強さは砂嵐の強さで決める（強いと 25 m/s ほど）
    const speed = 3 + 22 * s
    const sand = parts.sand.geometry.attributes
    const sp = sand.position.array as Float32Array
    const sa = sand.aAlpha.array as Float32Array
    const gy = terrain.height(cx, cz)
    for (let i = 0; i < parts.nSand; i++) {
      const j = i * 3
      const low = 1 / (1 + sp[j + 1])
      sp[j] += wind.x * speed * dt * (0.6 + 0.6 * low)
      sp[j + 2] += wind.z * speed * dt * (0.6 + 0.6 * low)
      // 範囲の外へ出たら、反対側から入り直す
      if (sp[j] - cx > BOX) sp[j] -= 2 * BOX
      else if (sp[j] - cx < -BOX) sp[j] += 2 * BOX
      if (sp[j + 2] - cz > BOX) sp[j + 2] -= 2 * BOX
      else if (sp[j + 2] - cz < -BOX) sp[j + 2] += 2 * BOX
      sa[i] = 0.75 * THREE.MathUtils.smoothstep(s, 0.08, 0.5) * (0.4 + 0.6 * low)
    }
    sand.position.needsUpdate = true
    sand.aAlpha.needsUpdate = true
    parts.sand.position.set(0, gy, 0)
    parts.sandMat.uniforms.uScale.value = scale
    parts.sandMat.uniforms.uColor.value.copy(color).multiplyScalar(lit * (0.6 + 0.6 * fwd))

    // 砂のもや
    const sh = parts.sheets.geometry.attributes
    const hp = sh.position.array as Float32Array
    const ha = sh.aAlpha.array as Float32Array
    const hr = sh.aRot.array as Float32Array
    const sheetSpeed = 2 + 14 * s
    for (let i = 0; i < parts.nSheet; i++) {
      const j = i * 3
      hp[j] += wind.x * sheetSpeed * dt
      hp[j + 2] += wind.z * sheetSpeed * dt
      if (hp[j] - cx > SHEET_BOX) hp[j] -= 2 * SHEET_BOX
      else if (hp[j] - cx < -SHEET_BOX) hp[j] += 2 * SHEET_BOX
      if (hp[j + 2] - cz > SHEET_BOX) hp[j + 2] -= 2 * SHEET_BOX
      else if (hp[j + 2] - cz < -SHEET_BOX) hp[j + 2] += 2 * SHEET_BOX
      hp[j + 1] = terrain.height(hp[j], hp[j + 2]) + 1.2 + (i % 5) * 1.1
      hr[i] += dt * 0.05 * ((i % 3) - 1)
      const d = Math.hypot(hp[j] - cx, hp[j + 2] - cz) / SHEET_BOX
      // カメラのすぐそばは描かない（画面いっぱいにかぶさらないように）
      const near = THREE.MathUtils.smoothstep(d * SHEET_BOX, 14, 34)
      ha[i] = 0.32 * THREE.MathUtils.smoothstep(s, 0.05, 0.6) * near * (1 - THREE.MathUtils.smoothstep(d, 0.35, 0.8))
    }
    sh.position.needsUpdate = true
    sh.aAlpha.needsUpdate = true
    sh.aRot.needsUpdate = true
    parts.puffMat.uniforms.uScale.value = scale
    parts.puffMat.uniforms.uColor.value.copy(color).multiplyScalar(lit * (1.25 + 1.0 * fwd))
    parts.puffMat.uniforms.uShadow.value.copy(color).multiplyScalar(lit * (0.8 + 0.4 * fwd) + 0.03)
    parts.puffMat.uniforms.uSunView.value.copy(sunDir).transformDirection(cam.matrixWorldInverse)

    // つむじ風
    const dg = parts.devils.geometry.attributes
    const dp = dg.position.array as Float32Array
    const da = dg.aAlpha.array as Float32Array
    const ds = dg.aSize.array as Float32Array
    const dr = dg.aRot.array as Float32Array
    const t = state.clock.elapsedTime
    devils.forEach((d, k) => {
      d.age += dt
      if (d.age >= d.life) {
        // 新しい柱：カメラから 350〜1400 m、出やすさに応じて
        const a = Math.random() * Math.PI * 2
        const r = 350 + Math.random() * 1050
        d.x = cx + Math.cos(a) * r
        d.z = cz + Math.sin(a) * r
        d.h = 180 + Math.random() * 380
        d.age = 0
        d.life = 25 + Math.random() * 35
        d.amt = Math.random() < 0.2 + 0.8 * w.devils ? 1 : 0
        // 出なかったときは、少し待ってまた試す
        if (!d.amt) d.life = 6
      }
      // 風に流されて、少し蛇行しながら進む
      d.x += (wind.x * 4 + Math.sin(t * 0.21 + d.seed) * 1.5) * dt
      d.z += (wind.z * 4 + Math.cos(t * 0.17 + d.seed) * 1.5) * dt
      const life = Math.min(1, d.age / 6, (d.life - d.age) / 6)
      const amt = d.amt * w.devils * life
      const base = terrain.height(d.x, d.z)
      for (let i = 0; i < DEVIL_PUFFS; i++) {
        const q = k * DEVIL_PUFFS + i
        const u = i / (DEVIL_PUFFS - 1)
        const h = u ** 1.4 * d.h
        // 上ほど太い。高さごとに違う速さで回る（ねじれた柱に見える）
        const rad = 6 + h * 0.1
        const ang = t * (2.4 - u * 1.4) + i * 2.399 + d.seed
        const lean = h * 0.12
        dp[q * 3] = d.x + Math.cos(ang) * rad * 0.6 + wind.x * lean
        dp[q * 3 + 1] = base + h
        dp[q * 3 + 2] = d.z + Math.sin(ang) * rad * 0.6 + wind.z * lean
        ds[q] = rad * 2.6 + 10
        dr[q] += dt * 1.2
        // 根元が濃く、上で薄れる
        da[q] = amt * 0.42 * (1 - u) ** 0.8 * (0.6 + 0.4 * Math.sin(i * 1.7 + t))
      }
    })
    dg.position.needsUpdate = true
    dg.aAlpha.needsUpdate = true
    dg.aSize.needsUpdate = true
    dg.aRot.needsUpdate = true
    parts.devilMat.uniforms.uScale.value = scale
    parts.devilMat.uniforms.uColor.value.copy(color).multiplyScalar(lit * (1.4 + 1.0 * fwd))
    parts.devilMat.uniforms.uShadow.value.copy(color).multiplyScalar(lit * 0.85 + 0.03)
    parts.devilMat.uniforms.uSunView.value.copy(sunDir).transformDirection(cam.matrixWorldInverse)
  })

  return (
    <>
      <primitive object={parts.sand} />
      <primitive object={parts.sheets} />
      <primitive object={parts.devils} />
    </>
  )
}
