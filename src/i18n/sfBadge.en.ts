import type { sfBadgeJa } from './sfBadge.ja'
import type { Translation } from './translation'

// The texts of ui/SFBadge.tsx (English). Same keys as sfBadge.ja.ts

export const sfBadgeEn: Translation<typeof sfBadgeJa> = {
  world: 'World',
  realWorldTip: 'Only the real solar system',
  real: 'Real',
  sfWorldTip: 'Show imaginary ships and structures too',
  fiction: 'FICTION',
}
