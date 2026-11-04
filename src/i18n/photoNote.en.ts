import type { photoNoteJa } from './photoNote.ja'
import type { Translation } from './translation'

// The texts of ui/PhotoNote.tsx (English). Same keys as photoNote.ja.ts

export const photoNoteEn: Translation<typeof photoNoteJa> = {
  noStars: 'Space photos show almost no stars because a sunlit planet is far brighter than the stars. When the camera is set for the planet, the faint stars do not show up. In this mode, stars fade out when a bright world fills the screen.',
  gasGiantEdge: 'The edge of a gas giant like Jupiter looks darker because at the edge we look through the air at a slant, so the upper haze hides the bright, deeper clouds (limb darkening). The Sun’s edge is darker for the same reason.',
  airlessWorlds: 'Worlds with no air, like the Moon and Mercury, have a sharp line between day and night, and a full Moon is bright right to its edge. Near that line, long shadows make craters stand out.',
  enhancedColor: 'Many published spacecraft pictures are “enhanced-color” images, with colors boosted so the details are easier to see. Illustrated mode is close to that style.',
  label: 'About Photographic mode',
  title: 'Photographic mode: what a camera would see',
  neverAgain: 'Don’t show this again',
  close: 'Close',
}
