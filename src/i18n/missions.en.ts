import type { ChapterText, MissionText } from '../data/missions'

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

  'amatsu-jupiter-spot': {
    title: 'Photograph Jupiter’s Great Red Spot',
    client: 'Planetary Weather Institute',
    briefing: [
      'Welcome aboard the Amatsukaze, Captain. The brass domes on deck are observatories. This ship’s job is to watch and to record.',
      'Our first photo is Jupiter’s Great Red Spot, a storm bigger than Earth that has been watched without a break for almost 190 years.',
    ],
    steps: [
      { goal: 'Head to Jupiter', start: 'I have set Jupiter as our target. Engage when ready.', done: 'We have reached Jupiter. The stripes are bands of cloud split apart by strong east–west winds.' },
      {
        goal: 'Keep Jupiter inside the camera frame',
        start: 'I have put a camera frame on the screen. Bring Jupiter inside it and hold it there for 4 seconds. Too close and it will not fit.',
        done: 'Photo taken! The Great Red Spot is a high-pressure whirlpool larger than Earth. It has been slowly shrinking for about 100 years.',
      },
    ],
    summary: ['The Great Red Spot is a storm (a high-pressure whirlpool) larger than Earth.', 'It has been watched without a break since about 1830.', 'In recent years it has been slowly shrinking.'],
    quiz: [
      { question: 'What is Jupiter’s Great Red Spot?', choices: ['A giant storm', 'A volcano', 'A big lake'], answer: 0, explanation: 'It is a swirling high-pressure storm. Jupiter has no solid ground, so nothing breaks it up and it lasts a very long time.' },
      {
        question: 'How big is the Great Red Spot?',
        choices: ['Big enough to hold Earth', 'About the size of the Moon', 'About the size of Japan'],
        answer: 0,
        explanation: 'Today it is about 14,000 km wide, wider than Earth (about 12,700 km). A hundred years ago it was big enough for two or three Earths side by side.',
      },
    ],
  },

  'amatsu-eclipse': {
    title: 'Watch a total solar eclipse from space',
    client: 'Solar Observation Center',
    briefing: ['On April 8, 2024, a total solar eclipse crossed North America. Let’s watch that day from space.', 'A solar eclipse happens when the Moon passes in front of the Sun and its shadow falls on Earth.'],
    steps: [
      {
        goal: 'Watch the Moon’s shadow cross Earth',
        start: 'I have opened the eclipse view and started playing that day. Watch the Moon’s shadow travel across Earth.',
        done: 'Maximum eclipse! Where the Moon’s dark shadow fell, daytime turned as dark as night for a few minutes, and the Sun’s corona appeared.',
      },
    ],
    summary: ['A solar eclipse is the Moon’s shadow falling on Earth.', 'The Sun is about 400 times bigger than the Moon but about 400 times farther away, so they look almost the same size.', 'A total eclipse can only be seen inside the narrow path of the shadow.'],
    quiz: [
      { question: 'During a solar eclipse, whose shadow falls on Earth?', choices: ['The Moon’s', 'Earth’s own', 'The Sun’s'], answer: 0, explanation: 'The Moon moves between the Sun and Earth and its shadow falls on Earth. A lunar eclipse is the opposite: Earth’s shadow falls on the Moon.' },
      {
        question: 'Why do the Sun and Moon look about the same size in the sky?',
        choices: ['The Sun is about 400 times bigger and about 400 times farther away', 'They really are the same size', 'The Moon makes its own light'],
        answer: 0,
        explanation: 'Size and distance are in almost the same ratio, so the Moon can just cover the Sun. That is why the corona shows during a total eclipse.',
      },
    ],
  },

  'amatsu-saturn-rings': {
    title: 'Photograph Saturn’s rings and Titan',
    client: 'Planetary Science Institute',
    briefing: [
      'Seen from Earth, the tilt of Saturn’s rings slowly changes. About every 15 years we see them exactly edge-on, and in 2025 they almost vanished from view.',
      'This time we will photograph the whole ring system and the moon Titan from space.',
    ],
    steps: [
      { goal: 'Head to Saturn', start: 'I have set Saturn as our target.', done: 'We have reached Saturn.' },
      {
        goal: 'Keep Saturn and its rings inside the frame',
        start: 'Back off a little so the whole ring system fits, then bring Saturn inside the frame. Too close and it will not fit.',
        done: 'Photo taken! The rings sit above Saturn’s equator, and Saturn is tilted about 27 degrees, so the rings look different with the seasons.',
      },
      {
        goal: 'Keep Titan inside the frame',
        start: 'Next is Titan. Target set.',
        done: 'Photo taken! Titan’s orange color is a thick haze. We learned about its surface from Cassini’s radar and from the Huygens lander, which touched down in 2005.',
      },
    ],
    summary: ['Saturn’s rings lie above its equator and look different with the seasons.', 'About every 15 years we see them edge-on and they almost disappear.', 'Titan is wrapped in thick haze. The Huygens lander touched down there in 2005.'],
    quiz: [
      {
        question: 'Why did Saturn’s rings almost vanish from Earth’s view in 2025?',
        choices: ['We saw them exactly edge-on', 'The rings disappeared', 'Saturn hid behind the Sun'],
        answer: 0,
        explanation: 'The rings are very thin, so seen edge-on they become a fine line that is hard to see. They did not go anywhere.',
      },
      { question: 'Which spacecraft landed on Titan?', choices: ['Huygens', 'Hayabusa', 'Apollo 11'], answer: 0, explanation: 'Huygens rode along with Cassini and landed on Titan in January 2005, the most distant landing ever made.' },
    ],
  },

  'hakobune-moon-water': {
    title: 'Moon water for Earth orbit',
    client: 'Earth-orbit supply station',
    briefing: [
      'Welcome aboard the Hakobune, Captain. She is an 800 m freighter.',
      'Deep craters at the Moon’s south pole never see sunlight, and ice is thought to remain there. We will carry that water to a supply station orbiting Earth.',
      'The Moon’s gravity is about one sixth of Earth’s, so launching cargo from the Moon takes far less fuel than launching from Earth.',
    ],
    steps: [
      { goal: 'Head to the Moon', start: 'I have set the Moon as our target.', done: 'We have reached the Moon.' },
      {
        goal: 'Stay near the Moon and load the ice',
        start: 'Please stay close to the Moon while we load ice from the south pole.',
        done: 'Loading complete! The ship is much heavier now. With the same push, heavier things speed up more slowly. I will keep our top speed down until we unload.',
      },
      { goal: 'Head to Earth', start: 'I have set Earth as our target. We are heavy, so let’s take it easy.', done: 'We have reached Earth. I can see the supply station’s docking ring.' },
      {
        goal: 'Fly slowly into the docking ring and stop',
        start: 'The glowing ring is the port entrance. Fly the last part yourself: ease into the middle of the ring and stop. If you are too fast you will not be able to stop.',
        done: 'Docked! A heavy ship needs a long distance to stop. In space, even stopping takes fuel, fired in the opposite direction.',
      },
    ],
    summary: ['Ice is thought to lie in dark craters at the Moon’s south pole.', 'With the same push, heavier things speed up and slow down less easily.', 'In space, you need fuel even to stop.'],
    quiz: [
      {
        question: 'Why is there ice in craters at the Moon’s south pole?',
        choices: ['Sunlight never reaches them, so they are extremely cold', 'It rains on the Moon', 'Ice was carried there from Earth'],
        answer: 0,
        explanation: 'At the Moon’s poles the Sun always skims the horizon, so the floors of deep craters are never lit. At below −200 °C, ice can last.',
      },
      {
        question: 'With the same push, what happens to a ship that has become heavier with cargo?',
        choices: ['It speeds up more slowly', 'It speeds up faster', 'Nothing changes'],
        answer: 0,
        explanation: 'For the same force, heavier things gain speed more slowly (force = mass × acceleration). Stopping works the same way: a heavier ship is harder to stop.',
      },
    ],
  },

  'hakobune-ring-ice': {
    title: 'Ring ice for Mars',
    client: 'Mars research base',
    briefing: [
      'The Mars research base needs more water. We will bring ice from Saturn’s rings.',
      'The Hakobune’s fusion rocket is still imaginary. In real life, scientists are working on fusion power, the same process that powers the Sun, at projects such as ITER in France.',
    ],
    steps: [
      { goal: 'Head to Saturn', start: 'I have set Saturn as our target.', done: 'We have reached Saturn.' },
      { goal: 'Stay near Saturn and load ring ice', start: 'Please stay close to Saturn while we gather ice grains from the outer rings.', done: 'Loading complete! More than 99% of the ring particles are water ice, and very clean water at that.' },
      { goal: 'Head to Mars', start: 'I have set Mars as our target. From Saturn to Mars is about 8 times the Earth–Sun distance.', done: 'We have reached Mars. I can see the base’s docking ring.' },
      {
        goal: 'Fly slowly into the docking ring and stop',
        start: 'Ease into the middle of the ring and stop.',
        done: 'Docked! Mars’s air is less than 1% as thick as Earth’s, so water on the surface quickly freezes or evaporates. The base will use it carefully.',
      },
    ],
    summary: ['More than 99% of Saturn’s ring particles are water ice.', 'From Saturn to Mars is about 8 times the Earth–Sun distance.', 'Mars’s air is less than 1% of Earth’s, so liquid water cannot stay on the surface.'],
    quiz: [
      { question: 'What are Saturn’s ring particles mostly made of?', choices: ['Water ice', 'Rock', 'Iron'], answer: 0, explanation: 'More than 99% is water ice, which is why the rings reflect sunlight so brightly.' },
      {
        question: 'Why can’t liquid water stay on the surface of Mars?',
        choices: ['The air is very thin and it is cold', 'Gravity is too strong', 'Mars has no water at all'],
        answer: 0,
        explanation: 'In thin air, water quickly evaporates or freezes. Mars does have water, as polar ice and ice underground.',
      },
    ],
  },

  'amatsu-moon-city': {
    title: 'Photograph the city on the Moon’s far side',
    client: 'Society for Moon Legends',
    briefing: [
      'Word has come of a glowing city on a crater floor on the far side of the Moon.',
      'The Moon Capital is where Princess Kaguya returned in the old Japanese “Tale of the Bamboo Cutter”. If it is really there, let’s record it.',
    ],
    steps: [
      { goal: 'Head to the Moon', start: 'I have set the Moon as our target.', done: 'We have reached the Moon. The city is on the far side, a place never visible from Earth.' },
      {
        goal: 'Keep the Moon Capital inside the frame',
        start: 'I have set the Moon Capital as our target. Swing around to the far side and bring the city into the frame.',
        done: 'Photo taken! In the tale, Princess Kaguya was taken home by a procession from the Moon Capital on the night of a full moon.',
      },
    ],
    summary: ['The Moon always shows Earth the same face, so we never see its far side from Earth.', 'A spacecraft first photographed the far side in 1959.', 'The Moon Capital is an imaginary place based on an old Japanese tale.'],
    real: ['The far side of the Moon was first photographed in 1959 by the Soviet probe Luna 3.', 'In 2019, China’s Chang’e 4 made the first landing on the far side.', 'Earth’s radio noise does not reach the far side, so there are plans to build quiet radio telescopes there.'],
    quiz: [
      {
        question: 'Which spacecraft first photographed the far side of the Moon?',
        choices: ['Luna 3 (1959)', 'Apollo 11 (1969)', 'Kaguya (2007)'],
        answer: 0,
        explanation: 'The Soviet Luna 3 looped around the Moon and took the pictures. Until then, no one had ever seen the far side.',
      },
      {
        question: 'Why can’t we see the far side of the Moon from Earth?',
        choices: ['The Moon spins once in the same time it takes to orbit Earth', 'The far side is always night', 'Clouds hide it'],
        answer: 0,
        explanation: 'The Moon spins once in about 27 days and circles Earth in the same 27 days, so the same face always points at us. The far side has daytime too.',
      },
    ],
  },

  'amatsu-radio-moon': {
    title: 'Observe the radio telescope moon',
    client: 'Radio Observatory',
    briefing: ['Our target is a man-made sphere as big as a moon: the Radio Telescope Moon.', 'The huge bowl at its north pole is not a weapon. It is an antenna that gathers faint radio waves from distant galaxies and black holes.'],
    steps: [
      { goal: 'Head to the Radio Telescope Moon', start: 'Target set.', done: 'We have arrived. I can see the hull bands wrapping its surface and the small antennas.' },
      { goal: 'Keep the Radio Telescope Moon inside the frame', start: 'Bring the whole sphere into the frame and take the photo.', done: 'Photo taken! Radio waves show us things visible light cannot, such as cold gas and the distant universe.' },
    ],
    summary: ['A radio telescope sees the universe in radio waves we cannot see.', 'The bigger the dish, the fainter the signals it can collect.', 'The Radio Telescope Moon is an imaginary structure.'],
    real: [
      'The largest radio dish in the world is China’s FAST, 500 m across, finished in 2016.',
      'Puerto Rico’s Arecibo radio telescope (305 m) collapsed in 2020 after its cables broke.',
      'In 2019 the Event Horizon Telescope, linking radio telescopes around the world, took the first picture of a black hole’s shadow.',
    ],
    quiz: [
      { question: 'How wide is the dish of FAST, the largest radio telescope?', choices: ['About 500 m', 'About 50 m', 'About 5 km'], answer: 0, explanation: 'FAST is a 500 m dish built into a natural hollow among the hills.' },
      {
        question: 'What was first photographed in 2019 by linking radio telescopes around the world?',
        choices: ['A black hole’s shadow', 'The surface of Mars', 'Sunspots'],
        answer: 0,
        explanation: 'Linking telescopes across the globe gave detail like one Earth-sized telescope. The target was the black hole at the center of galaxy M87.',
      },
    ],
  },

  'amatsu-railway': {
    title: 'Fly alongside the Galactic Railway',
    client: 'Museum of Star Stories',
    briefing: ['We have a request to photograph the Galactic Railway running on its rails of light.', 'The train will not stop for us. Fly alongside and keep it in the frame.'],
    steps: [
      { goal: 'Head to the Galactic Railway', start: 'I have set the Galactic Railway as our target. Warping puts us right beside the train.', done: 'We caught up! Its windows are lit.' },
      {
        goal: 'Keep the moving train inside the frame',
        start: 'Keep the train inside the frame for 5 seconds. If it pulls away, autopilot (G) can chase it.',
        done: 'Photo taken! In Kenji Miyazawa’s “Night on the Galactic Railroad”, Giovanni and Campanella ride this train along the Milky Way.',
      },
    ],
    summary: ['The Galactic Railway is an imaginary train from Kenji Miyazawa’s story.', 'The Milky Way is our own galaxy seen from inside.', 'To photograph something moving, fly alongside at the same speed.'],
    real: [
      'The Milky Way is our galaxy seen from inside. It holds 100 to 400 billion stars.',
      'Galileo was the first to show with a telescope that the Milky Way is made of stars (1610).',
      'Even light takes about 100,000 years to cross the Milky Way.',
    ],
    quiz: [
      { question: 'What is the Milky Way?', choices: ['A huge crowd of stars', 'High clouds', 'Reflected moonlight'], answer: 0, explanation: 'Countless distant stars blend into a faint glowing band across the sky.' },
      { question: 'Who first showed with a telescope that the Milky Way is made of stars?', choices: ['Galileo', 'Newton', 'Einstein'], answer: 0, explanation: 'In 1610 Galileo turned his handmade telescope to the Milky Way and found it was made of countless stars.' },
    ],
  },

  'hakobune-ore': {
    title: 'From the asteroid port to the shipyard',
    client: 'Lunar Shipyard',
    briefing: ['The lunar shipyard is short of metal for the hull of the sister ship SV-03.', 'We will load metal mined at the Cross Asteroid Port and deliver it to the shipyard.'],
    steps: [
      { goal: 'Head to the Cross Asteroid Port', start: 'I have set the Cross Asteroid Port as our target.', done: 'We have reached the asteroid port.' },
      { goal: 'Stay near the port and load metal', start: 'Please stay close to the port while we load the mined metal.', done: 'Loading complete! The ship is heavier now. I will keep our top speed down until we unload.' },
      { goal: 'Head to the Lunar Shipyard', start: 'I have set the shipyard as our target.', done: 'We have reached the shipyard. I can see the docking ring.' },
      { goal: 'Fly slowly into the docking ring and stop', start: 'Ease into the middle of the ring and stop.', done: 'Docked! This metal will become SV-03’s hull plates.' },
    ],
    summary: ['Using asteroid metal in space means less has to be launched from Earth.', 'Big spacecraft are assembled in space.', 'The asteroid port and the shipyard are imaginary structures.'],
    real: [
      'Hayabusa2 brought back samples from Ryugu, and NASA’s OSIRIS-REx from Bennu.',
      'NASA’s Psyche spacecraft is on its way to the asteroid Psyche, which may be made of metal. It should arrive in 2029.',
      'The International Space Station was built in space from parts carried up on more than 40 launches.',
    ],
    quiz: [
      { question: 'Which spacecraft is heading to Psyche, an asteroid that may be made of metal?', choices: ['Psyche', 'Hayabusa2', 'Voyager 1'], answer: 0, explanation: 'Psyche launched in 2023 and should reach the asteroid in 2029. It may be a piece of an ancient small planet’s core.' },
      {
        question: 'How was the International Space Station built?',
        choices: ['Parts were launched dozens of times and assembled in space', 'It was built on the ground and launched in one go', 'It was built on the Moon'],
        answer: 0,
        explanation: 'Between 1998 and 2011, more than 40 launches carried up parts, and astronauts joined them together in space.',
      },
    ],
  },

  'hakobune-ark': {
    title: 'Final supplies for the generation ship',
    client: 'Generation Ship',
    briefing: ['We are bringing final supplies to the generation ship before it leaves for Alpha Centauri, our nearest neighboring star.', 'Many generations will live aboard during the voyage. Let’s carry water and metal from the Engine Asteroid.'],
    steps: [
      { goal: 'Head to the Engine Asteroid', start: 'I have set the Engine Asteroid as our target.', done: 'We have reached the Engine Asteroid.' },
      { goal: 'Stay near the asteroid and load water and metal', start: 'Please stay close to the asteroid while we load.', done: 'Loading complete! The ship is heavier now.' },
      { goal: 'Head to the generation ship', start: 'I have set the generation ship as our target.', done: 'We have reached the generation ship. I can see the docking ring.' },
      { goal: 'Fly slowly into the docking ring and stop', start: 'Ease into the middle of the ring and stop.', done: 'Docked! This water will be cleaned and reused again and again on board. Safe travels!' },
    ],
    summary: ['Even the nearest star is extremely far away.', 'On long voyages, water and air are recycled again and again.', 'The generation ship is imaginary.'],
    real: [
      'The nearest star is about 4.2 light-years away. At Voyager 1’s speed the trip would take more than 70,000 years.',
      'The International Space Station turns sweat and urine back into water and reuses about 98% of its water.',
      'People have lived for long periods in sealed buildings on Earth as experiments, such as Biosphere 2 in the United States.',
    ],
    quiz: [
      { question: 'About how much of its water does the International Space Station reuse?', choices: ['About 98%', 'About 10%', 'About 50%'], answer: 0, explanation: 'It filters moisture from the air and even sweat and urine back into drinking water.' },
      { question: 'How far away is the nearest star?', choices: ['About 4.2 light-years', 'About 4.2 light-minutes', 'About 420 light-years'], answer: 0, explanation: 'Even light takes about 4.2 years, a distance of about 40 trillion km. Light from the Sun takes only about 8 minutes.' },
    ],
  },
}

