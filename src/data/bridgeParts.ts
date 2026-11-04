/** 艦橋の見どころの説明（位置は部屋の座標 m。-Z が前） */
export type BridgePart = {
  id: string
  pos: [number, number, number]
}

/** BridgePart の文言（日本語は src/i18n/bridgeParts.ja.ts、英語は bridgeParts.en.ts） */
export type BridgePartText = {
  name: string
  text: string
}

export const BRIDGE_PARTS: BridgePart[] = [
  {
    id: 'captain',
    pos: [0, 1.65, 0.75],
  },
  {
    id: 'seats',
    pos: [-1.5, 1.4, 0.75],
  },
  {
    id: 'helm',
    pos: [-1.0, 1.25, -2.6],
  },
  {
    id: 'ops',
    pos: [1.0, 1.25, -2.6],
  },
  {
    id: 'window',
    pos: [0, 2.6, -6.2],
  },
  {
    id: 'skylight',
    pos: [0, 4.2, 0],
  },
  {
    id: 'tactical',
    pos: [0, 1.65, 4.2],
  },
  {
    id: 'rail',
    pos: [2.7, 1.5, 2.55],
  },
  {
    id: 'map',
    pos: [0, 2.6, 6.2],
  },
  {
    id: 'stations',
    pos: [-3.6, 2.4, 5.5],
  },
  {
    id: 'lift',
    pos: [-4.5, 2.2, 5.0],
  },
]
