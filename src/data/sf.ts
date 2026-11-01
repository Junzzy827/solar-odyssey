import { t } from '../i18n/lang'
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
export const colonyName = () => t('第1コロニー群（L5）', 'Colony Group 1 (L5)')
/** 群の中の、ほかの円筒コロニー（入れるのは代表の1号基だけ） */
export const colonyMemberName = (n: number) => t(`第1コロニー群 ${n}号基`, `Group 1, Colony ${n}`)
/** ドーナツ型のコロニー（スタンフォード・トーラスの構想がもと） */
export const TORUS_ID = 'torus'
export const torusName = () => t('ドーナツ型コロニー', 'Torus Colony')
/** くりぬいた小惑星の宇宙港（十字形は地球と月の L4、傘形は L2） */
export const CROSS_ID = 'rock-port'
export const crossName = () => t('十字の小惑星港', 'Cross Asteroid Port')
export const UMBRELLA_ID = 'rock-base'
/** 移民船団（街を載せた都市船の隊列） */
export const FLEET_ID = 'fleet'
export const fleetName = () => t('移民船団', 'Migrant Fleet')
export const umbrellaName = () => t('傘の小惑星基地', 'Umbrella Asteroid Base')
/** 月の軌道の造船所（自機 SV-01 の母港） */
export const YARD_ID = 'shipyard'
export const yardName = () => t('月軌道の造船所', 'Lunar Shipyard')
/** 地球の軌道の宇宙船ドック「天の湊」（輪と十字の、差し渡し約5kmの造船・整備の基地） */
export const DOCK_ID = 'spacedock'
export const dockName = () => t('宇宙船ドック「天の湊」', 'Amano-Minato Orbital Dock')
/** 軌道エレベーター（目標は静止軌道の駅） */
export const ELEVATOR_ID = 'elevator'
export const elevatorName = () => t('軌道エレベーター', 'Space Elevator')

/** 太陽光ミラー発電所（太陽と地球の L1 点。宇宙太陽光発電の研究がもと） */
export const SOLAR_PLANT_ID = 'solar-plant'
export const solarPlantName = () => t('太陽光ミラー発電所', 'Solar Mirror Power Station')

/** 光帆の発射台（地球と月の L3 点。円筒を改造したレーザー発射台。ブレークスルー・スターショット計画がもと） */
export const SAIL_LAUNCHER_ID = 'sail-launcher'
export const sailLauncherName = () => t('光帆発射台', 'Light-Sail Launcher')

/** 構造物のそばで自機を縮める割合の目安（近くの構造物は、この倍率で本物の大きさの比率になるよう作る） */
export const SITE_ZOOM = 20
/** SITE_ZOOM のとき、1m が何表示単位か（自機は表示 0.3 で 640m） */
export const UNITS_PER_METER = 0.3 / SITE_ZOOM / 640

