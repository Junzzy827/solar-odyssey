// ローバーレースの、ゲームに入っている記録（レース場ごと、track）。ハイスコア表に自分の記録といっしょに並び、表の 1 位なら
// その走りが金色のゴーストになって、いっしょに走る（state/rallyHiscore.ts, components/surface/RallyGhost.tsx）。
// course は走ったコースの印（state/rallyGhost.ts の coursePrint）。コースの線を変えると、印の合わない記録は表に出ない。
// b64 は走りの記録：1 秒に hz 回、x, y, z（m）・向き・縦の傾き・横の傾き（ラジアン）の Float32 を base64 に。

export type RallyRecord = {
  /** 走った人 */
  name: string
  /** レース場（data/rallyTracks.ts の TRACKS の名前） */
  track: string
  /** 追いかけっこだけ：つかまえたローバーの数 */
  caught?: number
  course: string
  /** タイム（秒） */
  time: number
  /** 順位 1〜4 */
  place: number
  /** ローバーの色（RALLY_COLORS の番号） */
  color: number
  /** 走った日時（Date.now()） */
  at: number
  hz: number
  b64: string
}

export const RALLY_RECORDS: RallyRecord[] = []
