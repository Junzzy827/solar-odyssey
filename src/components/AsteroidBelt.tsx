import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { asteroidGeometry, asteroidMaterial } from './asteroidShape'
import { angularSpeed } from '../data/scale'
import { useLayout } from '../state/useLayout'
import { BELT_AU } from '../data/layout'
import { asteroids, sim, type RockType } from '../state/registry'
import { photoUniform } from '../state/look'

const COUNT = 3000
// 小さな岩は粗い形、大きな岩は細かい形（数が多いので三角形を節約する）
const SMALL_SHAPES = 6
const LARGE_SHAPES = 4
const SHAPES = SMALL_SHAPES + LARGE_SHAPES
/** これより大きい岩は細かい形を使う */
const LARGE_SIZE = 0.22
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

/** 写真モードで、カメラからこれより遠い岩は小さくして消す（本物の小惑星は、少し離れると点にも見えない） */
const PHOTO_FADE = { near: 12, far: 36 }

/**
 * 帯の岩の材質。写真モードでは、帯の外から見ると岩の輪が見えないようにする
 * （本物の小惑星帯は岩どうしが平均で数十万〜百万kmも離れていて、帯として目に見えることはない）
 */
function beltMaterial() {
  const material = asteroidMaterial()
  const base = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    base.call(material, shader, renderer)
    shader.uniforms.uPhoto = photoUniform
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uPhoto;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      if (uPhoto > 0.5) {
        vec3 rockAt = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        transformed *= 1.0 - smoothstep(${PHOTO_FADE.near.toFixed(1)}, ${PHOTO_FADE.far.toFixed(1)}, distance(rockAt, cameraPosition));
      }`,
    )
  }
  return material
}

/** 火星と木星の間の小惑星帯。実際はもっとまばらだが、見て分かる密度にしている */
export function AsteroidBelt() {
  const belt = useRef<THREE.Group>(null!)
  const meshes = useRef<THREE.InstancedMesh[]>([])
  // 距離のスライダーを広げると、帯も火星と木星のあいだで広がる（岩の数は同じなので、本物のようにまばらになる）
  const { belt: beltRadius } = useLayout()

  const { geometries, material } = useMemo(() => {
    const rand = random(7)
    return {
      geometries: Array.from({ length: SHAPES }, (_, i) => asteroidGeometry(rand, i < SMALL_SHAPES ? 2 : 3)),
      material: beltMaterial(),
    }
  }, [])

  // 岩の配置と種類（毎回同じ）。大きさで、使う形（細かさ）を分ける
  const rocks = useMemo(() => {
    const rand = random(42)
    const e = new THREE.Euler()
    const groups: { matrix: THREE.Matrix4; type: RockType }[][] = Array.from({ length: SHAPES }, () => [])
    let small = 0
    let large = 0
    for (let i = 0; i < COUNT; i++) {
      const au = BELT_AU.inner + (BELT_AU.outer - BELT_AU.inner) * (rand() + rand()) * 0.5
      const r = beltRadius(au)
      const a = rand() * Math.PI * 2
      const p = new THREE.Vector3(Math.cos(a) * r, (rand() - 0.5) * 3, Math.sin(a) * r)
      const size = 0.04 + rand() ** 3 * 0.4
      const q = new THREE.Quaternion().setFromEuler(e.set(rand() * 6.28, rand() * 6.28, rand() * 6.28))
      // 炭素質（暗い）・石質（灰）・金属（明るい）を、実際の割合に近く混ぜる
      const k = rand()
      const type: RockType = k < 0.75 ? 0 : k < 0.92 ? 1 : 2
      const shape = size > LARGE_SIZE ? SMALL_SHAPES + (large++ % LARGE_SHAPES) : small++ % SMALL_SHAPES
      groups[shape].push({ matrix: new THREE.Matrix4().compose(p, q, new THREE.Vector3(size, size, size)), type })
    }
    return groups
  }, [beltRadius])

  useLayoutEffect(() => {
    const color = new THREE.Color()
    meshes.current.forEach((mesh, shape) => {
      const types: RockType[] = []
      rocks[shape].forEach((rock, i) => {
        mesh.setMatrixAt(i, rock.matrix)
        mesh.setColorAt(i, color.set(ROCK_COLORS[rock.type]))
        types.push(rock.type)
      })
      asteroids.meshes.push(mesh)
      asteroids.types.set(mesh, types)
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere() // 帯が広がったら、見えているかの判定も広げる
    })
    return () => {
      asteroids.meshes.length = 0
      asteroids.types.clear()
      asteroids.destroyed.length = 0
    }
  }, [rocks])

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
          args={[g, material, rocks[i].length]}
        />
      ))}
    </group>
  )
}
