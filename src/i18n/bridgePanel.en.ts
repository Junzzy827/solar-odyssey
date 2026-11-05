import type { bridgePanelJa } from './bridgePanel.ja'
import type { Translation } from './translation'

// The texts of ui/BridgePanel.tsx (English). Same keys as bridgePanel.ja.ts

export const bridgePanelEn: Translation<typeof bridgePanelJa> = {
  leaveBridge: '◀ Leave the bridge',
  lookTouchHint: 'Tap “Look around” and drag to turn your head',
  lookMouseHint: 'Hold the right button and move the mouse to look around',
  coastingHint: 'The ship coasts to a stop. Drag to look around (go back to the captain’s chair to fly)',
  backToWindow: 'Back to the window',
  zoomOnTarget: 'Zoom on target',
  zoomAhead: 'Zoom ahead',
  hideLabels: 'Hide labels',
  showLabels: 'Show labels',
  backToFlying: 'Back to flying',
  lookAround: 'Look around',
  close: 'Close',
}
