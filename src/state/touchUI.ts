import { create } from 'zustand'

/** スマホ・タブレットで、上のアイコンから開くメニュー（航法コンピュータ・航海日誌・お知らせ・縮尺）。一度に開くのはひとつだけ */
export type Sheet = 'nav' | 'log' | 'notice' | 'scale' | null

export const useTouchUI = create<{ sheet: Sheet; setSheet: (sheet: Sheet) => void }>((set) => ({
  sheet: null,
  setSheet: (sheet) => set({ sheet }),
}))
