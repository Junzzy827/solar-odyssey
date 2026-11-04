import type { shipPickerJa } from './shipPicker.ja'
import type { Translation } from './translation'

// The texts of ui/ShipPicker.tsx (English). Same keys as shipPicker.ja.ts

export const shipPickerEn: Translation<typeof shipPickerJa> = {
  switchedTo: (registry: string, _name: string, nameEn: string) => `Switched to ${registry} ${nameEn}`,
  yourShip: 'Your ship',
  kindAndLength: (_kind: string, lengthM: number, kindEn: string) => `${kindEn} · ${lengthM} m`,
  shipName: (registry: string, _name: string, nameEn: string) => `${registry} ${nameEn}`,
  fictionNote: 'All of these ships are original and imaginary. Press V to view your ship and read about its parts.',
}
