import type { timeBarJa } from './timeBar.ja'
import type { Translation } from './translation'

// The texts of components/surface/TimeBar.tsx (English). Same keys as timeBar.ja.ts

export const timeBarEn: Translation<typeof timeBarJa> = {
  dayInEarthHours: (h: string) => `1 day = ${h} Earth hours`,
  dayInEarthDays: (h: string) => `1 day ≈ ${h} Earth days`,
  newMoon: 'New moon',
  fullMoon: 'Full moon',
  firstQuarter: 'First quarter',
  lastQuarter: 'Last quarter',
  waxingCrescent: 'Waxing crescent',
  waningCrescent: 'Waning crescent',
  waxingGibbous: 'Waxing gibbous',
  waningGibbous: 'Waning gibbous',
  moonFromEarth: 'The Moon from Earth now',
  earthPhase: (earthFull: boolean) => `Earth in this sky looks ${earthFull ? 'full-ish' : 'thin'}`,
  luxLarge: (_lx: number, lx2: number) => `~${lx2}k`,
  luxValue: (lx: number | string) => `~${lx}`,
  brightSummerSun: 'bright summer sun',
  overcastDay: 'an overcast day',
  brightRoom: 'a bright room',
  dusk: 'dusk',
  fullMoonNight: 'a full-moon night',
  starlightOnly: 'starlight only',
  luxUnit: ' lux',
  ground: 'Ground',
  light: 'Light',
  luxLike: (like: string) => `About like ${like}`,
  groundTemp: 'Ground temp',
  night: 'Night',
  weather: 'Weather',
  localTime: 'Local time',
}
