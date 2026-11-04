import type { throttleJa } from './throttle.ja'
import type { Translation } from './translation'

// The texts of ui/Throttle.tsx (English). Same keys as throttle.ja.ts

export const throttleEn: Translation<typeof throttleJa> = {
  deadSlow: 'Dead slow',
  slow: 'Slow',
  half: 'Half',
  cruise: 'Cruise',
  fast: 'Fast',
  full: 'Full',
  wheelTip: 'Scroll the mouse wheel while flying (up = faster, down = slower)',
  thrust: 'Thrust',
  speed: 'Speed',
  thrustLevel: 'Thrust level',
  wheelHint: 'Mouse wheel to change',
  slower: 'Slower',
  faster: 'Faster',
}
