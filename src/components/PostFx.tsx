import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, N8AO, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, ShaderPass, ToneMappingMode } from 'postprocessing'
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

/**
 * 光のにじみの前に、描いた絵の壊れた画素（NaN・無限大）を黒に、明るすぎる画素を半精度で表せる明るさまでに直す。
 * 半精度の描画先では、とても明るい光（エンジン・太陽など）が無限大になることがあり、NaN といっしょに
 * 光のにじみの縮小・ぼかしで広がって、画面全体に黒い四角がちらつく（Firefox の報告。SF の世界・ヘロンの任務）
 */
export function makeNanGuard() {
  const material = new THREE.ShaderMaterial({
    name: 'NanGuard',
    uniforms: { inputBuffer: { value: null } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D inputBuffer;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(inputBuffer, vUv);
        bvec4 bad = bvec4(isnan(c.r) || isinf(c.r), isnan(c.g) || isinf(c.g), isnan(c.b) || isinf(c.b), isnan(c.a) || isinf(c.a));
        if (any(bad)) c = vec4(0.0, 0.0, 0.0, 1.0);
        gl_FragColor = clamp(c, vec4(0.0), vec4(60000.0));
      }`,
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  return new ShaderPass(material, 'inputBuffer')
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

  // 後処理を作り直すたびに古いものは片付けられるので、組み合わせごとに作る
  const composerKey = `${quality.msaa}-${fx.ao && quality.ao !== null}-${fx.bloom}-${fx.film}`
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const guard = useMemo(makeNanGuard, [composerKey])
  useEffect(() => () => guard.dispose(), [guard])

  if (!active) return null
  const useAO = fx.ao && quality.ao !== null
  return (
    // 効果の組み合わせが変わったら作り直す（EffectComposer は途中で効果を足し引きすると順番が崩れることがある）
    <EffectComposer key={composerKey} multisampling={quality.msaa} enableNormalPass={false}>
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
      <primitive object={guard} />
      {fx.bloom ? <Bloom intensity={1.2} luminanceThreshold={1} luminanceSmoothing={0.2} mipmapBlur /> : <></>}
      {/* 後処理を通すとレンダラーのトーンマッピングが掛からないので、ここで掛ける（軽量の画質と同じ見え方に） */}
      <ToneMapping mode={postTone ? ToneMappingMode.ACES_FILMIC : ToneMappingMode.LINEAR} />
      {fx.film ? <Vignette offset={0.32} darkness={0.42} /> : <></>}
      {fx.film ? <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.18} /> : <></>}
    </EffectComposer>
  )
}
