import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vNormalW;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }
`

const fragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uColor;
  uniform float uPower;
  uniform vec3 uSunDir;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vNormalW;
  void main() {
    // 背面の球なので、外側の輪郭で0、本体の縁に近づくほど濃くなる
    float glow = pow(abs(dot(vNormal, vView)), uPower);
    // 太陽に照らされた側の縁だけ光る（夜側の縁はほとんど見えない）
    glow *= smoothstep(-0.45, 0.35, dot(normalize(vNormalW), uSunDir)) * 0.95 + 0.05;
    gl_FragColor = vec4(uColor * glow, glow);
    #include <logdepthbuf_fragment>
  }
`

const center = new THREE.Vector3()

/** 縁がぼんやり光る大気のグロー（背面を加算合成で描く） */
export function Atmosphere({ radius, color, power = 1.4, scale = 1.08 }: { radius: number; color: string; power?: number; scale?: number }) {
  const uniforms = useMemo(
    () => ({ uColor: { value: new THREE.Color(color) }, uPower: { value: power }, uSunDir: { value: new THREE.Vector3(1, 0, 0) } }),
    [color, power],
  )
  const mesh = useRef<THREE.Mesh>(null!)
  useFrame(() => {
    mesh.current.getWorldPosition(center)
    uniforms.uSunDir.value.copy(center).negate().normalize()
  })
  return (
    <mesh ref={mesh} scale={scale}>
      <sphereGeometry args={[radius, 48, 48]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.BackSide}
      />
    </mesh>
  )
}
