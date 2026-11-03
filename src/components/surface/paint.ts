import * as THREE from 'three'

// ローバーの色ぬり（峡谷レースの 4 色）。焼き込んだ質感の、明るくて色の薄いところ（白い外板）だけを塗り、
// 黒い車輪・金属・汚れ・ランプはそのまま残す。模型は 1 枚の質感なので、色の明るさと鮮やかさで見分ける。

export type PaintUniforms = { uPaint: { value: THREE.Color }; uPaintOn: { value: number } }

export const paintUniforms = (hex?: string): PaintUniforms => ({
  uPaint: { value: new THREE.Color(hex ?? '#ffffff') },
  uPaintOn: { value: hex ? 1 : 0 },
})

/** ぬる部品（車体・マスト・カメラの頭）。そのほか（脚・車輪・アーム・太陽電池）は、白い所だけ */
export const PAINT_PARTS = new Set(['Body', 'Mast', 'Head'])

/** full：部品ぜんたいを塗る（汚れの明暗は残す）。false：明るくて色の薄い所だけ */
export function withPaint<M extends THREE.Material>(material: M, u: PaintUniforms, full = false): M {
  const prev = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer)
    Object.assign(shader.uniforms, u)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uPaint;\nuniform float uPaintOn;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec3 c = diffuseColor.rgb;
          float lum = dot(c, vec3(0.299, 0.587, 0.114));
          float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
          // 明るい外板ほど濃く塗る。汚れの明暗は残す（塗った色 × 元の明るさ）
          ${full
            ? `float w = uPaintOn * (1.0 - smoothstep(0.12, 0.3, sat)) * smoothstep(0.012, 0.05, lum);
          diffuseColor.rgb = mix(c, uPaint * (0.32 + 1.3 * lum), w);`
            : `float w = uPaintOn * smoothstep(0.2, 0.42, lum) * (1.0 - smoothstep(0.1, 0.22, sat));
          diffuseColor.rgb = mix(c, uPaint * (0.25 + 0.95 * lum), w);`}
        }`,
      )
  }
  const key = material.customProgramCacheKey.bind(material)
  material.customProgramCacheKey = () => key() + (full ? '|paint-full' : '|paint')
  material.needsUpdate = true
  return material
}
