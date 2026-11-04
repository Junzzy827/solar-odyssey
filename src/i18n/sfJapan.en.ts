import type { sfJapanJa } from './sfJapan.ja'
import type { Translation } from './translation'

// The texts of data/sfJapan.ts (English). Same keys as sfJapan.ja.ts

export const sfJapanEn: Translation<typeof sfJapanJa> = {
  galacticRailway: 'Galactic Railway',
  moonCapital: 'Moon Capital',
  railwayFound: 'The Galactic Railway comes running along its rails of light. Its windows are lit, and stardust smoke trails from the smokestack.\n(I for the ship’s log)',
  moonCityFound: 'A city of light glows on a crater floor on the far side of the Moon, a place that can never be seen from Earth.\n(I for the ship’s log)',
}
