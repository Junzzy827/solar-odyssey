import * as THREE from 'three'
import type { Level } from '../../state/quality'

// Blender で焼いた船体のテクスチャ（tools/blender/bake_ship.py）。glb の Hull の材質に 4 枚が付いていて、
// どれも 2 番目の UV（TEXCOORD_1、three.js の channel 1）で貼る。
// three.js 側は材質を名前で差し替えるので、ここで取り出して、差し替えた材質に付け直す。
// - detail   : ベースカラーに掛ける明るさ（AO・曲率・墨入れ・色ムラ・すす）。平らな面は 0.85 で、
//              今までの外板の絵と同じくらいの明るさになる（材質の色はそのまま）
// - rough    : ラフネス（緑のチャンネル）
// - normal   : 継ぎ目の溝と細かな凹凸
// - emissive : 小さな窓明かり

export type BakedMaps = {
  detail: THREE.Texture
  rough: THREE.Texture | null
  normal: THREE.Texture | null
  emissive: THREE.Texture | null
}

/** glb の中から、焼いたテクスチャを探す（無ければ null：焼く前の glb でも動く） */
export function findBaked(root: THREE.Object3D): BakedMaps | null {
  let found: BakedMaps | null = null
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (found || !mesh.isMesh) return
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const std = m as THREE.MeshStandardMaterial
      if (std.map && std.map.channel === 1) {
        found = { detail: std.map, rough: std.roughnessMap, normal: std.normalMap, emissive: std.emissiveMap }
        for (const t of [std.map, std.roughnessMap, std.normalMap, std.emissiveMap]) if (t) t.anisotropy = 8
        return
      }
    }
  })
  return found
}

/**
 * 画質ごとに使う枚数を変える（軽量では detail だけ。GPU のメモリが 1/4 になる）。
 * 画質を変えたときは setBakedLevel で付け外しする
 */
export function applyBaked(mat: THREE.MeshStandardMaterial, baked: BakedMaps, opts: { windows?: boolean } = {}) {
  mat.map = baked.detail
  // AO は detail に焼いてあるので、頂点カラーの AO はもう使わない
  mat.vertexColors = false
  mat.bumpMap = null
  mat.userData.baked = { baked, windows: opts.windows ?? false }
  mat.needsUpdate = true
}

/** 焼いたテクスチャのうち、画質に応じて付け外しするもの */
export function setBakedLevel(mat: THREE.MeshStandardMaterial, level: Level) {
  const info = mat.userData.baked as { baked: BakedMaps; windows: boolean } | undefined
  if (!info) return
  const full = level !== 'low'
  const { baked } = info
  mat.roughnessMap = full ? baked.rough : null
  mat.normalMap = full ? baked.normal : null
  mat.normalScale.set(1, 1)
  if (info.windows) {
    mat.emissiveMap = full ? baked.emissive : null
    mat.emissive.setRGB(full ? 1.1 : 0, full ? 1.05 : 0, full ? 0.95 : 0)
  }
  mat.needsUpdate = true
}

/**
 * 外板の絵（map）を残したまま、detail を掛ける（SV-01 の機関部用）。
 * map の枠は外板の絵が使っているので、aoMap の枠に detail を入れて（強さ 0 で本来の AO としては効かせず）、
 * シェーダーでベースカラーに掛ける
 */
export function multiplyDetail(mat: THREE.MeshStandardMaterial, baked: BakedMaps) {
  mat.aoMap = baked.detail
  mat.aoMapIntensity = 0
  mat.roughnessMap = baked.rough
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      // 外板の絵がもう暗さを持っているので、平らな面（0.85）が 1 になるよう戻して、角だけ少し明るくする
      '#include <map_fragment>\n\tdiffuseColor.rgb *= texture2D( aoMap, vAoMapUv ).rgb / 0.85;',
    )
  }
  mat.customProgramCacheKey = () => 'baked-detail'
  mat.needsUpdate = true
}
