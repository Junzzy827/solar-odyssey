import type { contextLostJa } from './contextLost.ja'
import type { Translation } from './translation'

// The texts of ui/ContextLost.tsx (English). Same keys as contextLost.ja.ts

export const contextLostEn: Translation<typeof contextLostJa> = {
  drawingStopped: '3D drawing stopped (this device ran out of graphics power).',
  reload: 'Reload',
}
