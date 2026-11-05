// 鑑賞モードで紹介する自機の各部と、大きさくらべの物。
// 位置は ShipModel の座標（全長約1.04、前方は -Z）。船の設定はオリジナルの空想で、
// 本物の科学や乗り物と結びつく話をそえる。

/** 自機の設定上の全長（m）。ShipModel の座標の1は約617m */
export const SHIP_LENGTH_M = 640
export const MODEL_LENGTH = 1.037
export const METERS_PER_UNIT = SHIP_LENGTH_M / MODEL_LENGTH

/** カメラの向き：yaw は船の上下の軸まわり（0 で真後ろ、π で真正面）、pitch は見上げ・見下ろし、dist は距離（模型の座標） */
export type View = { yaw: number; pitch: number; dist: number; target: [number, number, number] }

/** side は、その部分が見える向き（反対側から見ているときは名札を消す）。null はどこからでも */
export type ShipPart = { id: string; pos: [number, number, number]; side: [number, number, number] | null; view: View }

/** ShipPart の文言（日本語は src/i18n/ships.ja.ts、英語は ships.en.ts） */
export type ShipPartText = {
  name: string
  text: string
}

export const SHIP_PARTS: ShipPart[] = [
  {
    id: 'saucer',
    pos: [0, 0.1, -0.17],
    side: [0, 1, 0],
    view: { yaw: Math.PI - 0.5, pitch: 0.35, dist: 1.25, target: [0, 0.07, -0.17] },
  },
  {
    id: 'bridge',
    pos: [0, 0.125, -0.16],
    side: [0, 1, 0],
    view: { yaw: Math.PI - 0.7, pitch: 0.3, dist: 0.32, target: [0, 0.115, -0.16] },
  },
  {
    id: 'name',
    pos: [0, 0.105, -0.31],
    side: [0, 1, 0],
    // 船名は後ろから見て読める向き
    view: { yaw: 0, pitch: 0.85, dist: 0.5, target: [0, 0.1, -0.3] },
  },
  {
    id: 'strobe',
    pos: [0, -0.045, 0.448],
    side: [0, 0.4, 1],
    view: { yaw: 0.5, pitch: 0.35, dist: 0.55, target: [0, -0.02, 0.4] },
  },
  {
    id: 'navlights',
    pos: [-0.32, 0.075, -0.17],
    side: [-1, 0, 0],
    view: { yaw: Math.PI + 1.2, pitch: 0.15, dist: 0.6, target: [-0.3, 0.07, -0.17] },
  },
  {
    id: 'impulse',
    pos: [0, 0.085, 0.088],
    side: [0, 0.4, 1],
    view: { yaw: 0.35, pitch: 0.45, dist: 0.45, target: [0, 0.08, 0.08] },
  },
  {
    id: 'deflector',
    pos: [0, -0.085, -0.01],
    side: [0, -0.2, -1],
    view: { yaw: Math.PI - 0.4, pitch: -0.12, dist: 0.5, target: [0, -0.085, 0] },
  },
  {
    id: 'secondary',
    pos: [0, -0.05, 0.22],
    side: null,
    view: { yaw: 1.4, pitch: 0.1, dist: 0.9, target: [0, -0.07, 0.22] },
  },
  {
    id: 'nacelle',
    pos: [0.2, 0.11, 0.35],
    side: [1, 0.4, 0],
    view: { yaw: 1.9, pitch: 0.2, dist: 0.7, target: [0.2, 0.068, 0.35] },
  },
  {
    id: 'collector',
    pos: [0.2, 0.09, 0.14],
    side: [0.3, 0, -1],
    view: { yaw: Math.PI - 0.6, pitch: 0.1, dist: 0.35, target: [0.2, 0.068, 0.15] },
  },
  {
    id: 'coil',
    pos: [0.24, 0.068, 0.3],
    side: [1, 0, 0],
    view: { yaw: 1.57, pitch: 0.05, dist: 0.45, target: [0.22, 0.068, 0.3] },
  },
  {
    id: 'bay',
    pos: [0, -0.06, 0.5],
    side: [0, 0, 1],
    view: { yaw: 0.15, pitch: 0.12, dist: 0.4, target: [0, -0.08, 0.49] },
  },
]

/** 大きさくらべ：自機の横に、本物の大きさで並べる */
export type CompareItem = { id: string; meters: number }

/** CompareItem の文言（日本語は src/i18n/compareItems.ja.ts、英語は compareItems.en.ts） */
export type CompareItemText = {
  name: string
  note: string
}

export const COMPARE: CompareItem[] = [
  { id: 'skytree', meters: 634 },
  { id: 'iss', meters: 109 },
  { id: 'jet', meters: 71 },
  { id: 'hubble', meters: 13 },
]

export const COMPARE_VIEW: View = { yaw: -1.2, pitch: 0.42, dist: 1.9, target: [-0.45, -0.06, 0.04] }
export const DEFAULT_VIEW: View = { yaw: Math.PI - 0.75, pitch: 0.28, dist: 1.6, target: [0, 0, 0.02] }

/** おまかせ（ゆっくり流すカメラ）のショット。from から to へ、ショットの長さをかけて動く */
export const SHOTS: { from: View; to: View }[] = [
  {
    from: { yaw: Math.PI - 0.9, pitch: 0.18, dist: 1.7, target: [0, 0.02, -0.05] },
    to: { yaw: Math.PI - 0.2, pitch: 0.28, dist: 1.25, target: [0, 0.04, -0.1] },
  },
  {
    from: { yaw: Math.PI + 0.5, pitch: -0.32, dist: 0.95, target: [0, 0, -0.12] },
    to: { yaw: Math.PI + 1.1, pitch: -0.2, dist: 0.75, target: [0, 0, -0.05] },
  },
  {
    from: { yaw: 2.3, pitch: 0.06, dist: 0.6, target: [0.2, 0.068, 0.25] },
    to: { yaw: 1.3, pitch: 0.12, dist: 0.5, target: [0.2, 0.068, 0.38] },
  },
  {
    from: { yaw: 0.7, pitch: 0.3, dist: 1.0, target: [0, -0.02, 0.38] },
    to: { yaw: -0.5, pitch: 0.36, dist: 1.15, target: [0, 0, 0.3] },
  },
  {
    from: { yaw: -0.3, pitch: 1.15, dist: 1.9, target: [0, 0, 0] },
    to: { yaw: 0.6, pitch: 1.0, dist: 1.6, target: [0, 0, -0.05] },
  },
]
export const SHOT_SECONDS = 10
