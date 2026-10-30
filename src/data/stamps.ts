import { PLANETS, SUN } from './bodies'
import { CUBE_ID } from './cube'
import { COLONY_ID, SF_OBJECTS, sfEntry } from './sf'
import { HUBBLE_ID, WEBB_ID } from './telescopes'

// 訪問スタンプ帳：天体のそばまで行くとスタンプがもらえる。決まった組をそろえたり、たくさん集めたりすると称号がもらえる

export type StampGroup = { id: string; name: string; nameEn: string; ids: string[] }

const planet = (id: string) => PLANETS.find((p) => p.id === id)!
const moonsOf = (id: string) => planet(id).moons.map((m) => m.id)

export const STAMP_GROUPS: StampGroup[] = [
  { id: 'planets', name: '太陽と惑星', nameEn: 'The Sun and planets', ids: ['sun', ...PLANETS.filter((p) => !p.dwarf).map((p) => p.id)] },
  ...PLANETS.filter((p) => !p.dwarf && p.moons.length > 0).map((p) => ({ id: `moons-${p.id}`, name: `${p.name}の衛星`, nameEn: p.moons.length === 1 ? `${p.nameEn}’s moon` : `Moons of ${p.nameEn}`, ids: moonsOf(p.id) })),
  { id: 'dwarf', name: '準惑星とその衛星', nameEn: 'Dwarf planet and its moon', ids: PLANETS.filter((p) => p.dwarf).flatMap((p) => [p.id, ...moonsOf(p.id)]) },
  { id: 'scopes', name: '宇宙望遠鏡', nameEn: 'Space telescopes', ids: [HUBBLE_ID, WEBB_ID] },
  // SF モードだけのページ（本物の太陽系のスタンプとは別に数える）
  { id: 'sf', name: 'SF（架空）', nameEn: 'SF (imaginary)', ids: SF_OBJECTS.map((e) => e.id) },
]

/** 太陽・惑星・衛星（数を数える称号はこれだけで数える） */
export const NATURAL = STAMP_GROUPS.filter((g) => g.id !== 'scopes' && g.id !== 'sf').flatMap((g) => g.ids)
export const STAMP_IDS = new Set(STAMP_GROUPS.flatMap((g) => g.ids))

/** スタンプの色 */
export function stampColor(id: string) {
  if (id === 'sun') return SUN.color
  if (id === HUBBLE_ID || id === WEBB_ID) return id === WEBB_ID ? '#e8b04a' : '#c9ced8'
  const sf = sfEntry(id)
  if (sf) return sf.color
  for (const p of PLANETS) {
    if (p.id === id) return p.color
    const m = p.moons.find((m) => m.id === id)
    if (m) return m.color
  }
  return '#888'
}

export type Title = {
  id: string
  name: string
  nameEn: string
  /** もらい方 */
  how: string
  howEn: string
  /** この中から count 個（stamp：行った天体、quiz：航海日誌のクイズに正解した天体） */
  ids: string[]
  count: number
  source: 'stamp' | 'quiz'
  /** 数を集める称号（いちばん上のものを「今の称号」にする） */
  rank?: boolean
  /** もらうまで名前を伏せる */
  secret?: boolean
  /** SF モードのもの（現実モードでは見せない） */
  sf?: boolean
}

const group = (id: string) => STAMP_GROUPS.find((g) => g.id === id)!.ids
const rank = (count: number, id: string, name: string, nameEn: string): Title => ({
  id,
  name,
  nameEn,
  how: count === NATURAL.length ? `太陽・惑星・衛星をぜんぶ（${count}）訪れる` : `天体を${count}つ訪れる`,
  howEn: count === NATURAL.length ? `Visit every sun, planet and moon (${count})` : `Visit ${count} bod${count === 1 ? 'y' : 'ies'}`,
  ids: NATURAL,
  count,
  source: 'stamp',
  rank: true,
})
const set = (id: string, ids: string[], name: string, nameEn: string, how: string, howEn: string, secret = false): Title => ({ id, name, nameEn, how, howEn, ids, count: ids.length, source: 'stamp', secret })

