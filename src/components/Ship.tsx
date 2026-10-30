import { Suspense, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { BRIDGE_BASE, METERS_PER_UNIT } from './ship/ShipModel'
import { GalleryScene } from './ship/GalleryScene'
import { OwnShipModel } from './ship/VariantModel'
import { currentShip, useShip } from '../data/ships'
import { bodies, colliders, passThrough, type BodyEntry } from '../state/registry'
import { useStore } from '../state/store'
import { CHARGE_SECONDS, EXIT_SECONDS, SHIP_SCALE, flightControl, ship, standoff, warpFx } from '../state/flight'
import { APPROACH_TEXT, approachKind, limitDistance } from '../data/approach'
import { approachSpeedFactor, nearInfo, proximity, updateProximity } from '../state/proximity'
import { useLayout } from '../state/useLayout'
import { isTouchDevice, touchInput } from '../state/input'
import { bridgeEye, useBridge } from '../state/bridge'
import { FLOOR_ABOVE_BASE, lookAngles, viewpoint } from '../data/bridge'
import { shipScale, shipZoom, updateZoom } from '../state/zoom'
import { beamFx, hitStopped, shakeCamera } from '../state/beam'
import { QUALITY, useLevel } from '../state/quality'
import { MAX_SPEED, THROTTLE_STEPS } from '../state/throttle'
import { raceActive } from '../state/race'

const THRUST = 10
const AUTO_SPEED = 12
const MOUSE_SENSITIVITY = 0.0016
// 巨大な船なので、旋回はマウスに少し遅れてゆっくり追いつく
const TURN_MAX = 0.55 // rad/s
const TURN_EASE = 2.2
const TURN_BACKLOG = 0.5 // rad。溜められる旋回量の上限（手を止めたらすぐ落ち着く）
const ROLL_SPEED = 0.6
const ROLL_EASE = 2
// 旋回するとき、曲がる側へ少し傾ける（見た目だけ。宇宙には空気がないので本当は傾けなくても曲がれる）
const BANK_MAX = 0.2 // rad（約11度）
const BANK_EASE = 1.6
// ブリッジ視点：首を振る速さと、振れる範囲
const HEAD_SENSITIVITY = 0.0024
const HEAD_YAW_MAX = 2.7
const HEAD_PITCH_MIN = -1.2
const HEAD_PITCH_MAX = 1.45
/** ふだんのカメラの手前の限界。ブリッジでは窓のすぐ外の円盤まで見えるよう、ぐっと近くまで描く */
const NEAR = 0.01
const BRIDGE_NEAR = 0.0004
const OVERVIEW = new THREE.Vector3(0, 120, 220)
/** OVERVIEW から全体が見える、いちばん外の軌道の半径 */
const OVERVIEW_FITS = 200

/** 出発点：地球から見て太陽の方向から、どれだけ横へずらすか（rad）。太陽は船の斜め後ろになる */
const START_ANGLE = 1.0
/** 逆光の強さ（太陽の光の約 1/4） */
const RIM_INTENSITY = 0.7
// 全体マップから操縦席へ切り替えるとき、カメラが船まで飛んでくる時間（ワープのチャージ 1.8 秒の内に終わる）
const FLY_IN_SECONDS = 1.4

const keys = new Set<string>()
const mouse = { dx: 0, dy: 0 }
// まだ回り切っていない量（ピッチ・ヨー）と、今のロールの速さ
const turn = { pitch: 0, yaw: 0, roll: 0 }

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
const camOffset = new THREE.Vector3(0, 0.095, 0.6)
/** マップから操縦席へ寄っていく途中（t が 1 で終わり）。from はマップのカメラの、自機からの位置 */
const flyIn = { t: 1, from: new THREE.Vector3(), quat: new THREE.Quaternion() }
const flyDir = new THREE.Vector3()
const prevQuat = new THREE.Quaternion()
const qTurn = new THREE.Quaternion()
const eTurn = new THREE.Euler(0, 0, 0, 'YXZ')

/** 目標の方向を向く姿勢（前方は -Z） */
function facing(from: THREE.Vector3, to: THREE.Vector3, upRef: THREE.Vector3) {
  look.lookAt(from, to, upRef)
  return qLook.setFromRotationMatrix(look)
}

export function Ship() {
  const group = useRef<THREE.Group>(null!)
  const bank = useRef<THREE.Group>(null!)
  const { gl, camera } = useThree()
  const mode = useStore((s) => s.mode)
  const spec = useShip()
  const shadowSize = QUALITY[useLevel()].shadow

  // 周回待機：天体と一緒に動く（ワープ到着や自動航行の後）
  const hold = useRef<{ id: string; offset: THREE.Vector3 } | null>(null)
  const warp = useRef({ t: 0, start: new THREE.Vector3(), offset: new THREE.Vector3() })
  const telemetryClock = useRef(0)
  // 太陽の方向から自機だけを照らして影を落とす光（惑星には届かない狭い円錐）
  const sunSpot = useRef<THREE.SpotLight>(null!)
  // 輪郭を立たせる弱い逆光（カメラから見て船の向こう側から、青白く）
  const rimSpot = useRef<THREE.SpotLight>(null!)
  const prevTarget = useRef<{ id: string; pos: THREE.Vector3 } | null>(null)
  const prevMode = useRef(mode)
  const placed = useRef(false)
  // 距離や大きさを切りかえたとき、いちばん近い天体のそばに、同じ高さの割合のままついていく。
  // 天体が新しい位置と大きさになるのを待つため、切りかえてから数フレーム後に移す
  const anchor = useRef<{ id: string; offset: THREE.Vector3; radius: number } | null>(null)
  const shownLayout = useRef<unknown>(null)
  const rescaleIn = useRef(0)

  useEffect(() => {
    sunSpot.current.target = group.current
    rimSpot.current.target = group.current
  }, [])

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
    // ブリッジの艦長席では、右ボタンを押しているあいだ首を振る（船の向きは変えない）
    const bridgeLook = (on: boolean) => (e: MouseEvent) => {
      if (e.button !== 2) return
      const st = useStore.getState()
      if (st.mode === 'flight' && st.cameraMode === 'bridge') useBridge.getState().setLooking(on)
    }
    const press = bridgeLook(true)
    const release = bridgeLook(false)
    const noMenu = (e: MouseEvent) => {
      if (useStore.getState().cameraMode === 'bridge') e.preventDefault()
    }
    window.addEventListener('mousedown', press)
    window.addEventListener('mouseup', release)
    gl.domElement.addEventListener('contextmenu', noMenu)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', upKey)
    window.addEventListener('mousemove', move)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', upKey)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('blur', blur)
      window.removeEventListener('mousedown', press)
      window.removeEventListener('mouseup', release)
      gl.domElement.removeEventListener('contextmenu', noMenu)
    }
  }, [gl])

  // 全体マップのカメラを、いちばん外の軌道に合わせてどれだけ引くか
  const layout = useLayout()
  const fit = Math.max(1, Math.max(...layout.orbit.values()) / OVERVIEW_FITS)
  const overviewFit = useRef(fit)
  // 全体マップを見ながらスライダーを動かしたら、見ている向きのまま同じ割合で引く・寄る
  useEffect(() => {
    if (useStore.getState().mode === 'map') camera.position.multiplyScalar(fit / overviewFit.current)
    overviewFit.current = fit
  }, [fit, camera])

  // 操縦中はキャンバスのクリックでマウスを固定する
  useEffect(() => {
    if (mode !== 'flight') {
      if (document.pointerLockElement) document.exitPointerLock()
      // 鑑賞モードのカメラは GalleryCamera が動かす
      if (mode === 'gallery') return
      // 距離や大きさのスライダーで太陽系を広げていたら、全体が入るところまで引く
      camera.position.copy(OVERVIEW).multiplyScalar(overviewFit.current)
      camera.up.set(0, 1, 0)
      return
    }
    // 指で操作する端末ではマウスを固定しない（画面をなぞって向きを変える）
    if (isTouchDevice()) return
    const lock = () => void gl.domElement.requestPointerLock()
    gl.domElement.addEventListener('click', lock)
    return () => gl.domElement.removeEventListener('click', lock)
  }, [mode, gl, camera])

  const followRescale = () => {
    const a = anchor.current
    const body = a ? bodies.get(a.id) : undefined
    // ワープ中は、着いたところで目標のそばに出るので、そのままにする
    if (!a || !body || useStore.getState().warpPhase !== 'idle') return
    body.object.getWorldPosition(hp)
    const offset = a.offset.clone().multiplyScalar(body.radius / a.radius)
    ship.position.copy(hp).add(offset)
    ship.velocity.set(0, 0, 0)
    hold.current = offset.length() <= body.radius * 12 + 6 ? { id: body.id, offset } : null
  }

  useFrame((_, rawDelta) => {
    // チャージビームを撃った瞬間は、ほんの少し時間を止める（ヒットストップ）
    const dt = hitStopped() ? 0 : Math.min(rawDelta, 0.05)
    const st = useStore.getState()
    const target = st.targetId ? bodies.get(st.targetId) : undefined
    if (target) target.object.getWorldPosition(tp)
    // マップを閉じた瞬間のカメラを覚えておき、そこから船の後ろまで飛んでくる
    if (prevMode.current === 'map' && st.mode === 'flight') {
      flyIn.t = 0
      flyIn.from.copy(camera.position).sub(ship.position)
      flyIn.quat.copy(camera.quaternion)
    }
    prevMode.current = st.mode

    // 目標の移動速度（公転している天体に追いつくため）
    const prev = prevTarget.current
    if (target && prev && prev.id === target.id && dt > 0) targetVel.copy(tp).sub(prev.pos).divideScalar(dt)
    else targetVel.set(0, 0, 0)
    prevTarget.current = target ? { id: target.id, pos: tp.clone() } : null

    up.set(0, 1, 0).applyQuaternion(ship.quaternion)

    // 出発点：地球のそば。太陽は斜め後ろにして、昼の側の地球を見る（太陽の真ん前だと、何が何だかわからないので）
    if (!placed.current) {
      const earth = bodies.get('earth')
      if (earth) {
        placed.current = true
        earth.object.getWorldPosition(hp)
        v.copy(hp).negate().setY(0).normalize().applyAxisAngle(up.set(0, 1, 0), START_ANGLE)
        ship.position.copy(hp).addScaledVector(v, earth.radius * 4 + 1.2)
        ship.position.y += earth.radius * 0.8
        ship.quaternion.copy(facing(ship.position, hp, up))
        ship.velocity.set(0, 0, 0)
        hold.current = { id: 'earth', offset: ship.position.clone().sub(hp) }
      }
    }

    if (shownLayout.current !== layout) {
      if (shownLayout.current) rescaleIn.current = 3
      shownLayout.current = layout
    }
    if (rescaleIn.current > 0 && --rescaleIn.current === 0) followRescale()

    if (flightControl.releaseHold) {
      flightControl.releaseHold = false
      hold.current = null
    }

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
      // ブリッジの艦長席以外（窓のそばや天井から）では、マウスや指は首を振るだけで、船は操縦しない
      const inBridge = st.mode === 'flight' && st.cameraMode === 'bridge'
      const atSeat = useBridge.getState().viewpoint === 'captain'
      if (inBridge && (!atSeat || useBridge.getState().looking)) lookAround()
      const manual = steer(dt, st.mode === 'flight' && !flightControl.locked && !st.scope && !(inBridge && !atSeat))
      if (manual && st.autopilot) st.setAutopilot(false)

      if (st.autopilot && target && !manual) {
        if (!hold.current || hold.current.id !== target.id) hold.current = null
        v.copy(ship.position).sub(tp)
        if (v.lengthSq() < 1e-6) v.set(0, 0.2, 1)
        v.setLength(standoff(target.radius)).add(tp).sub(ship.position)
        const d = v.length()
        // 遠い目標ほど速く進む（距離のスライダーで太陽系を広げても、40秒ほどで着く）
        ship.velocity.copy(v).setLength(Math.min(Math.max(AUTO_SPEED, d / 40), d * 1.5 + 0.2)).add(targetVel)
        ship.quaternion.slerp(facing(ship.position, tp, up), 1 - Math.exp(-2.5 * dt))
        if (d < 0.05) {
          ship.velocity.set(0, 0, 0)
          hold.current = { id: target.id, offset: ship.position.clone().sub(tp) }
          st.setAutopilot(false)
        }
      }
      ship.position.addScaledVector(ship.velocity, dt)
      avoidBodies()
      colliders.forEach((collide) => collide())
      updateProximity(ship.position)

      // 待機中に操縦したら相対位置を更新、離れたら待機を解除
      if (hold.current && held) {
        hold.current.offset.copy(ship.position).sub(hp)
        if (hold.current.offset.length() > held.radius * 12 + 6) hold.current = null
      }
    }

    if (rescaleIn.current === 0) anchor.current = nearestBody(layout.radius, anchor.current)

    // 天体に近づくほど船とカメラを縮める（鑑賞モードでは今の大きさのまま）
    updateZoom(ship.position, dt, st.mode === 'gallery')
    // 周回待機中は、構造物の側で自機を一緒に動かさない（二重に動くので）
    flightControl.holding = hold.current !== null
    const zoomIn = st.mode === 'map' ? 1 : 1 / shipZoom.factor
    group.current.position.copy(ship.position)
    // チャージビームを溜めているあいだ、船体を小刻みに震わせる
    if (beamFx.tremble > 0) group.current.position.add(v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(beamFx.tremble * shipScale() * 0.025))
    group.current.quaternion.copy(ship.quaternion)
    group.current.scale.setScalar(shipScale())
    // 船体の傾き：機首の左右の回りの速さ（ヨー）に合わせて、ゆっくり傾けて戻す
    qTurn.copy(prevQuat).invert().multiply(ship.quaternion)
    eTurn.setFromQuaternion(qTurn, 'YXZ')
    prevQuat.copy(ship.quaternion)
    const yawRate = dt > 0 && st.warpPhase === 'idle' ? eTurn.y / dt : 0
    const bankTo = st.settings.banking ? THREE.MathUtils.clamp(yawRate / TURN_MAX, -1, 1) * BANK_MAX : 0
    bank.current.rotation.z += (bankTo - bank.current.rotation.z) * (1 - Math.exp(-BANK_EASE * dt))
    v.copy(ship.position).negate()
    if (v.lengthSq() < 1e-6) v.set(0, 1, 0)
    sunSpot.current.position.copy(ship.position).addScaledVector(v.normalize(), 2 * zoomIn)
    // 影を落とす光も、船と一緒に縮める
    const spot = sunSpot.current
    if (spot.distance !== 4 * zoomIn) {
      spot.distance = 4 * zoomIn
      spot.shadow.camera.near = zoomIn
      spot.shadow.camera.far = 3 * zoomIn
      spot.shadow.normalBias = 0.002 * zoomIn
      spot.shadow.camera.updateProjectionMatrix()
    }

    const cam = camera as THREE.PerspectiveCamera
    const bridgeView = st.mode === 'flight' && st.cameraMode === 'bridge'
    // ブリッジを出たら、次に入ったときは見どころにそのまま立つ
    if (!bridgeView) bridgeMove.id = ''
    if (!bridgeView && cam.near !== NEAR * zoomIn) {
      cam.near = NEAR * zoomIn
      cam.updateProjectionMatrix()
    }
    if (st.mode === 'flight') {
      if (bridgeView) {
        hero.active = false
        bridgeCamera(cam, dt, bank.current.quaternion, zoomIn)
      } else if (st.cameraMode === 'hero' && st.warpPhase === 'idle') heroCamera(camera as THREE.PerspectiveCamera, dt)
      else {
        hero.active = false
        followCamera(camera as THREE.PerspectiveCamera, dt, st.warpPhase, zoomIn)
      }
      if (flyIn.t < 1) flyInCamera(cam, rawDelta)
      if (st.settings.beamFx.shake) shakeCamera(cam, rawDelta, shipScale())
      else beamFx.shake = 0
    }

    // 逆光はカメラの反対側の少し上から。ブリッジの中からは船体の前が不自然に光るので消す
    const rim = rimSpot.current
    rim.intensity = bridgeView ? 0 : RIM_INTENSITY
    v.copy(ship.position).sub(cam.position)
    if (v.lengthSq() < 1e-12) v.set(0, 0, -1)
    v.normalize().addScaledVector(up.set(0, 1, 0).applyQuaternion(cam.quaternion), 0.15).normalize()
    rim.position.copy(ship.position).addScaledVector(v, 2 * zoomIn)
    if (rim.distance !== 4 * zoomIn) rim.distance = 4 * zoomIn

    telemetryClock.current += dt
    if (telemetryClock.current > 0.1) {
      telemetryClock.current = 0
      const distance = target ? Math.max(0, tp.distanceTo(ship.position) - target.radius) : null
      const speed = ship.velocity.length()
      st.setTelemetry({ distance, speed, eta: distance !== null && speed > 0.1 ? distance / speed : null, near: nearInfo(proximity) })
    }
  })

  return (
    <>
      <group ref={group} name="ownship" scale={SHIP_SCALE}>
        <group ref={bank}>
          <Suspense fallback={null}>
            <OwnShipModel spec={spec} unitScale={shipScale} />
          </Suspense>
        </group>
        {mode === 'gallery' && <GalleryScene />}
      </group>
      {/* 影の細かさが変わったら作り直す（影の地図は最初の大きさのまま使い回されるので） */}
      <spotLight
        key={shadowSize}
        ref={sunSpot}
        angle={0.12}
        penumbra={0.3}
        distance={4}
        decay={0}
        intensity={3}
        color="#fff4e6"
        castShadow={shadowSize > 0}
        shadow-mapSize={[shadowSize || 512, shadowSize || 512]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.002}
        shadow-camera-near={1}
        shadow-camera-far={3}
      />
      <spotLight ref={rimSpot} angle={0.25} penumbra={0.5} distance={4} decay={0} intensity={RIM_INTENSITY} color="#bccbff" />
    </>
  )
}

