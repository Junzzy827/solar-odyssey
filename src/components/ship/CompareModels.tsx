import { useMemo } from 'react'
import * as THREE from 'three'
import { COMPARE, METERS_PER_UNIT } from '../../data/shipParts'
import { compareScale, useShip, type ShipSpec } from '../../data/ships'
import { named, t } from '../../i18n/lang'

// 大きさくらべ：本物の大きさで、自機（ShipModel の座標）の横に並べる簡単な模型。
// 形は特徴がわかる程度にとどめ、色は塗装の白・銀・太陽電池の金色だけにする

const m = (meters: number) => meters / METERS_PER_UNIT
const HALF_PI = Math.PI / 2

const white = new THREE.MeshStandardMaterial({ color: '#e9edf2', roughness: 0.55, metalness: 0.1 })
const silver = new THREE.MeshStandardMaterial({ color: '#c9ccd2', roughness: 0.3, metalness: 0.8 })
const panel = new THREE.MeshStandardMaterial({ color: '#8a6a32', roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide })

/** 東京スカイツリー（634m）。寝かせて、てっぺんを船の前に向ける。足元は三角、上へ行くほど丸く細くなる */
function Skytree() {
  const geometry = useMemo(() => {
    // [半径, 高さ]（m）。展望デッキ（350m）と展望回廊（450m）でふくらむ
    const profile: [number, number][] = [
      [0, 0], [40, 0], [33, 80], [25, 200], [19, 320], [18, 335], [27, 340], [27, 365], [17, 372], [15, 435], [20, 440], [20, 455], [13, 460], [10, 495],
      [4, 500], [3, 634], [0, 634],
    ]
    const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(m(r), m(y))), 12)
    g.computeVertexNormals()
    return g
  }, [])
  return <mesh geometry={geometry} material={white} rotation={[-HALF_PI, 0, 0]} />
}

/** 国際宇宙ステーション（トラス約109m）。トラス・居住モジュール・太陽電池パネル8枚 */
function Iss() {
  const wings = [-1, 1].flatMap((side) => [m(43), m(52)].map((x) => side * x))
  return (
    <group>
      <mesh material={silver}>
        <boxGeometry args={[m(109), m(4), m(4)]} />
      </mesh>
      {/* 居住モジュールは、トラスと直角に前後へ並ぶ */}
      <mesh material={white} rotation={[HALF_PI, 0, 0]} position={[0, -m(5), 0]}>
        <cylinderGeometry args={[m(2.1), m(2.1), m(73), 12]} />
      </mesh>
      {wings.flatMap((x) =>
        [-1, 1].map((s) => (
          <mesh key={`${x}${s}`} material={panel} position={[x, 0, s * m(20)]}>
            <boxGeometry args={[m(12), m(0.3), m(35)]} />
          </mesh>
        )),
      )}
    </group>
  )
}

/** ジャンボジェット（ボーイング747、全長約71m・翼の幅約64m） */
function Jet() {
  return (
    <group>
      <mesh material={white} rotation={[HALF_PI, 0, 0]}>
        <capsuleGeometry args={[m(3.2), m(64), 4, 12]} />
      </mesh>
      {/* 後ろへ傾いた主翼と水平尾翼、垂直尾翼 */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh material={white} position={[s * m(16), -m(1.5), m(2)]} rotation={[0, s * 0.65, 0]}>
            <boxGeometry args={[m(34), m(0.8), m(9)]} />
          </mesh>
          <mesh material={white} position={[s * m(6), m(1), m(30)]} rotation={[0, s * 0.6, 0]}>
            <boxGeometry args={[m(12), m(0.5), m(5)]} />
          </mesh>
        </group>
      ))}
      <mesh material={white} position={[0, m(8), m(30)]} rotation={[0.5, 0, 0]}>
        <boxGeometry args={[m(0.6), m(12), m(7)]} />
      </mesh>
    </group>
  )
}

/** ハッブル宇宙望遠鏡（長さ約13m・太さ約4m）と、2枚の太陽電池パネル */
function Hubble() {
  return (
    <group>
      <mesh material={silver} rotation={[HALF_PI, 0, 0]}>
        <cylinderGeometry args={[m(2.1), m(2.1), m(13.2), 16]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={panel} position={[s * m(4), 0, m(1)]}>
          <boxGeometry args={[m(4), m(0.1), m(12)]} />
        </mesh>
      ))}
    </group>
  )
}

const MODELS: Record<string, () => JSX.Element> = { skytree: Skytree, iss: Iss, jet: Jet, hubble: Hubble }

/** 並べる位置（船の座標）。カメラは左舷の上から見るので、小さな物ほど手前（左舷の外側）に置く */
const PLACES: Record<string, [number, number, number]> = {
  skytree: [-0.52, -0.06, m(634) / 2],
  iss: [-0.78, -0.06, 0.3],
  jet: [-0.78, -0.06, 0.1],
  hubble: [-0.78, -0.06, -0.05],
}
/** 名札の高さ（物の中心から上へ） */
const LABEL_LIFT: Record<string, number> = { skytree: 0.07, iss: 0.04, jet: 0.04, hubble: 0.025 }

/** 大きさくらべの名札（船の座標）。スカイツリーは寝かせているので、真ん中の上に出す。
 * 模型は SV-01 の座標で作ってあるので、ほかの船では位置を倍率に合わせる */
export function compareLabels(ship: ShipSpec): { id: string; text: string; pos: [number, number, number] }[] {
  const k = compareScale(ship)
  return [
    ...COMPARE.map((item) => {
      const [x, y, z] = PLACES[item.id]
      const pos: [number, number, number] = [x * k, (y + LABEL_LIFT[item.id]) * k, (item.id === 'skytree' ? z - m(634) / 2 : z) * k]
      return { id: item.id, text: `${named(item)} ${item.meters}m`, pos }
    }),
    {
      id: 'ship',
      text: t(`${ship.registry} ${ship.lengthM}m（設定）`, `${ship.registry} ${ship.lengthM} m (story)`),
      pos: ship.model ? [0, 0.25, 0] : [0, 0.16, -0.17],
    },
  ]
}

export function CompareModels() {
  const ship = useShip()
  return (
    <group scale={compareScale(ship)}>
      {COMPARE.map((item) => {
        const Model = MODELS[item.id]
        return (
          <group key={item.id} position={PLACES[item.id]}>
            <Model />
          </group>
        )
      })}
    </group>
  )
}
