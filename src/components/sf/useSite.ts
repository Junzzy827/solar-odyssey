import { useEffect, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { passThrough, registerBody, zoomZones, type ZoomZone } from '../../state/registry'
import { flightControl, ship } from '../../state/flight'
import { useStore } from '../../state/store'
import { SITE_ZOOM, sfEntry } from '../../data/sf'

type SiteOptions = {
  id: string
  /** 目標にしたときの大きさ（ワープで止まる距離・ラベルの高さに使う） */
  radius: number
  /** 自機を縮める範囲（中心からの距離）。full より近いと SITE_ZOOM 倍まで縮める */
  zoom?: { start: number; full: number; factor?: number }
  /** この距離まで近づくと案内を出す */
  notice?: { distance: number; text: () => string }
}

const pos = new THREE.Vector3()

/**
 * SF の構造物の共通の仕組み：天体として登録し（ワープ・自動航行・スタンプ）、天体の近づける限界は使わず、
 * そばでは自機を縮めて本物の大きさの比率で見せる。
 * 構造物が地球や月と一緒に動くので、縮める範囲の中では自機も一緒に動かす（止まっていても置いていかれないように）。
 * 毎フレーム、構造物の位置を決めたあとに戻り値の moved() を呼ぶ。
 */
export function useSite(group: RefObject<THREE.Object3D>, { id, radius, zoom, notice }: SiteOptions) {
  const state = useRef({ last: new THREE.Vector3(), ready: false, noticed: false })

  useEffect(() => {
    const entry = sfEntry(id)
    const unregister = registerBody({ id, get name() { return entry?.name() ?? id }, radius, object: group.current! })
    passThrough.add(id)
    const zone: ZoomZone | null = zoom ? { object: group.current!, start: zoom.start, full: zoom.full, factor: zoom.factor ?? SITE_ZOOM } : null
    if (zone) zoomZones.add(zone)
    return () => {
      unregister()
      passThrough.delete(id)
      if (zone) zoomZones.delete(zone)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  /** 構造物を動かしたあとに呼ぶ */
  return function moved() {
    const s = state.current
    const g = group.current
    if (!g) return
    g.updateWorldMatrix(true, false)
    g.getWorldPosition(pos)
    const st = useStore.getState()
    const flying = st.mode !== 'map' && st.warpPhase === 'idle'
    const d = ship.position.distanceTo(pos)
    if (s.ready && flying && zoom && d < zoom.full * 1.5 && !flightControl.holding) ship.position.add(s.last.sub(pos).negate())
    s.last.copy(pos)
    s.ready = true
    if (notice && st.mode === 'flight' && flying) {
      if (d < notice.distance && !s.noticed) {
        s.noticed = true
        st.showToast(notice.text())
      }
      if (d > notice.distance * 3) s.noticed = false
    }
  }
}

/** useFrame の中で、構造物のそばを描くかどうか（遠いときは細かい部品を描かない） */
export const near = (object: THREE.Object3D | null, distance: number) => !!object && ship.position.distanceTo(object.getWorldPosition(pos)) < distance

