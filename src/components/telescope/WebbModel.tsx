import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { cellMaterial, darkMaterial, goldMaterial, roomEnvironment, shieldMaterial, solarCellTexture } from './parts'

// ジェイムズ・ウェッブ宇宙望遠鏡（日よけの長さ 1）。
// 日よけは XZ 面で、-Y が太陽の側。金色の鏡は日よけの上に立ち、+Z を向く。

const HALF_PI = Math.PI / 2

/** 鏡1枚の、中心から角までの長さ（向かい合う辺のあいだ 1.32m ÷ 日よけ 21m） */
const SEGMENT = 0.0363
const GAP = 0.0012
/** 鏡の曲がり具合（焦点距離。主鏡は f/1.2 くらい） */
const FOCAL = 0.37

/** 日よけの形：長い六角形 */
function shieldShape(scale: number) {
  const shape = new THREE.Shape()
  const pts: [number, number][] = [
    [0.5, 0],
    [0.21, 0.33],
    [-0.21, 0.33],
    [-0.5, 0],
    [-0.21, -0.33],
    [0.21, -0.33],
  ]
  pts.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x * scale, y * scale) : shape.lineTo(x * scale, y * scale)))
  shape.closePath()
  return new THREE.ShapeGeometry(shape)
}

/** 18枚の六角形の鏡の位置と向き（中心の1枚ぶんは穴） */
function segments() {
  const list: { position: THREE.Vector3; quaternion: THREE.Quaternion }[] = []
  const base = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), HALF_PI)
  const s = SEGMENT + GAP
  for (let q = -2; q <= 2; q++) {
    for (let r = -2; r <= 2; r++) {
      const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r))
      if (ring < 1 || ring > 2) continue
      const x = 1.5 * s * q
      const y = Math.sqrt(3) * s * (r + q / 2)
      const d2 = x * x + y * y
      // 放物面に沿って、少しずつ中心へ向ける
      const normal = new THREE.Vector3(-x, -y, 2 * FOCAL).normalize()
      const tilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
      list.push({ position: new THREE.Vector3(x, y, d2 / (4 * FOCAL)), quaternion: tilt.multiply(base) })
    }
  }
  return list
}

/** 2点を結ぶ細い棒 */
function strut(a: THREE.Vector3, b: THREE.Vector3) {
  const mid = a.clone().add(b).multiplyScalar(0.5)
  const dir = b.clone().sub(a)
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  return { position: mid, quaternion, length: dir.length() }
}

export function WebbModel() {
  const { gl } = useThree()

  const m = useMemo(() => {
    const env = roomEnvironment(gl)
    const cellMap = solarCellTexture()
    const dark = darkMaterial(env)
    const gold = goldMaterial(env)
    const cells = cellMaterial(env, cellMap)
    const sunSide = shieldMaterial(env, '#d8cde6')
    const layer = shieldMaterial(env, '#c3c6d3')
    const backing = new THREE.MeshStandardMaterial({ color: '#3b3a40', metalness: 0.3, roughness: 0.7 })
    return {
      env,
      dark,
      gold,
      cells,
      sunSide,
      layer,
      backing,
      segment: [backing, gold, backing],
      panel: [dark, dark, dark, cells, dark, dark],
      textures: [cellMap],
      shields: [0, 1, 2, 3, 4].map((i) => shieldShape(1 - i * 0.022)),
      mirror: segments(),
      struts: [
        strut(new THREE.Vector3(-0.13, -0.12, 0.02), new THREE.Vector3(0, 0, 0.34)),
        strut(new THREE.Vector3(0.13, -0.12, 0.02), new THREE.Vector3(0, 0, 0.34)),
        strut(new THREE.Vector3(0, 0.16, -0.01), new THREE.Vector3(0, 0, 0.34)),
      ],
    }
  }, [gl])

  useEffect(
    () => () => {
      for (const mat of [m.dark, m.gold, m.cells, m.sunSide, m.layer, m.backing]) mat.dispose()
      for (const t of m.textures) t.dispose()
      for (const g of m.shields) g.dispose()
    },
    [m],
  )

  return (
    <group>
      {/* 5枚重ねの日よけ。いちばん下（太陽側）が紫がかった銀色 */}
      {m.shields.map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={i === 4 ? m.sunSide : m.layer} position={[0, -i * 0.014, 0]} rotation={[-HALF_PI, 0, 0]} />
      ))}
      {[1, -1].map((side) => (
        <mesh key={side} material={m.dark} position={[side * 0.25, -0.022, 0]} rotation={[0, 0, HALF_PI]}>
          <cylinderGeometry args={[0.003, 0.003, 0.5, 6]} />
        </mesh>
      ))}

      {/* 太陽側：本体の箱、太陽電池、地球へのアンテナ */}
      <mesh material={m.dark} position={[0, -0.09, 0]}>
        <boxGeometry args={[0.1, 0.05, 0.1]} />
      </mesh>
      <mesh material={m.panel} position={[0, -0.112, -0.17]}>
        <boxGeometry args={[0.07, 0.004, 0.24]} />
      </mesh>
      <mesh material={m.dark} position={[0.04, -0.13, 0.04]} rotation={[Math.PI, 0, 0]} scale={[1, 0.4, 1]}>
        <sphereGeometry args={[0.03, 16, 5, 0, Math.PI * 2, 0, Math.PI * 0.4]} />
      </mesh>

      {/* 冷たい側：塔、鏡の裏の骨組み、観測装置の箱 */}
      <mesh material={m.dark} position={[0, 0.05, -0.03]}>
        <cylinderGeometry args={[0.012, 0.012, 0.1, 10]} />
      </mesh>
      <group position={[0, 0.235, 0.02]} rotation={[-0.1, 0, 0]}>
        <mesh material={m.backing} position={[0, 0, -0.02]}>
          <boxGeometry args={[0.22, 0.27, 0.02]} />
        </mesh>
        <mesh material={m.dark} position={[0, -0.02, -0.07]}>
          <boxGeometry args={[0.12, 0.12, 0.08]} />
        </mesh>

        {/* 18枚の金の鏡 */}
        {m.mirror.map((seg, i) => (
          <mesh key={i} material={m.segment} position={seg.position} quaternion={seg.quaternion}>
            <cylinderGeometry args={[SEGMENT, SEGMENT, 0.004, 6, 1, false, Math.PI / 6]} />
          </mesh>
        ))}
        {/* 中心の穴から出る光学系 */}
        <mesh material={m.dark} position={[0, 0, 0.015]} rotation={[HALF_PI, 0, 0]}>
          <cylinderGeometry args={[0.014, 0.018, 0.04, 12]} />
        </mesh>

        {/* 副鏡と、それを支える3本の棒 */}
        {m.struts.map((s, i) => (
          <mesh key={i} material={m.dark} position={s.position} quaternion={s.quaternion}>
            <cylinderGeometry args={[0.0025, 0.0025, s.length, 5]} />
          </mesh>
        ))}
        <mesh material={[m.backing, m.backing, m.gold]} position={[0, 0, 0.34]} rotation={[HALF_PI, 0, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 0.006, 6, 1, false, Math.PI / 6]} />
        </mesh>
      </group>
    </group>
  )
}
