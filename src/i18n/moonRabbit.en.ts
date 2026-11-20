import type { moonRabbitJa } from './moonRabbit.ja'
import type { Translation } from './translation'

// The texts of components/surface/MoonRabbitPanel.tsx (English): the glowing Moon rabbit fairy tale

export const moonRabbitEn: Translation<typeof moonRabbitJa> = {
  hint: '🐇 They say a glowing rabbit appears at lunar dusk…',
  waitDusk: 'Wait for dusk',
  appearTitle: '🐇 A glowing rabbit appeared',
  appearText: 'The rabbit looks at you and gives a little hop. It seems to be saying “follow me”.',
  appearAgain: 'It’s that rabbit again. It wants to show you the way somewhere today, too.',
  follow: 'Follow',
  followRover: 'Follow in the rover',
  later: 'Later',
  following: '🐇 Follow the rabbit',
  left: (m: number) => `${m} m to the Moon garden`,
  waiting: 'The rabbit has turned round and is waiting',
  quit: 'Stop',
  next: 'Next',
  bye: 'Goodbye',
  pageOf: (n: number, total: number) => `${n}/${total}`,
  tale: [
    'You came! I’m the Moon rabbit. People on Earth say I pound rice cakes up here. Today I’ll tell you how the Moon was born.',
    'Long, long ago, about 4.5 billion years ago, a planet the size of Mars called Theia struck the young Earth a glancing blow.',
    'The rock it splashed out circled the Earth and gathered together, and in a very short time it became the round Moon. That is why Moon rocks are so much like Earth rocks.',
    'The newborn Moon was an ocean of molten magma. Light rock floated up and became the white highlands, and later lava flowed out into the dark “seas”. From Earth, those dark patches look like a rabbit.',
    'The rocks the Apollo astronauts brought home helped prove this story. See you again at dusk!',
  ],
  taleNote: 'In real science: this is the giant-impact hypothesis. It is the leading idea, but the details are still being studied.',
  saveLabel: 'Glowing Moon rabbit',
  navButton: '🐇 Glowing Moon rabbit',
}
