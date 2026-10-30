import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal, useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { bodies } from '../../state/registry'
import { useStore } from '../../state/store'
import { BEACON_ID, SF_TEXT, beaconName } from '../../data/sf'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'
import { useSite } from './useSite'

// エウロパの氷の上の、謎のビーコン（オリジナルのデザイン）。
// 内側へ反った3枚の虹色の刃が立ち、その上に輪が浮かんでゆっくり回る。真ん中の結晶がやわらかく脈打ち、
// ときどき光の球がふくらんで消える（信号）。何もしてこない、静かな物体。
// エウロパの表示の大きさ（半径約0.75）に合わせ、見えるよう高さは約150km（本物の物ならありえない大きさ）で描く。

/** エウロパの表面の、ビーコンのある向き（エウロパの座標） */
const SITE = new THREE.Vector3(0.35, 0.75, 0.55).normalize()
const Y = new THREE.Vector3(0, 1, 0)
/** 信号の球がふくらむ周期（秒） */
const PULSE = 5

function signalMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uFade: { value: 1 } },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      uniform float uFade; varying vec3 vN; varying vec3 vV;
      void main() {
        #include <logdepthbuf_fragment>
        float rim = pow(1.0 - abs(dot(vN, vV)), 2.5);
        gl_FragColor = vec4(vec3(0.35, 0.95, 1.0) * rim * uFade, rim * uFade);
      }`,
  })
}

function Beacon({ radius }: { radius: number }) {
  useLang()
  const group = useRef<THREE.Group>(null!)
  const ring = useRef<THREE.Mesh>(null!)
  const core = useRef<THREE.Mesh>(null!)
  const signal = useRef<THREE.Mesh>(null!)
  const label = useRef<HTMLSpanElement>(null)
  useHideBehindSun(label, group)
  const height = radius * 0.09
  const moved = useSite(group, { id: BEACON_ID, radius: height * 0.6, notice: { distance: radius * 0.8, text: SF_TEXT.beaconFound } })
  const parts = useMemo(() => {
    // 刃：根元が太く先が細い、少し反った三角柱
    const blade = new THREE.ConeGeometry(0.12, 1, 3, 12, false)
    const pos = blade.attributes.position
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      const t = v.y + 0.5
      // 上へ行くほど内側（-X）へ反り、ねじれる
      v.x -= t * t * 0.35
      v.applyAxisAngle(Y, t * 0.9)
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    blade.computeVertexNormals()
    return {
      blade,
      bladeMat: new THREE.MeshPhysicalMaterial({ color: '#3a5a78', metalness: 0.9, roughness: 0.18, iridescence: 1, iridescenceIOR: 1.8, emissive: '#0a2a3a', emissiveIntensity: 0.6 }),
      ring: new THREE.TorusGeometry(0.32, 0.018, 12, 96),
      ringMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.6, 1.9), toneMapped: false }),
      core: new THREE.IcosahedronGeometry(0.07, 0),
      coreMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 2.2, 2.4), toneMapped: false }),
      signal: new THREE.SphereGeometry(1, 48, 32),
      signalMat: signalMaterial(),
    }
  }, [])
  useEffect(
    () => () => {
      Object.values(parts).forEach((p) => (p as { dispose?: () => void }).dispose?.())
    },
    [parts],
  )

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    ring.current.rotation.z = t * 0.25
    ring.current.position.y = 0.72 + Math.sin(t * 0.8) * 0.02
    core.current.rotation.set(t * 0.3, t * 0.5, 0)
    core.current.scale.setScalar(1 + 0.15 * Math.sin(t * 2))
    const k = (t % PULSE) / PULSE
    signal.current.scale.setScalar(0.1 + k * 4)
    parts.signalMat.uniforms.uFade.value = (1 - k) * (1 - k)
    moved()
  })

  // ビーコンの座標：+Y が地面から上。高さ1で作り、height 倍する
  const q = new THREE.Quaternion().setFromUnitVectors(Y, SITE)
  return (
    <group ref={group} position={SITE.clone().multiplyScalar(radius * 0.995)} quaternion={q}>
      <group scale={height}>
        {[0, 1, 2].map((k) => (
          <mesh key={k} geometry={parts.blade} material={parts.bladeMat} position={[Math.cos((k * 2 * Math.PI) / 3) * 0.28, 0.5, Math.sin((k * 2 * Math.PI) / 3) * 0.28]} rotation={[0, -(k * 2 * Math.PI) / 3, 0]} />
        ))}
        <mesh ref={ring} geometry={parts.ring} material={parts.ringMat} position={[0, 0.72, 0]} rotation={[Math.PI / 2, 0, 0]} />
        <mesh ref={core} geometry={parts.core} material={parts.coreMat} position={[0, 0.45, 0]} />
        <mesh ref={signal} geometry={parts.signal} material={parts.signalMat} position={[0, 0.45, 0]} />
      </group>
      <Html position={[0, height * 1.3, 0]} center className="label" zIndexRange={LABEL_Z}>
        <span ref={label} onClick={() => useStore.getState().setTarget(BEACON_ID)}>
          {beaconName()}
        </span>
      </Html>
    </group>
  )
}

/** エウロパ（の描画のかたまり）の中に置く。エウロパが登録されるまでは何も描かない */
export function EuropaBeacon() {
  const [europa, setEuropa] = useState<{ object: THREE.Object3D; radius: number } | null>(null)
  useEffect(() => {
    if (europa) return
    const find = () => {
      const b = bodies.get('europa')
      if (b) setEuropa({ object: b.object, radius: b.radius })
    }
    find()
    const id = window.setInterval(find, 500)
    return () => window.clearInterval(id)
  }, [europa])
  if (!europa) return null
  return createPortal(<Beacon radius={europa.radius} />, europa.object)
}
