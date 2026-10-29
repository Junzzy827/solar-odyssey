import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PLANETS } from '../data/bodies'
import { DIVE_DEPTH } from '../data/approach'
import { ship } from '../state/flight'
import { bodies } from '../state/registry'
import { proximity } from '../state/proximity'
import { shipZoom } from '../state/zoom'

// ガス惑星の雲の中・雲の上をかすめるときの、ふわっとした雲のかたまり。
// 船の進む先で左右に押し分けられ、後ろで渦を巻きながらゆっくり閉じる。

const COUNT = 220
/** 雲のかたまりが見える範囲（船からの距離） */
const RANGE = 2.6
/** 雲の上面から上に、どこまで雲が湧いているか（半径に対する割合） */
const TOP = 0.012

const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec4 aPuff; // xyz: 中心, w: 大きさ
  attribute vec3 aLook; // x: 不透明度, y: 明るさ, z: 模様の種
  uniform float uNear;
  varying vec2 vUv;
  varying vec3 vLook;
  varying float vNear;
  void main() {
    vUv = uv;
    vLook = aLook;
    vec4 mv = modelViewMatrix * vec4(aPuff.xyz, 1.0);
    // カメラに近すぎる雲は薄くする（画面いっぱいの板にならないように）
    vNear = smoothstep(0.06 * uNear, 0.45 * uNear, -mv.z);
    mv.xy += position.xy * aPuff.w;
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }
`

const fragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uLit;
  uniform vec3 uShade;
  uniform vec3 uSunView;
  varying vec2 vUv;
  varying vec3 vLook;
  varying float vNear;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 1.7; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    // もこもこした輪郭：中心ほど濃く、縁は雲の模様で崩す
    float billow = fbm(p * 2.2 + vLook.z * 17.0);
    float density = smoothstep(1.0, 0.15, r + (billow - 0.5) * 0.75);
    if (density <= 0.001) discard;
    // 丸い雲として、太陽の側を明るく、反対側を暗くする
    vec3 n = normalize(vec3(p, sqrt(max(0.0, 1.0 - r * r)) + 0.35));
    float sun = clamp(dot(n, uSunView) * 0.5 + 0.5, 0.0, 1.0);
    vec3 color = mix(uShade, uLit, sun * (0.65 + 0.35 * billow)) * vLook.y;
    gl_FragColor = vec4(color, density * vLook.x * vNear);
    #include <logdepthbuf_fragment>
  }
`

type Puff = {
  /** 惑星の中心からの位置（惑星と一緒に公転する） */
  base: THREE.Vector3
  /** 押し分けられたずれ。ゆっくり元に戻る */
  push: THREE.Vector3
  size: number
  seed: number
  age: number
}

const planetColors = new Map(PLANETS.map((p) => [p.id, { lit: new THREE.Color(p.atmosphere ?? p.color), base: new THREE.Color(p.color) }]))

const center = new THREE.Vector3()
const rel = new THREE.Vector3()
const dir = new THREE.Vector3()
const lateral = new THREE.Vector3()
const world = new THREE.Vector3()
const tmp = new THREE.Vector3()
const sunView = new THREE.Vector3()
const swirl = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

