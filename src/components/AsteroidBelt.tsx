import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { angularSpeed, orbitRadius } from '../data/scale'
import { asteroids, sim, type RockType } from '../state/registry'

const COUNT = 3000
const INNER_AU = 2.2
const OUTER_AU = 3.3
const SHAPES = 4
const RESPAWN_SECONDS = 30
const ROCK_COLORS = ['#5a534c', '#9a8f80', '#b8b4ac']

// 再現性のある乱数（毎回同じ配置にする）
function random(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/** ごつごつした岩の形：正二十面体の頂点をでこぼこに動かす */
function rockGeometry(rand: () => number) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 1))
  const pos = g.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).multiplyScalar(0.7 + rand() * 0.5)
    pos.setXYZ(i, v.x, v.y * (0.6 + rand() * 0.3), v.z)
  }
  g.computeVertexNormals()
  return g
}

/** 火星と木星の間の小惑星帯。実際はもっとまばらだが、見て分かる密度にしている */
export function AsteroidBelt() {
  const belt = useRef<THREE.Group>(null!)
  const meshes = useRef<THREE.InstancedMesh[]>([])

  const { geometries, material } = useMemo(() => {
    const rand = random(7)
    return {
      geometries: Array.from({ length: SHAPES }, () => rockGeometry(rand)),
      material: new THREE.MeshStandardMaterial({ color: '#8a7f72', roughness: 1, flatShading: true }),
    }
  }, [])

  useLayoutEffect(() => {
    const rand = random(42)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const p = new THREE.Vector3()
    const s = new THREE.Vector3()
    const color = new THREE.Color()
    const per = Math.ceil(COUNT / SHAPES)
    meshes.current.forEach((mesh) => {
      const types: RockType[] = []
      for (let i = 0; i < per; i++) {
        const au = INNER_AU + (OUTER_AU - INNER_AU) * (rand() + rand()) * 0.5
        const r = orbitRadius(au)
        const a = rand() * Math.PI * 2
        p.set(Math.cos(a) * r, (rand() - 0.5) * 3, Math.sin(a) * r)
        const size = 0.04 + rand() ** 3 * 0.4
        s.set(size, size, size)
        q.setFromEuler(e.set(rand() * 6.28, rand() * 6.28, rand() * 6.28))
        mesh.setMatrixAt(i, m.compose(p, q, s))
        // 炭素質（暗い）・石質（灰）・金属（明るい）を、実際の割合に近く混ぜる
        const k = rand()
        const type: RockType = k < 0.75 ? 0 : k < 0.92 ? 1 : 2
        types.push(type)
        mesh.setColorAt(i, color.set(ROCK_COLORS[type]))
      }
      asteroids.meshes.push(mesh)
      asteroids.types.set(mesh, types)
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    })
    return () => {
      asteroids.meshes.length = 0
      asteroids.types.clear()
      asteroids.destroyed.length = 0
    }
  }, [])

  // 帯全体を平均的な公転速度で回す
  const speed = angularSpeed(365.25 * 2.7 ** 1.5)
  useFrame(({ clock }) => {
    belt.current.rotation.y = sim.time * speed
    // 壊した岩は時間がたつと元に戻る
    const now = clock.getElapsedTime()
    const back = asteroids.destroyed.filter((d) => now - d.at > RESPAWN_SECONDS)
    if (back.length === 0) return
    for (const d of back) {
      d.mesh.setMatrixAt(d.index, d.matrix)
      d.mesh.instanceMatrix.needsUpdate = true
    }
    asteroids.destroyed = asteroids.destroyed.filter((d) => now - d.at <= RESPAWN_SECONDS)
  })

  return (
    <group ref={belt}>
      {geometries.map((g, i) => (
        <instancedMesh
          key={i}
          ref={(mesh) => {
            if (mesh) meshes.current[i] = mesh
          }}
          args={[g, material, Math.ceil(COUNT / SHAPES)]}
        />
      ))}
    </group>
  )
}
