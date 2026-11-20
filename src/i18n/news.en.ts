import type { newsJa } from './news.ja'
import type { Translation } from './translation'

// Text for ui/News.tsx (English): notices shown once at start-up

export const newsEn: Translation<typeof newsJa> = {
  raceSites:
    '🏁 News: rover races are open in 3 places: Mars (Valles Marineris), the Moon (the Apollo 17 valley, a chase) and Europa (an ice ridge, very slippery). Land on one and press its 🏁 race button. On the Moon, “🚩 To the Apollo 17 site” takes you to the historic sites.',
  bodyCards: '📇 New: body cards. Press “📇 Body card” in the ship’s log to compare size, gravity, day length and temperature with Earth. Use ◀ ▶ to flip to other bodies.',
}
