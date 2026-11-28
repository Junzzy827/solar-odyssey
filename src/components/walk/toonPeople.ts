import * as THREE from 'three'

// 公園の人（Rocketbox）のトゥーン見た目。写真の顔のまま陰影だけリアルだと「不気味の谷」に見えたため、
// junji さんが見比べて選んだ（2026-11-27「トゥーンいいね。不気味さがなくなった」）。
//  - 陰影は 3 段（MeshToonMaterial）
//  - 輪郭線は裏面を法線の向きへふくらませる。鼻・口のまわりは線を細くする（小鼻や口元の線が強いと老けて見える）
// 見比べ用に URL に ?mobtoon=off で前のリアルな見た目。

export const MOB_TOON = typeof location === 'undefined' || !/[?&#]mobtoon=off\b/.test(location.search + location.hash)

let grad: THREE.DataTexture | null = null
function gradient() {
  if (grad) return grad
  const steps = [0.4, 0.72, 1.0]
  const d = new Uint8Array(steps.flatMap((v) => [v * 255, v * 255, v * 255, 255]))
  grad = new THREE.DataTexture(d, steps.length, 1)
  grad.minFilter = grad.magFilter = THREE.NearestFilter
  grad.needsUpdate = true
  return grad
}

function toonOf(m: THREE.Material, done: Map<THREE.Material, THREE.Material>) {
  let r = done.get(m)
  if (r) return r
  const s = m as THREE.MeshStandardMaterial
  const t = new THREE.MeshToonMaterial({
    map: s.map ?? null,
    color: s.color ? s.color.clone() : 0xffffff,
    gradientMap: gradient(),
    alphaTest: s.alphaTest,
    transparent: s.transparent,
    side: s.side,
    depthWrite: s.depthWrite,
  })
  t.name = s.name
  r = t
  done.set(m, r)
  return r
}

/** 輪郭線。width はメッシュの単位（Rocketbox は cm）。顔の中心 face のまわり r0〜r1 では線を k 倍に細くする */
function outlineMaterial(width: number, face: THREE.Vector3 | null, r0: number, r1: number, k: number) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.16, 0.11, 0.1, THREE.SRGBColorSpace), side: THREE.BackSide })
  const uniforms = {
    uWidth: { value: width },
    uFace: { value: face ?? new THREE.Vector3(1e6, 1e6, 1e6) },
    uFaceR: { value: new THREE.Vector3(r0, r1, k) },
  }
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWidth;\nuniform vec3 uFace;\nuniform vec3 uFaceR;')
      .replace(
        '#include <skinning_vertex>',
        `#include <skinning_vertex>
  transformed += normalize( objectNormal ) * uWidth * mix( uFaceR.z, 1.0, smoothstep( uFaceR.x, uFaceR.y, distance( position, uFace ) ) );`,
      )
  }
  m.customProgramCacheKey = () => 'mob-toon-outline'
  return m
}

/** 骨の、形を付けたとき（バインド）の位置。メッシュの頂点と同じ座標 */
function bindPos(mesh: THREE.SkinnedMesh, re: RegExp) {
  const i = mesh.skeleton.bones.findIndex((b) => re.test(b.name))
  return i < 0 ? null : new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[i].clone().invert())
}

/** 鼻と口のあたり（目の中点から 3.2 目幅/5.5 下・1 手前）と、その大きさの目安 */
function faceCenter(mesh: THREE.SkinnedMesh) {
  const eL = bindPos(mesh, /^Bip01_LEye$/)
  const eR = bindPos(mesh, /^Bip01_REye$/)
  const head = bindPos(mesh, /^Bip01_Head$/)
  const pelvis = bindPos(mesh, /^Bip01_Pelvis$/)
  if (!eL || !eR || !head || !pelvis) return null
  const up = head.clone().sub(pelvis).normalize()
  const mid = eL.clone().add(eR).multiplyScalar(0.5)
  const fwd = mid.clone().sub(head)
  fwd.addScaledVector(up, -fwd.dot(up)).normalize()
  const u = eL.distanceTo(eR) / 5.5
  return { c: mid.addScaledVector(up, -3.2 * u).addScaledVector(fwd, u), u }
}

/** Rocketbox の人をトゥーンにする（材質の置きかえと輪郭線）。輪郭線は形と骨を元のメッシュと共有する */
export function toonify(root: THREE.Object3D) {
  const done = new Map<THREE.Material, THREE.Material>()
  const add: [THREE.Object3D, THREE.SkinnedMesh][] = []
  root.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh
    if (!mesh.isMesh) return
    const src = ([] as THREE.Material[]).concat(mesh.material)
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => toonOf(m, done)) : toonOf(mesh.material, done)
    if (!mesh.isSkinnedMesh || src.some((m) => m.alphaTest > 0 || m.transparent)) return
    const f = faceCenter(mesh)
    const line = new THREE.SkinnedMesh(mesh.geometry, outlineMaterial(0.28, f?.c ?? null, 2.4 * (f?.u ?? 1), 4.2 * (f?.u ?? 1), 0.15))
    line.name = mesh.name + '.outline'
    line.bind(mesh.skeleton, mesh.bindMatrix)
    line.position.copy(mesh.position)
    line.quaternion.copy(mesh.quaternion)
    line.scale.copy(mesh.scale)
    line.castShadow = false
    line.receiveShadow = false
    line.frustumCulled = false
    add.push([mesh.parent!, line])
  })
  for (const [parent, line] of add) parent.add(line)
}
