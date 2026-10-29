import { t } from '../i18n/lang'

/**
 * 艦橋（ブリッジ）の中の部屋。座標は m で、床の中心が原点、-Z が船の前。
 * 前が広い楕円の部屋で、中央の一段低いところに艦長席、後ろ半分は一段高い床と手すり。
 */
export const ROOM = {
  /** 楕円の半径（左右・前後） */
  rx: 8,
  rz: 6.5,
  height: 4.2,
  /** 後ろの高い床の高さと、手すりの半径 */
  deck: 0.4,
  railR: 3.7,
  /** 正面の窓：真正面から左右に何ラジアン、床から何 m 〜何 m */
  windowHalf: 0.95,
  windowBottom: 0.45,
  windowTop: 3.5,
  /** 天窓の半径 */
  skylight: 1.6,
}

/** 部屋の床の中心は、模型のブリッジの底から何 m 上か（円盤のてっぺんとほぼ同じ高さ） */
export const FLOOR_ABOVE_BASE = 2

export type ViewpointId = 'captain' | 'window' | 'helm' | 'rail' | 'science' | 'overhead'

export type Viewpoint = {
  id: ViewpointId
  name: () => string
  eye: [number, number, number]
  look: [number, number, number]
}

export const VIEWPOINTS: Viewpoint[] = [
  { id: 'captain', name: () => t('艦長席', 'Captain’s chair'), eye: [0, 1.25, 0.55], look: [0, 1.15, -10] },
  { id: 'helm', name: () => t('操舵席', 'Helm'), eye: [-1.0, 1.15, -1.75], look: [-1.0, 0.9, -10] },
  { id: 'window', name: () => t('窓のそば', 'At the window'), eye: [1.2, 1.65, -5.3], look: [2.6, 0.5, -12] },
  { id: 'rail', name: () => t('後ろの手すり', 'Aft rail'), eye: [0, ROOM.deck + 1.65, 4.4], look: [0, 1.1, -4] },
  { id: 'science', name: () => t('科学ステーション', 'Science station'), eye: [-5.6, ROOM.deck + 1.6, 2.6], look: [0, 1, -2] },
  { id: 'overhead', name: () => t('天井から', 'From above'), eye: [4.2, 3.7, 4.2], look: [0, 0.4, -1.2] },
]

export const viewpoint = (id: ViewpointId) => VIEWPOINTS.find((v) => v.id === id) ?? VIEWPOINTS[0]

/** 見ている向き（ヨー・ピッチ）。-Z が 0 */
export function lookAngles(vp: Viewpoint) {
  const dx = vp.look[0] - vp.eye[0]
  const dy = vp.look[1] - vp.eye[1]
  const dz = vp.look[2] - vp.eye[2]
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) }
}
