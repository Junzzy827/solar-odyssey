import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { asteroids, beamTargets, type RockType } from '../state/registry'
import { ship } from '../state/flight'
import { useStore } from '../state/store'
import { playBeam, playBlast } from '../audio/sfx'
import { touchInput } from '../state/input'
import { t } from '../i18n/lang'

const RANGE = 40
const BEAM_SECONDS = 0.35
const DEBRIS = 80
const DEBRIS_SECONDS = 1.6
/** 任務の目標には、照準から約10°以内なら当たる */
const AIM_ASSIST = Math.cos(THREE.MathUtils.degToRad(10))

const ROCK_FACTS: Record<RockType, [string, string]> = {
  0: [
    '炭素質（C型）の小惑星を破壊。小惑星の約4分の3がこのタイプで、太陽系ができたころの材料がほぼそのまま残っています。',
    'Carbon-rich (C-type) asteroid destroyed. About three quarters of asteroids are this type, and they still hold material from when the solar system formed.',
  ],
  1: [
    '石質（S型）の小惑星を破壊。岩と金属が混ざっていて、地球に落ちてくる隕石に多いタイプです。',
    'Stony (S-type) asteroid destroyed. It is a mix of rock and metal, a common type among meteorites that fall to Earth.',
  ],
  2: [
    '金属（M型）の小惑星を破壊。鉄やニッケルが多く、昔の小さな惑星の芯のかけらだと考えられています。',
    'Metal (M-type) asteroid destroyed. Rich in iron and nickel, it is thought to be a piece of the core of an ancient small planet.',
  ],
}
const SPARSE_FACT: [string, string] = [
  '本物の小惑星帯はとてもまばらで、大きな岩どうしは数十万〜100万kmほど離れています。探査機は何にもぶつからずに通り抜けられます。',
  'The real asteroid belt is very sparse: big rocks are hundreds of thousands to a million km apart. Probes fly through without hitting anything.',
]

// 円盤の下面前方にある発射口（自機の座標、スケール0.3を掛けた値）
const EMITTER = new THREE.Vector3(0, 0.03 * 0.3, -0.3 * 0.3)

const tmpM = new THREE.Matrix4()
const zero = new THREE.Matrix4().makeScale(0, 0, 0)
const from = new THREE.Vector3()
const to = new THREE.Vector3()
const mid = new THREE.Vector3()
const up = new THREE.Vector3(0, 1, 0)
const center = new THREE.Vector2(0, 0)

/** ビームで小惑星を撃つ（F キー、または操縦中のクリック） */
export function Phaser() {
  const { camera, gl } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const beam = useRef<THREE.Mesh>(null!)
  const beamMat = useRef<THREE.MeshBasicMaterial>(null!)
  const fire = useRef(false)
  const beamState = useRef({ t: BEAM_SECONDS, target: new THREE.Vector3() })
  const destroyedCount = useRef(0)

  const debris = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DEBRIS * 3), 3))
    const velocity = new Float32Array(DEBRIS * 3)
    return { geometry, velocity, t: DEBRIS_SECONDS, origin: new THREE.Vector3() }
  }, [])
  const debrisMat = useRef<THREE.PointsMaterial>(null!)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyF' && !e.repeat) fire.current = true
    }
    const onDown = (e: MouseEvent) => {
      if (e.button === 0 && document.pointerLockElement === gl.domElement) fire.current = true
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [gl])

  useFrame(({ clock }, delta) => {
    const st = useStore.getState()
    if (fire.current || touchInput.fire) {
      fire.current = false
      touchInput.fire = false
      if (st.mode === 'flight' && st.warpPhase === 'idle') shoot(clock.getElapsedTime())
    }

    // ビーム：発射口から命中点へ。短時間で細く消える
    const b = beamState.current
    b.t += delta
    const k = Math.max(0, 1 - b.t / BEAM_SECONDS)
    beam.current.visible = k > 0
    if (k > 0) {
      from.copy(EMITTER).applyQuaternion(ship.quaternion).add(ship.position)
      const length = from.distanceTo(b.target)
      mid.copy(from).add(b.target).multiplyScalar(0.5)
      beam.current.position.copy(mid)
      beam.current.quaternion.setFromUnitVectors(up, to.copy(b.target).sub(from).normalize())
      beam.current.scale.set(k, length, k)
      beamMat.current.opacity = k
    }

    // 破片：外へ飛び散りながら消える
    debris.t += delta
    const dk = Math.max(0, 1 - debris.t / DEBRIS_SECONDS)
    debrisMat.current.opacity = dk
    if (dk > 0) {
      const pos = debris.geometry.attributes.position.array as Float32Array
      for (let i = 0; i < DEBRIS * 3; i++) pos[i] += debris.velocity[i] * delta
      debris.geometry.attributes.position.needsUpdate = true
    }
  })

  function shoot(now: number) {
    raycaster.setFromCamera(center, camera)
    raycaster.far = RANGE
    const b = beamState.current
    b.t = 0
    playBeam()
    // 任務の小惑星など：壊さずに、当たったことだけ知らせる。照準が少しずれていても当たる（スマホでも当てやすく）
    for (const t of beamTargets) {
      t.object.getWorldPosition(to)
      const d = to.distanceTo(raycaster.ray.origin)
      if (d > RANGE || mid.copy(to).sub(raycaster.ray.origin).normalize().dot(raycaster.ray.direction) < AIM_ASSIST) continue
      b.target.copy(to)
      burst(to)
      playBlast()
      t.onHit()
      return
    }
    const hit = raycaster.intersectObjects(asteroids.meshes, false)[0]
    if (!hit || hit.instanceId === undefined) {
      b.target.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, RANGE)
      return
    }
    b.target.copy(hit.point)
    const mesh = hit.object as THREE.InstancedMesh
    mesh.getMatrixAt(hit.instanceId, tmpM)
    asteroids.destroyed.push({ mesh, index: hit.instanceId, matrix: tmpM.clone(), at: now })
    mesh.setMatrixAt(hit.instanceId, zero)
    mesh.instanceMatrix.needsUpdate = true
    burst(hit.point)
    playBlast()

    const type = asteroids.types.get(mesh)?.[hit.instanceId] ?? 0
    destroyedCount.current += 1
    useStore.getState().showToast(destroyedCount.current === 1 ? `${t(...ROCK_FACTS[type])}\n${t(...SPARSE_FACT)}` : t(...ROCK_FACTS[type]))
  }

  function burst(at: THREE.Vector3) {
    const pos = debris.geometry.attributes.position.array as Float32Array
    for (let i = 0; i < DEBRIS; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
      const speed = 0.5 + Math.random() * 2.5
      pos.set([at.x, at.y, at.z], i * 3)
      debris.velocity.set([dir.x * speed, dir.y * speed, dir.z * speed], i * 3)
    }
    debris.geometry.attributes.position.needsUpdate = true
    debris.t = 0
  }

  return (
    <>
      <mesh ref={beam} visible={false} frustumCulled={false}>
        <cylinderGeometry args={[0.012, 0.012, 1, 8, 1, true]} />
        <meshBasicMaterial ref={beamMat} color={new THREE.Color(2.4, 0.8, 0.2)} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <points geometry={debris.geometry} frustumCulled={false}>
        <pointsMaterial ref={debrisMat} color={new THREE.Color(1.8, 1.1, 0.6)} size={0.06} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </points>
    </>
  )
}
