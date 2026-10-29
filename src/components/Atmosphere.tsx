import * as THREE from 'three'

const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uPower;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    // 背面の球なので、外側の輪郭で0、本体の縁に近づくほど濃くなる
    float glow = pow(abs(dot(vNormal, vView)), uPower);
    gl_FragColor = vec4(uColor * glow, glow);
  }
`

/** 縁がぼんやり光る大気のグロー（背面を加算合成で描く） */
export function Atmosphere({ radius, color, power = 1.4, scale = 1.08 }: { radius: number; color: string; power?: number; scale?: number }) {
  return (
    <mesh scale={scale}>
      <sphereGeometry args={[radius, 48, 48]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={{ uColor: { value: new THREE.Color(color) }, uPower: { value: power } }}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.BackSide}
      />
    </mesh>
  )
}
