import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, N8AO, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import { QUALITY, useLevel } from '../state/quality'
import { useStore } from '../state/store'
import { shipScale } from '../state/zoom'
import { usePostFxActive, usePostToneMapping } from './SpaceLighting'

// 後処理。設定パネルの「表示の設定」で 1 つずつ切り替えられる（どれも切れば後処理そのものを使わない）。
// - 光のにじみ（Bloom）：エンジン・窓・太陽など、とても明るいところの光がにじむ
// - 陰影（N8AO の SSAO）：部品のすき間や付け根が暗く締まる。半径は自機の大きさに合わせる（惑星には効かない細かさ）
// - フィルム調：薄い粒子（グレイン）と周辺減光（ビネット）
// 画質が「軽量」のときは使わない（GPU の負担と、ちらつきの原因になりやすい浮動小数の描画先を減らす）。

/** 陰影の半径（自機の全長に対する割合）。船の全長は模型でおよそ 1、world では shipScale() 倍 */
const AO_RADIUS = 0.12

type AOPass = {
  configuration: { aoRadius: number; distanceFalloff: number }
  effectShaderQuad: { material: { fragmentShader: string; needsUpdate: boolean } }
  configureAOPass: (logDepth?: boolean) => void
  __svPatched?: boolean
}

/**
 * N8AO は深さの比べ方に「0.1 / カメラの手前の限界」を掛けた余裕（bias）を持たせている。
 * このアプリは船に寄るとき手前の限界をとても小さくする（0.0001 など）ので余裕が大きくなりすぎ、陰影がまったく出なかった。
 * 余裕を「画面の 1 画素ぶんの奥行きの変化」だけにする（シェーダーを作り直すたびに直す）
 */
function patchBias(pass: AOPass) {
  if (pass.__svPatched) return
  pass.__svPatched = true
  const fix = () => {
    const m = pass.effectShaderQuad.material
    m.fragmentShader = m.fragmentShader.replace(
      'float bias = (0.1 / near) * fwidth(distance(worldPos, cameraPos)) / radiusToUse;',
      'float bias = 0.5 * fwidth(distance(worldPos, cameraPos));',
    )
    m.needsUpdate = true
  }
  const configure = pass.configureAOPass.bind(pass)
  pass.configureAOPass = (logDepth) => {
    configure(logDepth)
    fix()
  }
  fix()
}

export function PostFx() {
  const level = useLevel()
  const quality = QUALITY[level]
  const fx = useStore((s) => s.settings.fx)
  const active = usePostFxActive()
  const postTone = usePostToneMapping()
  const ao = useRef<AOPass | null>(null)

  useFrame(() => {
    if (!ao.current) return
    patchBias(ao.current)
    const r = AO_RADIUS * shipScale()
    if (ao.current.configuration.aoRadius !== r) {
      ao.current.configuration.aoRadius = r
      ao.current.configuration.distanceFalloff = r * 0.5
    }
  })

  if (!active) return null
  const useAO = fx.ao && quality.ao !== null
  return (
    // 効果の組み合わせが変わったら作り直す（EffectComposer は途中で効果を足し引きすると順番が崩れることがある）
    <EffectComposer key={`${quality.msaa}-${useAO}-${fx.bloom}-${fx.film}`} multisampling={quality.msaa} enableNormalPass={false}>
      {useAO ? (
        <N8AO
          ref={ao as never}
          aoRadius={AO_RADIUS * 0.3}
          distanceFalloff={AO_RADIUS * 0.15}
          intensity={4}
          quality={quality.ao === 'full' ? 'medium' : 'performance'}
          halfRes={quality.ao === 'half'}
          depthAwareUpsampling
        />
      ) : (
        <></>
      )}
      {fx.bloom ? <Bloom intensity={1.2} luminanceThreshold={1} luminanceSmoothing={0.2} mipmapBlur /> : <></>}
      {/* 後処理を通すとレンダラーのトーンマッピングが掛からないので、ここで掛ける（軽量の画質と同じ見え方に） */}
      <ToneMapping mode={postTone ? ToneMappingMode.ACES_FILMIC : ToneMappingMode.LINEAR} />
      {fx.film ? <Vignette offset={0.32} darkness={0.42} /> : <></>}
      {fx.film ? <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.18} /> : <></>}
    </EffectComposer>
  )
}
