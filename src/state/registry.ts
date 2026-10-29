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
