import type { sfEngineJa } from './sfEngine.ja'
import type { Translation } from './translation'

// The texts of data/sfEngine.ts (English). Same keys as sfEngine.ja.ts

export const sfEngineEn: Translation<typeof sfEngineJa> = {
  engineAsteroid: 'Engine Asteroid',
  found: 'The Engine Asteroid comes into view. It is being pushed by its engines from the asteroid belt toward Earth, to be mined.\n(I for the ship’s log)',
}
