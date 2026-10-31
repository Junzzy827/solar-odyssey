import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useLanding } from '../state/landing'
import { isTouchDevice } from '../state/input'
import { lowMemory } from '../state/quality'

/**
 * 地表にいるあいだ、宇宙の場面の GPU メモリを空ける（スマホ・タブレットだけ）。
 * 地表の場面は別の Canvas なので、そのままだと宇宙の場面（惑星・船・構造物のテクスチャ 300MB 以上）と
 * 地表の場面を同時に抱えることになり、iPhone の Safari はページごと落としてしまう。
 * テクスチャと形（頂点）を GPU から捨てても、元の画像や頂点は手元に残っているので、
 * 宇宙にもどった最初のフレームで three.js が自動で載せ直す（暗転のあいだに済む）。
 */
export function SurfaceMemory() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const onSurface = useLanding((l) => l.phase === 'descent' || l.phase === 'surface' || l.phase === 'ascent')
  useEffect(() => {
    if (!onSurface || !(isTouchDevice() || lowMemory())) return
    const textures = new Set<THREE.Texture>()
    const geometries = new Set<THREE.BufferGeometry>()
    const addTex = (v: unknown) => {
      const t = v as THREE.Texture | null
      // 描き込み先（後処理・影・映りこみ）のテクスチャは、持ち主の RenderTarget が管理するので触らない
      if (t?.isTexture && !(t as THREE.Texture & { isRenderTargetTexture?: boolean }).isRenderTargetTexture) textures.add(t)
    }
    addTex(scene.background)
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.geometry?.isBufferGeometry) geometries.add(mesh.geometry)
      const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []
      for (const m of mats) {
        for (const v of Object.values(m)) addTex(v)
        const u = (m as THREE.ShaderMaterial).uniforms
        if (u) for (const k in u) addTex(u[k]?.value)
      }
    })
    textures.forEach((t) => t.dispose())
    geometries.forEach((g) => g.dispose())
    gl.renderLists.dispose()
    if (location.hash.includes('debug')) console.log(`[surface-memory] freed ${textures.size} textures, ${geometries.size} geometries`)
  }, [onSurface, gl, scene])
  return null
}