export const TITLES: Title[] = [
  rank(1, 'rookie', '宇宙の新人', 'Space Rookie'),
  rank(5, 'apprentice', '見習い探検家', 'Apprentice Explorer'),
  rank(12, 'skilled', '一人前の探検家', 'Skilled Explorer'),
  rank(22, 'veteran', 'ベテラン探検家', 'Veteran Explorer'),
  rank(NATURAL.length, 'grand-tour', '太陽系グランドツアー', 'Grand Tour of the Solar System'),
  set('rocky', ['mercury', 'venus', 'earth', 'mars'], '岩の惑星めぐり', 'Rocky Planets Tour', '水星・金星・地球・火星を訪れる', 'Visit Mercury, Venus, Earth and Mars'),
  set('giants', ['jupiter', 'saturn', 'uranus', 'neptune'], '巨大惑星めぐり', 'Giant Planets Tour', '木星・土星・天王星・海王星を訪れる', 'Visit Jupiter, Saturn, Uranus and Neptune'),
  set('nearby', ['moon', ...moonsOf('mars')], '近くの衛星めぐり', 'Nearby Moons Tour', '月と、火星の衛星2つを訪れる', 'Visit the Moon and both moons of Mars'),
  set('galilean', moonsOf('jupiter'), 'ガリレオ衛星コンプリート', 'All Four Galilean Moons', '木星の4つの衛星（1610年にガリレオが見つけた）を訪れる', 'Visit the four moons of Jupiter that Galileo found in 1610'),
  set('saturn-moons', moonsOf('saturn'), '土星の衛星めぐり', 'Moons of Saturn', `土星の衛星${moonsOf('saturn').length}つを訪れる`, `Visit all ${moonsOf('saturn').length} moons of Saturn`),
  set('ice-moons', [...moonsOf('uranus'), ...moonsOf('neptune')], '氷の巨大惑星の衛星めぐり', 'Moons of the Ice Giants', '天王星と海王星の衛星をぜんぶ訪れる', 'Visit every moon of Uranus and Neptune'),
  set('far', group('dwarf'), '最果ての冥王星', 'Out to Pluto', '冥王星とカロンを訪れる', 'Visit Pluto and Charon'),
  set('scopes', group('scopes'), '望遠鏡ウォッチャー', 'Telescope Spotter', 'ハッブルとウェッブ、2つの宇宙望遠鏡を訪れる', 'Visit both space telescopes, Hubble and Webb'),
  { ...set('mystery', [CUBE_ID], '謎の発見者', 'Mystery Finder', 'どこかに浮かぶ、見たことのない船を見つける', 'Find the strange ship floating somewhere out there', true), sf: true },
  { ...set('colonist', [COLONY_ID], 'コロニー訪問者', 'Colony Visitor', 'L5スペースコロニーを訪れる', 'Visit the L5 Space Colony'), sf: true },
  { id: 'scholar', name: '博士の卵', nameEn: 'Budding Scientist', how: '航海日誌のクイズに10問正解する', howEn: 'Answer 10 ship’s log quizzes correctly', ids: NATURAL, count: 10, source: 'quiz' },
  { id: 'professor', name: '太陽系博士', nameEn: 'Solar System Professor', how: `航海日誌のクイズに、太陽・惑星・衛星ぜんぶ（${NATURAL.length}）正解する`, howEn: `Answer the ship’s log quiz for every sun, planet and moon (${NATURAL.length})`, ids: NATURAL, count: NATURAL.length, source: 'quiz' },
]

/** 称号のための数（集めた数、いる数） */
export function titleProgress(title: Title, stamps: Record<string, number>, explored: string[]) {
  const have = title.source === 'stamp' ? title.ids.filter((id) => id in stamps).length : title.ids.filter((id) => explored.includes(id)).length
  return { have: Math.min(have, title.count), need: title.count }
}

export const titleEarned = (title: Title, stamps: Record<string, number>, explored: string[]) => {
  const { have, need } = titleProgress(title, stamps, explored)
  return have >= need
}
