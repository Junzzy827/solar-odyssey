import type { logPanelJa } from './logPanel.ja'
import type { Translation } from './translation'

// The texts of ui/LogPanel.tsx (English). Same keys as logPanel.ja.ts

export const logPanelEn: Translation<typeof logPanelJa> = {
  diameter: 'Diameter',
  temperature: 'Temperature',
  gravity: 'Gravity',
  dayLength: 'Length of day',
  yearLength: 'Year (orbit)',
  moons: 'Moons',
  shipsLog: 'Ship’s log',
  shipsLogPrefix: 'Ship’s log: ',
  fictionBadge: 'SF · fiction',
  explored: 'Explored',
  close: 'Close',
  inRealScience: 'In real science',
  lookThroughScope: 'Look through the telescope',
  flyCloseToScope: 'Fly close to look through the telescope',
  correct: 'Correct!',
  notQuite: 'Not quite!',
  tryAgain: 'Try again',
  keyHintStart: ' (',
  keyHintEnd: ' to open/close)',
}
