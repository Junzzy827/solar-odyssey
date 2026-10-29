import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { ShipModel } from './ship/ShipModel'
import { bodies } from '../state/registry'
import { useStore } from '../state/store'
import { CHARGE_SECONDS, EXIT_SECONDS, ship, standoff, warpFx } from '../state/flight'

const SHIP_SCALE = 0.3
const THRUST = 10
const MAX_SPEED = 8
const AUTO_SPEED = 12
const MOUSE_SENSITIVITY = 0.0022
const ROLL_SPEED = 1.4
const OVERVIEW = new THREE.Vector3(0, 120, 220)

const keys = new Set<string>()
const mouse = { dx: 0, dy: 0 }

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

// 毎フレームの計算用
const tp = new THREE.Vector3()
const targetVel = new THREE.Vector3()
const hp = new THREE.Vector3()
const v = new THREE.Vector3()
const fwd = new THREE.Vector3()
const up = new THREE.Vector3()
const look = new THREE.Matrix4()
const qLook = new THREE.Quaternion()
const qDelta = new THREE.Quaternion()
const euler = new THREE.Euler()
const camOffset = new THREE.Vector3(0, 0.22, 1.05)

/** 目標の方向を向く姿勢（前方は -Z） */
function facing(from: THREE.Vector3, to: THREE.Vector3, upRef: THREE.Vector3) {
  look.lookAt(from, to, upRef)
  return qLook.setFromRotationMatrix(look)
}

export function Ship() {
  const group = useRef<THREE.Group>(null!)
  const { gl, camera } = useThree()
  const mode = useStore((s) => s.mode)

  // 周回待機：天体と一緒に動く（ワープ到着や自動航行の後）
  const hold = useRef<{ id: string; offset: THREE.Vector3 } | null>(null)
  const warp = useRef({ t: 0, start: new THREE.Vector3(), offset: new THREE.Vector3() })
  const telemetryClock = useRef(0)
  const prevTarget = useRef<{ id: string; pos: THREE.Vector3 } | null>(null)

  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => e.target instanceof HTMLInputElement
    const down = (e: KeyboardEvent) => {
      if (!isTyping(e)) keys.add(e.code)
    }
    const upKey = (e: KeyboardEvent) => keys.delete(e.code)
    const move = (e: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return
      mouse.dx += e.movementX
      mouse.dy += e.movementY
    }
    const blur = () => keys.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', upKey)
    window.addEventListener('mousemove', move)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', upKey)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('blur', blur)
    }
  }, [gl])

  // 操縦中はキャンバスのクリックでマウスを固定する
  useEffect(() => {
    if (mode !== 'flight') {
      if (document.pointerLockElement) document.exitPointerLock()
      camera.position.copy(OVERVIEW)
      camera.up.set(0, 1, 0)
      return
    }
    const lock = () => void gl.domElement.requestPointerLock()
    gl.domElement.addEventListener('click', lock)
    return () => gl.domElement.removeEventListener('click', lock)
  }, [mode, gl, camera])

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05)
    const st = useStore.getState()
    const target = st.targetId ? bodies.get(st.targetId) : undefined
    if (target) target.object.getWorldPosition(tp)

    // 目標の移動速度（公転している天体に追いつくため）
    const prev = prevTarget.current
    if (target && prev && prev.id === target.id && dt > 0) targetVel.copy(tp).sub(prev.pos).divideScalar(dt)
    else targetVel.set(0, 0, 0)
    prevTarget.current = target ? { id: target.id, pos: tp.clone() } : null

    up.set(0, 1, 0).applyQuaternion(ship.quaternion)

    // 待機中の天体に合わせて移動する
    const held = hold.current ? bodies.get(hold.current.id) : undefined
    if (hold.current && held) {
      held.object.getWorldPosition(hp)
      ship.position.copy(hp).add(hold.current.offset)
    }

    if (st.warpPhase !== 'idle' && target) {
      const w = warp.current
      // 音声と合わせるため、ワープの進行は実時間で数える
      w.t += Math.min(rawDelta, 0.25)
      if (st.warpPhase === 'charge') {
        ship.velocity.multiplyScalar(Math.exp(-3 * dt))
        ship.position.addScaledVector(ship.velocity, dt)
        ship.quaternion.slerp(facing(ship.position, tp, up), 1 - Math.exp(-3 * dt))
        warpFx.glow = Math.min(1, w.t / CHARGE_SECONDS)
        if (w.t >= CHARGE_SECONDS) {
          hold.current = null
          w.t = 0
          w.start.copy(ship.position)
          w.offset.copy(ship.position).sub(tp)
          if (w.offset.lengthSq() < 1e-6) w.offset.set(0, 0.2, 1)
          w.offset.setLength(standoff(target.radius))
          ship.velocity.set(0, 0, 0)
          st.setWarpPhase('warp')
        }
      } else if (st.warpPhase === 'warp') {
        const p = Math.min(1, w.t / warpFx.seconds)
        v.copy(tp).add(w.offset)
        ship.position.lerpVectors(w.start, v, ease(p))
        ship.quaternion.slerp(facing(ship.position, tp, up), 1 - Math.exp(-4 * dt))
        warpFx.intensity = Math.min(1, Math.sin(Math.PI * p) * 1.6)
        if (p >= 1) {
          w.t = 0
          hold.current = { id: target.id, offset: w.offset.clone() }
          st.setWarpPhase('exit')
        }
      } else {
        warpFx.intensity = Math.max(0, warpFx.intensity - dt * 2)
        warpFx.glow = Math.max(0, 1 - w.t / EXIT_SECONDS)
        ship.quaternion.slerp(facing(ship.position, tp, up), 1 - Math.exp(-3 * dt))
        if (w.t >= EXIT_SECONDS) {
          w.t = 0
          warpFx.intensity = 0
          warpFx.glow = 0
          st.setWarpPhase('idle')
        }
      }
    } else {
      if (st.warpPhase !== 'idle') st.setWarpPhase('idle')
      const manual = steer(dt, st.mode === 'flight')
      if (manual && st.autopilot) st.setAutopilot(false)

      if (st.autopilot && target && !manual) {
        if (!hold.current || hold.current.id !== target.id) hold.current = null
        v.copy(ship.position).sub(tp)
        if (v.lengthSq() < 1e-6) v.set(0, 0.2, 1)
        v.setLength(standoff(target.radius)).add(tp).sub(ship.position)
        const d = v.length()
        ship.velocity.copy(v).setLength(Math.min(AUTO_SPEED, d * 1.5 + 0.2)).add(targetVel)
        ship.quaternion.slerp(facing(ship.position, tp, up), 1 - Math.exp(-2.5 * dt))
        if (d < 0.05) {
          ship.velocity.set(0, 0, 0)
          hold.current = { id: target.id, offset: ship.position.clone().sub(tp) }
          st.setAutopilot(false)
        }
      }
      ship.position.addScaledVector(ship.velocity, dt)
      avoidBodies()

      // 待機中に操縦したら相対位置を更新、離れたら待機を解除
      if (hold.current && held) {
        hold.current.offset.copy(ship.position).sub(hp)
        if (hold.current.offset.length() > held.radius * 12 + 6) hold.current = null
      }
    }

    group.current.position.copy(ship.position)
    group.current.quaternion.copy(ship.quaternion)

    if (st.mode === 'flight') followCamera(camera as THREE.PerspectiveCamera, dt, st.warpPhase)

    telemetryClock.current += dt
    if (telemetryClock.current > 0.1) {
      telemetryClock.current = 0
      const distance = target ? Math.max(0, tp.distanceTo(ship.position) - target.radius) : null
      const speed = ship.velocity.length()
      st.setTelemetry({ distance, speed, eta: distance !== null && speed > 0.1 ? distance / speed : null })
    }
  })

  return (
    <group ref={group} scale={SHIP_SCALE}>
      <ShipModel />
    </group>
  )
}

