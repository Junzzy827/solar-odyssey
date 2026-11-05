import { ui } from '../i18n'
import { useStore } from '../state/store'
import { CUBE_ID, cubeName } from './cube'
import { CARRIER_ID, FREIGHTER_ID, RADIO_MOON_ID, carrierName, freighterName, radioMoonName } from './sfSpace'
import { MOON_CITY_ID, RAILWAY_ID, moonCityName, railwayName } from './sfJapan'
import { HOURGLASS_ID, hourglassName } from './sfHourglass'
import { COLONY_GROUPS, colonyGroupName } from './sfSides'
import { ENGINE_ROCK_ID, engineRockName } from './sfEngine'

// SF モード：本物の太陽系に、架空の船や構造物を重ねて出す。
// どれも実在の研究や構想をもとにしたオリジナルのデザインで、作品の名前・ロゴ・設定画の形は使わない。
// 本物の科学のモード（real）には、ここにあるものは一切出さない。

export const isSF = () => useStore.getState().settings.world === 'sf'
export const useSF = () => useStore((s) => s.settings.world === 'sf')
/** 世界を切り替える。現実にもどすときは、SF のものを目標にしていたら外す */
export function setWorld(world: 'real' | 'sf') {
  const st = useStore.getState()
  if (st.settings.world === world) return
  st.updateSettings({ world })
  if (world === 'real' && isSFObject(st.targetId)) st.setTarget(null)
  st.showToast(world === 'sf' ? SF_TEXT.worldOn() : SF_TEXT.worldOff())
}

/** スペースコロニー（地球と月の L5 点。オニールの「島3号」の構想がもと） */
export const COLONY_ID = 'colony'
export const colonyName = () => ui().sf.colonyGroup1
/** 群の中の、ほかの円筒コロニー（入れるのは代表の1号基だけ） */
export const colonyMemberName = (n: number) => ui().sf.group1Colony(n)
/** ドーナツ型のコロニー（スタンフォード・トーラスの構想がもと） */
export const TORUS_ID = 'torus'
export const torusName = () => ui().sf.torusColony
/** くりぬいた小惑星の宇宙港（十字形は地球と月の L4、傘形は L2） */
export const CROSS_ID = 'rock-port'
export const crossName = () => ui().sf.crossAsteroidPort
export const UMBRELLA_ID = 'rock-base'
/** 移民船団（街を載せた都市船の隊列） */
export const FLEET_ID = 'fleet'
export const fleetName = () => ui().sf.migrantFleet
export const umbrellaName = () => ui().sf.umbrellaAsteroidBase
/** 月の軌道の造船所（自機 SV-01 の母港） */
export const YARD_ID = 'shipyard'
export const yardName = () => ui().sf.lunarShipyard
/** 地球の軌道の宇宙船ドック「天の湊」（輪と十字の、差し渡し約5kmの造船・整備の基地） */
export const DOCK_ID = 'spacedock'
export const dockName = () => ui().sf.amanoMinatoDock
/** 軌道エレベーター（目標は静止軌道の駅） */
export const ELEVATOR_ID = 'elevator'
export const elevatorName = () => ui().sf.spaceElevator

/** 太陽光ミラー発電所（太陽と地球の L1 点。宇宙太陽光発電の研究がもと） */
export const SOLAR_PLANT_ID = 'solar-plant'
export const solarPlantName = () => ui().sf.solarMirrorStation

/** 光帆の発射台（地球と月の L3 点。円筒を改造したレーザー発射台。ブレークスルー・スターショット計画がもと） */
export const SAIL_LAUNCHER_ID = 'sail-launcher'
export const sailLauncherName = () => ui().sf.lightSailLauncher

/** 構造物のそばで自機を縮める割合の目安（近くの構造物は、この倍率で本物の大きさの比率になるよう作る） */
export const SITE_ZOOM = 20
/** SITE_ZOOM のとき、1m が何表示単位か（自機は表示 0.3 で 640m） */
export const UNITS_PER_METER = 0.3 / SITE_ZOOM / 640

/** 太陽のまわりの集光衛星の群れ（水星の軌道より内側） */
export const DYSON_ID = 'dyson'
export const dysonName = () => ui().sf.dysonSwarm
/** となりの恒星をめざす世代宇宙船（海王星の外） */
export const ARK_ID = 'ark'
export const arkName = () => ui().sf.generationShip
/** エウロパの氷の上の、謎のビーコン */
export const BEACON_ID = 'beacon'
export const beaconName = () => ui().sf.europaBeacon
/** 地球の低い軌道で宇宙ごみを集める回収船 */
export const DEBRIS_ID = 'debris-tug'
export const debrisName = () => ui().sf.debrisCollector

