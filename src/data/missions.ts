import type { Quiz } from './facts'
import type { ShipId } from './ships'
import { ARK_ID, CROSS_ID, YARD_ID } from './sf'
import { ENGINE_ROCK_ID } from './sfEngine'
import { RADIO_MOON_ID } from './sfSpace'
import { MOON_CITY_ID, RAILWAY_ID } from './sfJapan'

// ストーリーモードの任務。ここには言葉を使わない決まりごとだけを書き、文章は i18n/missions.*.ts に置く。
// 任務は船ごとの「章」にまとまっていて、始めるとその章の船に乗り換える。章には現実編と SF 編がある。
// 一つの任務は、いくつかの手順（ステップ）を順番にこなしていく。

/**
 * goto：天体のそばまで行く
 * unload：天体のそばで止まって荷物を降ろす（seconds 秒）
 * scan：天体のそばで観測する（seconds 秒）
 * flyby：天体の雲・地表のすぐ上をかすめて飛ぶ（スイングバイ）
 * deflect：地球に近づく小惑星にビームを当てて、道すじをそらす
 * photo：目標を画面の枠に入れたまま seconds 秒（アマツカゼの天文台で撮影）。frame は表面からの距離の範囲（半径の何倍か）
 * load：天体のそばで止まって荷物を積む（seconds 秒）。積んでいるあいだは船が重くなる（ハコブネ）
 * dock：天体のそばに出る入港の輪へ、ゆっくり入って止まる（ハコブネ）
 * eclipse：宇宙から日食・月食を見る（eclipse の id。いちばん深くなるまで）
 */
export type StepKind = 'goto' | 'unload' | 'scan' | 'flyby' | 'deflect' | 'photo' | 'load' | 'dock' | 'eclipse'

export type MissionStep = { kind: StepKind; body: string; seconds?: number; frame?: [number, number]; eclipse?: string }

export type MissionDef = { id: string; steps: MissionStep[] }

export type ChapterDef = {
  id: string
  /** この章で乗る船 */
  ship: ShipId
  /** 現実編か SF 編か（SF 編は SF モードのときだけ出る） */
  world: 'real' | 'sf'
  missions: MissionDef[]
}

/** 任務3で出てくる小惑星（目標として選べるよう、天体の一覧に一時的に加える） */
export const ROCK_ID = 'mission-rock'

/** 道すじをそらすのに必要な命中の数 */
export const DEFLECT_HITS = 3

/** スイングバイ：雲の上からの高さが、半径のこの割合より低くなれば成功 */
export const FLYBY_ALTITUDE = 1.1

/** 入港：輪の中心からこの距離（船の長さの何倍か）に入り、この速さ（船の長さ／秒）より遅ければ止まったとみなす */
export const DOCK_RANGE = 0.9
export const DOCK_SPEED = 0.6
export const DOCK_SECONDS = 2
/** 荷物を積んだあいだの最高速度の割合 */
export const CARGO_SPEED = 0.6

const SV01_MISSIONS: MissionDef[] = [
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

export const CHAPTERS: ChapterDef[] = [
  { id: 'sv01-real', ship: 'sv01', world: 'real', missions: SV01_MISSIONS },
  {
    id: 'amatsu-real',
    ship: 'amatsu',
    world: 'real',
    missions: [
      {
        id: 'amatsu-jupiter-spot',
        steps: [
          { kind: 'goto', body: 'jupiter' },
          { kind: 'photo', body: 'jupiter', seconds: 4, frame: [0.3, 4] },
        ],
      },
      { id: 'amatsu-eclipse', steps: [{ kind: 'eclipse', body: 'earth', eclipse: 'solar-2024-04' }] },
      {
        id: 'amatsu-saturn-rings',
        steps: [
          { kind: 'goto', body: 'saturn' },
          { kind: 'photo', body: 'saturn', seconds: 4, frame: [2.5, 14] },
          { kind: 'photo', body: 'titan', seconds: 4, frame: [0.5, 12] },
        ],
      },
    ],
  },
  {
    id: 'hakobune-real',
    ship: 'hakobune',
    world: 'real',
    missions: [
      {
        id: 'hakobune-moon-water',
        steps: [
          { kind: 'goto', body: 'moon' },
          { kind: 'load', body: 'moon', seconds: 5 },
          { kind: 'goto', body: 'earth' },
          { kind: 'dock', body: 'earth' },
        ],
      },
      {
        id: 'hakobune-ring-ice',
        steps: [
          { kind: 'goto', body: 'saturn' },
          { kind: 'load', body: 'saturn', seconds: 6 },
          { kind: 'goto', body: 'mars' },
          { kind: 'dock', body: 'mars' },
        ],
      },
    ],
  },
  {
    id: 'amatsu-sf',
    ship: 'amatsu',
    world: 'sf',
    missions: [
      {
        id: 'amatsu-moon-city',
        steps: [
          { kind: 'goto', body: 'moon' },
          { kind: 'photo', body: MOON_CITY_ID, seconds: 4 },
        ],
      },
      {
        id: 'amatsu-radio-moon',
        steps: [
          { kind: 'goto', body: RADIO_MOON_ID },
          { kind: 'photo', body: RADIO_MOON_ID, seconds: 4 },
        ],
      },
      {
        id: 'amatsu-railway',
        steps: [
          { kind: 'goto', body: RAILWAY_ID },
          { kind: 'photo', body: RAILWAY_ID, seconds: 5 },
        ],
      },
    ],
  },
  {
    id: 'hakobune-sf',
    ship: 'hakobune',
    world: 'sf',
    missions: [
      {
        id: 'hakobune-ore',
        steps: [
          { kind: 'goto', body: CROSS_ID },
          { kind: 'load', body: CROSS_ID, seconds: 5 },
          { kind: 'goto', body: YARD_ID },
          { kind: 'dock', body: YARD_ID },
        ],
      },
      {
        id: 'hakobune-ark',
        steps: [
          { kind: 'goto', body: ENGINE_ROCK_ID },
          { kind: 'load', body: ENGINE_ROCK_ID, seconds: 5 },
          { kind: 'goto', body: ARK_ID },
          { kind: 'dock', body: ARK_ID },
        ],
      },
    ],
  },
]

/** すべての任務（章の順）。任務の番号はこの並びの番号 */
export const MISSIONS: MissionDef[] = CHAPTERS.flatMap((c) => c.missions)

export const chapterOf = (missionIndex: number) => {
  const id = MISSIONS[missionIndex]?.id
  return CHAPTERS.find((c) => c.missions.some((m) => m.id === id)) ?? CHAPTERS[0]
}

export const missionIndexOf = (id: string) => MISSIONS.findIndex((m) => m.id === id)

/** 前のバージョンで保存した星の並び（ソーラーボイジャーの8本） */
export const LEGACY_ORDER = SV01_MISSIONS.map((m) => m.id)

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
  /** SF 編：「現実の科学では」の説明 */
  real?: string[]
}

/** 章の文章 */
export type ChapterText = {
  title: string
  /** 船の得意技（この章で使う操作） */
  skill: string
  /** 得意技の使い方 */
  how: string
  intro: string
}
