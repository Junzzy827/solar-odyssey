import type { telescopesJa } from './telescopes.ja'
import type { Translation } from './translation'

// The texts of data/telescopes.ts (English). Same keys as telescopes.ja.ts

export const telescopesEn: Translation<typeof telescopesJa> = {
  hubbleSpaceTelescope: 'Hubble Space Telescope',
  webbSpaceTelescope: 'Webb Space Telescope',
  hubble: 'Hubble',
  webb: 'Webb',
  found: (name: string) => `You are next to the ${name}.\nPress T to look into deep space through its eyes. (I for the ship’s log)`,
  tooFar: (name: string) => `Fly close to the ${name} to look through its pictures.`,
}
