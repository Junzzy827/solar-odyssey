import type { Quiz } from './facts'
import type { ShipId } from './ships'
import { ARK_ID, BEACON_ID, BLACK_HOLE_ID, COLONY_ID, CROSS_ID, DESERT_ID, DYSON_ID, FLEET_ID, GATE_ID, ICE_ID, SAIL_LAUNCHER_ID, SOLAR_PLANT_ID, YARD_ID } from './sf'
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
 * launch：探査艇を発進させて天体へ送る（ホワイトヘロン）。back なら艇が戻ってくるまで（救助では相手を連れて帰る）
 * sail：光の帆で distance だけ進む（ソラカゼ）。light はその場所の太陽の光の強さ（地球のそばを1とした本物の比）
 * land：着陸艇を天体の表面へ降ろして、戻ってくるまで（メグリ）
 * beam：天体のまわりに出る光の点（BEAM_NODES 個）に、ビームを全部当てる（最終章の SV-01）
 */
export type StepKind = 'goto' | 'unload' | 'scan' | 'flyby' | 'deflect' | 'photo' | 'load' | 'dock' | 'eclipse' | 'launch' | 'sail' | 'land' | 'beam'

export type MissionStep = {
  kind: StepKind
  body: string
  seconds?: number
  frame?: [number, number]
  eclipse?: string
  back?: boolean
  distance?: number
  light?: number
}

export type MissionDef = {
  id: string
  /** この任務だけ別の船に乗る（最終章は任務ごとに船が変わる） */
  ship?: ShipId
  steps: MissionStep[]
}

