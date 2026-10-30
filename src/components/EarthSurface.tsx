import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useOptionalTexture } from '../hooks/useOptionalTexture'
import { useCloseTexture } from '../hooks/useCloseTexture'
import { closeTextureUrl, textureUrl } from '../data/textures'
import { ECLIPSE_GLSL, eclipseUniforms } from './eclipseShadow'
import { useStore } from '../state/store'
import { PHOTO_GLSL, photoUniform } from '../state/look'

const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vPosW;
  varying vec3 vPosL;
  void main() {
    vUv = uv;
    vPosL = position;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vPosW = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`

// 昼側は昼の地図、夜側は都市の灯り。境目（明暗境界）はなめらかに混ぜる。
// 海には太陽の照り返し、地表には雲の影、縁には大気の青い散乱をのせる。
// 近づくと、地図の1画素より細かい山並みの陰影・地表のむら・海面のさざ波を足す
const NOISE_GLSL = /* glsl */ `
  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  // 格子の向きが目立たないよう、1段ごとに回して重ねる
  const mat3 ROT = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
  float fbm3(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * noise3(p); p = ROT * p * 2.03; a *= 0.5; }
    return v / 0.875;
  }
  // 画面上で1ピクセルより細かくなる模様は消す
  float fine(float px, float freq) {
    return 1.0 - smoothstep(0.05, 0.18, px * freq);
  }
