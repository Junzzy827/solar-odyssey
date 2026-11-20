import type { newsJa } from './news.ja'
import type { Translation } from './translation'

// Text for ui/News.tsx (English): notices shown once at start-up

export const newsEn: Translation<typeof newsJa> = {
  raceSites:
    '🏁 News: rover races are open in 3 places: Mars (Valles Marineris), the Moon (the Apollo 17 valley, a chase) and Europa (an ice ridge, very slippery). Land on one and press its 🏁 race button. On the Moon, “🚩 To the Apollo 17 site” takes you to the historic sites.',
  colonyLap:
    '🛸 News: inside the colony you can now walk beyond the park, cross the bridges over the window strips to the other lands, and on the hover scooter “Fly (G)” at 360 km/h to lap the whole cylinder in about 4 minutes.',
  bodyCards: '📇 New: body cards. Press “📇 Body card” in the ship’s log to compare size, gravity, day length and temperature with Earth. Use ◀ ▶ to flip to other bodies.',
  raceMedals: '🥇 News: rover races now have medals, and you can pick how tough your rivals are (Easy, Normal, Tough). A gold medal adds a reward rock to your rock collection. On phones the rover can drive with auto throttle.',
  today: '🌙 New: “Today in space”. Open it from Learn in the nav panel to see tonight’s Moon, the planets in tonight’s sky and where the probes are now.',
  discovery: '📡 New: discovery scan. Turn the scanner on from Learn in the nav panel, fly close to a rock in the asteroid belt and scan it to discover a new asteroid. You can name it, too.',
  arrival: '🪐 News: when you arrive at a world, it now shows its size next to the Earth. At Jupiter, 11 Earths line up across it.',
}
