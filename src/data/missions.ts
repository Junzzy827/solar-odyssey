import type { Quiz } from './facts'

// ストーリーモードの任務。ここには言葉を使わない決まりごとだけを書き、文章は i18n/missions.*.ts に置く。
// 一つの任務は、いくつかの手順（ステップ）を順番にこなしていく。

/**
 * goto：天体のそばまで行く
 * unload：天体のそばで止まって荷物を降ろす（seconds 秒）
 * scan：天体のそばで観測する（seconds 秒）
 * flyby：天体の雲・地表のすぐ上をかすめて飛ぶ（スイングバイ）
 * deflect：地球に近づく小惑星にビームを当てて、道すじをそらす
 */
export type StepKind = 'goto' | 'unload' | 'scan' | 'flyby' | 'deflect'

export type MissionStep = { kind: StepKind; body: string; seconds?: number }

export type MissionDef = { id: string; steps: MissionStep[] }

/** 任務3で出てくる小惑星（目標として選べるよう、天体の一覧に一時的に加える） */
export const ROCK_ID = 'mission-rock'

/** 道すじをそらすのに必要な命中の数 */
export const DEFLECT_HITS = 3

/** スイングバイ：雲の上からの高さが、半径のこの割合より低くなれば成功 */
export const FLYBY_ALTITUDE = 1.1

export const MISSIONS: MissionDef[] = [
  {
    id: 'moon-supply',
    steps: [
      { kind: 'goto', body: 'moon' },
      { kind: 'unload', body: 'moon', seconds: 5 },
    ],
  },
  {
    id: 'mars-parts',
    steps: [
      { kind: 'goto', body: 'mars' },
      { kind: 'unload', body: 'mars', seconds: 5 },
      { kind: 'scan', body: 'phobos', seconds: 5 },
    ],
  },
  {
    id: 'asteroid-deflect',
    steps: [
      { kind: 'goto', body: 'earth' },
      { kind: 'deflect', body: ROCK_ID },
    ],
  },
  {
    id: 'jupiter-cargo',
    steps: [
      { kind: 'goto', body: 'jupiter' },
      { kind: 'flyby', body: 'jupiter' },
      { kind: 'goto', body: 'ganymede' },
      { kind: 'unload', body: 'ganymede', seconds: 5 },
    ],
  },
  {
    id: 'io-europa',
    steps: [
      { kind: 'scan', body: 'io', seconds: 6 },
      { kind: 'scan', body: 'europa', seconds: 6 },
    ],
  },
  {
    id: 'saturn-rings',
    steps: [
      { kind: 'scan', body: 'saturn', seconds: 6 },
      { kind: 'scan', body: 'mimas', seconds: 5 },
    ],
  },
  {
    id: 'water-hunt',
    steps: [
      { kind: 'scan', body: 'enceladus', seconds: 6 },
      { kind: 'scan', body: 'titan', seconds: 6 },
    ],
  },
  {
    id: 'pluto-voyage',
    steps: [
      { kind: 'scan', body: 'pluto', seconds: 6 },
      { kind: 'scan', body: 'charon', seconds: 5 },
    ],
  },
]

/** 任務の文章（言語ごとに一つ） */
export type MissionText = {
  title: string
  /** 依頼主 */
  client: string
  /** 出発前の説明（航法AIのことば） */
  briefing: string[]
  steps: {
    /** 画面に出し続ける目標 */
    goal: string
    /** この手順を始めるときの説明 */
    start: string
    /** この手順を終えたときの解説 */
    done: string
    /** deflect：命中したときのことば（命中の数だけ） */
    hits?: string[]
  }[]
  /** 学んだことのまとめ */
  summary: string[]
  /** 任務のあとのクイズ（2問） */
  quiz: Quiz[]
}
