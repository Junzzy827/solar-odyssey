import { create } from 'zustand'
import { COMPARE_VIEW, DEFAULT_VIEW, SHIP_PARTS, type View } from '../data/shipParts'
import { useStore } from './store'
import { raceActive } from './race'

// 鑑賞モード：止まった自機のまわりをカメラで回り、各部の名前と説明、大きさくらべを見る

type GalleryState = {
  /** 説明を出している部分 */
  part: string | null
  /** おまかせ：ゆっくり流れるカメラで、いくつかの角度から順に見せる */
  auto: boolean
  /** 大きさくらべの物を船の横に並べる */
  compare: boolean
  /** 各部の名札 */
  labels: boolean
}

export const useGallery = create<GalleryState>(() => ({ part: null, auto: false, compare: false, labels: true }))

/** 船のまわりの名札（画面の上の要素）。位置は船の座標で、カメラを動かした直後に画面の位置へ直す */
export type GalleryAnchor = { el: HTMLElement; pos: [number, number, number]; side: [number, number, number] | null }
export const galleryAnchors = new Map<string, GalleryAnchor>()

/** カメラが向かう視点（ドラッグ・部分の選択・大きさくらべで変わる）。描画のたびに読むので、React の外に置く */
export const galleryGoal: View = { ...DEFAULT_VIEW, target: [...DEFAULT_VIEW.target] }

export function setGoal(v: View) {
  galleryGoal.yaw = v.yaw
  galleryGoal.pitch = v.pitch
  galleryGoal.dist = v.dist
  galleryGoal.target = [...v.target]
}

/** 鑑賞モードに入れるとき（ワープ中・レース中・望遠鏡を見ているあいだは入れない） */
export function canOpenGallery() {
  const s = useStore.getState()
  return s.warpPhase === 'idle' && !s.scope && !raceActive()
}

export function openGallery() {
  if (!canOpenGallery()) return
  if (document.pointerLockElement) document.exitPointerLock()
  const s = useStore.getState()
  s.setAutopilot(false)
  setGoal(DEFAULT_VIEW)
  useGallery.setState({ part: null, auto: false, compare: false })
  s.setMode('gallery')
}

export function closeGallery() {
  useStore.getState().setMode('flight')
}

export function selectPart(id: string | null) {
  const part = SHIP_PARTS.find((p) => p.id === id)
  useGallery.setState({ part: part ? part.id : null, auto: false, compare: false })
  setGoal(part ? part.view : DEFAULT_VIEW)
}

export function toggleCompare() {
  const compare = !useGallery.getState().compare
  useGallery.setState({ compare, auto: false, part: null })
  setGoal(compare ? COMPARE_VIEW : DEFAULT_VIEW)
}

export function toggleAuto() {
  const auto = !useGallery.getState().auto
  useGallery.setState({ auto, part: null, compare: false })
  if (!auto) setGoal(DEFAULT_VIEW)
}

/** マウスで動かしたら、おまかせは止める */
export function stopAuto() {
  if (useGallery.getState().auto) useGallery.setState({ auto: false })
}
