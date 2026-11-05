import type { sfSpaceJa } from './sfSpace.ja'
import type { Translation } from './translation'

// The texts of data/sfSpace.ts (English). Same keys as sfSpace.ja.ts

export const sfSpaceEn: Translation<typeof sfSpaceJa> = {
  radioTelescopeMoon: 'Radio Telescope Moon',
  wedgeOreCarrier: 'Wedge Ore Carrier',
  discFreighter: 'Disc Freighter',
  radioMoonFound: 'A man-made sphere as big as a moon. The huge bowl at its north pole is the dish of a radio telescope that gathers radio waves from space.\n(I for the ship’s log)',
  carrierFound: 'A huge wedge-shaped carrier hauling ore mined from asteroids. You can see containers stacked along its sides and the open cargo bay underneath.\n(I for the ship’s log)',
  freighterFound: 'A small disc-shaped freighter carrying materials made on the Moon to the L5 colonies.\n(I for the ship’s log)',
}
