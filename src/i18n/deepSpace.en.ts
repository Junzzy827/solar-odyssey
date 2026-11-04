import type { deepSpaceJa } from './deepSpace.ja'
import type { Translation } from './translation'

// The texts of data/deepSpace.ts (English). Same keys as deepSpace.ja.ts

export const deepSpaceEn: Translation<typeof deepSpaceJa> = {
  visibleExplained: 'visible light (the light our eyes can see)',
  infraredExplained: 'infrared (heat light our eyes cannot see)',
  visible: 'visible',
  infrared: 'infrared',
}
