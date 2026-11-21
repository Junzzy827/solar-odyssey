import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { ShaderPass, ToneMappingMode } from 'postprocessing'
import { QUALITY, useLevel } from '../../state/quality'

// 月ミッションの画面の後処理：明るさ（露出）・光のにじみ（Bloom）・ACES の色調。
// 露出は missionLook.exposure を場面が毎コマ決める（点火で炎がまぶしいときは下げる、など）。
// 画質が「軽量」のときは後処理を使わず、レンダラーの露出だけ変える（同じ見え方に近づける）。

export const missionLook = {
  /** 画面全体の明るさ（1 がふつう） */
  exposure: 1,
}

/**
 * 露出を掛け、壊れた画素（NaN・無限大）を黒に、明るすぎる画素を半精度で表せる明るさまでに直す（光のにじみの前に）。
 * にじみは露出の後の明るさで決まるので、まぶしい炎だけがにじみ、露出を下げた照明はにじみにくくなる。
 */
function exposurePass() {
  const material = new THREE.ShaderMaterial({
    name: 'MissionExposure',
    uniforms: { inputBuffer: { value: null }, uExposure: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D inputBuffer;
      uniform float uExposure;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(inputBuffer, vUv);
        bvec4 bad = bvec4(isnan(c.r) || isinf(c.r), isnan(c.g) || isinf(c.g), isnan(c.b) || isinf(c.b), isnan(c.a) || isinf(c.a));
        if (any(bad)) c = vec4(0.0, 0.0, 0.0, 1.0);
        c.rgb *= uExposure;
        gl_FragColor = clamp(c, vec4(0.0), vec4(60000.0));
      }`,
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  return { pass: new ShaderPass(material, 'inputBuffer'), material }
}

export function MissionPost() {
  const level = useLevel()
  const quality = QUALITY[level]
  const gl = useThree((s) => s.gl)
  const ex = useMemo(exposurePass, [quality.msaa, quality.bloom])
  useEffect(
    () => () => {
      ex.pass.dispose()
      ex.material.dispose()
    },
    [ex],
  )
  useEffect(
    () => () => {
      gl.toneMappingExposure = 1
      missionLook.exposure = 1
    },
    [gl],
  )
  useFrame(() => {
    ex.material.uniforms.uExposure.value = missionLook.exposure
    // 後処理を使わないとき（軽量）は、レンダラーのトーンマッピングの露出で
    gl.toneMappingExposure = quality.bloom ? 1 : missionLook.exposure
  })
  if (!quality.bloom) return null
  return (
    <EffectComposer key={`${quality.msaa}`} multisampling={quality.msaa} enableNormalPass={false}>
      <primitive object={ex.pass} />
      <Bloom intensity={0.6} luminanceThreshold={2} luminanceSmoothing={0.4} mipmapBlur />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}
