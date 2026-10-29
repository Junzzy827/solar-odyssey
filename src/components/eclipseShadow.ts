import { eclipseUniforms } from '../state/eclipse'

// 日食のとき、月の影が地球に落ちる計算（地球の表面・雲・仮の地球のシェーダーで共有する）。
// 影は、太陽の光の向き uShadowD に沿って、月の中心 uShadowC から伸びる筒として描く（太陽は遠いので光はほぼ平行）

export { eclipseUniforms }

export const ECLIPSE_GLSL = /* glsl */ `
  uniform float uShadowOn;
  uniform vec3 uShadowC;
  uniform vec3 uShadowD;
  uniform vec3 uShadowR;
  // 光がどれだけ残るか（1 は影なし）。半影の中ではだんだん暗く、本影の中はほぼ真っ暗（金環のときは少し明るい）
  float solarShadow(vec3 p) {
    if (uShadowOn < 0.5 || uShadowOn > 1.5) return 1.0;
    vec3 q = p - uShadowC;
    float t = dot(q, uShadowD);
    if (t < 0.0) return 1.0;
    float d = length(q - t * uShadowD);
    float pen = 1.0 - smoothstep(uShadowR.x, uShadowR.y, d);
    float umb = 1.0 - smoothstep(uShadowR.x * 0.5, uShadowR.x * 1.5, d);
    return (1.0 - 0.9 * pow(pen, 0.75)) * (1.0 - uShadowR.z * umb);
  }
`
