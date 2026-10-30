import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { create } from 'zustand'
import { textureUrl } from '../data/textures'
import { useOptionalTexture } from '../hooks/useOptionalTexture'
import { QUALITY, useLevel } from '../state/quality'
import { useStore } from '../state/store'

// 宇宙の照らし方：
// - 映り込み（環境マップ）は天の川の全天画像から作る。宇宙は暗いので、金属の部分にだけ星の帯がうっすら映る。
//   以前の室内用の環境マップ（RoomEnvironment）は四方から明るく照らすので、影の側まで明るくなり平板に見えていた
// - 色は ACES Filmic でトーンマッピングし、sRGB で出す（後処理を使う画質では、後処理の最後で同じトーンマッピングを掛ける）

/** 天の川の画像の明るさの倍率。画像はほとんど黒いので、つやのある面に星の帯が見えるよう明るめに */
const ENV_GAIN = 4
/** 空全体に足す、ごく弱い明るさ（リニアの RGB） */
const ENV_FLOOR = ['0.012', '0.014', '0.02']
/** 環境マップを持たない材質（惑星や構造物）への映り込みの強さ。夜の側が明るくならないよう、ごく弱く */
export const SCENE_ENV_INTENSITY = 0.35

type SpaceEnv = { env: THREE.Texture | null }
/** 船の材質が使う、宇宙の環境マップ（できるまでは null） */
export const useSpaceEnv = create<SpaceEnv>(() => ({ env: null }))

/** 天の川の画像（無ければ暗い空のグラデーション）から、映り込み用の環境マップを作る */
function spaceEnvironment(gl: THREE.WebGLRenderer, map: THREE.Texture | null) {
  const scene = new THREE.Scene()
  const geometry = new THREE.SphereGeometry(10, 64, 32)
  // 星の帯に、ほんのわずかな青みの明るさを足す（遠くの星や惑星からの照り返しの代わり。影の側が真っ黒につぶれないように）
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { map: { value: map }, useMap: { value: map ? 1 : 0 } },
    vertexShader: 'varying vec3 vDir; varying vec2 vUv; void main() { vDir = normalize(position); vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D map;
      uniform float useMap;
      varying vec3 vDir;
      varying vec2 vUv;
      void main() {
        vec3 sky = useMap > 0.5 ? texture2D(map, vUv).rgb * ${ENV_GAIN.toFixed(2)} : vec3(0.03, 0.028, 0.026) * exp(-pow(vDir.y * 4.0, 2.0));
        gl_FragColor = vec4(sky + vec3(${ENV_FLOOR.join(', ')}), 1.0);
      }`,
  })
  scene.add(new THREE.Mesh(geometry, material))
  const pmrem = new THREE.PMREMGenerator(gl)
  const env = pmrem.fromScene(scene, 0, 0.1, 100).texture
  pmrem.dispose()
  geometry.dispose()
  material.dispose()
  return env
}

/** トーンマッピングと、場面全体の環境マップを決める */
export function SpaceLighting() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const map = useOptionalTexture(textureUrl('milkyWay'))

  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = 1
    gl.outputColorSpace = THREE.SRGBColorSpace
  }, [gl])

  useEffect(() => {
    const env = spaceEnvironment(gl, map)
    scene.environment = env
    scene.environmentIntensity = SCENE_ENV_INTENSITY
    useSpaceEnv.setState({ env })
    return () => {
      if (scene.environment === env) scene.environment = null
      if (useSpaceEnv.getState().env === env) useSpaceEnv.setState({ env: null })
      env.dispose()
    }
  }, [gl, scene, map])

  return null
}

/**
 * 材質に宇宙の環境マップを付ける（環境マップができたとき・作り直したとき）。
 * 材質を作り直すと船体のテクスチャまで描き直しになるので、できている材質に後から差し込む
 */
export function useSpaceEnvOn(materials: THREE.Material[]) {
  const env = useSpaceEnv((s) => s.env)
  useEffect(() => {
    for (const m of materials) {
      const lit = m as THREE.MeshStandardMaterial
      if (!lit.isMeshStandardMaterial) continue
      lit.envMap = env
      lit.needsUpdate = true
    }
  }, [env, materials])
}

/**
 * 後処理の最後で ACES のトーンマッピングを掛けるか。後処理を使う画質だけ（軽量はレンダラーが掛ける）。
 * ブリッジの中は照明を焼き込んだ絵（トーンマッピングなしで色を決めてある）なので掛けない
 */
export function usePostToneMapping() {
  const bloom = QUALITY[useLevel()].bloom
  const bridge = useStore((s) => s.mode === 'flight' && s.cameraMode === 'bridge')
  return bloom && !bridge
}
