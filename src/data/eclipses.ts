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
  where: string
  whereEn: string
  note: string
  noteEn: string
}

export const ECLIPSES: Eclipse[] = [
  {
    id: 'solar-2024-04',
    kind: 'solar',
    type: 'total',
    at: '2024-04-08T18:17Z',
    where: 'メキシコ・アメリカ・カナダ',
    whereEn: 'Mexico, the United States and Canada',
    note: '北アメリカを縦断した皆既日食。何千万人もの人が見ました。',
    noteEn: 'A total eclipse that crossed North America. Tens of millions of people watched it.',
  },
  {
    id: 'lunar-2025-09',
    kind: 'lunar',
    type: 'total',
    at: '2025-09-07T18:12Z',
    where: '日本（9月8日の未明）・アジア・ヨーロッパ・アフリカ・オーストラリア',
    whereEn: 'Japan (early on September 8), Asia, Europe, Africa and Australia',
    note: '日本の全国で、皆既月食の始めから終わりまで見られました。',
    noteEn: 'All of Japan could watch this total lunar eclipse from start to finish.',
  },
  {
    id: 'lunar-2026-03',
    kind: 'lunar',
    type: 'total',
    at: '2026-03-03T11:34Z',
    where: '日本（夜のはじめ）・東アジア・オーストラリア・南北アメリカ',
    whereEn: 'Japan (early evening), East Asia, Australia and the Americas',
    note: '日本では、夜の早い時間に赤い月が見られました。',
    noteEn: 'In Japan, the red Moon could be seen early in the evening.',
  },
  {
    id: 'solar-2026-08',
    kind: 'solar',
    type: 'total',
    at: '2026-08-12T17:46Z',
    where: 'グリーンランド・アイスランド・スペイン',
    whereEn: 'Greenland, Iceland and Spain',
    note: '月の影が北極の近くから入り、夕方のスペインへぬけていきました。',
    noteEn: 'The Moon’s shadow came in near the Arctic and swept down to Spain in the evening.',
  },
  {
    id: 'solar-2027-02',
    kind: 'solar',
    type: 'annular',
    at: '2027-02-06T16:00Z',
    where: 'チリ・アルゼンチン・大西洋・西アフリカ',
    whereEn: 'Chile, Argentina, the Atlantic and West Africa',
    note: '月が地球から遠いので、太陽をかくしきれず、まわりが輪のように光る「金環日食」です。',
    noteEn: 'The Moon is far from Earth, so it cannot cover the whole Sun, and a ring of sunlight shines around it: an annular eclipse.',
  },
  {
    id: 'solar-2027-08',
    kind: 'solar',
    type: 'total',
    at: '2027-08-02T10:07Z',
    where: 'スペイン南部・北アフリカ・エジプト・サウジアラビア',
    whereEn: 'Southern Spain, North Africa, Egypt and Saudi Arabia',
    note: '月が地球にとても近く、皆既が最長6分以上続く、今世紀でも特に長い皆既日食です。',
    noteEn: 'The Moon is very close to Earth, so totality lasts over 6 minutes, one of the longest this century.',
  },
  {
    id: 'solar-2028-07',
    kind: 'solar',
    type: 'total',
    at: '2028-07-22T02:56Z',
    where: 'オーストラリア（シドニーなど）・ニュージーランド',
    whereEn: 'Australia (including Sydney) and New Zealand',
    note: '月の影がオーストラリア大陸をななめに横切り、大都市シドニーも通ります。',
    noteEn: 'The Moon’s shadow cuts across Australia and passes right over the big city of Sydney.',
  },
  {
    id: 'lunar-2028-12',
    kind: 'lunar',
    type: 'total',
    at: '2028-12-31T16:52Z',
    where: '日本（元日の未明）・アジア・ヨーロッパ・アフリカ・オーストラリア',
    whereEn: 'Japan (early on New Year’s Day), Asia, Europe, Africa and Australia',
    note: '日本では、2029年の元日の真夜中に皆既月食になります。',
    noteEn: 'In Japan, the Moon turns red in the middle of the night on New Year’s Day 2029.',
  },
  {
    id: 'lunar-2029-06',
    kind: 'lunar',
    type: 'total',
    at: '2029-06-26T03:22Z',
    where: '南北アメリカ・ヨーロッパ西部・アフリカ西部',
    whereEn: 'The Americas, western Europe and western Africa',
    note: '月が地球の影のほぼ真ん中を通るので、皆既が1時間40分ほども続きます。',
    noteEn: 'The Moon passes almost through the middle of Earth’s shadow, so totality lasts about 1 hour 40 minutes.',
  },
  {
    id: 'solar-2030-06',
    kind: 'solar',
    type: 'annular',
    at: '2030-06-01T06:28Z',
    where: '北アフリカ・ギリシャ・トルコ・ロシア・中国・日本（北海道）',
    whereEn: 'North Africa, Greece, Turkey, Russia, China and Japan (Hokkaido)',
    note: '北海道で金環日食が見られます。日本のほかの場所でも、太陽が大きく欠けて見えます。',
    noteEn: 'Hokkaido will see the ring of fire, and the rest of Japan will see a big partial eclipse.',
  },
  {
    id: 'solar-2035-09',
    kind: 'solar',
    type: 'total',
    at: '2035-09-02T01:56Z',
    where: '中国・朝鮮半島・日本（北陸・関東の北など）',
    whereEn: 'China, Korea and Japan (Hokuriku and the north of Kanto)',
    note: '日本の本州で見られる皆既日食。本州では1887年以来、148年ぶりです。',
    noteEn: 'A total eclipse over Japan’s main island, Honshu, the first there since 1887, 148 years earlier.',
  },
]

export const eclipseById = (id: string | null) => ECLIPSES.find((e) => e.id === id) ?? null
