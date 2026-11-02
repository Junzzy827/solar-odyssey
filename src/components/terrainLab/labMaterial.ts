import * as THREE from 'three'
import { detailTexture } from '../surface/groundMaterial'

// 地形ラボの地面と岩の材質。切り替えはすべて uniform（作り直さない）。
//  uTri   0：上から貼る（x, z）／1：トライプラナー（3 方向から貼って、面の向きで混ぜる）
//  uBlend 0：塗り分けなし（全部砂）／1：ぼかし（傾きでふわっと）／2：高さで切替（模様の凹凸に沿ってくっきり）
//  uView  0：通常／1：傾きの白黒（赤い線が岩肌に変わる角度）／2：塗り分けの色（砂・岩肌・細かい砂）

export type LabUniforms = {
  uTri: { value: number }
  uBlend: { value: number }
  uView: { value: number }
  uDustTop: { value: number }
}

export const labUniforms: LabUniforms = {
  uTri: { value: 1 },
  uBlend: { value: 2 },
  uView: { value: 0 },
  uDustTop: { value: 1 },
}

const PALETTE = {
  sand: new THREE.Color('#946246'),
  rock: new THREE.Color('#8a6248'),
  dust: new THREE.Color('#c08a60'),
}

/** 3 方向から貼る・上から貼るを切り替えて、世界の法線（xyz）と模様の高さ（w）を返す */
const SAMPLE = /* glsl */ `
vec3 labPlanar(vec3 tn, vec3 n) {
  vec3 T = normalize(vec3(1.0, 0.0, 0.0) - n * n.x);
  vec3 B = normalize(cross(T, n));
  return normalize(T * tn.x + B * tn.y + n * tn.z);
}
vec4 labSample(sampler2D t, vec3 p, vec3 n, float tile, float k, bool tri) {
  if (!tri) {
    vec4 s = texture2D(t, p.xz / tile);
    vec3 tn = s.xyz * 2.0 - 1.0;
    tn.xy *= k;
    return vec4(labPlanar(normalize(tn), n), s.a);
  }
  vec3 w = pow(abs(n), vec3(4.0));
  w /= (w.x + w.y + w.z);
  vec4 sx = texture2D(t, p.zy / tile);
  vec4 sy = texture2D(t, p.xz / tile);
  vec4 sz = texture2D(t, p.xy / tile);
  vec3 tx = sx.xyz * 2.0 - 1.0; tx.xy *= k;
  vec3 ty = sy.xyz * 2.0 - 1.0; ty.xy *= k;
  vec3 tz = sz.xyz * 2.0 - 1.0; tz.xy *= k;
  // whiteout 合成：それぞれの面の凹凸を、世界の向きに直して重ねる
  tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x);
  ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y);
  tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
  vec3 wn = normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
  return vec4(wn, sx.a * w.x + sy.a * w.y + sz.a * w.z);
}
`

