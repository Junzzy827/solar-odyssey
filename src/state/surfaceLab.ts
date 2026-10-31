import { create } from 'zustand'

// 地表の調整ページ（URL の末尾に #surface-lab）。太陽の高さ・向き、霞の濃さ、露出をその場で動かして、
// 天体ごとの値を決めるための道具。ふだんの画面には出ない。

type LabState = {
  /** 太陽の高度・方位（度）。null なら天体の設定どおり */
  sunEl: number | null
  sunAz: number | null
  /** 地面近くの霞の濃さ（倍） */
  haze: number
  /** 露出の補正（段。+1 で 2 倍明るい） */
  ev: number
  /** 脚の出し具合（0〜1）を手で決める。null なら降下・離陸の動きのまま */
  legs: number | null
  /** 計算した露出（表示用） */
  exposure: number
  set: (p: Partial<Omit<LabState, 'set'>>) => void
}

export const useSurfaceLab = create<LabState>((set) => ({
  sunEl: null,
  sunAz: null,
  haze: 1,
  ev: 0,
  legs: null,
  exposure: 1,
  set: (p) => set(p),
}))

export const labEnabled = () => location.hash.includes('surface-lab')

/** #surface-lab=mars のように天体が書いてあれば、その id */
export function labBodyFromHash() {
  const m = location.hash.match(/surface-lab=([a-z]+)/)
  return m ? m[1] : null
}
