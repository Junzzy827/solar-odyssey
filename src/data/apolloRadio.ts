// アポロ17号の本物の交信音声（NASA の記録。パブリックドメイン）の切り抜きと、字幕の時刻。
// 出典：Apollo Flight Journal / Apollo Lunar Surface Journal（apollojournals.org）の録音と文字起こし。
// セリフは作らない。字幕の文は src/i18n/moonMission.* の radio.lines にある（原文と訳）。

export type RadioWho = 'pao' | 'cdr' | 'capcom' | 'lmp'
export type RadioLineKey = 'count' | 'liftoff1' | 'liftoff2' | 'landed' | 'super' | 'goTli' | 'goTliAck' | 'arrived' | 'heardYou' | 'pdiCount' | 'pdiIgnition' | 'ohHey' | 'what' | 'orangeSoil' | 'dontMove' | 'allOver' | 'leaveAsWeCame' | 'peaceHope' | 'ascentCount' | 'ascentIgnition' | 'onOurWay' | 'ratesGood'
export type RadioClipId = 'liftoff' | 'landed' | 'tli' | 'aos' | 'pdi' | 'orange' | 'lastWords' | 'ascent'

export type RadioLine = { from: number; to: number; who: RadioWho; key: RadioLineKey }
export type RadioClip = {
  file: string
  /** 長さ（秒） */
  length: number
  /** ミッション経過時間の表示（本物の時刻） */
  get: string
  lines: RadioLine[]
}

export const RADIO: Record<RadioClipId, RadioClip> = {
  // 打ち上げ 10 秒前から、塔を越えるまで（ケネディ宇宙センターの実況）。切り抜きの 10.0 秒が離昇
  liftoff: {
    file: 'audio/apollo17/liftoff.mp3',
    length: 19.9,
    get: 'T-00:00:10',
    lines: [
      { from: 0, to: 10, who: 'pao', key: 'count' },
      { from: 10, to: 14.2, who: 'pao', key: 'liftoff1' },
      { from: 14.2, to: 19.9, who: 'pao', key: 'liftoff2' },
    ],
  },
  // 月へ向かう点火の許可（経過時間 002:53:12、ヒューストンのボブ・オーヴァマイヤー）
  tli: {
    file: 'audio/apollo17/tli.mp3',
    length: 13.5,
    get: '002:53:12',
    lines: [
      { from: 0.2, to: 6.4, who: 'capcom', key: 'goTli' },
      { from: 7.4, to: 13.5, who: 'cdr', key: 'goTliAck' },
    ],
  },
  // 月の裏でブレーキをかけたあと、表に出て交信が戻ったとき（経過時間 089:21:18）
  aos: {
    file: 'audio/apollo17/aos.mp3',
    length: 12.6,
    get: '089:21:18',
    lines: [
      { from: 0.3, to: 7.9, who: 'cdr', key: 'arrived' },
      { from: 8.6, to: 12.6, who: 'capcom', key: 'heardYou' },
    ],
  },
  // 降下の点火（経過時間 112:49:51。秒読みは着陸船パイロットのシュミット）
  pdi: {
    file: 'audio/apollo17/pdi.mp3',
    length: 7.9,
    get: '112:49:51',
    lines: [
      { from: 0, to: 4.3, who: 'lmp', key: 'pdiCount' },
      { from: 4.3, to: 7.9, who: 'cdr', key: 'pdiIgnition' },
    ],
  },
  // 着陸の直後（経過時間 113:02:11）
  landed: {
    file: 'audio/apollo17/landed.mp3',
    length: 7.2,
    get: '113:02:11',
    lines: [
      { from: 0.3, to: 4.4, who: 'cdr', key: 'landed' },
      { from: 5.2, to: 7.2, who: 'capcom', key: 'super' },
    ],
  },
  // ショーティ・クレーターでオレンジの土を見つけた瞬間（経過時間 145:26:22、2 回目の船外活動の観測点4）
  orange: {
    file: 'audio/apollo17/orange.mp3',
    length: 20.4,
    get: '145:26:22',
    lines: [
      { from: 0.3, to: 2.9, who: 'lmp', key: 'ohHey' },
      { from: 2.9, to: 4.4, who: 'cdr', key: 'what' },
      { from: 4.4, to: 10.0, who: 'lmp', key: 'orangeSoil' },
      { from: 10.0, to: 13.0, who: 'cdr', key: 'dontMove' },
      { from: 13.0, to: 16.5, who: 'lmp', key: 'allOver' },
      { from: 16.5, to: 20.4, who: 'cdr', key: 'dontMove' },
    ],
  },
  // 月面に残る最後の言葉（経過時間 170:41、サーナン船長。長い言葉の終わりの部分）
  lastWords: {
    file: 'audio/apollo17/lastwords.mp3',
    length: 17.8,
    get: '170:41:36',
    lines: [
      { from: 0.2, to: 9.5, who: 'cdr', key: 'leaveAsWeCame' },
      { from: 9.5, to: 17.8, who: 'cdr', key: 'peaceHope' },
    ],
  },
  // 月からの離陸（経過時間 188:01:39 に点火。切り抜きの 7.0 秒）
  ascent: {
    file: 'audio/apollo17/ascent.mp3',
    length: 13.0,
    get: '188:01:32',
    lines: [
      { from: 0, to: 6.8, who: 'lmp', key: 'ascentCount' },
      { from: 6.8, to: 8.0, who: 'lmp', key: 'ascentIgnition' },
      { from: 8.0, to: 10.8, who: 'cdr', key: 'onOurWay' },
      { from: 10.8, to: 13.0, who: 'lmp', key: 'ratesGood' },
    ],
  },
}

/** 離昇は切り抜きの何秒目か（秒読みと合わせる） */
export const LIFTOFF_AT = 10
