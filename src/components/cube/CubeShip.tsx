import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { CubeModel } from './CubeModel'
import { registerBody, sim } from '../../state/registry'
import { ship } from '../../state/flight'
import { useStore } from '../../state/store'
import { CUBE_EDGE, CUBE_HEIGHT, CUBE_ID, CUBE_NAME, CUBE_NOTICE, CUBE_ORBIT, CUBE_TEXT } from '../../data/cube'

const RADIUS = CUBE_EDGE * 0.8
const pos = new THREE.Vector3()

/**
 * 小惑星帯と木星のあいだを漂う、機械文明の立方体船（架空）。
 * 近づくと案内が出て、航海日誌で解説とクイズが読める。
 */
export function CubeShip() {
  const group = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const noticed = useRef(false)

  useEffect(() => registerBody({ id: CUBE_ID, name: CUBE_NAME, radius: RADIUS, object: group.current }), [])

  useFrame(() => {
    // ゆっくり漂いながら、わずかに向きを変える
    const a = 1.1 + sim.time * 0.002
    group.current.position.set(Math.cos(a) * CUBE_ORBIT, CUBE_HEIGHT, Math.sin(a) * CUBE_ORBIT)
    body.current.rotation.set(0.18, sim.time * 0.01, 0.07)

    const st = useStore.getState()
    if (st.mode !== 'flight' || st.warpPhase !== 'idle') return
    group.current.getWorldPosition(pos)
    const distance = ship.position.distanceTo(pos) - RADIUS
    if (distance < CUBE_NOTICE && !noticed.current) {
      noticed.current = true
      st.showToast(CUBE_TEXT.found)
    }
    if (distance > CUBE_NOTICE * 3) noticed.current = false
  })

  return (
    <group ref={group}>
      <group ref={body} scale={CUBE_EDGE}>
        <CubeModel />
      </group>
      <Html position={[0, CUBE_EDGE, 0]} center className="label">
        <span onClick={() => useStore.getState().setTarget(CUBE_ID)}>{CUBE_NAME}</span>
      </Html>
    </group>
  )
}
