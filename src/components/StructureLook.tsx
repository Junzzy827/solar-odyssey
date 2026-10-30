import { useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSpaceEnv } from './SpaceLighting'
import { currentLevel } from '../state/quality'

// 自機の質感のリアル化（段階1〜3）を、SF の構造物・望遠鏡などにも当てる。
// 構造物はコードで形を作っているので（glb ではないので Blender では焼けない）、同じ効果をシェーダーで足す：
// - 映り込み：室内用の環境マップ（RoomEnvironment）をやめて、自機と同じ宇宙の環境マップにする（影の側が暗く締まる。鏡と岩はそのまま）
// - 外板の細部：パネルごとの明るさのムラ（±4%）とつやの違い、継ぎ目のうっすらした墨入れ、大きな汚れのムラ。
//   パネルは物体の座標で決めるので、近づいても遠ざかっても同じ板に見える。画面で細かくなりすぎた継ぎ目は消す（ちらつき防止）
// 中の部品があとから読み込まれても当たるよう、1 秒ごとに見回して、まだのものだけ直す。
// 画質「軽量」では細部を足さない（映り込みの差し替えだけ）。

/** 細部の強さ（全部の材質で共有。画質が「軽量」になったら 0 にする） */
const strength = { value: 1 }

const VERT_HEAD = 'varying vec3 vSlPos;\nvarying vec3 vSlNrm;\n'
const FRAG_HEAD = /* glsl */ `
varying vec3 vSlPos;
varying vec3 vSlNrm;
uniform float uSlCell;
uniform float uSlStrength;
float slH;
float slHash(vec2 c) { return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }
`
// パネル（面の向きでいちばん近い軸の平面に投影した格子。行ごとに少しずらす）と、その乱数・継ぎ目・汚れ
const FRAG_DETAIL = /* glsl */ `
{
  vec3 an = abs(normalize(vSlNrm));
  vec3 p = vSlPos / uSlCell;
  vec2 q = an.x > an.y && an.x > an.z ? p.yz : (an.y > an.z ? p.xz : p.xy);
  q *= vec2(1.0, 1.6);
  q.x += floor(q.y) * 0.37;
  vec2 cell = floor(q);
  slH = slHash(cell);
  vec2 f = abs(fract(q) - 0.5);
  vec2 w = fwidth(q);
  // 継ぎ目：画面で 1 画素より細くなるなら薄める
  float seam = max(smoothstep(0.5 - w.x * 1.2, 0.5, f.x), smoothstep(0.5 - w.y * 1.2, 0.5, f.y));
  seam *= 1.0 - smoothstep(0.06, 0.2, max(w.x, w.y));
  float grime = 0.5 + 0.25 * sin(dot(p, vec3(0.071, 0.113, 0.093)) * 6.283) + 0.25 * sin(dot(p, vec3(0.31, -0.23, 0.17)) * 2.1);
  float shade = (1.0 + (slH - 0.5) * 0.08) * (1.0 - seam * 0.3) * mix(1.0, 0.85 + 0.15 * grime, 0.4);
  diffuseColor.rgb *= mix(1.0, shade, uSlStrength);
}
`
const FRAG_ROUGH = /* glsl */ `
roughnessFactor = clamp(roughnessFactor * mix(1.0, slH > 0.75 ? 0.72 : 0.92 + 0.16 * slH, uSlStrength), 0.04, 1.0);
`

type Lit = THREE.MeshStandardMaterial & { userData: { slDone?: boolean; noDetail?: boolean } }

function patchMaterial(m: Lit, mesh: THREE.Mesh, env: THREE.Texture | null, detail: boolean) {
  // 室内用の環境マップの代わりに宇宙の環境マップ。宇宙は暗いので強さは上げる（自機と同じ考え方）
  // 鏡（つるつるの金属）は宇宙を映すと真っ黒な板になるので、今までの映り込みのまま
  const mirror = m.metalness >= 0.9 && m.roughness < 0.2
  if (m.envMap && env && m.envMap !== env && !mirror) {
    m.envMap = env
    m.envMapIntensity = THREE.MathUtils.clamp(m.envMapIntensity * 4, 2, 3)
    m.needsUpdate = true
  }
  // 自前のシェーダーを持つ材質（小惑星の岩など）には足さない
  const custom = m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile
  if (!detail || custom || m.userData.noDetail || m.transparent || m.opacity < 1 || m.wireframe) return
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere()
  // パネル 1 枚の大きさ：部品の大きさのおよそ 1/40
  const cell = Math.max(1e-6, (mesh.geometry.boundingSphere?.radius ?? 1) / 40)
  const prevKey = m.customProgramCacheKey.bind(m)
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSlCell = { value: cell }
    shader.uniforms.uSlStrength = strength
    shader.vertexShader = VERT_HEAD + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSlPos = position;\nvSlNrm = normal;')
    shader.fragmentShader =
      FRAG_HEAD +
      shader.fragmentShader
        .replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAG_DETAIL)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FRAG_ROUGH)
  }
  m.customProgramCacheKey = () => prevKey() + '|sl'
  m.needsUpdate = true
}

/** 子の構造物の材質を見回して直す。detail=false なら映り込みの差し替えだけ（実在の望遠鏡など） */
export function StructureLook({ children, detail = true }: { children: ReactNode; detail?: boolean }) {
  const root = useRef<THREE.Group>(null!)
  const clock = useRef(1)
  useFrame((_, dt) => {
    clock.current += dt
    if (clock.current < 1) return
    clock.current = 0
    const level = currentLevel()
    strength.value = level === 'low' ? 0 : 1
    const env = useSpaceEnv.getState().env
    if (!env) return
    root.current.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const m = mat as Lit
        if (!m.isMeshStandardMaterial || m.userData.slDone) continue
        m.userData.slDone = true
        patchMaterial(m, mesh, env, detail && level !== 'low')
      }
    })
  })
  return <group ref={root}>{children}</group>
}
