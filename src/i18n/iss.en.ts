// 宇宙ステーション（ISS）の一日（components/iss/）の文言（英語）
import type { issJa } from './iss.ja'
import type { Translation } from './translation'

export const issEn: Translation<typeof issJa> = {
  title: 'A Day on the Space Station',
  saveLabel: 'Space station record',
  loading: 'Going to the space station…',
  exit: 'Back',
  modules: {
    destiny: { name: 'Destiny', sub: 'The US lab' },
    unity: { name: 'Unity', sub: 'A connecting room' },
    harmony: { name: 'Harmony', sub: 'Bedrooms and docks' },
    tranquility: { name: 'Tranquility', sub: 'Toilet and exercise' },
    cupola: { name: 'Cupola', sub: 'The window on Earth' },
    quest: { name: 'Quest', sub: 'The door to space' },
    columbus: { name: 'Columbus', sub: 'The European lab' },
    kiboPm: { name: 'Kibo lab', sub: 'The Japanese lab' },
    kiboElm: { name: 'Kibo storage', sub: 'The Japanese store room' },
    leonardo: { name: 'Leonardo', sub: 'Store room' },
    beam: { name: 'BEAM', sub: 'An inflatable room' },
    bishop: { name: 'Bishop', sub: 'A small airlock' },
  },
  nameSep: ' · ',
  outer: {
    russian: 'Russian segment beyond',
    dock: 'A spacecraft docks here',
    berth: 'Cargo ships attach here',
    closed: 'This hatch stays closed',
    space: 'Space outside: the spacewalk door',
  },
  map: {
    open: 'Map',
    title: 'Station map',
    here: 'You are here',
    visited: 'Rooms visited',
    close: 'Tap to close',
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
}
