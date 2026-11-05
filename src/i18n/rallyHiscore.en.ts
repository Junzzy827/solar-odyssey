import type { rallyHiscoreJa } from './rallyHiscore.ja'
import type { Translation } from './translation'

// The texts of components/surface/RallyHiscore.tsx and RallyGhost.tsx (English). Same keys as rallyHiscore.ja.ts

const ORD = ['1st', '2nd', '3rd', '4th']

export const rallyHiscoreEn: Translation<typeof rallyHiscoreJa> = {
  hiscores: 'Hiscores',
  thisRun: (rank: number) => `this run: #${rank}`,
  noRecords: 'No finished races yet',
  you: 'You',
  roversCaught: 'Rovers caught',
  place: (place: number) => ORD[place - 1] ?? `#${place}`,
}
