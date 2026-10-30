import type * as THREE from 'three'

/** 描画中の天体。航法や自動航行が位置を参照する */
export type BodyEntry = {
  id: string
  name: string
  radius: number
  object: THREE.Object3D
}

export const bodies = new Map<string, BodyEntry>()

export function registerBody(entry: BodyEntry) {
  bodies.set(entry.id, entry)
  return () => {
    if (bodies.get(entry.id) === entry) bodies.delete(entry.id)
  }
}

/** シミュレーション時間（秒）。一時停止や早送りのため描画時計とは分ける */
export const sim = { time: 0 }

/** 小惑星の種類（0 炭素質・1 石質・2 金属） */
export type RockType = 0 | 1 | 2

/** 小惑星帯：ビームで壊すために参照する */
export const asteroids = {
  meshes: [] as THREE.InstancedMesh[],
  types: new Map<THREE.InstancedMesh, RockType[]>(),
  destroyed: [] as { mesh: THREE.InstancedMesh; index: number; matrix: THREE.Matrix4; at: number }[],
}

/** 小惑星帯のほかにビームが当たるもの（任務の小惑星など）。当たると onHit を呼ぶ */
export const beamTargets: { object: THREE.Object3D; onHit: () => void }[] = []

/** 天体以外を目標マーカーで指すとき（レースの次のゲートなど） */
export const markerOverride = { object: null as THREE.Object3D | null }

/**
 * 天体ではないが、そばで船を縮めたい場所（SFモードのスペースコロニーなど）。
 * 中心から start より近いと縮め始め、full より近いと factor 倍まで縮める。
 * 縮めた分、速さの上限も下げる（大きな構造物の横を、ゆっくり流れるように）
 */
export type ZoomZone = { object: THREE.Object3D; start: number; full: number; factor: number }
export const zoomZones = new Set<ZoomZone>()

/** 中を飛べる構造物：天体のような「近づける限界」の代わりに、自分で壁に当たる判定をする（毎フレーム、自機を動かしたあとに呼ぶ） */
export const colliders = new Set<() => void>()
/** 天体の近づける限界を使わない id（colliders で自分で判定するもの） */
export const passThrough = new Set<string>()
