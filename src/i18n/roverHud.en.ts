import type { roverHudJa } from './roverHud.ja'
import type { Translation } from './translation'

// The texts of components/surface/RoverHud.tsx (English). Same keys as roverHud.ja.ts

export const roverHudEn: Translation<typeof roverHudJa> = {
  heading: 'HDG',
  tilt: 'TILT',
  distance: 'DIST',
  rock: 'ROCK',
  done: 'done',
  air: 'AIR',
  rcsTip: 'Thruster propellant (◀▶ and ▼ in the air)',
  rcs: 'RCS',
  showMinimap: 'Show the minimap',
  map: 'Map',
  minimap: 'Minimap',
  hideMinimap: 'Hide the minimap',
  near: 'Near',
  all: 'All',
}
