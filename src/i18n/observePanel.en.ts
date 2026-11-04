import type { observePanelJa } from './observePanel.ja'
import type { Translation } from './translation'

// The texts of ui/ObservePanel.tsx (English). Same keys as observePanel.ja.ts

export const observePanelEn: Translation<typeof observePanelJa> = {
  holdingStill: 'Holding still',
  lapTime: (clockwise: boolean, lap: number) => `${clockwise ? 'Right' : 'Left'} · ${lap} s per lap`,
  observing: 'Observing',
  headingToBerth: 'Heading to the berth…',
  headingToPort: 'Heading to the port…',
  touchHint: 'Stick up/down: distance · left/right: orbit speed · drag: position and angle · up/down buttons: tilt',
  keysHint: 'W/S distance · A/D orbit speed/direction · Space/Shift tilt · mouse: position and angle',
  cancelBerth: 'Cancel',
  cancelDock: 'Cancel',
  berth: 'Berth (into the dock)',
  dock: 'Dock (go to the port)',
  stopObserving: 'Stop observing',
}
