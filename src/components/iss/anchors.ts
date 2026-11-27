import * as THREE from 'three'

// 3D の中の名札（光る印・ハッチの「この先は…」）の場所。IssWorld が毎フレーム画面の位置を計算して el を動かし、
// IssHud が el（DOM のボタン）を作って登録する
export type Anchor = { pos: THREE.Vector3; el: HTMLElement | null; range: number }
export const spotAnchors = new Map<string, Anchor>()

/** 置く・場所だけ変える（el はそのまま） */
export function setAnchor(id: string, pos: THREE.Vector3, range: number) {
  const a = spotAnchors.get(id)
  if (a) {
    a.pos.copy(pos)
    a.range = range
  } else spotAnchors.set(id, { pos: pos.clone(), el: null, range })
}

/** HUD のボタンをつなぐ */
export function bindAnchorEl(id: string, el: HTMLElement | null) {
  const a = spotAnchors.get(id)
  if (a) a.el = el
  else if (el) spotAnchors.set(id, { pos: new THREE.Vector3(0, -100, 0), el, range: 0 })
}
