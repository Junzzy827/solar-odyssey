import { Bloom, EffectComposer, Noise, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import { QUALITY, useLevel } from '../../state/quality'
import { useStore } from '../../state/store'

// 地表の後処理：明るさの幅を残したまま描いて、最後にフィルムのような色の丸め（ACES）をかける。
// 太陽や噴射のとても明るいところは光がにじむ（Bloom）。フィルム調（粒状感・周辺減光）は設定の「フィルム調」に合わせる。
// 「軽量」ではまったく使わない（レンダラーの ACES だけ）。

export function SurfacePost() {
  const level = useLevel()
  const q = QUALITY[level]
  const fx = useStore((s) => s.settings.fx)
  if (!q.bloom) return null
  return (
    <EffectComposer key={`${q.msaa}-${fx.bloom}-${fx.film}`} multisampling={q.msaa} enableNormalPass={false}>
      {fx.bloom ? <Bloom intensity={0.9} luminanceThreshold={1.1} luminanceSmoothing={0.3} mipmapBlur /> : <></>}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {/* 後処理の中ではアンチエイリアスが効かないので、多重サンプルを使わない画質では SMAA で縁をならす */}
      {q.msaa === 0 ? <SMAA /> : <></>}
      {fx.film ? <Vignette offset={0.3} darkness={0.5} /> : <></>}
      {fx.film ? <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.12} /> : <></>}
    </EffectComposer>
  )
}
