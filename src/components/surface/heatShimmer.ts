import * as THREE from 'three'
import { Effect } from 'postprocessing'

// 陽炎（かげろう）：熱い地面の上で空気の密度がゆらいで、光が曲がり、地平線のあたりの景色がゆらゆら揺れる。
// 金星（地表 460℃・地球の 90 倍の濃い空気）では強く、地球の砂漠でも真昼に少し。
// 光の通り道が長い地平線のまわりほど強く揺れるので、画面の地平線の高さ（uHorizon）を中心に効かせる。

const fragment = /* glsl */ `
  uniform float uTime;
  uniform float uAmp;
  uniform float uHorizon;
  uniform float uAspect;
  void mainUv(inout vec2 uv) {
    if (uAmp <= 0.0) return;
    // 地平線のすぐ下（遠くの地面）で最も強く、空の側は弱く
    float dy = uv.y - uHorizon;
    float band = dy < 0.0 ? exp(-dy * dy / 0.012) : exp(-dy * dy / 0.0015) * 0.6;
    // 上へ流れながら揺れる、細かい縦じまのゆらぎ
    vec2 p = vec2(uv.x * uAspect, uv.y);
    float w1 = sin(p.y * 420.0 - uTime * 7.0 + sin(p.x * 38.0 + uTime * 1.3) * 2.2);
    float w2 = sin(p.y * 260.0 - uTime * 4.6 + sin(p.x * 23.0 - uTime * 0.9) * 3.1 + 1.7);
    float w3 = sin(p.x * 90.0 + uTime * 2.1 + p.y * 60.0);
    uv.x += (w1 * 0.6 + w2 * 0.4) * 0.0016 * uAmp * band;
    uv.y += (w2 * 0.5 + w3 * 0.5) * 0.0011 * uAmp * band;
  }
`

export class HeatShimmerEffect extends Effect {
  constructor() {
    super('HeatShimmer', fragment, {
      uniforms: new Map<string, THREE.Uniform>([
        ['uTime', new THREE.Uniform(0)],
        ['uAmp', new THREE.Uniform(0)],
        ['uHorizon', new THREE.Uniform(0.5)],
        ['uAspect', new THREE.Uniform(1.7)],
      ]),
    })
  }

  set(amp: number, horizon: number, aspect: number, dt: number) {
    const u = this.uniforms
    u.get('uTime')!.value += dt
    u.get('uAmp')!.value = amp
    u.get('uHorizon')!.value = horizon
    u.get('uAspect')!.value = aspect
  }
}

/** 今の陽炎の強さ（Scene が毎フレーム書き、後処理が読む） */
export const shimmerNow = { amp: 0 }

/** 陽炎の強さ（0〜1）。金星はいつも。地球は晴れた昼間（日ざしで砂が熱いとき）だけ少し */
export function shimmerAmount(id: string, sunY: number) {
  if (id === 'venus') return 1
  if (id === 'earth') return 0.45 * THREE.MathUtils.smoothstep(sunY, 0.35, 0.7)
  return 0
}
