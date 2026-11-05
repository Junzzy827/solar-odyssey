import type { LagrangePoint } from '../components/sf/lagrange'
import type { sfSidesJa } from './sfSides.ja'
import type { Translation } from './translation'

// The texts of data/sfSides.ts (English). Same keys as sfSides.ja.ts

export const sfSidesEn: Translation<typeof sfSidesJa> = {
  colonyGroup: (n: number, point: LagrangePoint) => `Colony Group ${n} (${point})`,
  buildingGroupFound: (n: number) => `Colony Group ${n} comes into view. Two colonies are finished, and the frame of a third is being put together.\n(I for the ship’s log)`,
  colonyGroupFound: (n: number, point: LagrangePoint, count: number) => `Colony Group ${n} comes into view. ${count} cylinder colonies float together at ${point}.\n(I for the ship’s log)`,
}
