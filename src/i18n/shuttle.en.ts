import type { Translation } from './translation'
import type { shuttleJa } from './shuttle.ja'

// Space Shuttle crew cabin (components/shuttle/*), English. Facts: tools/shuttle/FACTS.md

export const shuttleEn: Translation<typeof shuttleJa> = {
  enter: '🚀 Inside the Shuttle (sample)',
  enterTip: 'Float through the Space Shuttle crew cabin in zero gravity',
  loading: 'To the Shuttle crew cabin…',
  exit: '✕ Back',
  exitTip: 'Back to free flight',
  deck: { flight: 'Flight deck', mid: 'Middeck' },
  mission: 'STS-61 · December 1993 · about 590 km up',
  light: { day: '☀ Lights', dark: '🌙 Night' },
  lightTip: { day: 'Lights off, over the night side of Earth', dark: 'Lights on, back to the day side' },
  help: {
    pc: ['WASD / arrows: push gently', 'Click, then mouse: look around (Esc to release)', 'Space / Shift: up / down'],
    touch: ['Left stick: push gently', 'Drag the screen: look around', '↑ ↓: up / down'],
  },
  up: 'Up',
  down: 'Down',
  spot: { seat: "💺 Take the commander's seat", arm: '🦾 Work the robot arm', bag: '🛌 Climb into the sleeping bag' },
  leave: 'Let go',
  seatHelp: { pc: 'WASD: move the control stick', touch: 'Stick: move the control stick' },
  armHelp: { pc: 'WASD: left handle   Arrows: right handle', touch: 'Stick: move the handles' },
  bagHelp: 'Good night, for a while',
  card: {
    seat: ['From this seat the commander', 'flew by hand, gently, up to Hubble', '(flight day 3)'],
    arm: ['Watching through the back windows,', 'two hand controllers move a long arm', 'This arm caught Hubble'],
    bag: ['Eight hours of sleep a day', 'There is no up or down,', 'so the bag is tied to the wall'],
  },
  saveLabel: 'Space Shuttle crew cabin',
}