export function groundLabMaterial() {
  const uniforms = {
    ...labUniforms,
    uSandT: { value: detailTexture('regolith') },
    uRockT: { value: detailTexture('rock') },
    uFineT: { value: detailTexture('sand') },
    uSandC: { value: PALETTE.sand },
    uRockC: { value: PALETTE.rock },
    uDustC: { value: PALETTE.dust },
  }
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 })
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFill;\nvarying vec3 vLW;\nvarying vec3 vLN;\nvarying float vFill;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vLW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vLN = normalize(mat3(modelMatrix) * objectNormal);
        vFill = aFill;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uSandT; uniform sampler2D uRockT; uniform sampler2D uFineT;
        uniform float uTri; uniform float uBlend; uniform float uView;
        uniform vec3 uSandC; uniform vec3 uRockC; uniform vec3 uDustC;
        varying vec3 vLW; varying vec3 vLN; varying float vFill;
        vec3 gN; float gRock; float gDust; float gSlope; float gRough;
        ${SAMPLE}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 p = vLW;
          vec3 n = normalize(vLN);
          bool tri = uTri > 0.5;
          float dist = length(p - cameraPosition);
          gSlope = 1.0 - clamp(n.y, 0.0, 1.0);
          // 平らな所の地面（小石まじりの砂礫）：近くの細かい模様と、遠くの大きな模様
          vec4 sN = labSample(uSandT, p, n, 2.2, 0.45, tri);
          vec4 sF = labSample(uSandT, p + 0.37, n, 14.0, 0.7, tri);
          float farK = smoothstep(6.0, 40.0, dist);
          vec4 S = mix(sN, sF, farK);
          // 岩肌：細かい割れ目と、大きな割れ目
          vec4 rN = labSample(uRockT, p, n, 2.6, 1.6, tri);
          vec4 rF = labSample(uRockT, p * 0.97 + 3.1, n, 11.0, 1.3, tri);
          float rockH = mix(rN.w, rF.w, 0.55);
          vec3 rockNrm = normalize(mix(rN.xyz, rF.xyz, 0.45));
          // 細かい砂（くぼみにたまる、さざ波のある明るい砂）
          vec4 D = labSample(uFineT, p, n, 3.2, 0.35, tri);

          // 塗り分け
          gRock = 0.0;
          gDust = 0.0;
          float fill = clamp(vFill, 0.0, 1.0) * (1.0 - smoothstep(0.06, 0.16, gSlope));
          if (uBlend > 1.5) {
            // 高さで切替：傾きで決まる割合に、模様の高さを足して比べる。境目は岩の凹凸に沿ってぎざぎざ
            float r = clamp((gSlope - 0.2) / 0.16 + 0.5, 0.0, 1.0);
            float a1 = S.w + (1.0 - r);
            float a2 = rockH + r;
            float ma = max(a1, a2) - 0.07;
            float b1 = max(a1 - ma, 0.0);
            float b2 = max(a2 - ma, 0.0);
            gRock = b2 / (b1 + b2 + 1e-5);
            // 細かい砂は、砂の模様の低い所から満ちていく（水たまりのような満ち方）
            float level = fill * 0.95 - 0.3;
            gDust = smoothstep(-0.025, 0.025, level - S.w);
          } else if (uBlend > 0.5) {
            gRock = smoothstep(0.06, 0.36, gSlope);
            gDust = smoothstep(0.25, 0.9, fill) * 0.85;
          }
          gRock *= 1.0 - gDust;

          // 色
          float macro = sF.w;
          vec3 sandCol = uSandC * mix(0.84, 1.1, S.w) * (0.9 + 0.22 * macro);
          float strata = 0.86 + 0.14 * sin(p.y * 2.4 + rF.w * 3.0) + 0.06 * sin(p.y * 7.3);
          vec3 rockCol = uRockC * mix(0.74, 1.14, rockH) * strata;
          vec3 dustCol = uDustC * (0.94 + 0.1 * D.w);
          vec3 col = mix(mix(sandCol, rockCol, gRock), dustCol, gDust);
          if (uView > 1.5) col = mix(mix(vec3(0.85, 0.7, 0.3), vec3(0.32, 0.38, 0.5), gRock), vec3(0.6, 0.2, 0.12), gDust);
          diffuseColor.rgb = col;

          vec3 sandNrm = S.xyz;
          vec3 dustNrm = D.xyz;
          gN = normalize(mix(mix(sandNrm, rockNrm, gRock), dustNrm, gDust));
          gRough = mix(mix(0.95, 0.8, gRock), 1.0, gDust);
        }`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRough;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(gN, 0.0)).xyz);')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        if (uView > 0.5 && uView < 1.5) {
          // 傾きの白黒：0°（平ら）＝黒 〜 60° 以上＝白。赤い線＝岩肌に切り替わる角度（約 37°）
          float ang = acos(1.0 - gSlope);
          float g = clamp(ang / 1.0472, 0.0, 1.0);
          vec3 c = vec3(g);
          float line = abs(gSlope - 0.2);
          float w = fwidth(gSlope) * 1.2;
          if (line < w) c = vec3(0.95, 0.15, 0.1);
          gl_FragColor = vec4(c, 1.0);
        }`,
      )
  }
  m.customProgramCacheKey = () => 'terrain-lab-ground'
  return m
}

/** 岩の材質：岩肌の模様は 3 方向から貼る。上を向いた面には砂が積もる（決まりどおりのとき） */
export function rockLabMaterial() {
  const uniforms = {
    uView: labUniforms.uView,
    uDustTop: labUniforms.uDustTop,
    uRockT: { value: detailTexture('rock') },
    uSandC: { value: PALETTE.sand },
  }
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0 })
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLW;\nvarying vec3 vLN;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        #ifdef USE_INSTANCING
          vLW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
          vLN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
        #else
          vLW = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vLN = normalize(mat3(modelMatrix) * objectNormal);
        #endif`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uRockT; uniform float uView; uniform float uDustTop; uniform vec3 uSandC;
        varying vec3 vLW; varying vec3 vLN;
        vec3 gN;
        ${SAMPLE}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 n = normalize(vLN);
          vec4 r = labSample(uRockT, vLW, n, 1.3, 1.4, true);
          diffuseColor.rgb *= mix(0.65, 1.15, r.w);
          gN = r.xyz;
          if (uDustTop > 0.5) {
            // 上を向いた面のくぼみに砂がたまる（境目は岩の凹凸でくっきり）
            float up = smoothstep(0.35, 0.85, n.y);
            float k = smoothstep(-0.04, 0.04, up * 0.9 - r.w);
            diffuseColor.rgb = mix(diffuseColor.rgb, uSandC * 0.95, k * 0.85);
            gN = normalize(mix(gN, n, k * 0.7));
          }
        }`,
      )
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(gN, 0.0)).xyz);')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        if (uView > 0.5 && uView < 1.5) gl_FragColor = vec4(1.0, 0.55, 0.1, 1.0);`,
      )
  }
  m.customProgramCacheKey = () => 'terrain-lab-rock'
  return m
}