/** 太陽のまわりの集光衛星の群れ（水星の軌道より内側） */
export const DYSON_ID = 'dyson'
export const dysonName = () => t('ダイソン・スウォーム', 'Dyson Swarm')
/** となりの恒星をめざす世代宇宙船（海王星の外） */
export const ARK_ID = 'ark'
export const arkName = () => t('世代宇宙船', 'Generation Ship')
/** エウロパの氷の上の、謎のビーコン */
export const BEACON_ID = 'beacon'
export const beaconName = () => t('エウロパのビーコン', 'Europa Beacon')
/** 地球の低い軌道で宇宙ごみを集める回収船 */
export const DEBRIS_ID = 'debris-tug'
export const debrisName = () => t('宇宙ごみ回収船', 'Debris Collector')

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
  { id: 'gate', name: () => t('時空のゲート', 'Space-Time Gate'), spoken: 'the gate', color: '#8f7dff' },
  { id: 'blackhole', name: () => t('ブラックホール（太陽系の外）', 'Black Hole (beyond the solar system)'), spoken: 'the black hole', color: '#f0b45a' },
  { id: 'swarm', name: () => t('銀色の群れ', 'Silver Swarm'), spoken: 'the silver swarm', color: '#c9d2dc' },
  { id: 'desert', name: () => t('2つの太陽の砂の惑星（太陽系の外）', 'Desert Planet of Two Suns (beyond the solar system)'), spoken: 'the desert world', color: '#d9a066' },
  { id: 'iceworld', name: () => t('氷の惑星（太陽系の外）', 'Ice Planet (beyond the solar system)'), spoken: 'the ice world', color: '#bfe3ff' },
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
    t(
      'ダイソン・スウォームです。太陽のまわりの輪に、何千もの集光衛星が並んで、太陽の光を受けとめています。\n（I で航海日誌）',
      'This is the Dyson swarm. Thousands of collector satellites line rings around the Sun, catching its light.\n(I for the ship’s log)',
    ),
  arkFound: () =>
    t(
      '世代宇宙船に追いつきました。何世代もかけて、となりの恒星ケンタウルス座アルファ星をめざしています。\n（I で航海日誌）',
      'You have caught up with the generation ship. It is heading for the nearest star, Alpha Centauri, on a trip that will take many generations.\n(I for the ship’s log)',
    ),
  beaconFound: () =>
    t(
      'エウロパの氷の上に、見たことのない物体が立っています。光の球がゆっくりふくらんでは消えています。\n（I で航海日誌）',
      'Something no one has seen before stands on Europa’s ice. A ball of light slowly swells and fades.\n(I for the ship’s log)',
    ),
  debrisFound: () =>
    t(
      '宇宙ごみの回収船です。地球の低い軌道を回りながら、腕の先の網で、古いロケットや破片を1つずつつかまえています。\n（I で航海日誌）',
      'This is the debris collector. Circling Earth in low orbit, it catches old rocket parts and fragments one by one with the net on its arm.\n(I for the ship’s log)',
    ),
  colonyFound: () =>
    t(
      '第1コロニー群が見えてきた。1号基には、太陽と反対側の端にある港から入れます。\n（I で航海日誌）',
      'Colony Group 1 comes into view. In Colony 1 you can fly inside through the port at the end facing away from the Sun.\n(I for the ship’s log)',
    ),
  torusFound: () =>
    t(
      'ドーナツ型のコロニーです。直径約1.8kmの輪が1分に1回転して、輪の中に1万人が暮らす設計です。\n（I で航海日誌）',
      'This is a torus colony. Its 1.8 km ring turns once a minute, and it is designed for 10,000 people to live inside the ring.\n(I for the ship’s log)',
    ),
  crossFound: () =>
    t(
      '金平糖のような形の小惑星の宇宙港です。運んできた小惑星をくりぬいて、港と住まいにしています。光っている四角は船の出入り口です。\n（I で航海日誌）',
      'An asteroid port shaped like a spiky konpeito candy. Asteroids were brought here and hollowed out for docks and homes. The glowing squares are the ship entrances.\n(I for the ship’s log)',
    ),
  umbrellaFound: () =>
    t(
      'キノコの形をした小惑星の基地です。厚い傘の裏と柄の先に、船の出入り口があります。\n（I で航海日誌）',
      'A mushroom-shaped asteroid base. Ships come and go through entrances under the wide cap and at the tip of the stem.\n(I for the ship’s log)',
    ),
  yardFound: () =>
    t(
      '月軌道の造船所です。左のドックでは姉妹艦 SV-03 を建造中。右の空いたドックが、この船 SV-01 の母港の係留場所です。\n（I で航海日誌）',
      'This is the lunar shipyard. In the left dock, the sister ship SV-03 is being built. The empty dock on the right is the home berth of this ship, SV-01.\n(I for the ship’s log)',
    ),
  dockFound: () =>
    t(
      '宇宙船ドック「天の湊（あまのみなと）」です。差し渡し約5kmの輪と十字の基地で、前の大きなドックには大型の船がまるごと入ります。後ろの船台では、新しい船を組み立てています。\n（I で航海日誌）',
      'This is the Amano-Minato Orbital Dock, a ring-and-cross base about 5 km across. A large ship fits whole inside the big dock at the front, and a new ship is being built on the open slipway at the back.\n(I for the ship’s log)',
    ),
  elevatorFound: () =>
    t(
      '軌道エレベーターの駅です。赤道の海の基地からケーブルが伸びていて、昇降機がゆっくり上り下りしています。\n（I で航海日誌）',
      'This is the space elevator station. A cable rises from a base on the ocean at the equator, and climbers slowly ride up and down.\n(I for the ship’s log)',
    ),
  fleetFound: () =>
    t(
      '移民船団です。背中の透明な丸屋根の中に、森と街がまるごと載っています。先頭が旗艦、まわりの小さな船は補給船です。\n（I で航海日誌）',
      'This is the migrant fleet. Under the clear domes on their backs, whole towns and forests ride along. The lead ship is the flagship; the small ones are supply ships.\n(I for the ship’s log)',
    ),
  colonyInside: () =>
    t(
      'コロニーの中に入りました。頭の上にも大地が広がっています。回転の遠心力が、内側の地面に重力の代わりの力を生んでいます。',
      'You are inside the colony. There is land above your head too. The spin pushes everything outward, and that push works like gravity on the inner ground.',
    ),
  solarPlantFound: () =>
    t(
      '太陽光ミラー発電所が見えてきた。約3800枚の鏡が太陽の光を1点に集め、電気に変えて地球へ送っています。\n（I で航海日誌）',
      'The Solar Mirror Power Station comes into view. About 3,800 mirrors gather sunlight onto one spot, turn it into electricity and beam it to Earth.\n(I for the ship’s log)',
    ),
  sailLauncherFound: () =>
    t(
      '光帆発射台が見えてきた。レーザーで、切手ほどの小さな探査機を星へ向けて送り出しています。\n（I で航海日誌）',
      'The Light-Sail Launcher comes into view. It uses a laser to send stamp-sized probes off toward the stars.\n(I for the ship’s log)',
    ),
  worldOn: () => t('SFモード：架空の船や構造物も出します。本物の太陽系の上に重ねて表示しています。', 'SF mode: imaginary ships and structures appear on top of the real solar system.'),
  worldOff: () => t('現実モード：本物の太陽系だけを表示します。', 'Real mode: only the real solar system is shown.'),
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
    t('時空のゲートのそばに来ました。輪の中へまっすぐ飛びこむと、遠くのブラックホールへ出ます。', 'You are near the space-time gate. Fly straight into the ring to come out by a faraway black hole.'),
  through: () => t('ゲートを通ります…', 'Passing through the gate…'),
  arrived: () =>
    t(
      'ブラックホールのそばに出ました。光が重力で曲がり、うしろにある円盤の向こう側まで、上と下に回りこんで見えています。\n帰りは近くのゲートをくぐるか、太陽系の目標へワープ。',
      'You came out near a black hole. Its gravity bends light, so you can see the far side of the disk wrapped over the top and under the bottom.\nTo go home, fly through the nearby gate or warp to any target in the solar system.',
    ),
  tooClose: () =>
    t(
      'これ以上は近づけません。ここでは重力で時間の進み方がおそくなります。事象の地平面の近くでは、外の世界の何倍もの時間が流れます。',
      'You cannot go any closer. Gravity slows time down here: close to the event horizon, much more time passes in the outside world than for you.',
    ),
  swarmFound: () =>
    t('銀色の群れです。液体の金属のように形を変えながら、静かに漂っています。近づいても何もしてきません。', 'A silver swarm. It drifts quietly, changing shape like liquid metal. It does nothing when you come close.'),
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
    t(
      '2つの太陽を回る砂の惑星に着きました。惑星のふちに、橙色と赤の太陽が並んでしずんでいきます。\n帰りは近くのゲートをくぐるか、太陽系の目標へワープ。',
      'You have reached a desert planet that circles two suns. An orange sun and a red sun set side by side over its edge.\nTo go home, fly through the nearby gate or warp to any target in the solar system.',
    ),
  iceArrived: () =>
    t(
      '氷の惑星に着きました。青白い氷が星じゅうをおおい、うすい雲が流れています。\n帰りは近くのゲートをくぐるか、太陽系の目標へワープ。',
      'You have reached an ice planet. Blue-white ice covers the whole world, with thin clouds drifting over it.\nTo go home, fly through the nearby gate or warp to any target in the solar system.',
    ),
  low: () => t('これより低くは飛べません（大気の上で止まります）。', 'You cannot fly any lower (you stop above the air).'),
}
