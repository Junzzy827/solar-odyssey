import type { bridgeJa } from './bridge.ja'
import type { Translation } from './translation'

// The texts of data/bridge.ts (English). Same keys as bridge.ja.ts

export const bridgeEn: Translation<typeof bridgeJa> = {
  captainsChair: 'Captain’s chair',
  helm: 'Helm',
  atWindow: 'At the window',
  aftRail: 'Aft rail',
  scienceStation: 'Science station',
  fromAbove: 'From above',
}
