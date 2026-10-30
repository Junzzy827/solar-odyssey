import { t } from '../i18n/lang'
import { useStore } from '../state/store'
import { CUBE_ID, cubeName } from './cube'

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
export const colonyName = () => t('L5スペースコロニー', 'L5 Space Colony')

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
  { id: COLONY_ID, name: colonyName, spoken: 'the L5 colony', color: '#9fc6e8' },
  { id: SOLAR_PLANT_ID, name: solarPlantName, spoken: 'the solar power station', color: '#f2cf6a' },
  { id: SAIL_LAUNCHER_ID, name: sailLauncherName, spoken: 'the light-sail launcher', color: '#b49cff' },
  { id: CUBE_ID, name: cubeName, spoken: 'the unknown vessel', color: '#6fd0b8' },
  { id: 'gate', name: () => t('時空のゲート', 'Space-Time Gate'), spoken: 'the gate', color: '#8f7dff' },
  { id: 'blackhole', name: () => t('ブラックホール（太陽系の外）', 'Black Hole (beyond the solar system)'), spoken: 'the black hole', color: '#f0b45a' },
  { id: 'swarm', name: () => t('銀色の群れ', 'Silver Swarm'), spoken: 'the silver swarm', color: '#c9d2dc' },
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
  colonyFound: () =>
    t(
      'スペースコロニーが見えてきた。太陽と反対側の端にある港から、中へ入れます。\n（I で航海日誌）',
      'A space colony comes into view. You can fly inside through the port at the end facing away from the Sun.\n(I for the ship’s log)',
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
