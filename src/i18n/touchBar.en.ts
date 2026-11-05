import type { touchBarJa } from './touchBar.ja'
import type { Translation } from './translation'

// The texts of ui/TouchBar.tsx (English). Same keys as touchBar.ja.ts

export const touchBarEn: Translation<typeof touchBarJa> = {
  menu: 'Menu',
  cockpit: 'Cockpit',
  map: 'Map',
  navigate: 'Navigate',
  scale: 'Scale',
  log: 'Log',
  news: 'News',
  outside: 'Outside',
  bridge: 'Bridge',
  ship: 'Ship',
  eva: 'EVA',
  switchRealSf: 'Switch Real / SF',
  real: 'Real',
  close: 'Close',
}