`

const fragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  ${NOISE_GLSL}
  uniform float uDetail;
  uniform float uRadius;
  varying vec3 vPosL;
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uClouds;
  uniform float uHasClouds;
  uniform float uCloudShift;
  uniform vec3 uSunDir;
  uniform mat3 uInvRot;
  ${ECLIPSE_GLSL}
  ${PHOTO_GLSL}
  #define PI 3.141592653589793
  // 雲の層の高さ（半径に対する比。雲の球は 1.012 倍）
  #define CLOUD_HEIGHT 0.012
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vPosW;
  float ridge(float n) {
    return 1.0 - abs(n * 2.0 - 1.0);
  }

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vPosW);
    vec3 L = uSunDir;
    float lightGeo = dot(N, L);
    float mu = max(dot(N, V), 0.0);
    float dayMix = smoothstep(-0.15, 0.25, lightGeo);
    vec3 dayTex = texture2D(uDay, vUv).rgb;
    float ocean = smoothstep(0.02, 0.12, dayTex.b - max(dayTex.r, dayTex.g) * 0.9);

    // ---- 近づいたときの細部 ----
    vec3 Nd = N;
    if (uDetail > 0.001) {
      vec3 unit = normalize(vPosL);
      float px = max(length(dFdx(unit)), length(dFdy(unit))) * 1.4;
      float land = 1.0 - ocean;
      // 山並み：尾根の形のノイズを重ねた高さから、陰影を作る
      float h = (ridge(noise3(unit * 150.0)) * 0.12 * fine(px, 150.0)
        + ridge(noise3(unit * 520.0 + 4.3)) * 0.04 * fine(px, 520.0)
        + noise3(unit * 1700.0) * 0.012 * fine(px, 1700.0)) * land;
      // 海面のさざ波（太陽の照り返しをきらめかせる）
      h += (noise3(unit * 2600.0) - 0.5) * 0.004 * fine(px, 2600.0) * ocean;
      h *= uDetail;
      vec3 dpdx = dFdx(vPosW);
      vec3 dpdy = dFdy(vPosW);
      vec3 r1 = cross(dpdy, N);
      vec3 r2 = cross(N, dpdx);
      float det = dot(dpdx, r1);
      vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
      Nd = normalize(abs(det) * N - uRadius * 0.012 * smoothstep(0.04, 0.3, mu) * grad);
      // 地表の色のむら（森・畑・岩肌の細かな濃淡）
      float n = (noise3(unit * 340.0) - 0.5) * fine(px, 340.0) + (noise3(unit * 1200.0 + 2.0) - 0.5) * 0.6 * fine(px, 1200.0);
      dayTex *= 1.0 + n * 0.35 * land * uDetail;
    }
    float light = dot(Nd, L) * smoothstep(-0.1, 0.05, lightGeo);

    // 雲の影：雲の層は少し速く回るので、ずらした位置の雲を読む
    float shadow = 1.0;
    if (uHasClouds > 0.5) {
      vec2 cloudUv = vUv;
      if (uPhoto > 0.5) {
        // 写真モード：雲は地表より上にあるので、影は太陽と反対の側へずれて落ちる（太陽が低いほど長く）
        vec3 toSun = uInvRot * L;
        vec3 at = normalize(vPosL) + toSun * (CLOUD_HEIGHT / max(lightGeo, 0.12));
        at = normalize(at);
        cloudUv = vec2(fract(atan(at.z, -at.x) / (2.0 * PI)), 1.0 - acos(clamp(at.y, -1.0, 1.0)) / PI);
      }
      float c = texture2D(uClouds, cloudUv + vec2(uCloudShift, 0.0)).r;
      shadow = 1.0 - mix(0.45, 0.6, uPhoto) * c;
    }
    // 日食のときの、月の影
    float eclipse = solarShadow(vPosW);
    shadow *= eclipse;
    vec3 day = dayTex * max(light, 0.0) * shadow;

    // 海の照り返し（青が強いところを海とみなす）
    vec3 H = normalize(L + V);
    float glint = pow(max(dot(Nd, H), 0.0), 260.0) * 0.7 + pow(max(dot(Nd, H), 0.0), 40.0) * 0.05;
    day += vec3(1.0, 0.92, 0.8) * glint * ocean * shadow * step(0.0, light);

    vec3 night = texture2D(uNight, vUv).rgb * 1.4;
    vec3 color = mix(night, day, dayMix);

    if (uPhoto < 0.5) {
      // 大気の散乱：昼側の縁が青く光り、明暗境界は夕焼け色に
      float rim = pow(1.0 - mu, 2.4);
      float lit = smoothstep(-0.25, 0.45, lightGeo);
      color += vec3(0.32, 0.58, 1.0) * rim * lit * 0.55 * eclipse;
      color += vec3(1.0, 0.5, 0.25) * exp(-pow(lightGeo * 9.0, 2.0)) * rim * 0.12 * eclipse;
    } else {
      // 写真モード：地表にかかる青いかすみは、縁の近くの薄いものだけ。夜側には無い
      float rim = pow(1.0 - mu, 5.0);
      float lit = smoothstep(0.0, 0.35, lightGeo);
      color += vec3(0.22, 0.42, 0.9) * rim * lit * 0.35 * eclipse;
      // 明け方・夕方の境目は、空気を長く通ってきた赤っぽい光で照らされる
      float dusk = exp(-pow((lightGeo - 0.04) * 11.0, 2.0));
      color = mix(color, color * vec3(1.25, 0.82, 0.55) + vec3(0.06, 0.025, 0.0) * dayTex, dusk * 0.7);
      color = photoColor(color);
    }

    gl_FragColor = vec4(color, 1.0);
    #include <logdepthbuf_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** 近づいたときの細部の強さ（地球の表面と雲で共有する） */
const detail = { value: 0 }

/**
 * 雲にも日食の影を落とす（three.js の標準の材質に、影の計算を差し込む）。
 * 近くでは、雲の縁を細かなノイズでちぎって、ぼやけた画像でなく本物の雲のかたまりに見せる
 */
function shadowClouds(shader: THREE.WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, eclipseUniforms, { uDetail: detail })
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vEclipsePos;\nvarying vec3 vCloudL;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvEclipsePos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvCloudL = transformed;')
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vEclipsePos;\nvarying vec3 vCloudL;\nuniform float uDetail;\n${NOISE_GLSL}\n${ECLIPSE_GLSL}`)
    .replace(
      '#include <alphamap_fragment>',
      `#include <alphamap_fragment>
      if (uDetail > 0.001) {
        vec3 cu = normalize(vCloudL);
        float px = max(length(dFdx(cu)), length(dFdy(cu))) * 1.4;
        float n = (fbm3(cu * 300.0) - 0.5) * fine(px, 1200.0) + (fbm3(ROT * cu * 1500.0 + 5.0) - 0.5) * 0.5 * fine(px, 6000.0);
        float a = diffuseColor.a;
        // 薄い雲（半透明のところ）ほど強くちぎる。厚い雲には陰影のむらだけ
        diffuseColor.a = clamp(a + n * 0.9 * 4.0 * a * (1.0 - a) * uDetail, 0.0, 1.0);
        diffuseColor.rgb *= 1.0 - 0.22 * uDetail * max(0.0, -n) * a;
      }`,
    )
    .replace('#include <opaque_fragment>', 'outgoingLight *= solarShadow(vEclipsePos);\n#include <opaque_fragment>')
}

