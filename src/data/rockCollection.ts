// 岩石コレクション（図鑑）のページ分け。ローバーで採集できる岩を、見つかる場所ごとにまとめる。
// 岩の種類は rockSamples.ts の samplesFor() と同じもの（同じ一覧を使う天体は 1 ページにまとめる）。

import { samplesFor, type RockSample } from './rockSamples'
import { SURFACES } from './surfaces'

export type RockGroup = {
  id: string
  name: [string, string]
  /** この岩が採れる天体 */
  bodies: string[]
  samples: RockSample[]
}

const NAMES: Record<string, [string, string]> = {
  europa: ['氷の衛星・冥王星', 'Icy moons & Pluto'],
  phobos: ['そのほかの岩の天体', 'Other rocky worlds'],
}

/** 先に並べる天体（火星はこのアプリの目玉なので最初に） */
const ORDER = ['mars', 'moon', 'earth', 'venus', 'mercury', 'io', 'europa', 'titan']

function build(): RockGroup[] {
  const byList = new Map<RockSample[], string[]>()
  for (const id of SURFACES.keys()) {
    const list = samplesFor(id)
    byList.set(list, [...(byList.get(list) ?? []), id])
  }
  const groups: RockGroup[] = []
  for (const [samples, bodies] of byList) {
    const lead = bodies.includes('europa') ? 'europa' : bodies.includes('phobos') ? 'phobos' : bodies[0]
    groups.push({ id: lead, name: NAMES[lead] ?? ['', ''], bodies, samples })
  }
  const rank = (g: RockGroup) => (ORDER.includes(g.id) ? ORDER.indexOf(g.id) : ORDER.length)
  return groups.sort((a, b) => rank(a) - rank(b))
}

export const ROCK_GROUPS = build()
export const ROCK_TOTAL = ROCK_GROUPS.reduce((n, g) => n + g.samples.length, 0)

/** 採集の記録（天体 → 集めた id）から、この岩を見つけた天体の一覧 */
export const foundAt = (g: RockGroup, id: string, log: Record<string, string[]>) => g.bodies.filter((b) => log[b]?.includes(id))

export const rockCount = (log: Record<string, string[]>) =>
  ROCK_GROUPS.reduce((n, g) => n + g.samples.filter((s) => foundAt(g, s.id, log).length > 0).length, 0)

export const rockImage = (id: string) => `${import.meta.env.BASE_URL}rocks/${id}.webp`