export function CloudWake() {
  const puffs = useRef<Puff[]>([])
  const planet = useRef<string | null>(null)

  const { geometry, material, mesh } = useMemo(() => {
    const quad = new THREE.PlaneGeometry(1, 1)
    const g = new THREE.InstancedBufferGeometry()
    g.index = quad.index
    g.setAttribute('position', quad.getAttribute('position'))
    g.setAttribute('uv', quad.getAttribute('uv'))
    g.setAttribute('aPuff', new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 4), 4).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aLook', new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 3), 3).setUsage(THREE.DynamicDrawUsage))
    g.instanceCount = 0
    const m = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uLit: { value: new THREE.Color() },
        uShade: { value: new THREE.Color() },
        uSunView: { value: new THREE.Vector3(0, 0, 1) },
        uNear: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(g, m)
    mesh.frustumCulled = false
    mesh.renderOrder = 2
    return { geometry: g, material: m, mesh }
  }, [])

  useFrame(({ camera }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05)
    const id = proximity.kind === 'gas' ? proximity.id : null
    const body = id ? bodies.get(id) : undefined
    // 雲の上面から半径の3%以内（または雲の中）にいるときだけ
    const active = body && proximity.altitude < body.radius * 0.03
    if (!active || !body || !id) {
      geometry.instanceCount = 0
      planet.current = null
      return
    }
    body.object.getWorldPosition(center)
    const R = body.radius
    const top = R * (1 + TOP)
    if (planet.current !== id) {
      planet.current = id
      puffs.current = []
    }

    // 接近ズームで船が小さくなったら、雲のかたまりも小さく・近くにする（縮め方の半分だけ。雲は船より大きく見える）
    const c = 1 / Math.sqrt(shipZoom.factor)
    const range = RANGE * c
    material.uniforms.uNear.value = c
    const speed = ship.velocity.length()
    if (speed > 0.02 * c) dir.copy(ship.velocity).divideScalar(speed)
    else dir.set(0, 0, -1).applyQuaternion(ship.quaternion)

    // 新しい雲は、進む先に多めに置く
    const spawn = (p: Puff | undefined, ahead: boolean) => {
      const puff = p ?? { base: new THREE.Vector3(), push: new THREE.Vector3(), size: 0, seed: 0, age: 0 }
      for (let tries = 0; tries < 8; tries++) {
        tmp.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
        if (tmp.lengthSq() > 1) continue
        if (ahead) {
          // 進む先の、少し横に広がった円盤の中
          tmp.addScaledVector(dir, -tmp.dot(dir)).multiplyScalar(range * 0.55).addScaledVector(dir, range * (0.75 + Math.random() * 0.35))
        } else tmp.multiplyScalar(range)
        world.copy(ship.position).add(tmp)
        // 雲の上面より上には置かない
        if (world.distanceTo(center) < top) break
      }
      puff.base.copy(world).sub(center)
      puff.push.set(0, 0, 0)
      puff.size = 0.18 + Math.random() * 0.42
      puff.seed = Math.random()
      puff.age = 0
      return puff
    }
    while (puffs.current.length < COUNT) puffs.current.push(spawn(undefined, false))

    const lit = planetColors.get(id)?.lit ?? new THREE.Color(1, 1, 1)
    const base = planetColors.get(id)?.base ?? lit
    material.uniforms.uLit.value.copy(lit).multiplyScalar(1.15)
    material.uniforms.uShade.value.copy(base).multiplyScalar(0.32)
    // 太陽の向き（ビュー空間）
    sunView.copy(center).negate().normalize().transformDirection(camera.matrixWorldInverse)
    material.uniforms.uSunView.value.copy(sunView)

    const puffAttr = geometry.getAttribute('aPuff') as THREE.InstancedBufferAttribute
    const lookAttr = geometry.getAttribute('aLook') as THREE.InstancedBufferAttribute
    const strength = (0.12 + Math.min(1, speed / (1.5 * c)) * 0.3) * c
    let n = 0
    for (const puff of puffs.current) {
      world.copy(center).add(puff.base)
      rel.copy(world).sub(ship.position)
      const dist = rel.length()
      // 遠ざかった雲は進む先へ置き直す
      if (dist > range * 1.25) {
        spawn(puff, speed > 0.02 * c)
        world.copy(center).add(puff.base)
        rel.copy(world).sub(ship.position)
      }
      puff.age += dt
      // 東西に流れる風（自転の向きに沿って、ゆっくり流れる）
      puff.base.addScaledVector(swirl.crossVectors(UP, puff.base).normalize(), 0.025 * dt)

      // 押し分け：船の進む線からの横のずれを、船の前後で広げる
      const axial = rel.dot(dir)
      lateral.copy(rel).addScaledVector(dir, -axial)
      const side = lateral.length()
      if (side > 1e-4) lateral.divideScalar(side)
      else lateral.set(0, 1, 0)
      const along = axial > 0 ? Math.exp(-((axial / (0.5 * c)) ** 2)) : Math.exp(axial / (1.4 * c))
      const want = strength * Math.exp(-((side / (0.45 * c)) ** 2)) * along
      const target = tmp.copy(lateral).multiplyScalar(want)
      // 後ろでは渦を巻く（進む向きのまわりに少し回す）
      if (axial < 0) target.add(swirl.crossVectors(dir, lateral).multiplyScalar(want * 0.6))
      // 押されるのは速く、戻るのはゆっくり
      const k = puff.push.lengthSq() < target.lengthSq() ? 1 - Math.exp(-6 * dt) : 1 - Math.exp(-0.5 * dt)
      puff.push.lerp(target, k)

      world.add(puff.push)
      const depth = THREE.MathUtils.clamp((R - world.distanceTo(center)) / (R * DIVE_DEPTH), 0, 1)
      const fadeIn = Math.min(1, puff.age / 0.8)
      const fadeOut = 1 - THREE.MathUtils.smoothstep(dist, range * 0.8, range * 1.2)
      puffAttr.setXYZW(n, world.x, world.y, world.z, puff.size * c)
      lookAttr.setXYZ(n, 0.55 * fadeIn * fadeOut, 1 - depth * 0.6, puff.seed)
      n++
    }
    puffAttr.needsUpdate = true
    lookAttr.needsUpdate = true
    geometry.instanceCount = n
  })

  return <primitive object={mesh} />
}
