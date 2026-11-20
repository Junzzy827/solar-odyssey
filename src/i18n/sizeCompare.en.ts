import type { Translation } from './translation'
import type { sizeCompareJa } from './sizeCompare.ja'

// Size comparison (ui/SizeCompare.tsx), English

const n = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 })

export const sizeCompareEn: Translation<typeof sizeCompareJa> = {
  title: 'Size comparison',
  navButton: 'Compare sizes',
  open3d: '🌍 Compare in 3D',
  everest: 'Everest',
  across: (big: string, small: string, count: number) => `About ${n(count)} × ${small} fit across ${big}`,
  vsEverest: (body: string, times: number) => (times >= 1 ? `${body} is about ${n(times)} times as wide as Everest is tall` : `Everest is taller than ${body} is wide!`),
  tapHint: 'Tap one to zoom in',
  back: 'Show all',
  close: 'Close',
  diameter: (km: number) => (km >= 100 ? `${Math.round(km).toLocaleString('en-US')} km` : `${n(km)} km`),
  height: (km: number) => `${n(km)} km high`,
}
