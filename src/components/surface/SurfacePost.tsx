import { Bloom, EffectComposer, Noise, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import { QUALITY, useLevel } from '../../state/quality'
import { useStore } from '../../state/store'
import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { HeatShimmerEffect, shimmerNow } from './heatShimmer'

const fwd = new THREE.Vector3()

// 地表の後処理：明るさの幅を残したまま描いて、最後にフィルムのような色の丸め（ACES）をかける。
// 太陽や噴射のとても明るいところは光がにじむ（Bloom）。フィルム調（粒状感・周辺減光）は設定の「フィルム調」に合わせる。
// 「軽量」ではまったく使わない（レンダラーの ACES だけ）。

/** 陽炎のある天体（金星・地球の砂漠） */
const SHIMMER = new Set(['venus', 'earth'])

export function SurfacePost({ bodyId }: { bodyId: string }) {
  const level = useLevel()
  const q = QUALITY[level]
  const fx = useStore((s) => s.settings.fx)
  const shimmer = useMemo(() => new HeatShimmerEffect(), [])
  // 画面の上での地平線の高さ（0 = 下、1 = 上）を、カメラの向きから出す
  useFrame((state, dt) => {
    const cam = state.camera as THREE.PerspectiveCamera
    cam.getWorldDirection(fwd)
    const pitch = Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1))
    const horizon = 0.5 - Math.tan(pitch) / (2 * Math.tan((cam.fov * Math.PI) / 360))
    shimmer.set(shimmerNow.amp, horizon, state.size.width / Math.max(1, state.size.height), Math.min(dt, 0.1))
  })
  if (!q.bloom) return null
  return (
    <EffectComposer key={`${q.msaa}-${fx.bloom}-${fx.film}-${bodyId}`} multisampling={q.msaa} enableNormalPass={false}>
      {fx.bloom ? <Bloom intensity={0.9} luminanceThreshold={1.1} luminanceSmoothing={0.3} mipmapBlur /> : <></>}
      {/* 陽炎（色の丸めの前に、景色をゆらす） */}
      {SHIMMER.has(bodyId) ? <primitive object={shimmer} /> : <></>}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {/* 後処理の中ではアンチエイリアスが効かないので、多重サンプルを使わない画質では SMAA で縁をならす */}
      {q.msaa === 0 ? <SMAA /> : <></>}
      {fx.film ? <Vignette offset={0.3} darkness={0.5} /> : <></>}
      {fx.film ? <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.12} /> : <></>}
    </EffectComposer>
  )
}
