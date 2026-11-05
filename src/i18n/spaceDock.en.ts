import type { spaceDockJa } from './spaceDock.ja'
import type { Translation } from './translation'

// The texts of components/sf/SpaceDock.tsx (English). Same keys as spaceDock.ja.ts

export const spaceDockEn: Translation<typeof spaceDockJa> = {
  entering: 'Entering the main dock. Following the guide lights to the berth',
  berthed: 'Berthed in the main dock. Thrust forward (W) to depart',
  mooredOutside: 'This ship is too big for the main dock, so it is moored alongside the outer tower. Thrust (W) to depart',
  arrived: 'Arrived at Amano-Minato. Observing now; press Berth to go into the dock',
}
