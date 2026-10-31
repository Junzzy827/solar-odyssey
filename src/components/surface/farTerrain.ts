import * as THREE from 'three'
import type { SurfaceDef } from '../../data/surfaces'
import { heightAt, type HeightMap } from './dem'

// 地平線の山並み（本物の地形の、遠くの地図）。近くの地面（3.2 km まで）の外側から、数十 km 先まで。
// 空の球（9 km）の内側に収めるため、目の位置を中心に縮めて置く（目から見た角度は変わらない）。
// 外側の輪から内側へ順に描くので、深さの比較をしなくても手前の山が奥の山を隠す（重ね塗り）。
// そのあと近くの地面が上から描かれる。空気遠近は、縮める前の本当の位置で計算する（aReal）。

export const FAR_SHRINK = 6

export function farTerrainGeometry(def: SurfaceDef, far: HeightMap, eyeY: number, r0: number) {
  const r1 = far.extent / 2 - far.extent / far.size
  const RINGS = 110
  const SEG = 360
  const R = def.radiusKm * 1000
  const real: number[] = []
  const col: number[] = []
  const g1 = new THREE.Color(def.ground)
  const g2 = new THREE.Color(def.ground2)
  const rock = new THREE.Color(def.rock)
  const c = new THREE.Color()
  const radii: number[] = []
  for (let i = 0; i < RINGS; i++) radii.push(r0 * (r1 / r0) ** (i / (RINGS - 1)))
  for (const r of radii)
    for (let j = 0; j < SEG; j++) {
      const a = (j / SEG) * Math.PI * 2
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const h = (heightAt(far, x, z) ?? 0) - (x * x + z * z) / (2 * R)
      real.push(x, h, z)
    }
  // 法線は本当の形で計算する（縮めても向きは同じ）
  const idx: number[] = []
  // 外側の輪から内側へ（重ね塗りの順）
  for (let i = RINGS - 2; i >= 0; i--) {
    const a0 = i * SEG
    const b0 = (i + 1) * SEG
    for (let j = 0; j < SEG; j++) {
      const j1 = (j + 1) % SEG
      idx.push(a0 + j, b0 + j, a0 + j1, a0 + j1, b0 + j, b0 + j1)
    }
  }
  const tmp = new THREE.BufferGeometry()
  tmp.setAttribute('position', new THREE.Float32BufferAttribute(real, 3))
  tmp.setIndex(idx)
  tmp.computeVertexNormals()
  const nrm = tmp.attributes.normal as THREE.BufferAttribute
  // 色：平らなところは地面の色、急な斜面は岩の色。高いところほど少し明るく
  for (let k = 0; k < real.length / 3; k++) {
    const ny = nrm.getY(k)
    const slope = THREE.MathUtils.smoothstep(1 - ny, 0.08, 0.3)
    const hy = real[k * 3 + 1]
    c.copy(g1).lerp(g2, 0.5 + 0.5 * Math.sin(real[k * 3] * 0.0007 + real[k * 3 + 2] * 0.0005))
    c.lerp(rock, slope * 0.8)
    c.multiplyScalar(0.92 + 0.12 * THREE.MathUtils.clamp(hy / 2000, -0.5, 1))
    col.push(c.r, c.g, c.b)
  }
  const pos = new Float32Array(real.length)
  for (let k = 0; k < real.length; k += 3) {
    pos[k] = real[k] / FAR_SHRINK
    pos[k + 1] = eyeY + (real[k + 1] - eyeY) / FAR_SHRINK
    pos[k + 2] = real[k + 2] / FAR_SHRINK
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aReal', new THREE.Float32BufferAttribute(real, 3))
  geo.setAttribute('normal', nrm)
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.setIndex(idx)
  tmp.dispose()
  return geo
}
