import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { cubeGeometry, cubeMaterial } from './cubeGeometry'

/** 機械文明の立方体船（一辺 1）。緑の灯はゆっくり脈打つ */
export function CubeModel() {
  const { gl } = useThree()
  const envMap = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    return env
  }, [gl])
  const parts = useMemo(() => {
    const { hull, lights } = cubeGeometry()
    return {
      hull,
      lights,
      hullMat: cubeMaterial(envMap),
      lightMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.6, 0.55), toneMapped: false }),
    }
  }, [envMap])
  useEffect(
    () => () => {
      parts.hull.dispose()
      parts.lights.dispose()
      parts.hullMat.dispose()
      parts.lightMat.dispose()
    },
    [parts],
  )
  const light = useRef(parts.lightMat)
  useFrame(({ clock }) => {
    const k = 0.85 + 0.15 * Math.sin(clock.getElapsedTime() * 0.9)
    light.current.color.setRGB(0.3 * k, 1.6 * k, 0.55 * k)
  })
  return (
    <group>
      <mesh geometry={parts.hull} material={parts.hullMat} castShadow receiveShadow />
      <mesh geometry={parts.lights} material={parts.lightMat} />
    </group>
  )
}
