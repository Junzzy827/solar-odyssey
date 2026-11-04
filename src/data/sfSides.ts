import { ui } from '../i18n'
import type { LagrangePoint } from '../components/sf/lagrange'

// SF モード：地球と月の5つのラグランジュ点に置いた、番号つきのコロニー群（オリジナルのデザインと名前）。
// 第1コロニー群は L5 の、中へ入れるコロニーのある群（ColonyCluster）。ここには第2〜第7コロニー群を置く。
// L4 と L5 には2つずつ、L1・L2・L3 には1つずつ。第7コロニー群は建設中。
// 第2〜第7の円筒は、第1コロニー群のものより小さい長さ約16km・直径約4km（表示も同じ縮尺で半分の長さ）。

export type ColonyGroup = {
  n: number
  id: string
  point: LagrangePoint
  /** 点からのずらし（表示単位）。radial：地球から外向き、along：月の進む向き、up：月の軌道の面の上 */
  offset: { radial?: number; along?: number; up?: number }
  /** 円筒の数（建設中の骨組みはべつ） */
  count: number
  building?: boolean
}

export const COLONY_GROUPS: ColonyGroup[] = [
  { n: 2, id: 'colony-group-2', point: 'L4', offset: { along: 1.6, up: 0.15 }, count: 3 },
  { n: 3, id: 'colony-group-3', point: 'L2', offset: { radial: 1.8, up: 0.2 }, count: 3 },
  { n: 4, id: 'colony-group-4', point: 'L5', offset: { radial: 3.4, up: -0.2 }, count: 4 },
  { n: 5, id: 'colony-group-5', point: 'L1', offset: { up: 0.15 }, count: 3 },
  { n: 6, id: 'colony-group-6', point: 'L4', offset: { along: -1.6, up: -0.2 }, count: 4 },
  { n: 7, id: 'colony-group-7', point: 'L3', offset: { along: 1.6 }, count: 2, building: true },
]

export const colonyGroupName = (n: number, point: LagrangePoint) => ui().sfSides.colonyGroup(n, point)

export const colonyGroupFound = (g: ColonyGroup) =>
  g.building
    ? ui().sfSides.buildingGroupFound(g.n)
    : ui().sfSides.colonyGroupFound(g.n, g.point, g.count)