/** WASD＋マウスの操縦。入力があれば true */
function steer(dt: number, enabled: boolean) {
  if (!enabled) {
    mouse.dx = mouse.dy = 0
    ship.velocity.multiplyScalar(Math.exp(-0.8 * dt))
    return false
  }
  const roll = (keys.has('KeyQ') ? 1 : 0) - (keys.has('KeyE') ? 1 : 0)
  euler.set(-mouse.dy * MOUSE_SENSITIVITY, -mouse.dx * MOUSE_SENSITIVITY, roll * ROLL_SPEED * dt)
  ship.quaternion.multiply(qDelta.setFromEuler(euler)).normalize()
  const turned = mouse.dx !== 0 || mouse.dy !== 0 || roll !== 0
  mouse.dx = mouse.dy = 0

  v.set(
    (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
    (keys.has('Space') ? 1 : 0) - (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0),
    (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0),
  )
  const thrusting = v.lengthSq() > 0
  if (thrusting) {
    v.normalize().applyQuaternion(ship.quaternion)
    ship.velocity.addScaledVector(v, THRUST * dt)
    if (ship.velocity.length() > MAX_SPEED) ship.velocity.setLength(MAX_SPEED)
  } else {
    ship.velocity.multiplyScalar(Math.exp(-0.8 * dt))
  }
  return thrusting || turned
}

/** 天体にめり込まないよう押し出す */
function avoidBodies() {
  for (const body of bodies.values()) {
    body.object.getWorldPosition(v)
    const min = body.radius * 1.05 + 0.15
    const d = ship.position.distanceTo(v)
    if (d < min) {
      ship.position.sub(v).setLength(min).add(v)
      ship.velocity.multiplyScalar(0.5)
    }
  }
}

/** 自機の後ろ上から追いかけるカメラ。ワープ中は視野角を広げる */
function followCamera(camera: THREE.PerspectiveCamera, dt: number, phase: string) {
  // 自機からの相対位置で追従させる（天体と一緒に動いても遅れない）
  v.set(0, 0.22, 1.05).applyQuaternion(ship.quaternion)
  camOffset.lerp(v, 1 - Math.exp(-8 * dt))
  camera.position.copy(ship.position).add(camOffset)
  fwd.set(0, 0, -1).applyQuaternion(ship.quaternion)
  up.set(0, 1, 0).applyQuaternion(ship.quaternion)
  camera.up.lerp(up, 1 - Math.exp(-6 * dt))
  camera.lookAt(v.copy(ship.position).addScaledVector(fwd, 2))
  const fov = phase === 'warp' ? 60 + 35 * warpFx.intensity : phase === 'charge' ? 55 : 60
  camera.fov += (fov - camera.fov) * (1 - Math.exp(-5 * dt))
  camera.updateProjectionMatrix()
}