export type SFEntry = {
  id: string
  name: () => string
  /** ワープの掛け声（英語）で呼ぶ名前 */
  spoken: string
  /** スタンプの色 */
  color: string
}

/** SF モードだけに出るもの。航法コンピュータの一覧・スタンプ帳はこの順に並ぶ */
export const SF_OBJECTS: SFEntry[] = [
  { id: COLONY_ID, name: colonyName, spoken: 'Colony Group 1', color: '#9fc6e8' },
  ...COLONY_GROUPS.map((g) => ({ id: g.id, name: () => colonyGroupName(g.n, g.point), spoken: `Colony Group ${g.n}`, color: '#8fb8dc' })),
  { id: TORUS_ID, name: torusName, spoken: 'the torus colony', color: '#c8d6a0' },
  { id: HOURGLASS_ID, name: hourglassName, spoken: 'the hourglass colonies', color: '#d8c7a0' },
  { id: YARD_ID, name: yardName, spoken: 'the lunar shipyard', color: '#d0b070' },
  { id: DOCK_ID, name: dockName, spoken: 'Amano-Minato dock', color: '#c8ccd6' },
  { id: ELEVATOR_ID, name: elevatorName, spoken: 'the space elevator', color: '#a0c8f0' },
  { id: CROSS_ID, name: crossName, spoken: 'the cross asteroid port', color: '#b59a7a' },
  { id: UMBRELLA_ID, name: umbrellaName, spoken: 'the umbrella asteroid base', color: '#9c8f86' },
  { id: FLEET_ID, name: fleetName, spoken: 'the migrant fleet', color: '#e0c6a0' },
  { id: SOLAR_PLANT_ID, name: solarPlantName, spoken: 'the solar power station', color: '#f2cf6a' },
  { id: SAIL_LAUNCHER_ID, name: sailLauncherName, spoken: 'the light-sail launcher', color: '#b49cff' },
  { id: RADIO_MOON_ID, name: radioMoonName, spoken: 'the radio telescope moon', color: '#b8bcc6' },
  { id: CARRIER_ID, name: carrierName, spoken: 'the ore carrier', color: '#d9a066' },
  { id: FREIGHTER_ID, name: freighterName, spoken: 'the disc freighter', color: '#9ad0c8' },
  { id: DYSON_ID, name: dysonName, spoken: 'the Dyson swarm', color: '#e0b25a' },
  { id: ARK_ID, name: arkName, spoken: 'the generation ship', color: '#a8c0d8' },
  { id: BEACON_ID, name: beaconName, spoken: 'the Europa beacon', color: '#5fd8e0' },
  { id: DEBRIS_ID, name: debrisName, spoken: 'the debris collector', color: '#f0b429' },
  { id: RAILWAY_ID, name: railwayName, spoken: 'the Galactic Railway', color: '#7fa6ff' },
  { id: MOON_CITY_ID, name: moonCityName, spoken: 'the Moon capital', color: '#e8cf8a' },
  { id: ENGINE_ROCK_ID, name: engineRockName, spoken: 'the engine asteroid', color: '#a8b4c8' },
  { id: CUBE_ID, name: cubeName, spoken: 'the unknown vessel', color: '#6fd0b8' },
  { id: 'gate', name: () => ui().sf.spaceTimeGate, spoken: 'the gate', color: '#8f7dff' },
  { id: 'blackhole', name: () => ui().sf.blackHole, spoken: 'the black hole', color: '#f0b45a' },
  { id: 'swarm', name: () => ui().sf.silverSwarm, spoken: 'the silver swarm', color: '#c9d2dc' },
  { id: 'desert', name: () => ui().sf.desertPlanet, spoken: 'the desert world', color: '#d9a066' },
  { id: 'iceworld', name: () => ui().sf.icePlanet, spoken: 'the ice world', color: '#bfe3ff' },
]
export const sfEntry = (id: string | null) => SF_OBJECTS.find((e) => e.id === id)
export const isSFObject = (id: string | null) => sfEntry(id) !== undefined

