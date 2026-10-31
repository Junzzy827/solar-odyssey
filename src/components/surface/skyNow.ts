import * as THREE from 'three'
import type { SkyFrame } from './skyClock'

/** 地表の「今」の空：毎フレーム Scene が書き、空・太陽・星・着陸船などが読む */
export type SkyNow = {
  frame: SkyFrame
  /** 太陽の方向（地方。+Y が真上） */
  sunDir: THREE.Vector3
  /** 大気を通った太陽の光の通りやすさ（RGB） */
  sunT: THREE.Vector3
  exposure: number
  /** 夜の深さ（0 = 昼、1 = 夜） */
  night: number
  /** 星の見え方（0〜1） */
  starVis: number
  /** 空に浮かぶ母惑星（地球から見た月など）の方向と、見えている昼側の割合 */
  bodyDir: THREE.Vector3
  bodyLit: number
}
