import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CubeModel } from '../cube/CubeModel'
import { markerOverride } from '../../state/registry'
import { flightControl, ship } from '../../state/flight'
import { useStore } from '../../state/store'
import { RACE_TEXT, useRace } from '../../state/race'
import { playBeep } from '../../audio/sfx'
import { GATE_RADIUS, MAX_GATES, buildCourse, type Course } from './course'
import { DEFAULT_RATE } from '../../data/scale'

const RIVAL_SPEED = 7
const BOOST = 1.7
const BOOST_SECONDS = 15
// 確認用：#raceauto（または #raceauto=速さ）で自機が自動で飛ぶ
const AUTO = location.hash.match(/raceauto(?:=(\d+))?/)
const AUTO_SPEED = Number(AUTO?.[1] ?? 8)
const UP = new THREE.Vector3(0, 1, 0)

/** コース上の輪（ゲート）、薄い道すじ、ライバルの立方体船、進行の判定 */
export function Race() {
  const phase = useRace((s) => s.phase)
  const course = useRef<Course | null>(null)
  const gateMeshes = useRef<THREE.Mesh[]>([])
  const rival = useRef<THREE.Group>(null!)
  const run = useRef({ lastCount: 4, t: 0, prevSide: -1, boost: 0, rivalS: 0, rivalTime: null as number | null, rivalBoost: false, prevTimeScale: DEFAULT_RATE })

  const gateGeometry = useMemo(() => new THREE.TorusGeometry(GATE_RADIUS, 0.035, 10, 64), [])
  const gateMaterials = useMemo(
    () => ({
      next: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 0.88, 0.3), toneMapped: false }),
      later: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.4, 0.14), transparent: true, opacity: 0.6, toneMapped: false }),
    }),
    [],
  )
  const pathMaterial = useMemo(
    () => new THREE.LineDashedMaterial({ color: new THREE.Color(1, 0.75, 0.3), dashSize: 0.8, gapSize: 0.7, transparent: true, opacity: 0.35, depthWrite: false }),
    [],
  )
  const line = useMemo(() => {
    const l = new THREE.Line(new THREE.BufferGeometry(), pathMaterial)
    l.frustumCulled = false
    l.visible = false
    return l
  }, [pathMaterial])

  // 開始：コースを作り、自機を最初の輪の手前に置いてカウントダウン。
  // 距離のスライダーを広げていたときは、惑星が見やすい距離にもどってから（次のフレームで）作る
  const pending = useRef(false)
  const begin = () => {
    const r = run.current
    const st = useStore.getState()
    const c = buildCourse()
    if (!c) {
      useRace.getState().stop()
      return
    }
    course.current = c
    useRace.getState().update({ gateCount: c.gates.length })
    line.geometry.dispose()
    line.geometry = new THREE.BufferGeometry().setFromPoints(c.curve.getSpacedPoints(800))
    line.computeLineDistances()

    const first = c.gates[0]
    ship.position.copy(first.pos).addScaledVector(first.normal, -4)
    ship.velocity.set(0, 0, 0)
    ship.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(ship.position, first.pos.clone().addScaledVector(first.normal, 10), UP))
    flightControl.releaseHold = true
    flightControl.locked = true
    flightControl.speedScale = 1
    r.prevTimeScale = st.timeScale || DEFAULT_RATE
    st.setTimeScale(0) // レース中は惑星を止めて、コースがずれないようにする
    st.setAutopilot(false)
    st.setTarget(null)
    st.setMode('flight')
    st.setCameraMode('chase')
    r.lastCount = 4
    r.t = 0
    r.prevSide = -1
    r.boost = 0
    r.rivalS = 0
    r.rivalTime = null
    r.rivalBoost = false
    st.showToast(RACE_TEXT.start)
  }

  useEffect(() => {
    const r = run.current
    const st = useStore.getState()
    if (phase === 'countdown') pending.current = true
    if (phase === 'idle' || phase === 'finished') {
      flightControl.locked = false
      flightControl.speedScale = 1
      markerOverride.object = null
      if (course.current) st.setTimeScale(r.prevTimeScale)
      if (phase === 'idle') course.current = null
    }
  }, [phase, line])

  useEffect(
    () => () => {
      gateGeometry.dispose()
      gateMaterials.next.dispose()
      gateMaterials.later.dispose()
      pathMaterial.dispose()
      line.geometry.dispose()
      markerOverride.object = null
    },
    [gateGeometry, gateMaterials, pathMaterial, line],
  )

  useFrame(({ clock }, rawDelta) => {
    if (pending.current) {
      pending.current = false
      begin()
    }
    const c = course.current
    const race = useRace.getState()
    const visible = c !== null && race.phase !== 'idle'
    line.visible = visible
    rival.current.visible = visible
    gateMeshes.current.forEach((m, i) => (m.visible = visible && c !== null && i < c.gates.length && i >= race.gate))
    if (!c || !visible) return
    const dt = Math.min(rawDelta, 0.05) // 自機（Ship）と同じ上限にそろえる
    const r = run.current

    // 輪の配置と色（次の輪は明るく脈打つ）
    c.gates.forEach((g, i) => {
      const m = gateMeshes.current[i]
      if (!m) return
      m.position.copy(g.pos)
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), g.normal)
      const next = i === race.gate
      m.material = next ? gateMaterials.next : gateMaterials.later
      m.scale.setScalar(next ? 1 + 0.05 * Math.sin(clock.getElapsedTime() * 5) : 1)
    })
    markerOverride.object = race.phase === 'running' || race.phase === 'countdown' ? (gateMeshes.current[race.gate] ?? null) : null

    // ライバル：コースに沿って一定の速さで進み、土星のあとで加速する
    const swingU = c.gates.find((g) => g.event === 'swingby')?.u ?? 0.6
    if (race.phase === 'running' && r.rivalTime === null) {
      r.rivalS += dt * RIVAL_SPEED * (r.rivalBoost ? 1.5 : 1)
      if (!r.rivalBoost && r.rivalS / c.length > swingU) r.rivalBoost = true
      if (r.rivalS >= c.length) r.rivalTime = r.t
    }
    const ru = Math.min(1, r.rivalS / c.length)
    const side = new THREE.Vector3().crossVectors(UP, c.curve.getTangentAt(ru)).normalize()
    rival.current.position.copy(c.curve.getPointAt(ru)).addScaledVector(side, 3.2).addScaledVector(UP, 1.2)
    rival.current.rotation.y += dt * 0.3
    const rivalGate = c.gates.filter((g) => g.u * c.length <= r.rivalS).length

    if (race.phase === 'countdown') {
      const left = race.countdown - Math.min(rawDelta, 0.25)
      const count = Math.ceil(left)
      if (count < r.lastCount && count > 0) playBeep(520)
      r.lastCount = count
      if (left <= 0) {
        playBeep(1040)
        flightControl.locked = false
        race.update({ phase: 'running', countdown: 0 })
      } else race.update({ countdown: left })
      return
    }
    if (race.phase !== 'running') return

    r.t += dt
    if (AUTO) {
      const target = c.gates[race.gate].pos.clone().addScaledVector(c.gates[race.gate].normal, 1)
      const to = target.sub(ship.position)
      ship.velocity.copy(to.setLength(AUTO_SPEED * flightControl.speedScale))
      ship.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(ship.position, ship.position.clone().add(ship.velocity), UP))
    }
    if (r.boost > 0) {
      r.boost -= dt
      if (r.boost <= 0) flightControl.speedScale = 1
    }

    // 次の輪をくぐったか：輪の面を手前から向こうへ横切り、そのとき輪の内側にいること
    const g = c.gates[race.gate]
    const rel = ship.position.clone().sub(g.pos)
    const sideNow = rel.dot(g.normal)
    const radial = rel.addScaledVector(g.normal, -sideNow).length()
    if (r.prevSide < 0 && sideNow >= 0 && radial < GATE_RADIUS * 1.25) {
      playBeep(880, 0.08)
      if (g.event === 'jupiter') useStore.getState().showToast(RACE_TEXT.jupiter)
      if (g.event === 'swingby') {
        useStore.getState().showToast(RACE_TEXT.swingby)
        flightControl.speedScale = BOOST
        r.boost = BOOST_SECONDS
        ship.velocity.multiplyScalar(BOOST)
        race.update({ boosted: true })
      }
      const next = race.gate + 1
      if (next >= c.gates.length) {
        race.update({ gate: next, rivalGate })
        race.finish(r.t, r.rivalTime)
        useStore.getState().showToast(RACE_TEXT.finish)
        return
      }
      r.prevSide = -1
      race.update({ gate: next, elapsed: r.t, rivalGate })
      return
    }
    // 輪から大きく離れて横を通り過ぎたら、もう一度手前から入り直す
    r.prevSide = sideNow < 0 || radial > GATE_RADIUS * 4 ? -1 : 1
    race.update({ elapsed: r.t, rivalGate })
  })

  return (
    <>
      <primitive object={line} />
      {Array.from({ length: MAX_GATES }, (_, i) => (
        <mesh
          key={i}
          ref={(m: THREE.Mesh | null) => {
            if (m) gateMeshes.current[i] = m
          }}
          geometry={gateGeometry}
          material={gateMaterials.later}
          visible={false}
          frustumCulled={false}
        />
      ))}
      <group ref={rival} visible={false} scale={0.7}>
        <CubeModel />
      </group>
    </>
  )
}
