import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { HubbleTelescope } from './HubbleNasa'
import { WebbModel } from './WebbModel'
import { bodies, registerBody, sim } from '../../state/registry'
import { ship } from '../../state/flight'
import { useStore } from '../../state/store'
import {
  HUBBLE_ID,
  HUBBLE_INCLINATION,
  HUBBLE_LENGTH,
  HUBBLE_ORBIT,
  HUBBLE_PERIOD,
  SCOPE_NEAR,
  TELESCOPE_TEXT,
  WEBB_DISTANCE,
  WEBB_HALO,
  WEBB_HALO_PERIOD,
  WEBB_ID,
  WEBB_WIDTH,
  scopeName,
  scopeShortName,
  type ScopeId,
} from '../../data/telescopes'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'

const HUBBLE_RADIUS = HUBBLE_LENGTH * 0.55
const WEBB_RADIUS = WEBB_WIDTH * 0.55

const earth = new THREE.Vector3()
const pos = new THREE.Vector3()
const outward = new THREE.Vector3()
const side = new THREE.Vector3()
const look = new THREE.Vector3()
const toSun = new THREE.Vector3()
const spin = new THREE.Quaternion()
const X = new THREE.Vector3(1, 0, 0)
const Y = new THREE.Vector3(0, 1, 0)
const DOWN = new THREE.Vector3(0, -1, 0)

function Label({ id, name, height }: { id: ScopeId; name: string; height: number }) {
  const anchor = useRef<THREE.Group>(null)
  const label = useRef<HTMLSpanElement>(null)
  useHideBehindSun(label, anchor)
  return (
    <group ref={anchor} position={[0, height, 0]}>
      <Html center className="label" zIndexRange={LABEL_Z}>
        <span ref={label} onClick={() => useStore.getState().setTarget(id)}>
          {name}
        </span>
      </Html>
    </group>
  )
}

/**
 * 宇宙望遠鏡：地球のまわりを回るハッブルと、太陽と反対側（L2）にいるウェッブ。
 * そばまで行くと、望遠鏡が撮った深宇宙の写真をのぞける。
 */
export function Telescopes() {
  useLang()
  const hubble = useRef<THREE.Group>(null!)
  const hubbleBody = useRef<THREE.Group>(null!)
  const webb = useRef<THREE.Group>(null!)
  const webbBody = useRef<THREE.Group>(null!)
  const noticed = useRef<ScopeId | null>(null)

  useEffect(() => {
    const a = registerBody({ id: HUBBLE_ID, get name() { return scopeName(HUBBLE_ID) }, radius: HUBBLE_RADIUS, object: hubble.current })
    const b = registerBody({ id: WEBB_ID, get name() { return scopeName(WEBB_ID) }, radius: WEBB_RADIUS, object: webb.current })
    return () => {
      a()
      b()
    }
  }, [])

  useFrame(() => {
    // そばに来たら「のぞく」を出す。自機は前のフレームの望遠鏡の位置に合わせて動いているので、
    // 望遠鏡を動かす前にくらべる
    const st = useStore.getState()
    let near: ScopeId | null = null
    for (const [id, group, radius] of [
      [HUBBLE_ID, hubble.current, HUBBLE_RADIUS],
      [WEBB_ID, webb.current, WEBB_RADIUS],
    ] as const) {
      const d = ship.position.distanceTo(group.position) - radius
      const keep = st.scopeNear === id ? 1.5 : 1
      if (d < SCOPE_NEAR * keep) near = id
      if (noticed.current === id && d > SCOPE_NEAR * 3) noticed.current = null
    }
    const flying = st.mode === 'flight' && st.warpPhase === 'idle'
    if (!flying) near = null
    if (near !== st.scopeNear) st.setScopeNear(near)
    if (near && noticed.current !== near && !st.scope) {
      noticed.current = near
      st.showToast(TELESCOPE_TEXT.found(scopeName(near)))
    }

    const home = bodies.get('earth')
    if (!home) return
    home.object.getWorldPosition(earth)
    const t = sim.time

    // ハッブル：傾いた円軌道で地球を回り、筒をゆっくり別の空へ向ける
    const a = (t / HUBBLE_PERIOD) * Math.PI * 2
    pos.set(Math.cos(a) * HUBBLE_ORBIT, 0, -Math.sin(a) * HUBBLE_ORBIT).applyAxisAngle(X, HUBBLE_INCLINATION)
    hubble.current.position.copy(earth).add(pos)
    look.set(Math.cos(t * 0.021), 0.35 * Math.sin(t * 0.013), Math.sin(t * 0.021))
    hubbleBody.current.lookAt(look.add(hubble.current.position))

    // ウェッブ：地球から見て太陽と反対側。L2のまわりをゆっくり回り、日よけをいつも太陽に向ける
    outward.copy(earth).normalize()
    side.crossVectors(outward, Y).normalize()
    const b = (t / WEBB_HALO_PERIOD) * Math.PI * 2
    webb.current.position
      .copy(earth)
      .addScaledVector(outward, WEBB_DISTANCE)
      .addScaledVector(side, Math.cos(b) * WEBB_HALO)
      .addScaledVector(Y, Math.sin(b) * WEBB_HALO * 0.6)
    toSun.copy(webb.current.position).negate().normalize()
    webbBody.current.quaternion.setFromUnitVectors(DOWN, toSun).multiply(spin.setFromAxisAngle(Y, t * 0.004))
  })

  return (
    <>
      <group ref={hubble}>
        <group ref={hubbleBody}>
          <group scale={HUBBLE_LENGTH}>
            <HubbleTelescope />
          </group>
        </group>
        <Label id={HUBBLE_ID} name={scopeShortName(HUBBLE_ID)} height={HUBBLE_LENGTH * 0.9} />
      </group>
      <group ref={webb}>
        <group ref={webbBody}>
          <group scale={WEBB_WIDTH}>
            <WebbModel />
          </group>
        </group>
        <Label id={WEBB_ID} name={scopeShortName(WEBB_ID)} height={WEBB_WIDTH * 0.9} />
      </group>
    </>
  )
}
