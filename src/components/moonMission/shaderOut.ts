import type * as THREE from 'three'

// 自前のシェーダー（煙・炎・地球・光の柱）の出力の仕上げ。
//
// three の素材は、画面に直接描くときだけ色調（トーンマッピング）と sRGB への直しを掛ける。自前のシェーダーにはそれが無かったので、
// 後処理（MissionPost）を通す画面と通さない画面（画質「軽量」）で、明るさがちがって見えた。
// 打ち上げの世界では encodeOutput() を付けて、どちらの画面でも同じ明るさにする。
// ほかの章は見え方を合わせ直すまで、いまのまま（MM_ENCODE なし）。

/** 自前のフラグメントシェーダーの最後（gl_FragColor を決めた後）に入れる */
export const OUT_CHUNK = /* glsl */ `
  #ifdef MM_ENCODE
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #endif
`

export function encodeOutput<T extends THREE.ShaderMaterial>(m: T): T {
  m.defines = { ...(m.defines ?? {}), MM_ENCODE: '' }
  m.needsUpdate = true
  return m
}
