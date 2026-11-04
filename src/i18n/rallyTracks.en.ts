import type { RallyTracksJa } from './rallyTracks.ja'
import type { Translation } from './translation'

// The texts of data/rallyTracks.ts (English). Same keys as rallyTracks.ja.ts

export const rallyTracksEn: Translation<RallyTracksJa> = {
  coprates: {
    title: 'Canyon trial',
    intro: 'Four rovers race about 1.2 km along the canyon floor. Pass the light gates in order to the finish. Driving onto rocks lifts the wheels: you slow down and can’t steer. Jump over them!',
    button: 'Canyon race',
    home: 'To Gale crater',
  },
  taurus: {
    title: 'Moon valley chase',
    intro: 'A chase through the valley where Apollo 17 landed! Three rovers get a head start: catch up and touch them before the finish, about 1.6 km away. Gravity is 1/6 of Earth’s, so jumps are long: in the air, ◀▶ thrusts you sideways and ▼ brings you down sooner.',
    button: 'Moon chase',
    home: 'Back to the landing site',
  },
}
