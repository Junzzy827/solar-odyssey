import { useStore } from './store'

// 天体の見え方：図鑑モード（見やすく色や大気を強調した絵）と、写真モード（探査機のカメラで撮ったような見え方）。
// 現実／SF の切り替え（何を出すか）とは別の軸で、こちらは同じ天体の「描き方」だけを変える。
// シェーダーは作り直さず、共有の uniform の値を変えるだけにする（切り替えても重くならない）

export type Look = 'illustrated' | 'photo'

export const isPhoto = () => useStore.getState().settings.look === 'photo'
export const usePhoto = () => useStore((s) => s.settings.look === 'photo')

/** 写真モードなら 1。惑星・衛星・地球・太陽・輪の材質で共有する */
export const photoUniform = { value: isPhoto() ? 1 : 0 }

/** 背景の星の明るさ（写真モードの自動露出。Sky.tsx が毎フレーム決める） */
export const starExposure = { value: 1 }

useStore.subscribe((s, prev) => {
  if (s.settings.look !== prev.settings.look) photoUniform.value = s.settings.look === 'photo' ? 1 : 0
})

export function setLook(look: Look) {
  useStore.getState().updateSettings({ look })
}

/** 写真モードの色：図鑑モードより少し彩度を落とし、自然な色味にする（GLSL） */
export const PHOTO_GLSL = /* glsl */ `
  uniform float uPhoto;
  vec3 photoColor(vec3 c) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    return mix(c, mix(vec3(l), c, 0.78), uPhoto);
  }
`