/**
 * コロニーの寸法（表示単位）。本物の構想は長さ約32km・直径約8km。
 * 天体のそばと同じく、近づくと自機を縮めて本物の比率で見せる（全長640mの自機が、長さの50分の1）
 */
export const COLONY_LENGTH = 1
export const COLONY_RADIUS = COLONY_LENGTH / 8
export const COLONY_REAL_KM = 32
/** 縮める割合：自機（表示 0.3 で 640m）を、コロニーの長さの本物の比率にする */
export const COLONY_ZOOM = 0.3 / ((0.64 / COLONY_REAL_KM) * COLONY_LENGTH)
/** 1G を作る回転：半径4km で約2分に1回転 */
export const COLONY_SPIN_SECONDS = 2 * Math.PI * Math.sqrt(4000 / 9.8)
/** 港（太陽と反対側の端の、回転軸のところ）の穴の半径 */
export const COLONY_PORT = COLONY_RADIUS * 0.3

export const SF_TEXT = {
  dysonFound: () =>
    ui().sf.dysonFound,
  arkFound: () =>
    ui().sf.arkFound,
  beaconFound: () =>
    ui().sf.beaconFound,
  debrisFound: () =>
    ui().sf.debrisFound,
  colonyFound: () =>
    ui().sf.colonyFound,
  torusFound: () =>
    ui().sf.torusFound,
  crossFound: () =>
    ui().sf.crossFound,
  umbrellaFound: () =>
    ui().sf.umbrellaFound,
  yardFound: () =>
    ui().sf.yardFound,
  dockFound: () =>
    ui().sf.dockFound,
  elevatorFound: () =>
    ui().sf.elevatorFound,
  fleetFound: () =>
    ui().sf.fleetFound,
  colonyInside: () =>
    ui().sf.colonyInside,
  solarPlantFound: () =>
    ui().sf.solarPlantFound,
  sailLauncherFound: () =>
    ui().sf.sailLauncherFound,
  worldOn: () => ui().sf.sfModeOn,
  worldOff: () => ui().sf.realModeOn,
}

/**
 * 時空のゲートとブラックホール（太陽系の外）。
 * ゲートは海王星の外。くぐると、ずっと遠くの回転するブラックホールのそばへ出る（ワームホールは理論の上だけの存在）。
 */
export const GATE_ID = 'gate'
export const BLACK_HOLE_ID = 'blackhole'
/** ゲートを置く、太陽からの距離（天文単位）と向き */
export const GATE_AU = 34
export const GATE_ANGLE = 2.3
/** ブラックホールの場所（太陽系からずっと離れた、表示単位の位置） */
export const BLACK_HOLE_POS: [number, number, number] = [0, 0, -20000]
/** 事象の地平面の半径（表示単位）。自機（0.3）の約7倍 */
export const BH_RS = 2
/** 光の曲がりを計算する球の半径（事象の地平面の何倍か） */
export const BH_LENS = 80
/** 降着円盤の内側と外側（事象の地平面の何倍か） */
export const BH_DISK = { inner: 3, outer: 14 }

/** 銀色の群れ（液体の金属のように形を変えながら漂う、架空の生命体の群れ） */
export const SWARM_ID = 'swarm'

export const SF_SPACE_TEXT = {
  gateFound: () =>
    ui().sf.gateFound,
  through: () => ui().sf.passingGate,
  arrived: () =>
    ui().sf.blackHoleArrived,
  tooClose: () =>
    ui().sf.blackHoleTooClose,
  swarmFound: () =>
    ui().sf.swarmFound,
}

/**
 * 太陽系の外の惑星（架空の場所）。ブラックホールと同じく、太陽系からずっと離れた位置に置き、ワープで行く。
 * 砂の惑星は、本物の周連星惑星ケプラー16b（橙色のK型星と赤いM型星の2つの太陽を回る）がもと
 */
export const DESERT_ID = 'desert'
export const ICE_ID = 'iceworld'
export const DESERT_POS: [number, number, number] = [19000, 0, 6000]
export const ICE_POS: [number, number, number] = [-19000, 0, 6000]
/** 惑星の半径（表示単位。自機の長さの約100倍） */
export const EXO_RADIUS = 30

export const EXO_TEXT = {
  desertArrived: () =>
    ui().sf.desertArrived,
  iceArrived: () =>
    ui().sf.iceArrived,
  low: () => ui().sf.tooLow,
}
