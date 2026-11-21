// 月ミッションの章：どの章からでも始められ、遊んでいる途中で次の章へ飛ばせる。
// 章の番号は計画の 0〜8（0 発射台、1 上昇、2 地球の周回と月への点火、3 ドッキング、4 青い地球と 3 日の旅、
// 5 月の裏でブレーキ、6 着陸、7 月面の探検、8 帰還）。まだ作っていない章は start がない。

import { debugSkip, saveChapter, startMoonMission, useMoonMission, setCaption, type MissionPhase } from './moonMission'
import { lunarSkip } from './moonLunar'

export type Chapter = {
  n: number
  /** この章から始める（ない章は準備中） */
  start?: () => void
}

/** いまのミッションを止めて、新しく始める */
function begin(chapter: 'launch' | 'moon', after?: () => void) {
  useMoonMission.setState({ phase: 'none' })
  startMoonMission(chapter, after)
}

export const CHAPTERS: Chapter[] = [
  { n: 0, start: () => begin('launch') },
  {
    n: 1,
    start: () =>
      begin('launch', () => {
        // 秒読みを飛ばして、離昇の瞬間から
        useMoonMission.setState({ phase: 'ascent', countdown: 0, ignitedAt: 1 })
        setCaption('ignition')
      }),
  },
  {
    n: 2,
    start: () =>
      begin('launch', () => {
        // 上昇はおまかせで済ませて、地球を回り始めた所から
        let guard = 0
        while (useMoonMission.getState().phase !== 'orbit' && guard++ < 400) debugSkip(guard * 5)
        useMoonMission.setState({ auto: false, caption: null })
        setCaption('orbit')
      }),
  },
  { n: 3 },
  { n: 4 },
  { n: 5, start: () => begin('moon') },
  { n: 6, start: () => begin('moon', () => lunarSkip('undock', false)) },
  { n: 7 },
  { n: 8 },
]

const OF_PHASE: Partial<Record<MissionPhase, number>> = {
  pad: 0,
  ascent: 1,
  orbit: 2,
  tli: 2,
  outbound: 2,
  coast: 5,
  loi: 5,
  undock: 6,
  descent: 6,
  landed: 6,
}

/** いまの章（ミッションの外では null） */
export const chapterOf = (phase: MissionPhase): number | null => OF_PHASE[phase] ?? null

/** いまの章の次に遊べる章（なければ null） */
export function nextChapter(phase: MissionPhase): Chapter | null {
  const now = chapterOf(phase)
  if (now === null) return null
  return CHAPTERS.find((c) => c.n > now && c.start) ?? null
}

export function startChapter(n: number) {
  const c = CHAPTERS[n]
  if (!c?.start) return
  saveChapter(n)
  c.start()
}

// 章が変わるたびに、進んだ所を残す
useMoonMission.subscribe((s, prev) => {
  if (s.phase === prev.phase) return
  const n = chapterOf(s.phase)
  if (n !== null && n > 0) saveChapter(n)
})