export type ChapterDef = {
  id: string
  /** この章で乗る船 */
  ship: ShipId
  /** 現実編か SF 編か（SF 編は SF モードのときだけ出る） */
  world: 'real' | 'sf'
  /** 船団の全船で挑む章（最終章） */
  fleet?: boolean
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

/** 探査艇を出せる距離（表示の単位）と、艇が行く・帰るのにかかる秒数 */
export const LAUNCH_RANGE = 30
export const CRAFT_SECONDS = 3
/** 着陸艇：降りる・地表にいる・上がる秒数 */
export const LANDER_SECONDS = [4, 3, 4] as const
/** 光の帆：最高速度の割合は光の強さに比例させるが、遊べる範囲に収める */
export const SAIL_SPEED: [number, number] = [0.15, 4]
/** 最終章：ゲートのまわりに出る起動の光の数 */
export const BEAM_NODES = 3
/** 救助の任務で出てくる作業メカ（目標として選べるよう、天体の一覧に一時的に加える） */
export const MECH_ID = 'mission-mech'

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
    id: 'heron-real',
    ship: 'heron',
    world: 'real',
    missions: [
      {
        id: 'heron-galilean',
        steps: [
          { kind: 'goto', body: 'jupiter' },
          { kind: 'launch', body: 'io' },
          { kind: 'launch', body: 'europa' },
          { kind: 'launch', body: 'ganymede' },
          { kind: 'launch', body: 'callisto' },
        ],
      },
      {
        id: 'heron-saturn-moons',
        steps: [
          { kind: 'goto', body: 'saturn' },
          { kind: 'launch', body: 'enceladus' },
          { kind: 'launch', body: 'titan' },
        ],
      },
    ],
  },
  {
    id: 'sorakaze-real',
    ship: 'sorakaze',
    world: 'real',
    missions: [
      {
        id: 'sorakaze-mercury',
        steps: [
          { kind: 'goto', body: 'venus' },
          { kind: 'sail', body: 'venus', distance: 60, light: 1.9 },
          { kind: 'goto', body: 'mercury' },
          { kind: 'sail', body: 'mercury', distance: 60, light: 6.6 },
          { kind: 'unload', body: 'mercury', seconds: 4 },
        ],
      },
      {
        id: 'sorakaze-outer',
        steps: [
          { kind: 'goto', body: 'mars' },
          { kind: 'sail', body: 'mars', distance: 30, light: 0.43 },
          { kind: 'goto', body: 'jupiter' },
          { kind: 'sail', body: 'jupiter', distance: 12, light: 0.037 },
        ],
      },
    ],
  },
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
    id: 'meguri-real',
    ship: 'meguri',
    world: 'real',
    missions: [
      {
        id: 'meguri-titan',
        steps: [
          { kind: 'goto', body: 'titan' },
          { kind: 'land', body: 'titan' },
        ],
      },
      {
        id: 'meguri-europa',
        steps: [
          { kind: 'goto', body: 'europa' },
          { kind: 'land', body: 'europa' },
        ],
      },
    ],
  },
  {
    id: 'heron-sf',
    ship: 'heron',
    world: 'sf',
    missions: [
      {
        id: 'heron-rescue',
        steps: [
          { kind: 'goto', body: COLONY_ID },
          { kind: 'launch', body: MECH_ID, back: true },
        ],
      },
      {
        id: 'heron-beacon',
        steps: [
          { kind: 'goto', body: 'europa' },
          { kind: 'launch', body: BEACON_ID, back: true },
        ],
      },
    ],
  },
  {
    id: 'sorakaze-sf',
    ship: 'sorakaze',
    world: 'sf',
    missions: [
      {
        id: 'sorakaze-laser',
        steps: [
          { kind: 'goto', body: SAIL_LAUNCHER_ID },
          { kind: 'scan', body: SAIL_LAUNCHER_ID, seconds: 4 },
          { kind: 'sail', body: SAIL_LAUNCHER_ID, distance: 120, light: 50 },
          { kind: 'goto', body: FLEET_ID },
          { kind: 'unload', body: FLEET_ID, seconds: 4 },
        ],
      },
      {
        id: 'sorakaze-dyson',
        steps: [
          { kind: 'goto', body: DYSON_ID },
          { kind: 'sail', body: DYSON_ID, distance: 80, light: 25 },
          { kind: 'goto', body: SOLAR_PLANT_ID },
          { kind: 'unload', body: SOLAR_PLANT_ID, seconds: 4 },
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
  {
    id: 'meguri-sf',
    ship: 'meguri',
    world: 'sf',
    missions: [
      {
        id: 'meguri-blackhole',
        steps: [
          { kind: 'goto', body: BLACK_HOLE_ID },
          { kind: 'scan', body: BLACK_HOLE_ID, seconds: 6 },
        ],
      },
      {
        id: 'meguri-desert',
        steps: [
          { kind: 'goto', body: DESERT_ID },
          { kind: 'land', body: DESERT_ID },
        ],
      },
      {
        id: 'meguri-ice',
        steps: [
          { kind: 'goto', body: ICE_ID },
          { kind: 'land', body: ICE_ID },
        ],
      },
    ],
  },
  {
    id: 'finale-sf',
    ship: 'sv01',
    world: 'sf',
    fleet: true,
    missions: [
      {
        id: 'finale-observe',
        ship: 'amatsu',
        steps: [
          { kind: 'goto', body: GATE_ID },
          { kind: 'photo', body: GATE_ID, seconds: 4 },
        ],
      },
      {
        id: 'finale-core',
        ship: 'hakobune',
        steps: [
          { kind: 'goto', body: YARD_ID },
          { kind: 'load', body: YARD_ID, seconds: 5 },
          { kind: 'goto', body: GATE_ID },
          { kind: 'dock', body: GATE_ID },
        ],
      },
      {
        id: 'finale-buoy',
        ship: 'heron',
        steps: [
          { kind: 'goto', body: GATE_ID },
          { kind: 'launch', body: GATE_ID },
        ],
      },
      {
        id: 'finale-light',
        ship: 'sorakaze',
        steps: [
          { kind: 'goto', body: SAIL_LAUNCHER_ID },
          { kind: 'sail', body: SAIL_LAUNCHER_ID, distance: 120, light: 50 },
          { kind: 'goto', body: GATE_ID },
          { kind: 'unload', body: GATE_ID, seconds: 4 },
        ],
      },
      {
        id: 'finale-open',
        ship: 'sv01',
        steps: [
          { kind: 'goto', body: GATE_ID },
          { kind: 'beam', body: GATE_ID },
        ],
      },
      {
        id: 'finale-beyond',
        ship: 'meguri',
        steps: [
          { kind: 'goto', body: GATE_ID },
          { kind: 'goto', body: DESERT_ID },
          { kind: 'land', body: DESERT_ID },
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

/** 任務で乗る船（ふだんは章の船、最終章は任務ごと） */
export const shipOf = (missionIndex: number) => MISSIONS[missionIndex]?.ship ?? chapterOf(missionIndex).ship

/** その船の得意技を説明している章（現実編） */
export const skillChapterOf = (ship: ShipId) => CHAPTERS.find((c) => c.ship === ship && c.world === 'real' && !c.fleet) ?? CHAPTERS[0]

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
    /** launch・land：艇が着いたときのことば */
    arrive?: string
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
