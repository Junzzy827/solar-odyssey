import { RALLY_LINE } from './rallyCourse'
import { MOON_LINE } from './moonCourse'

// ローバーレースのコース（レース場ごと）。キーは着陸地点（SITES、surfaces.ts）の名前

export type RallyTrack = {
  /** どの天体か */
  body: string
  /** 走行ライン（10 m ごと、x 東・z 南） */
  line: [number, number][]
  /** 追いかけっこ：ライバルが先に逃げて、ゴールまでにタッチしてつかまえる（月） */
  chase?: boolean
}

/** RallyTrack の文言（日本語は src/i18n/rallyTracks.ja.ts、英語は rallyTracks.en.ts） */
export type RallyTrackText = {
  /** スタート欄の題 */
  title: string
  /** スタート欄の説明 */
  intro: string
  /** 運転中・着陸船のボタン */
  button: string
  /** もとの着陸地点へ戻るボタン */
  home: string
}

export const TRACKS: Record<string, RallyTrack> = {
  coprates: {
    body: 'mars',
    line: RALLY_LINE,
  },
  taurus: {
    body: 'moon',
    line: MOON_LINE,
    chase: true,
  },
}

/** その天体のレース場（無ければ null） */
export function trackForBody(body: string): string | null {
  for (const [id, tr] of Object.entries(TRACKS)) if (tr.body === body) return id
  return null
}
