import type { shipPickerJa } from './shipPicker.ja'
import type { Translation } from './translation'

// The texts of ui/ShipPicker.tsx (English). Same keys as shipPicker.ja.ts

export const shipPickerEn: Translation<typeof shipPickerJa> = {
  switchedTo: (registry: string, name: string) => `Switched to ${registry} ${name}`,
  yourShip: 'Your ship',
  kindAndLength: (kind: string, lengthM: number) => `${kind} · ${lengthM} m`,
  shipName: (registry: string, name: string) => `${registry} ${name}`,
  fictionNote: 'All of these ships are original and imaginary. Press V to view your ship and read about its parts.',
}
