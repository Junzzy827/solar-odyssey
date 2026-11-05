import type { touchControlsJa } from './touchControls.ja'
import type { Translation } from './translation'

// The texts of ui/TouchControls.tsx (English). Same keys as touchControls.ja.ts

export const touchControlsEn: Translation<typeof touchControlsJa> = {
  gettingReady: 'Getting ready…',
  warp: 'Warp',
  auto: 'Auto',
  observe: 'Observe',
  rollLeft: 'Roll left',
  rollRight: 'Roll right',
  up: 'Up',
  down: 'Down',
  launch: 'Launch',
  camera: 'Camera',
  beam: 'Beam',
  beamTip: 'Beam (hold to charge)',
}
