import type { chargeBeamJa } from './chargeBeam.ja'
import type { Translation } from './translation'

// The texts of components/ChargeBeam.tsx (English). Same keys as chargeBeam.ja.ts

export const chargeBeamEn: Translation<typeof chargeBeamJa> = {
  rocksAndJunkDestroyed: (rocks: number, junk: number) => `Charge beam: ${rocks} asteroids and ${junk} pieces of space junk destroyed.`,
  rocksDestroyed: (rocks: number) => `Charge beam: ${rocks} asteroids destroyed.`,
}
