import type { racePanelJa } from './racePanel.ja'
import type { Translation } from './translation'

// The texts of ui/RacePanel.tsx (English). Same keys as racePanel.ja.ts

export const racePanelEn: Translation<typeof racePanelJa> = {
  raceResults: 'Race results',
  youWon: 'Finish! You beat your rival',
  rivalWon: 'Finish! Your rival won',
  you: 'You',
  rival: 'Rival',
  stillFlying: 'still flying',
  best: 'Best',
  newRecord: 'New record',
  raceAgain: 'Race again',
  done: 'Done',
  rings: 'Rings',
  swingByBoost: 'Swing-by boost',
  quit: 'Quit',
}
