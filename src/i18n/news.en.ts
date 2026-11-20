import type { newsJa } from './news.ja'
import type { Translation } from './translation'

// Text for ui/News.tsx (English): notices shown once at start-up

export const newsEn: Translation<typeof newsJa> = {
  raceSites:
    '🏁 News: rover races are open in 3 places: Mars (Valles Marineris), the Moon (the Apollo 17 valley, a chase) and Europa (an ice ridge, very slippery). Land on one and press its 🏁 race button. On the Moon, “🚩 To the Apollo 17 site” takes you to the historic sites.',
  colonyLap:
    '🛸 News: inside the colony you can now walk beyond the park, cross the bridges over the window strips to the other lands, and on the hover scooter “Fly (G)” at 360 km/h to lap the whole cylinder in about 4 minutes.',
}