/** 地球の表面。テクスチャが揃わない間は null を返し、呼び出し側が通常の球を描く */
export function EarthSurface({ radius }: { radius: number }) {
  const surface = useRef<THREE.Mesh>(null!)
  // 近くでは 4K 版に差し替える
  const closeDay = useCloseTexture(closeTextureUrl('earth'), surface, radius)
  const closeNight = useCloseTexture(closeTextureUrl('earthNight'), surface, radius)
  const closeClouds = useCloseTexture(closeTextureUrl('earthClouds'), surface, radius)
  const farDay = useOptionalTexture(textureUrl('earth'))
  const farNight = useOptionalTexture(textureUrl('earthNight'))
  const farClouds = useOptionalTexture(textureUrl('earthClouds'))
  const day = closeDay ?? farDay
  const night = closeNight ?? farNight
  const clouds = closeClouds ?? farClouds
  const cloudLayer = useRef<THREE.Mesh>(null)

  const uniforms = useMemo(
    () => ({
      uDay: { value: null as THREE.Texture | null },
      uNight: { value: null as THREE.Texture | null },
      uClouds: { value: null as THREE.Texture | null },
      uHasClouds: { value: 0 },
      uCloudShift: { value: 0 },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uDetail: detail,
      uRadius: { value: radius },
      ...eclipseUniforms,
      uPhoto: photoUniform,
      uInvRot: { value: new THREE.Matrix3() },
    }),
    [radius],
  )
  uniforms.uDay.value = day
  uniforms.uNight.value = night
  uniforms.uClouds.value = clouds
  uniforms.uHasClouds.value = clouds ? 1 : 0
  if (clouds && clouds.wrapS !== THREE.RepeatWrapping) {
    clouds.wrapS = THREE.RepeatWrapping
    clouds.needsUpdate = true
  }

  const worldPos = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }, delta) => {
    if (!surface.current) return
    surface.current.getWorldPosition(worldPos)
    // 表面に近づくほど細部を足す
    detail.value = 1 - THREE.MathUtils.smoothstep(camera.position.distanceTo(worldPos) - radius, radius * 0.15, radius * 1.4)
    uniforms.uSunDir.value.copy(worldPos).negate().normalize()
    // 世界の向きから、この球の座標の向きへ（雲の影のずれを地図の上で計算する）
    uniforms.uInvRot.value.setFromMatrix4(surface.current.matrixWorld).invert()
    if (cloudLayer.current) {
      // 雲は風で少しずつ流れる（時間の速さに合わせる。1秒で1時間のとき、1秒に0.02ラジアン）
      cloudLayer.current.rotation.y += delta * Math.min(0.02 * useStore.getState().timeScale, 0.05)
      // 球の u は回転と逆向きに進むので、雲の回った分だけ戻して読む
      uniforms.uCloudShift.value = -cloudLayer.current.rotation.y / (Math.PI * 2)
    }
  })

  if (!day || !night) return null

  return (
    <>
      <mesh ref={surface}>
        <sphereGeometry args={[radius, 192, 128]} />
        <shaderMaterial vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniforms} />
      </mesh>
      {clouds && (
        <mesh ref={cloudLayer} scale={1.012}>
          <sphereGeometry args={[radius, 192, 128]} />
          <meshStandardMaterial alphaMap={clouds} transparent depthWrite={false} color="#ffffff" onBeforeCompile={shadowClouds} />
        </mesh>
      )}
    </>
  )
}
