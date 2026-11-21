// アポロ17号の本物の交信音声（NASA の記録。パブリックドメイン）の切り抜きと、字幕の時刻。
// 出典：Apollo Flight Journal / Apollo Lunar Surface Journal（apollojournals.org）の録音と文字起こし。
// セリフは作らない。字幕の文は src/i18n/moonMission.* の radio.lines にある（原文と訳）。

export type RadioWho = 'pao' | 'cdr' | 'capcom'
export type RadioLineKey = 'count' | 'liftoff1' | 'liftoff2' | 'landed' | 'super'
export type RadioClipId = 'liftoff' | 'landed'

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
}

/** 離昇は切り抜きの何秒目か（秒読みと合わせる） */
export const LIFTOFF_AT = 10
