// 宇宙から見る日食・月食。日付と種類、見えた（見える）場所は NASA の一覧から。
// 時刻はおおよそで、再生するときは月の位置の計算（moon.ts）で、影の軸がいちばん近づく時刻を探して真ん中にする。

export type EclipseKind = 'solar' | 'lunar'
export type EclipseType = 'total' | 'annular' | 'partial' | 'penumbral'

export type Eclipse = {
  id: string
  kind: EclipseKind
  type: EclipseType
  /** 食がいちばん深くなる、おおよその時刻（世界時） */
  at: string
}

/** Eclipse の文言（日本語は src/i18n/eclipses.ja.ts、英語は eclipses.en.ts） */
export type EclipseText = {
  where: string
  note: string
}

export const ECLIPSES: Eclipse[] = [
  {
    id: 'solar-2024-04',
    kind: 'solar',
    type: 'total',
    at: '2024-04-08T18:17Z',
  },
  {
    id: 'lunar-2025-09',
    kind: 'lunar',
    type: 'total',
    at: '2025-09-07T18:12Z',
  },
  {
    id: 'lunar-2026-03',
    kind: 'lunar',
    type: 'total',
    at: '2026-03-03T11:34Z',
  },
  {
    id: 'solar-2026-08',
    kind: 'solar',
    type: 'total',
    at: '2026-08-12T17:46Z',
  },
  {
    id: 'solar-2027-02',
    kind: 'solar',
    type: 'annular',
    at: '2027-02-06T16:00Z',
  },
  {
    id: 'solar-2027-08',
    kind: 'solar',
    type: 'total',
    at: '2027-08-02T10:07Z',
  },
  {
    id: 'solar-2028-07',
    kind: 'solar',
    type: 'total',
    at: '2028-07-22T02:56Z',
  },
  {
    id: 'lunar-2028-12',
    kind: 'lunar',
    type: 'total',
    at: '2028-12-31T16:52Z',
  },
  {
    id: 'lunar-2029-06',
    kind: 'lunar',
    type: 'total',
    at: '2029-06-26T03:22Z',
  },
  {
    id: 'solar-2030-06',
    kind: 'solar',
    type: 'annular',
    at: '2030-06-01T06:28Z',
  },
  {
    id: 'solar-2035-09',
    kind: 'solar',
    type: 'total',
    at: '2035-09-02T01:56Z',
  },
]

export const eclipseById = (id: string | null) => ECLIPSES.find((e) => e.id === id) ?? null