/** WASD＋マウスの操縦。入力があれば true */
function steer(dt: number, enabled: boolean) {
  if (!enabled) {
    mouse.dx = mouse.dy = 0
    touchInput.lookX = touchInput.lookY = 0
    turn.pitch = turn.yaw = turn.roll = 0
    ship.velocity.multiplyScalar(Math.exp(-0.8 * dt))
    return false
  }
  const clampTurn = (a: number) => THREE.MathUtils.clamp(a, -TURN_BACKLOG, TURN_BACKLOG)
  turn.pitch = clampTurn(turn.pitch - (mouse.dy + touchInput.lookY) * MOUSE_SENSITIVITY)
  turn.yaw = clampTurn(turn.yaw - (mouse.dx + touchInput.lookX) * MOUSE_SENSITIVITY)
  mouse.dx = mouse.dy = 0
  touchInput.lookX = touchInput.lookY = 0
  const k = 1 - Math.exp(-TURN_EASE * dt)
  // 船ごとの曲がりやすさ（小さな船は速く、大きな船はゆっくり）
  const turnMax = TURN_MAX * currentShip().turn
  const step = (a: number) => THREE.MathUtils.clamp(a * k, -turnMax * dt, turnMax * dt)
  const pitch = step(turn.pitch)
  const yaw = step(turn.yaw)
  turn.pitch -= pitch
  turn.yaw -= yaw
  const roll = THREE.MathUtils.clamp((keys.has('KeyQ') ? 1 : 0) - (keys.has('KeyE') ? 1 : 0) + touchInput.roll, -1, 1)
  turn.roll += (roll * ROLL_SPEED - turn.roll) * (1 - Math.exp(-ROLL_EASE * dt))
  euler.set(pitch, yaw, turn.roll * dt)
  ship.quaternion.multiply(qDelta.setFromEuler(euler)).normalize()
  const turned = Math.abs(pitch) + Math.abs(yaw) > 1e-5 || roll !== 0

  // キーボードとタッチのスティック（スティックは倒した分だけ、キーは全開）
  v.set(
    (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + touchInput.x,
    (keys.has('Space') ? 1 : 0) - (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0) + touchInput.lift,
    (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0) + touchInput.y,
  )
  const thrusting = v.lengthSq() > 0.01
  const before = ship.velocity.length()
  // 推進の段階（ホイールで切り替え）。レースではみな同じ条件で走る
  const throttle = raceActive() ? 1 : THROTTLE_STEPS[useStore.getState().throttle] ?? 1
  if (thrusting) {
    if (v.lengthSq() > 1) v.normalize()
    v.applyQuaternion(ship.quaternion)
    // 速い段階では、そのぶん早く加速する（最高速まで数秒で届くように）
    ship.velocity.addScaledVector(v, THRUST * Math.max(1, throttle) * dt)
  } else {
    ship.velocity.multiplyScalar(Math.exp(-0.8 * dt))
  }
  // 天体のそばでは上限が下がる。急ブレーキにならないよう、なめらかに落とす
  const cap = MAX_SPEED * throttle * flightControl.speedScale * approachSpeedFactor()
  const speed = ship.velocity.length()
  if (speed > cap) ship.velocity.setLength(Math.max(cap, Math.min(speed, before * Math.exp(-2.5 * dt))))
  return thrusting || turned
}

/** 天体ごとの接近限界で止める。止まったときと雲に入ったときに説明を出す */
const lastNotice = new Map<string, number>()
function notice(key: string, text: string) {
  const now = performance.now()
  if (now - (lastNotice.get(key) ?? -Infinity) < 15000) return
  lastNotice.set(key, now)
  useStore.getState().showToast(text)
}
let insideGas: string | null = null

/** 自機にいちばん近い太陽・惑星・衛星（表面からの高さで比べる）と、そこからの位置 */
function nearestBody(natural: Map<string, number>, reuse: { id: string; offset: THREE.Vector3; radius: number } | null) {
  let best: BodyEntry | null = null
  let bestScore = Infinity
  for (const body of bodies.values()) {
    if (body.id !== 'sun' && !natural.has(body.id)) continue
    body.object.getWorldPosition(v)
    const score = ship.position.distanceTo(v) - body.radius
    if (score < bestScore) {
      bestScore = score
      best = body
    }
  }
  if (!best) return null
  best.object.getWorldPosition(v)
  const out = reuse ?? { id: '', offset: new THREE.Vector3(), radius: 1 }
  out.id = best.id
  out.radius = best.radius
  out.offset.copy(ship.position).sub(v)
  return out
}

function avoidBodies() {
  for (const body of bodies.values()) {
    if (passThrough.has(body.id)) continue
    body.object.getWorldPosition(v)
    const min = limitDistance(body.id, body.radius)
    const d = ship.position.distanceTo(v)
    const kind = approachKind(body.id)
    if (kind === 'gas') {
      if (d < body.radius && insideGas !== body.id) {
        insideGas = body.id
        notice(`${body.id}:dive`, APPROACH_TEXT.diveStart(body.name))
      } else if (d > body.radius * 1.02 && insideGas === body.id) insideGas = null
    }
    if (d < min) {
      // 自分から突っ込んだときだけ説明する（衛星のほうが近づいてきたときは黙って避ける）
      const pushing = ship.velocity.dot(fwd.copy(v).sub(ship.position).normalize()) > 0.2
      ship.position.sub(v).setLength(min).add(v)
      ship.velocity.multiplyScalar(0.5)
      if (!pushing) continue
      if (kind === 'star') notice('sun', APPROACH_TEXT.star())
      else if (kind === 'rock') notice(body.id, APPROACH_TEXT.rock(body.name))
      else if (kind === 'gas') notice(body.id, APPROACH_TEXT.gasLimit(body.name))
    }
  }
}

/**
 * ヒーローショット：望遠で、船の斜め前の低い位置からゆっくり回り込みながら見上げる。
 * 画角を狭くして距離をとると、遠近感が圧縮されて巨大な船に見える。
 */
const hero = { active: false, angle: 0, radius: 0, height: 0, base: 0 }
const qInv = new THREE.Quaternion()
function heroCamera(camera: THREE.PerspectiveCamera, dt: number) {
  // 切り替えた瞬間のカメラ位置から弧を描いて回り込む（船体を突き抜けないように）
  if (!hero.active) {
    hero.active = true
    v.copy(camOffset).applyQuaternion(qInv.copy(ship.quaternion).invert())
    hero.angle = Math.atan2(v.x, -v.z)
    // 半径と高さは船の大きさを1とした値で持つ（接近ズームで船が縮んでも、同じ構図のまま）
    hero.radius = Math.hypot(v.x, v.z) / shipScale()
    hero.height = v.y / shipScale()
    // 斜め前（左右は今いる側）から見上げる位置へ回り込み、その後はゆっくり周回する
    hero.base = Math.sign(v.x || 1) * 0.55
  }
  const k = 1 - Math.exp(-1.2 * dt)
  hero.base += dt * 0.05 * Math.sign(hero.base)
  let diff = (hero.base - hero.angle) % (Math.PI * 2)
  if (diff > Math.PI) diff -= Math.PI * 2
  if (diff < -Math.PI) diff += Math.PI * 2
  hero.angle += diff * k
  const scale = shipScale()
  hero.radius += (1.9 - hero.radius) * k
  hero.height += (-0.32 - hero.height) * k
  v.set(Math.sin(hero.angle) * hero.radius, hero.height, -Math.cos(hero.angle) * hero.radius).multiplyScalar(scale).applyQuaternion(ship.quaternion)
  camOffset.copy(v)
  camera.position.copy(ship.position).add(camOffset)
  up.set(0, 1, 0).applyQuaternion(ship.quaternion)
  camera.up.lerp(up, 1 - Math.exp(-4 * dt))
  camera.lookAt(v.copy(ship.position).addScaledVector(up, 0.03 * scale))
  camera.fov += (22 - camera.fov) * (1 - Math.exp(-2 * dt))
  camera.updateProjectionMatrix()
}

/** 首を振る（マウスの動きや指でなぞった量を、船ではなく目の向きに使う） */
function lookAround() {
  bridgeEye.yaw = THREE.MathUtils.clamp(bridgeEye.yaw - (mouse.dx + touchInput.lookX) * HEAD_SENSITIVITY, -HEAD_YAW_MAX, HEAD_YAW_MAX)
  bridgeEye.pitch = THREE.MathUtils.clamp(bridgeEye.pitch - (mouse.dy + touchInput.lookY) * HEAD_SENSITIVITY, HEAD_PITCH_MIN, HEAD_PITCH_MAX)
  mouse.dx = mouse.dy = 0
  touchInput.lookX = touchInput.lookY = 0
  bridgeMove.settling = false
}

/** 見どころを移るときは、目の位置と向きをなめらかに動かす */
const bridgeMove = { id: '', settling: false }
const eyeTarget = new THREE.Vector3()
const eyeModel = new THREE.Vector3()
const qHead = new THREE.Quaternion()
const eHead = new THREE.Euler(0, 0, 0, 'YXZ')

/**
 * ブリッジ視点：艦橋の部屋の中の目の位置から、窓ごしに宇宙を見る。
 * 宇宙用のカメラは船と一緒に動かし、部屋は BridgeInterior が同じ目の位置・向きで重ねて描く
 */
function bridgeCamera(camera: THREE.PerspectiveCamera, dt: number, bankQuat: THREE.Quaternion, zoomIn: number) {
  const { viewpoint: id, looking } = useBridge.getState()
  const vp = viewpoint(id)
  const aim = lookAngles(vp)
  if (bridgeMove.id !== id) {
    // 入った直後はその場に、移ったときはなめらかに
    if (!bridgeMove.id) {
      bridgeEye.pos.set(...vp.eye)
      bridgeEye.yaw = aim.yaw
      bridgeEye.pitch = aim.pitch
    }
    bridgeMove.id = id
    bridgeMove.settling = true
  }
  const k = 1 - Math.exp(-3 * dt)
  bridgeEye.pos.lerp(eyeTarget.set(...vp.eye), k)
  // 艦長席で手を離したら、前を向き直す
  if (bridgeMove.settling || (id === 'captain' && !looking)) {
    bridgeEye.yaw += (aim.yaw - bridgeEye.yaw) * k
    bridgeEye.pitch += (aim.pitch - bridgeEye.pitch) * k
  }
  qHead.setFromEuler(eHead.set(bridgeEye.pitch, bridgeEye.yaw, 0))
  bridgeEye.quaternion.copy(qHead)

  // 部屋の目の位置（m）→ 模型の座標 → 宇宙の座標（傾きも含めて船と一緒に）
  // SV-01 は船の模型の寸法から、ほかの船は data/ships.ts の値で
  const spec = currentShip()
  const base = spec.model ? spec.bridgeBase : BRIDGE_BASE
  eyeModel.copy(bridgeEye.pos).setY(bridgeEye.pos.y + FLOOR_ABOVE_BASE).divideScalar(spec.model ? spec.metersPerUnit : METERS_PER_UNIT)
  eyeModel.x += base[0]
  eyeModel.y += base[1]
  eyeModel.z += base[2]
  eyeModel.applyQuaternion(bankQuat).multiplyScalar(shipScale()).applyQuaternion(ship.quaternion)
  camera.position.copy(ship.position).add(eyeModel)
  camera.quaternion.copy(ship.quaternion).multiply(bankQuat).multiply(qHead)
  up.set(0, 1, 0).applyQuaternion(camera.quaternion)
  camera.up.copy(up)
  // 追いかけカメラへもどったとき、いきなり跳ばないように
  camOffset.copy(camera.position).sub(ship.position)
  const fov = 62 + 18 * warpFx.intensity
  camera.fov += (fov - camera.fov) * (1 - Math.exp(-5 * dt))
  camera.near = BRIDGE_NEAR * zoomIn
  camera.updateProjectionMatrix()
}

/** 自機の後ろ上から追いかけるカメラ。ワープ中は視野角を広げる */
/** 追いかけカメラが見る点を、船の前方からどれだけ上げるか */
const CHASE_AIM_LIFT = 0.16

/** マップのカメラから、いま決めた操縦席のカメラへ寄せる。距離は桁ごとに同じ速さで縮める */
function flyInCamera(camera: THREE.PerspectiveCamera, rawDelta: number) {
  flyIn.t = Math.min(1, flyIn.t + Math.min(rawDelta, 0.1) / FLY_IN_SECONDS)
  const k = ease(flyIn.t)
  v.copy(camera.position).sub(ship.position)
  const near = Math.max(v.length(), 1e-6)
  const far = Math.max(flyIn.from.length(), near)
  flyDir.copy(flyIn.from).normalize().lerp(v.divideScalar(near), k)
  if (flyDir.lengthSq() < 1e-8) flyDir.copy(v)
  camera.position.copy(ship.position).addScaledVector(flyDir.normalize(), far * (near / far) ** k)
  camera.quaternion.copy(qLook.copy(flyIn.quat).slerp(camera.quaternion, k))
}

function followCamera(camera: THREE.PerspectiveCamera, dt: number, phase: string, zoomIn: number) {
  // 自機からの相対位置で追従させる（天体と一緒に動いても遅れない）。接近ズーム中は船と一緒に近寄る
  // チャージビームを溜めて撃つあいだは、少し上・後ろへ引いて、ビームの長さが見えるようにする
  const pose = beamFx.pose
  v.set(0, 0.095 + 0.085 * pose, 0.6 + 0.12 * pose).multiplyScalar(zoomIn).applyQuaternion(ship.quaternion)
  camOffset.lerp(v, 1 - Math.exp(-8 * dt))
  camera.position.copy(ship.position).add(camOffset)
  fwd.set(0, 0, -1).applyQuaternion(ship.quaternion)
  up.set(0, 1, 0).applyQuaternion(ship.quaternion)
  camera.up.lerp(up, 1 - Math.exp(-6 * dt))
  // 船を画面の中央より少し下に置き、真ん中（ビームの照準）は船の上を通す。船の真後ろを狙うと、ビームが円盤の陰に隠れてしまう
  camera.lookAt(v.copy(ship.position).addScaledVector(fwd, 2 * zoomIn).addScaledVector(up, CHASE_AIM_LIFT * zoomIn))
  const fov = phase === 'warp' ? 58 + 35 * warpFx.intensity : phase === 'charge' ? 50 : 52
  camera.fov += (fov - camera.fov) * (1 - Math.exp(-5 * dt))
  camera.updateProjectionMatrix()
}
