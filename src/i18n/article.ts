import { bodiesEn } from './bodies.en'
import { flightEn } from './flight.en'
import { telescopesEn } from './telescopes.en'

// 英語の文の中で天体の名前を呼ぶ形：the Sun・the Moon・the Hubble Space Telescope のように the をつける名前と、
// そのままの名前（Mars、Europa）。state/flight.ts のワープの掛け声（SPOKEN）と同じ分け方。
// 着陸地点つきの名前（"Moon · Taurus-Littrow valley"、区切りは surfaceView.en.ts の siteSuffix）にも the をつける
const WITH_THE = [bodiesEn.sun?.name, bodiesEn.moon?.name, flightEn.sun, telescopesEn.hubbleSpaceTelescope, telescopesEn.webbSpaceTelescope].filter(
  (n): n is string => n !== undefined,
)
const takesThe = (name: string) => WITH_THE.some((n) => name === n || name.startsWith(`${n} · `))

/** 文の途中で：the Moon / Mars */
export const theEn = (name: string) => (takesThe(name) ? `the ${name}` : name)
/** 文の頭で：The Moon / Mars */
export const TheEn = (name: string) => (takesThe(name) ? `The ${name}` : name)
