import type { playCardsJa } from './playCards.ja'
import type { Translation } from './translation'

// The picture cards of the nav computer's Play tab (ui/nav/PlayCards.tsx and ui/nav/entries/*.ts)

export const playCardsEn: Translation<typeof playCardsJa> = {
  shelves: {
    feats: 'Historic feats',
    story: 'Stories',
    free: 'Free play',
  },
  shelfNotes: {
    feats: 'Real space journeys, flown by you',
    story: 'Stories that go on. Play a bit at a time',
    free: 'Play right away. Stop any time',
  },
  recommend: '★ Try next',
  playing: 'Playing now',
  tried: '✓ Done',
  chapterOf: (n: number, total: number) => `Chapter ${n} / ${total}`,
  saveTried: 'Cards played in the Play tab',
  cards: {
    moonMission: { title: 'Apollo 17', desc: 'Fly a crew to the Moon, from launch to landing' },
    voyager2: { title: 'Voyager 2', desc: 'The grand tour of the four giant planets' },
    hayabusa2: { title: 'Hayabusa2', desc: 'Touch down on asteroid Ryugu' },
    missions: { title: 'Story mode', desc: 'Earn stars on each ship’s missions' },
    campaign: { title: 'The Professor’s Survey Team', desc: 'Hunt for rocks on the Moon and Mars' },
    pioneer: { title: 'Pioneering', desc: 'Gather resources and build a colony' },
    landMars: { title: 'Land on Mars', desc: 'Drive a rover across the red ground' },
    skyFlight: { title: 'Fly over the Moon', desc: 'Skim the Moon in the lander' },
    eva: { title: 'Spacewalk', desc: 'Fly around the ship with Tsumugi' },
    evaRepair: { title: 'Hull repairs', desc: 'Fix the ship’s hull with Tsumugi' },
    walk: { title: 'Colony park', desc: 'Stroll by the pond' },
    colonyAxis: { title: 'Colony axis', desc: 'Ride the elevator to the centre' },
  },
}
