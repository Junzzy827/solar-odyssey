// components/walk/WalkView.tsx・state/walk.ts の文言（英語）
import type { walkJa } from './walk.ja'
import type { Translation } from './translation'

export const walkEn: Translation<typeof walkJa> = {
  park: 'Park by the pond',
  gravity: '1 g from the spin',
  day: 'Day',
  dusk: 'Dusk',
  night: 'Night',
  backToShip: 'Back to the ship',
  view: 'View',
  viewChase: 'Behind',
  viewEye: 'My eyes',
  sit: 'Sit on the bench',
  stand: 'Stand up',
  jump: 'Jump',
  run: 'Run',
  walkTo: (name: string) => `Go down and walk in ${name}`,
  keysHint: 'W A S D walk · Shift run · Space jump · Mouse look (click to lock) · Wheel distance · E sit · V view · J ship',
  arrived: (name: string) => `You are in a park in ${name}. Look up: the land on the far side is your sky`,
}
