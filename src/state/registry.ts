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
