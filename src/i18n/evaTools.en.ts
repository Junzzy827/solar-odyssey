import type { evaToolsJa } from './evaTools.ja'
import type { Translation } from './translation'

// The texts of state/eva.ts (English). Same keys as evaTools.ja.ts

export const evaToolsEn: Translation<typeof evaToolsJa> = {
  hand: 'Hand',
  drill: 'Drill',
  cutter: 'Cutter',
  welder: 'Welder',
  pad: 'Suction pad',
}
