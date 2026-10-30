import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Colony } from './Colony'
import { StanfordTorus } from './StanfordTorus'
import { earthMoonPoint } from './lagrange'
import { COLONY_ID, colonyName, colonyMemberName } from '../../data/sf'

const Y = new THREE.Vector3(0, 1, 0)
const toSun = new THREE.Vector3()

/**
 * 地球と月の L5 点のコロニー群。円筒型3基（1基は中へ入れる代表）、ドーナツ型1基、建設中の1基。
 * 群ごと回転軸（+Y）を太陽へ向ける。並べる間隔は、円筒の鏡が回ってきてもぶつからない広さ。
 */
export function ColonyCluster() {
  const group = useRef<THREE.Group>(null!)
  useFrame(() => {
    const g = group.current
    if (!earthMoonPoint('L5', g.position)) return
    toSun.copy(g.position).negate().normalize()
    g.quaternion.setFromUnitVectors(Y, toSun)
  })
  return (
    <group ref={group}>
      <Colony id={COLONY_ID} name={colonyName} primary />
      <Colony id="colony-2" name={() => colonyMemberName(2)} position={[-1.2, 0.12, 0.05]} phase={1.1} />
      <Colony id="colony-3" name={() => colonyMemberName(3)} position={[-0.45, -0.1, 1.2]} phase={2.3} />
      <StanfordTorus position={[0.55, 0.05, -1.1]} />
    </group>
  )
}
