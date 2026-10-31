import { useEffect, useMemo, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { loadCatalog } from '../Sky'
import { useLevel } from '../../state/quality'
import type { SkyNow } from './skyNow'

// 地表から見る星表の星（宇宙の場面と同じ 9,096 個）。天体の自転と一緒に空を回る。
// 空が明るいあいだは見えず、日が沈むと出てくる。大気のある星では地平線の近くほど暗く、少し赤くなる。

const vertex = /* glsl */ `
  attribute float mag;
  attribute vec3 color;
  uniform float uPx;
  uniform float uVis;
  uniform float uAir;
  varying vec3 vColor;
  varying float vSize;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec3 d = normalize(world.xyz - cameraPosition);
    // 大気を斜めに通るほど暗く（地平線の近くの星は見えにくい）
    float airmass = 1.0 / max(d.y + 0.06, 0.03);
    float ext = exp(-uAir * 0.12 * airmass);
    float flux = pow(10.0, -0.4 * (mag - 1.5) * 0.6) * uVis * ext;
    float size = clamp(1.5 + 1.8 * sqrt(flux), 1.5, 7.0);
    vSize = size * max(uPx, 1.0);
    vColor = color * vec3(1.0, 0.95 + 0.05 * ext, 0.85 + 0.15 * ext) * min(flux * 2.4, 3.4);
    if (d.y < -0.02) vColor = vec3(0.0);
    gl_Position = projectionMatrix * viewMatrix * world;
    gl_PointSize = vSize + 2.0;
  }
`
const fragment = /* glsl */ `
  varying vec3 vColor;
  varying float vSize;
  void main() {
    float r = length(gl_PointCoord - 0.5) * (vSize + 2.0);
    float core = exp(-r * r / (0.18 * vSize * vSize + 0.35));
    if (core < 0.004 || dot(vColor, vec3(1.0)) < 0.002) discard;
    gl_FragColor = vec4(vColor * core, 1.0);
  }
`

/** 星の球の大きさ（星表は半径 1800 で作ってある。空の球 9000 の内側に収める） */
const SCALE = 4.6

export function SurfaceStars({ sky, hasAir }: { sky: SkyNow; hasAir: boolean }) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)
  const level = useLevel()
  const gl = useThree((s) => s.gl)
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uPx: { value: 1 }, uVis: { value: 0 }, uAir: { value: hasAir ? 1 : 0 } },
        vertexShader: vertex,
        fragmentShader: fragment,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
    [hasAir],
  )
  const group = useMemo(() => new THREE.Group(), [])
  useEffect(() => {
    let alive = true
    loadCatalog().then(
      (g) => alive && setGeometry(g),
      () => {},
    )
    return () => {
      alive = false
    }
  }, [])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    if (geometry) geometry.setDrawRange(0, level === 'low' ? geometry.userData.low : Infinity)
  }, [geometry, level])
  useFrame(() => {
    material.uniforms.uPx.value = gl.getPixelRatio()
    material.uniforms.uVis.value = sky.starVis
    group.quaternion.copy(sky.frame.quatToLocal)
  })
  if (!geometry) return null
  return (
    <primitive object={group} scale={SCALE}>
      <points geometry={geometry} material={material} renderOrder={-8} frustumCulled={false} />
    </primitive>
  )
}
