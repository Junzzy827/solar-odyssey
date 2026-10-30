import type { MissionText } from '../data/missions'

// Story mode text (English). Same ids and order as missions.ja.ts. The narrator is the ship's navigation AI, NAVI.

export const missionsEn: Record<string, MissionText> = {
  'moon-supply': {
    title: 'Supplies for the Moon base',
    client: 'Tranquility Station, Moon base',
    briefing: [
      'Welcome aboard, Captain. I am NAVI, this ship’s navigation AI.',
      'Our first mission is to deliver food and water to the Moon base. The Moon is about 384,000 km from Earth: 1.3 seconds for light, and about 3 days for the Apollo spacecraft.',
    ],
    steps: [
      {
        goal: 'Head to the Moon',
        start: 'I have set the Moon as our target. Press Warp (Enter) to jump there, or use autopilot (G). You can also fly there yourself.',
        done: 'We have reached the Moon. The Moon always shows the same face to Earth, because it takes the same 27 days to spin once and to circle Earth once.',
      },
      {
        goal: 'Stay near the Moon and unload',
        start: 'Please stay close to the Moon while we unload the cargo.',
        done: 'Unloading complete! The Moon’s gravity is about one sixth of Earth’s. A 60 kg package feels like about 10 kg there.',
      },
    ],
    summary: ['The Moon is about 384,000 km away: 1.3 seconds at the speed of light.', 'The Moon spins once and orbits once in the same 27 days, so the same face always points at Earth.', 'The Moon’s gravity is about one sixth of Earth’s.'],
    quiz: [
      {
        question: 'About how strong is the Moon’s gravity compared with Earth’s?',
        choices: ['Twice as strong', 'Half', 'One sixth'],
        answer: 2,
        explanation: 'The Moon is small and light, so its gravity is about one sixth of Earth’s. Astronauts bounced as they walked on it.',
      },
      {
        question: 'Why do we always see the same side of the Moon from Earth?',
        choices: ['The Moon does not spin', 'The Moon spins once in the same time it takes to orbit Earth', 'The far side is always dark'],
        answer: 1,
        explanation: 'The Moon spins once in about 27 days and orbits Earth in the same 27 days, so it always faces us the same way. The far side has day and night too.',
      },
    ],
  },

  'mars-parts': {
    title: 'Parts for the Mars base',
    client: 'Mars research base',
    briefing: [
      'The Mars research base is short of parts for its water-making machine. Let’s deliver them.',
      'A real rocket takes about 7 months to reach Mars, and the best “launch window”, when Earth and Mars line up well, comes only about once every 26 months.',
    ],
    steps: [
      {
        goal: 'Head to Mars',
        start: 'I have set Mars as our target.',
        done: 'We have reached Mars. It looks red because its sand and rocks contain a lot of rust (iron oxide).',
      },
      {
        goal: 'Stay near Mars and unload the parts',
        start: 'Please stay close to Mars while we unload the parts.',
        done: 'Parts delivered! Mars has the tallest mountain in the solar system, Olympus Mons, about 22,000 m high, roughly six times Mount Fuji.',
      },
      {
        goal: 'Observe the moon Phobos (stay close)',
        start: 'Before we leave, let’s study Mars’s moon Phobos. I have set it as our target. The scan starts when we get close.',
        done: 'Scan complete. Phobos is slowly getting closer to Mars. In 30 to 50 million years Mars’s gravity may break it apart into a ring.',
      },
    ],
    summary: ['Mars is about 7 months away, and the launch window comes about every 26 months.', 'Mars is red because of rusty sand and rocks.', 'The moon Phobos is slowly getting closer to Mars.'],
    quiz: [
      {
        question: 'Why does Mars look red?',
        choices: ['Its surface is very hot', 'Its sand and rocks contain a lot of rust', 'It is covered in red plants'],
        answer: 1,
        explanation: 'Mars’s sand and rocks contain a lot of iron oxide (rust), which gives them a reddish color.',
      },
      {
        question: 'How often does a good launch window from Earth to Mars come around?',
        choices: ['Every month', 'About every 26 months', 'About every 100 years'],
        answer: 1,
        explanation: 'Earth and Mars circle the Sun at different speeds, so they line up well only about once every 26 months (2 years and 2 months).',
      },
    ],
  },

  'asteroid-deflect': {
    title: 'Nudge the asteroid',
    client: 'Asteroid Watch Center, Earth',
    briefing: [
      'A small asteroid heading our way has been found. It is not dangerous right now, but decades from now its path crosses Earth’s.',
      'Real space agencies work on this problem too. In 2022, NASA’s DART spacecraft crashed into the asteroid Dimorphos and successfully changed its orbit.',
      'This time we will warm the asteroid’s surface with our beam, so the gas that shoots out gives it a small push and moves its path.',
    ],
    steps: [
      {
        goal: 'Head to Earth',
        start: 'I have set Earth as our target. We will look for the asteroid near Earth.',
        done: 'We have reached Earth... I see the asteroid nearby!',
      },
      {
        goal: 'Hit the asteroid with the beam to change its path',
        start:
          'I have set the asteroid as our target. Get close, aim, and fire the beam (F key or click, or the beam button on a phone). The orange dotted line shows where it is heading now.',
        hits: ['Hit! Gas is shooting out and its path has shifted a little.', 'Again! The dotted line is nearing the edge of Earth.', ''],
        done: 'Its path now misses Earth! The asteroid will pass by safely. The earlier we find one, the smaller the push we need.',
      },
    ],
    summary: ['A small push can change an asteroid’s path. The earlier we find it, the smaller the push.', 'In 2022, the DART spacecraft really did change an asteroid’s orbit.', 'Telescopes around the world watch for asteroids that come near Earth.'],
    quiz: [
      {
        question: 'What matters most when steering an asteroid away from Earth?',
        choices: ['Finding it as early as possible', 'Making the biggest explosion possible', 'Waiting until it gets very close'],
        answer: 0,
        explanation: 'While it is far away, a tiny push adds up to a big miss by the time it reaches Earth. That is why people watch for asteroids all around the world.',
      },
      {
        question: 'What did the DART spacecraft do in 2022?',
        choices: ['Landed on an asteroid and brought back rocks', 'Crashed into an asteroid and changed its orbit', 'Smashed an asteroid to pieces'],
        answer: 1,
        explanation: 'DART hit the asteroid Dimorphos at about 6 km per second and shortened the time it takes to circle its parent asteroid by about 32 minutes. Japan’s Hayabusa and Hayabusa2 were the ones that brought back rocks.',
      },
    ],
  },

  'jupiter-cargo': {
    title: 'Instruments for Jupiter’s moon',
    client: 'Ganymede Observatory',
    briefing: [
      'We are delivering new instruments to the observatory on Ganymede, Jupiter’s moon. Ganymede is the largest moon in the solar system, bigger than the planet Mercury.',
      'Real spacecraft save fuel by borrowing a planet’s gravity to change speed and direction. This is called a gravity assist, or swing-by. Let’s try one at Jupiter.',
    ],
    steps: [
      {
        goal: 'Head to Jupiter',
        start: 'I have set Jupiter as our target. Warp when ready.',
        done: 'We have reached Jupiter, the largest planet in the solar system. More than 1,300 Earths would fit inside it.',
      },
      {
        goal: 'Skim just above Jupiter’s clouds (swing-by)',
        start: 'Fly down toward Jupiter’s clouds yourself. Once your height drops to about Jupiter’s radius, the swing-by is a success. The ship slows down as you get closer.',
        done: 'Swing-by complete! Passing close to a planet lets its gravity change your speed and direction without using fuel. Voyager used this trick to travel from Jupiter to Saturn.',
      },
      {
        goal: 'Head to Ganymede',
        start: 'I have set Ganymede as our target.',
        done: 'We have reached Ganymede.',
      },
      {
        goal: 'Stay near Ganymede and unload the instruments',
        start: 'Please stay close to Ganymede while we unload the instruments.',
        done: 'Instruments delivered! Ganymede is the only moon known to make its own magnetic field.',
      },
    ],
    summary: ['Jupiter is the largest planet. More than 1,300 Earths would fit inside.', 'A swing-by borrows a planet’s gravity to change speed or direction without fuel.', 'Ganymede is the largest moon in the solar system, bigger than Mercury.'],
    quiz: [
      {
        question: 'What does a spacecraft borrow during a swing-by?',
        choices: ['The planet’s gravity', 'The planet’s air', 'Sunlight'],
        answer: 0,
        explanation: 'Passing close to a planet, its gravity pulls the spacecraft and changes its speed and direction, so it can travel far using very little fuel.',
      },
      {
        question: 'Which is the largest moon in the solar system?',
        choices: ['The Moon', 'Ganymede', 'Titan'],
        answer: 1,
        explanation: 'Ganymede is about 5,270 km across, bigger than Mercury (about 4,880 km). Saturn’s Titan comes second.',
      },
    ],
  },

  'io-europa': {
    title: 'The volcano moon and the ice moon',
    client: 'Planetary Science Institute',
    briefing: ['Jupiter’s moons are very different worlds. Let’s observe volcanic Io and icy Europa.'],
    steps: [
      {
        goal: 'Observe Io (stay close)',
        start: 'I have set Io as our target. The scan starts when we get close.',
        done: 'Io has more than 400 volcanoes, the most volcanically active place in the solar system. Jupiter’s strong gravity kneads it and heats its inside.',
      },
      {
        goal: 'Observe Europa (stay close)',
        start: 'Next is Europa. Target set.',
        done: 'Under Europa’s ice there may be an ocean with more water than all of Earth’s oceans combined. The Europa Clipper spacecraft is on its way to study it as a place where life might exist.',
      },
    ],
    summary: ['Io is the most volcanically active world. Jupiter’s gravity keeps its inside hot.', 'A large ocean of water is thought to lie under Europa’s ice.', 'Moons of the same planet can be completely different worlds.'],
    quiz: [
      {
        question: 'Why does Io have so many volcanoes?',
        choices: ['It is very close to the Sun', 'Jupiter’s gravity kneads it and heats its inside', 'Many meteorites hit it'],
        answer: 1,
        explanation: 'As Io orbits, Jupiter’s gravity stretches and relaxes it again and again, and the friction melts its inside.',
      },
      {
        question: 'What is thought to lie under Europa’s ice?',
        choices: ['A sea of lava', 'An ocean of water', 'A layer of diamonds'],
        answer: 1,
        explanation: 'A salty ocean is thought to lie under the thick ice. Because there is water, Europa is a key place to look for life.',
      },
    ],
  },

  'saturn-rings': {
    title: 'The secret of Saturn’s rings',
    client: 'Planetary Science Institute',
    briefing: ['We have a request to study Saturn’s rings. What are those beautiful rings made of?'],
    steps: [
      {
        goal: 'Observe Saturn’s rings (stay near Saturn)',
        start: 'I have set Saturn as our target. The scan starts when we get close.',
        done: 'The rings are made of countless pieces of ice, from grains of sand to chunks as big as a house. They are about 270,000 km from edge to edge, yet mostly less than 1 km thick.',
      },
      {
        goal: 'Observe the moon Mimas (stay close)',
        start: 'The rings have a big gap called the Cassini Division. Let’s study Mimas, the moon that makes it.',
        done: 'Mimas’s gravity tugs at the same spot again and again, pushing the ice pieces out and leaving a gap. Mimas also has a giant crater a third as wide as the moon itself.',
      },
    ],
    summary: ['Saturn’s rings are made of countless pieces of ice.', 'The rings are about 270,000 km across but less than 1 km thick.', 'A moon’s gravity can make gaps in the rings.'],
    quiz: [
      {
        question: 'What are Saturn’s rings made of?',
        choices: ['One solid plate', 'Countless pieces of ice', 'Clouds of gas'],
        answer: 1,
        explanation: 'The rings are a huge number of ice pieces, each orbiting Saturn on its own. They are not one solid plate.',
      },
      {
        question: 'How thick are Saturn’s rings in most places?',
        choices: ['Less than 1 km', 'About 10,000 km', 'About as wide as Earth'],
        answer: 0,
        explanation: 'They stretch about 270,000 km from edge to edge, but are only tens of meters to about 1 km thick in most places. A very thin disk.',
      },
    ],
  },

  'water-hunt': {
    title: 'Hunting for clues of water',
    client: 'Life Search Project',
    briefing: ['Our mission is to look for liquids, which life needs. Two of Saturn’s moons hold big clues.'],
    steps: [
      {
        goal: 'Observe Enceladus (stay close)',
        start: 'I have set Enceladus as our target. It is a small white moon.',
        done: 'Water from an ocean under the ice sprays out into space from Enceladus’s south pole. The Cassini spacecraft flew through these plumes and found salt and organic molecules.',
      },
      {
        goal: 'Observe Titan (stay close)',
        start: 'Next is Titan. Target set.',
        done: 'Like Earth, Titan has rain, rivers and lakes. But the liquid is methane, not water, which is liquid at −180 °C. The air pressure on its surface is about 1.5 times Earth’s.',
      },
    ],
    summary: ['Enceladus sprays water from an ocean under its ice.', 'Titan has methane rain, rivers and lakes.', 'Places with liquids are important targets in the search for life.'],
    quiz: [
      {
        question: 'What sprays out from Enceladus’s south pole?',
        choices: ['Lava', 'Water (ice grains and vapor)', 'Dust'],
        answer: 1,
        explanation: 'Water from the ocean under the ice sprays out through cracks. One of Saturn’s rings, the E ring, is made of ice grains from these plumes.',
      },
      {
        question: 'What liquid fills Titan’s lakes and rivers?',
        choices: ['Water', 'Methane', 'Molten iron'],
        answer: 1,
        explanation: 'Titan is about −180 °C. Water is frozen rock-hard there, but methane is liquid and forms rain, rivers and lakes.',
      },
    ],
  },

  'pluto-voyage': {
    title: 'The long trip to Pluto',
    client: 'Solar System Survey Bureau',
    briefing: [
      'Our final mission is to survey Pluto at the edge of the solar system.',
      'Pluto is about 40 times farther from the Sun than Earth. Even sunlight takes about 5 and a half hours to get there. The New Horizons spacecraft, launched in 2006, took nine and a half years to reach it.',
    ],
    steps: [
      {
        goal: 'Observe Pluto (stay close)',
        start: 'I have set Pluto as our target. It is a long journey.',
        done: 'Pluto has a white heart-shaped region. Its left half is a flat plain of frozen nitrogen. Pluto was classified as a dwarf planet in 2006.',
      },
      {
        goal: 'Observe the moon Charon (stay close)',
        start: 'Finally, let’s study Pluto’s moon Charon.',
        done: 'Charon is about half the size of Pluto. Pluto and Charon always keep the same faces turned toward each other as they go around.',
      },
    ],
    summary: ['Even sunlight takes about 5 and a half hours to reach Pluto.', 'The white heart-shaped region holds a plain of frozen nitrogen.', 'Pluto and Charon always face each other with the same sides.'],
    quiz: [
      {
        question: 'How long does sunlight take to reach Pluto?',
        choices: ['About 8 minutes', 'About 5 and a half hours', 'About 3 days'],
        answer: 1,
        explanation: 'Light travels about 300,000 km each second, but Pluto is about 5.9 billion km away, so it takes about 5 and a half hours. To Earth it takes about 8 minutes.',
      },
      {
        question: 'What is the plain in Pluto’s white heart made of?',
        choices: ['Water snow', 'Frozen nitrogen', 'Salt'],
        answer: 1,
        explanation: 'The left half of the heart, Sputnik Planitia, is made of frozen nitrogen and other ices. Nitrogen, which makes up about 80% of Earth’s air, is frozen solid on Pluto.',
      },
    ],
  },
}
