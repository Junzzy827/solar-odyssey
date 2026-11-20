import { cardOf, hasCard } from './bodyCards'

// 大きさくらべ（A4）：いまの星と、地球・月・エベレストなどを、本当の大きさの比で横にならべる。
// 単位は km。小さいものから左にならべて、下の端をそろえる（棚に置いたように）

/** エベレストの高さ（km） */
export const EVEREST_KM = 8.849
/** エベレストのすそ野の半径（km）。形を見せるための目安 */
export const EVEREST_BASE_KM = 14

/** くらべるのに選べるもの（いまの星のほか） */
export const PICKS = ['everest', 'moon', 'earth', 'jupiter', 'sun'] as const
export type Pick = (typeof PICKS)[number]

export type Item = {
  id: string
  /** 山（エベレスト）か球か */
  kind: 'ball' | 'mountain'
  /** 横の幅（km）：球は直径、山はすその幅 */
  width: number
  /** 高さ（km）：球は直径、山は高さ */
  height: number
  /** ならべたときのまん中の x（km） */
  x: number
}

/** 半径（km） */
const r = (id: string) => (id === 'everest' ? EVEREST_KM : (cardOf(id)?.radiusKm ?? 0))

/** はじめに出すもの：地球（地球なら月）。地球より小さい星には月も、とても小さい星にはエベレストも */
export function defaultPicks(id: string): Pick[] {
  const km = r(id)
  if (id === 'earth') return ['moon', 'everest']
  if (id === 'sun') return ['jupiter', 'earth']
  const picks: Pick[] = ['earth']
  if (km < 6_371 && id !== 'moon') picks.push('moon')
  if (km < 400) picks.push('everest')
  if (km > 50_000) picks.push('sun')
  return picks
}

/** ならべ方：小さいものから左へ。すき間は、となりの大きいほうの幅の 1/4 */
export function lineup(id: string, picks: readonly string[]): Item[] {
  const ids = [id, ...picks.filter((p) => p !== id)]
  const items = ids
    .map((i): Item => (i === 'everest' ? { id: i, kind: 'mountain', width: EVEREST_BASE_KM * 2, height: EVEREST_KM, x: 0 } : { id: i, kind: 'ball', width: r(i) * 2, height: r(i) * 2, x: 0 }))
    .filter((i) => i.width > 0)
    .sort((a, b) => a.height - b.height)
  let cursor = 0
  items.forEach((it, i) => {
    if (i > 0) cursor += Math.max(it.width, items[i - 1].width) * 0.25
    it.x = cursor + it.width / 2
    cursor += it.width
  })
  return items
}

/** 大きいほうの直径に、小さいほうがいくつならぶか（10 より小さいときは半分きざみ） */
export function across(big: Item, small: Item) {
  const n = big.height / small.height
  return n < 10 ? Math.round(n * 2) / 2 : Math.round(n)
}

/** 大きさくらべができる星（天体カードのある星） */
export const canCompare = (id: string | null | undefined): id is string => !!id && hasCard(id) && r(id) > 0
