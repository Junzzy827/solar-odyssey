import type { scaleToggleJa } from './scaleToggle.ja'
import type { Translation } from './translation'

// The texts of ui/ScaleToggle.tsx (English). Same keys as scaleToggle.ja.ts

export const scaleToggleEn: Translation<typeof scaleToggleJa> = {
  easy: 'Easy',
  nearReal: 'Near real',
  mid: 'Mid',
  easyNote: 'Everything packed close, small bodies enlarged so they are easy to find',
  nearRealNote: 'Real proportions and real moon distances; planets at about 1/20–1/50 of real spacing',
  midNote: 'Halfway between easy and real',
  scale: 'Scale',
  moonGapFact: (moonGap: string) => `To the Moon: about ${moonGap} Earth diameters (really about 30)`,
  sunSizeFact: (sunSize: string) => `The Sun: about ${sunSize} times Earth (really about 109)`,
  raceScaleNote: 'During the race, the easy-to-see distance and size are used.',
}