export const chaptersEn: Record<string, ChapterText> = {
  'sv01-real': { title: 'Solar Voyager’s chapter', skill: 'Beam', how: 'Press F or click (the beam button on a phone) to fire the beam where you aim.', intro: 'The basic missions around the solar system: eight requests, from the Moon to Pluto.' },
  'amatsu-real': {
    title: 'Amatsukaze: the observatory ship',
    skill: 'Observatory photos',
    how: 'Bring the target inside the camera frame on the screen and hold it for a few seconds. Too close or too far and the photo will not work.',
    intro: 'Record Jupiter’s storm, a solar eclipse and Saturn’s rings from the deck observatories.',
  },
  'hakobune-real': {
    title: 'Hakobune: heavy cargo',
    skill: 'Docking a heavy ship',
    how: 'Cargo makes the ship heavy and slow to gain speed. Fly the last part into the glowing docking ring yourself, slowly, and stop.',
    intro: 'Deliver ice from the Moon and from Saturn’s rings to the places that need it.',
  },
  'amatsu-sf': { title: 'Amatsukaze, SF: landmarks of the future', skill: 'Observatory photos', how: 'Bring the target inside the camera frame and hold it for a few seconds.', intro: 'Photograph the landmarks of the SF world: the Moon Capital, the Radio Telescope Moon and the Galactic Railway.' },
  'hakobune-sf': { title: 'Hakobune, SF: shipping in future space', skill: 'Docking a heavy ship', how: 'Cargo makes the ship heavy. Fly the last part into the glowing docking ring yourself, slowly, and stop.', intro: 'Carry asteroid metal to the shipyard, then final supplies to the departing generation ship.' },
}
