import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { FloatController } from './floatControl'
import { setAnchor } from './anchors'

// 水の玉：無重力では、水は落ちずに表面の力でまるい玉になって浮かぶ。
// つつく（印にさわる・体でぶつかる）と、ぷるぷるゆれて小さな玉に分かれ、しばらくすると引き合ってまた 1 つにもどる。
// 照明の計算はしない部屋なので、水の見え方（ふちの明るさ・天井のランプの照り・うすい青）はシェーダーで描く。

const R = 0.075
const DROPS = 6

const vert = /* glsl */ `
  uniform float uTime;
  uniform float uWob;
  uniform float uSeed;
  varying vec3 vN;
  varying vec3 vP;
  void main() {
    vec3 n = normalize(position);
    // ゆれ：向きごとに違う波を重ねる（つついた直後ほど大きく、だんだん小さく）
    float w = sin(dot(n, vec3(3.0, 1.0, 0.0)) * 2.0 + uTime * 9.0 + uSeed)
            + 0.7 * sin(dot(n, vec3(0.0, 2.6, 1.4)) * 3.0 - uTime * 12.0 + uSeed * 2.0)
            + 0.5 * sin(dot(n, vec3(1.7, 0.0, 2.2)) * 4.0 + uTime * 15.0);
    // 何もしなくても、ほんの少しだけゆれる
    vec3 p = position * (1.0 + (uWob + 0.025) * w * 0.33);
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vP = wp.xyz;
    vN = normalize(mat3(modelMatrix) * n);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`
const frag = /* glsl */ `
  varying vec3 vN;
  varying vec3 vP;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(cameraPosition - vP);
    float f = pow(1.0 - abs(dot(n, v)), 2.2);
    // 天井のランプ（上）と、ふちの明るい輪
    vec3 h = normalize(vec3(0.2, 1.0, 0.1) + v);
    float spec = pow(max(dot(n, h), 0.0), 60.0);
    vec3 h2 = normalize(vec3(-0.4, 0.8, -0.5) + v);
    spec += 0.6 * pow(max(dot(n, h2), 0.0), 90.0);
    vec3 col = mix(vec3(0.55, 0.72, 0.82), vec3(0.95, 0.98, 1.0), f) + spec * 1.4;
    float a = 0.22 + f * 0.6 + spec;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`

type Drop = { mesh: THREE.Mesh; p: THREE.Vector3; v: THREE.Vector3; r: number; mat: THREE.ShaderMaterial }

export function WaterBall({ at, ctrl, onPoke }: { at: THREE.Vector3; ctrl: FloatController; onPoke: () => void }) {
  const s = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1, 5)
    const make = (seed: number) =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms: { uTime: { value: 0 }, uWob: { value: 0 }, uSeed: { value: seed } },
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      })
    const mainMat = make(0)
    const main = new THREE.Mesh(geo, mainMat)
    const drops: Drop[] = []
    for (let i = 0; i < DROPS; i++) {
      const mat = make(i * 1.7 + 1)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.visible = false
      drops.push({ mesh, p: new THREE.Vector3(), v: new THREE.Vector3(), r: 0, mat })
    }
    return { geo, main, mainMat, drops, center: at.clone(), vel: new THREE.Vector3(), split: -1, wob: 0, mass: 1 }
  }, [at])
  useEffect(
    () => () => {
      s.geo.dispose()
      s.mainMat.dispose()
      s.drops.forEach((d) => d.mat.dispose())
    },
    [s],
  )

  const poke = (dir?: THREE.Vector3) => {
    s.wob = 1
    if (s.split >= 0) return
    // 分かれる：小さな玉がゆっくり散らばる（全部で元の水の 半分ほど）
    s.split = 0
    s.mass = 0.5
    const d = dir ?? new THREE.Vector3(0, 0, -1)
    s.drops.forEach((drop, i) => {
      const a = (i / DROPS) * Math.PI * 2
      drop.r = R * (0.32 + 0.12 * ((i * 7) % 3))
      drop.p.copy(s.center)
      drop.v.set(Math.cos(a) * 0.09, Math.sin(a * 1.3) * 0.07, Math.sin(a) * 0.09).addScaledVector(d, 0.05)
      drop.mesh.visible = true
    })
  }

  // 印（光る点）の場所
  useEffect(() => {
    setAnchor('water', s.center.clone().add(new THREE.Vector3(0, R + 0.1, 0)), 5)
    pokeRef.current = () => {
      poke()
      onPoke()
    }
  })

  useFrame((state, dt) => {
    dt = Math.min(dt, 0.05)
    const t = state.clock.elapsedTime
    // 体でぶつかったら、つつく
    const d = ctrl.pos.distanceTo(s.center)
    if (d < ctrl.radius + R + 0.02 && s.split < 0) {
      poke(s.center.clone().sub(ctrl.pos).normalize())
      onPoke()
    }
    s.wob *= Math.exp(-dt * 1.6)
    // 大きな玉はその場にゆっくりもどる
    s.center.lerp(at, 1 - Math.exp(-dt * 0.5))
    s.main.position.copy(s.center)
    const rMain = R * Math.cbrt(s.mass)
    s.main.scale.setScalar(rMain)
    s.mainMat.uniforms.uTime.value = t
    s.mainMat.uniforms.uWob.value = s.wob
    if (s.split >= 0) {
      s.split += dt
      let left = 0
      for (const drop of s.drops) {
        if (!drop.mesh.visible) continue
        left++
        if (s.split > 2.2) {
          // 引き合って、もどる
          const to = s.center.clone().sub(drop.p)
          const dist = to.length()
          drop.v.addScaledVector(to.normalize(), dt * 0.35).multiplyScalar(Math.exp(-dt * 1.2))
          if (dist < rMain + drop.r * 0.6) {
            drop.mesh.visible = false
            s.mass = Math.min(1, s.mass + (drop.r / R) ** 3)
            s.wob = Math.max(s.wob, 0.35)
          }
        } else drop.v.multiplyScalar(Math.exp(-dt * 0.6))
        drop.p.addScaledVector(drop.v, dt)
        drop.mesh.position.copy(drop.p)
        drop.mesh.scale.setScalar(drop.r)
        drop.mat.uniforms.uTime.value = t
        drop.mat.uniforms.uWob.value = 0.2
      }
      if (left === 0) {
        s.split = -1
        s.mass = 1
      }
    }
  })

  return (
    <group>
      <primitive object={s.main} />
      {s.drops.map((d, i) => (
        <primitive key={i} object={d.mesh} />
      ))}
    </group>
  )
}

/** 印を押したときに呼ぶ（HUD から） */
export const pokeRef: { current: (() => void) | null } = { current: null }
