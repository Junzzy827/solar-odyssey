import { create } from 'zustand'
import * as THREE from 'three'
import type { ViewpointId } from '../data/bridge'

/** ブリッジ視点：どこに立って（座って）いるか、見回しているか */
export const useBridge = create<{
  viewpoint: ViewpointId
  /** 艦長席で、マウス（右ボタン）や指で首を振っている */
  looking: boolean
  setViewpoint: (id: ViewpointId) => void
  setLooking: (on: boolean) => void
}>((set) => ({
  viewpoint: 'captain',
  looking: false,
  setViewpoint: (viewpoint) => set({ viewpoint, looking: false }),
  setLooking: (looking) => set({ looking }),
}))

/** 部屋の中の目の位置（m）と向き。Ship が毎フレーム決め、BridgeInterior がその通りに部屋を描く */
export const bridgeEye = {
  pos: new THREE.Vector3(0, 1.25, 0.55),
  yaw: 0,
  pitch: 0,
  quaternion: new THREE.Quaternion(),
}
