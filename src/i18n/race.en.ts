import type { raceJa } from './race.ja'
import type { Translation } from './translation'

// The texts of state/race.ts (English). Same keys as race.ja.ts

export const raceEn: Translation<typeof raceJa> = {
  raceStart: 'Race start! Fly through the glowing rings in order, pass close to Jupiter, swing by Saturn and head back to Mars.',
  pastJupiter: 'Past Jupiter! It is the biggest planet in the solar system, big enough to hold more than 1,300 Earths.',
  swingByComplete: 'Swing-by complete! Borrowing a planet’s gravity lets you speed up and change direction without using fuel. The Voyager probes used this trick at Jupiter and Saturn.',
  finishNote: 'The real Voyager 2 probe used swing-bys to visit Jupiter, Saturn, Uranus and Neptune one after another, reaching Neptune 12 years after launch.',
  noWarp: 'Warp and autopilot are off during the race. Fly it yourself!',
}
