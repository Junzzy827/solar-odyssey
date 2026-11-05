import type { cubeJa } from './cube.ja'
import type { Translation } from './translation'

// The texts of data/cube.ts (English). Same keys as cube.ja.ts

export const cubeEn: Translation<typeof cubeJa> = {
  mysteriousCubeShip: 'Mysterious Cube Ship',
  found: 'You found a giant cube-shaped ship! Fly in slowly and take a closer look.\n(I for the ship’s log)',
}
