import type { pioneerJa } from './pioneer.ja'
import type { Translation } from './translation'
import type { Amounts, Resource, StageId } from '../data/pioneer'

// The texts of the pioneering game (English). Same keys as pioneer.ja.ts

const RES: Record<Resource, string> = { metal: 'metal', ice: 'ice', gas: 'gas' }
const list = (a: Amounts) =>
  (Object.keys(RES) as Resource[])
    .filter((r) => a[r] > 0)
    .map((r) => `${a[r]} ${RES[r]}`)
    .join(', ')

const stageName: Record<StageId, string> = {
  frame: 'Frame',
  hull: 'Hull plating',
  mirror: 'Windows and mirrors',
  spin: 'Start the spin',
  air: 'Air and water',
}

export const pioneerEn: Translation<typeof pioneerJa> = {
  navButton: 'Pioneering',
  saveLabel: 'Pioneering (storehouse and build stage)',
  title: 'Pioneering',
  terminal: 'Pioneering terminal',
  resource: { metal: 'Metal', ice: 'Ice', gas: 'Gas' },
  hold: 'Cargo',
  store: 'Amano-Minato storehouse',
  open: 'Terminal',
  close: 'Close',
  quit: 'Stop pioneering',
  intro: [
    'Break asteroid-belt rocks with the charge beam, and metal and ice fragments fly to your ship.',
    'Skim just above the clouds of Jupiter to collect gas.',
    'Back at Amano-Minato, the cargo goes to the storehouse, and you can build the L5 colony one stage at a time.',
  ],
  goField: 'To the belt mining field',
  goJupiter: 'To Jupiter (gas)',
  goDock: 'To Amano-Minato (unload)',
  goSite: 'Go see the colony under construction',
  nextStage: (name: string) => `Next stage: ${name}`,
  needLine: (list: string) => `Needed: ${list}`,
  short: (a: string) => `${a} to go`,
  ready: 'Ready to build',
  build: 'Build',
  stageName,
  stageScience: {
    frame: 'Real science: large structures are assembled in space. The International Space Station was put together from parts carried up on dozens of flights.',
    hull: 'Real science: the hull holds in the air and blocks space radiation.',
    mirror: "Real science: in O'Neill's design, outside mirrors reflect sunlight through the windows, and their angle makes day and night.",
    spin: 'Real science: spinning makes an outward force that stands in for gravity. With a 3 km radius, one turn in about 2 minutes gives 1 g, the same as on Earth.',
    air: 'Real science: melt ice into water and split it with electricity, and you get oxygen to breathe.',
  },
  stages: (done: number, all: number) => `Stage ${done}/${all}`,
  complete: 'Complete!',
  completeText: 'Your colony is complete. Give it a name.',
  namePlaceholder: 'Settlement No. 1',
  nameOk: 'Set name',
  defaultName: 'Settlement No. 1',
  fieldName: 'Belt mining field',
  resourceScience: {
    metal: 'Real science: some asteroids are rich in metal (such as Psyche), and a probe is on its way there.',
    ice: 'Real science: carbon-rich asteroids hold many minerals that contain water.',
    gas: 'Real science: Jupiter is mostly hydrogen and helium.',
  },
  reset: 'Start over',
  resetConfirm: 'Clear the storehouse and build stage and start over?',
  started: 'Pioneering started. Pick a destination from the terminal',
  stopped: 'Pioneering stopped. Continue any time from Play → Pioneering',
  holdFull: 'Cargo is full. Head back to Amano-Minato to unload',
  delivered: (a: Amounts, ready: boolean) => `Unloaded to the storehouse: ${list(a)}${ready ? '. The next stage can be built (from the terminal)' : ''}`,
  built: (id: StageId) => `Construction advanced: ${stageName[id]}`,
  named: (name: string) => `Your colony is named "${name}". A nameplate is now on the port`,
  gasSkimming: 'Skimming the cloud tops. Gas is collecting',
  gasTooDeep: 'Too deep and too hot to collect gas. Climb a little',
  sfOnly: 'Available in SF mode',
  doneBadge: 'Done',
}
