// 宇宙ステーション（ISS）の一日（components/iss/）の文言（英語）
import type { issJa } from './iss.ja'
import type { Translation } from './translation'

export const issEn: Translation<typeof issJa> = {
  title: 'A Day on the Space Station',
  saveLabel: 'Space station record',
  loading: 'Going to the space station…',
  exit: 'Back',
  modules: {
    destiny: { name: 'Destiny laboratory', sub: 'The US lab' },
    unity: { name: 'Node 1 “Unity”', sub: 'A connecting room' },
    harmony: { name: 'Node 2 “Harmony”', sub: 'A connecting room' },
    tranquility: { name: 'Node 3 “Tranquility”', sub: 'The living room' },
    cupola: { name: 'Cupola', sub: 'The window on Earth' },
    quest: { name: 'Quest airlock', sub: 'The door for spacewalks' },
    columbus: { name: 'Columbus laboratory', sub: 'The European lab' },
    kiboPm: { name: 'Kibo laboratory', sub: 'The Japanese lab' },
    kiboElm: { name: 'Kibo storage room', sub: 'The Japanese store room' },
    leonardo: { name: 'Leonardo', sub: 'Store room' },
    beam: { name: 'BEAM', sub: 'An inflatable room' },
    bishop: { name: 'Bishop', sub: 'A small airlock' },
  },
  help: 'WASD / arrows to move · drag to look · Space / Shift up and down',
  helpTouch: 'Left circle to move · swipe right side to look',
  up: 'Up',
  down: 'Down',
  flip: 'Flip',
  spots: {
    water: {
      name: 'Water ball',
      lines: ['Water does not fall here. It floats as a ball.', 'Poke it: it wobbles and splits.', 'Air bubbles in it do not rise, either.'],
    },
    bike: {
      name: 'Exercise bike',
      lines: ['In space, astronauts exercise about 2 hours a day.', 'Without it, bones and muscles get weak.', 'Feet on the pedals, a belt holds you on.'],
    },
    window: {
      name: 'Earth window',
      lines: ['A window in the floor looks straight down at Earth.', 'The station flies about 400 km up.', 'It goes around Earth in about 90 minutes.'],
    },
  },
  bikeOff: 'Get off',
  close: 'Close',
  soon: 'More to come beyond this hatch',
}
