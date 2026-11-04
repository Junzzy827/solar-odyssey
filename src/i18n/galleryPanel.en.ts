import type { galleryPanelJa } from './galleryPanel.ja'
import type { Translation } from './translation'

// The texts of ui/GalleryPanel.tsx (English). Same keys as galleryPanel.ja.ts

export const galleryPanelEn: Translation<typeof galleryPanelJa> = {
  viewingMode: 'Viewing mode',
  shipSummary: (registry: string, name: string, kind: string, len: number) => `${registry} ${name} (${kind.toLowerCase()}, about ${len} m long)`,
  autoTour: 'Auto tour',
  compareSizes: 'Compare sizes',
  labels: 'Labels',
  comparedAtRealSize: 'Compared at real size',
  shipLength: (registry: string, len: number) => `${registry}: ${len} m`,
  fromStory: ' (from this ship’s story)',
  compareLength: (name: string, meters: number) => `${name}: ${meters} m`,
  compareNote: (note: string) => ` (${note})`,
  enterBridge: '▶ Go inside the bridge',
  autoTourNote: 'Shows the ship slowly from several angles. Drag to take over.',
  touchHint: 'Drag to rotate and pinch to zoom. Tap a label or the list below to read about that part.',
  mouseHint: 'Drag to rotate and scroll to zoom. Click a label or the list below to read about that part.',
  shipParts: 'Parts of the ship',
  fictionNote: 'This ship’s design and story are original to this app and imaginary.',
  backToCockpit: 'Back to the cockpit',
}
