import { useStore } from '../state/store'
import { COMPARE_VIEW, DEFAULT_VIEW, METERS_PER_UNIT, SHIP_LENGTH_M, SHIP_PARTS, SHOTS, type ShipPart, type View } from './shipParts'

// 乗る船をえらべる。SV-01 のほかの船は Blender で組み立てたモデル（tools/blender/build_fleet.py）。
// どれもこのアプリのオリジナルの空想の船で、本物の科学や乗り物と結びつく話をそえる。
// 位置はどれも船の模型の座標（Y が上、前方が -Z、全長およそ 1）

export type ShipId = 'sv01' | 'heron' | 'sorakaze' | 'hakobune'

/** 灯火：strobe は白い衝突防止灯（3秒おきに2回光る）、port は左舷の赤、starboard は右舷の緑、beacon は赤い回転灯風 */
export type ShipLight = { pos: [number, number, number]; kind: 'strobe' | 'port' | 'starboard' | 'beacon'; size: number }

/** 船体を照らす投光器（暗い宇宙でも形がわかるように、外板に光のたまりを作る） */
export type Flood = { from: [number, number, number]; to: [number, number, number]; angle: number; intensity: number }

/** 外板に描く文字（型式番号や船名）。pos は板の中心、rot は板の向き（オイラー角）、size は幅と高さ */
export type Decal = { text: string; pos: [number, number, number]; rot: [number, number, number]; size: [number, number]; color?: string }

export type ShipSpec = {
  id: ShipId
  registry: string
  name: string
  nameEn: string
  /** 船の種類 */
  kind: string
  kindEn: string
  /** 選ぶ画面の紹介文 */
  blurb: string
  blurbEn: string
  /** 設定上の全長（m） */
  lengthM: number
  /** 模型の座標の 1 が何 m か */
  metersPerUnit: number
  /** 旋回の速さの倍率（大きな船ほどゆっくり） */
  turn: number
  /** glb（SV-01 以外） */
  model?: string
  /** ブリッジの部屋の床の基準点（模型の座標） */
  bridgeBase: [number, number, number]
  parts: ShipPart[]
  defaultView: View
  compareView: View
  shots: { from: View; to: View }[]
  lights: ShipLight[]
  floods: Flood[]
  decals: Decal[]
  /** 噴射の光の色（ふだん・ワープ準備） */
  glow: { idle: [number, number, number]; warp: [number, number, number] }
  /** 選ぶ画面のカードの色（外板の主な色） */
  swatch: string[]
}

const PI = Math.PI

const SV01: ShipSpec = {
  id: 'sv01',
  registry: 'SV-01',
  name: 'ソーラーボイジャー',
  nameEn: 'Solar Voyager',
  kind: '調査船',
  kindEn: 'Survey vessel',
  blurb: '円盤部と2本のナセルを持つ、この船団の旗艦。バランスのよい船です。',
  blurbEn: 'The flagship: a saucer and two nacelles. A well-balanced ship.',
  lengthM: SHIP_LENGTH_M,
  metersPerUnit: METERS_PER_UNIT,
  turn: 1,
  bridgeBase: [0, 0, 0],
  parts: SHIP_PARTS,
  defaultView: DEFAULT_VIEW,
  compareView: COMPARE_VIEW,
  shots: SHOTS,
  lights: [],
  floods: [],
  decals: [],
  glow: { idle: [1, 1, 1], warp: [1, 1, 1] },
  swatch: ['#e6e4dc', '#4aa8ff', '#ff4a2a'],
}

const HERON: ShipSpec = {
  id: 'heron',
  registry: 'SC-03',
  name: 'ホワイトヘロン',
  nameEn: 'White Heron',
  kind: '探査母艦',
  kindEn: 'Survey carrier',
  blurb: '前へ長く伸びた2本の「脚」に、小型の探査艇を積む白い母艦。武装はありません。',
  blurbEn: 'A white carrier whose two long forward "legs" hold small survey craft. It has no weapons.',
  lengthM: 400,
  metersPerUnit: 400 / 1.06,
  turn: 0.9,
  model: 'ship-heron.glb',
  bridgeBase: [0, 0.163, -0.02],
  parts: [
    {
      id: 'legs',
      name: '脚（格納庫と発進甲板）',
      nameEn: 'Legs (hangars and launch decks)',
      text: '左右に伸びた脚の中は、小型の探査艇の格納庫という設定です。上の甲板の光る線は、探査艇を押し出す発進レール（カタパルト）。本物の空母も、短い甲板で飛行機を飛ばすためにカタパルトを使います。',
      textEn: 'In the story, each leg holds a hangar for small survey craft. The glowing line on top is a launch rail (catapult). Real aircraft carriers use catapults too, to launch planes from a short deck.',
      pos: [0.212, 0.03, -0.2],
      side: [0, 1, 0],
      view: { yaw: PI - 0.9, pitch: 0.42, dist: 0.85, target: [0.15, 0, -0.2] },
    },
    {
      id: 'bay',
      name: '発進口',
      nameEn: 'Launch bay',
      text: '脚の先の開いた口。奥に格納庫の明かりが見えます。探査艇はここから前へ飛び出し、帰りもここへ入ります。',
      textEn: 'The open mouth at the tip of each leg. You can see the hangar lights inside. Survey craft fly out forward here and come back the same way.',
      pos: [-0.212, -0.04, -0.48],
      side: [0, 0, -1],
      view: { yaw: PI + 0.45, pitch: 0.12, dist: 0.42, target: [-0.212, -0.044, -0.46] },
    },
    {
      id: 'bridge',
      name: '艦橋（ブリッジ）',
      nameEn: 'Bridge',
      text: '背中に高く立つ塔の上が、船を指揮する部屋。左右に張り出しているのは、外を直接見るための見張り台（ブリッジウイング）で、本物の船にもあります。',
      textEn: 'The command room sits on the tall tower on the ship’s back. The parts sticking out to each side are bridge wings for looking outside directly, just like on real ships.',
      pos: [0, 0.17, 0],
      side: [0, 1, 0],
      view: { yaw: PI - 0.6, pitch: 0.28, dist: 0.38, target: [0, 0.15, -0.01] },
    },
    {
      id: 'sensors',
      name: 'アンテナとセンサー',
      nameEn: 'Antennas and sensors',
      text: '塔のてっぺんのアンテナと小さな皿は、通信と観測のため。本物の探査機も、地球と話すための皿形のアンテナ（ハイゲインアンテナ）を持っています。',
      textEn: 'The mast and small dish on top are for radio and observation. Real space probes also carry a dish (a high-gain antenna) to talk to Earth.',
      pos: [0.024, 0.19, 0.035],
      side: null,
      view: { yaw: PI - 1.2, pitch: 0.35, dist: 0.3, target: [0.01, 0.18, 0.02] },
    },
    {
      id: 'engines',
      name: '主機',
      nameEn: 'Main engines',
      text: '後ろの左右の機関ブロックに、ベル形の噴射口が2つずつ。本物のロケットのノズルも、ガスを広げて速く吹き出すためにこの形をしています。',
      textEn: 'Two bell-shaped nozzles on each engine block at the back. Real rocket nozzles have this shape too: it lets the gas expand and shoot out faster.',
      pos: [0.118, 0.004, 0.55],
      side: [0, 0, 1],
      view: { yaw: 0.45, pitch: 0.2, dist: 0.6, target: [0, 0, 0.45] },
    },
    {
      id: 'wings',
      name: '翼と尾翼',
      nameEn: 'Wings and tail fins',
      text: '宇宙には空気がないので、本当は翼は要りません。この船では、熱を逃がす放熱板と、大気のある星に近づくときの安定のための板、という設定です。',
      textEn: 'Space has no air, so a ship does not really need wings. On this ship they double as radiators to shed heat, and steady the ship near worlds with air.',
      pos: [0.36, -0.02, 0.44],
      side: null,
      view: { yaw: 1.1, pitch: 0.5, dist: 0.9, target: [0.15, 0.02, 0.38] },
    },
  ],
  defaultView: { yaw: PI - 0.75, pitch: 0.3, dist: 1.75, target: [0, 0, 0] },
  compareView: { yaw: -1.2, pitch: 0.45, dist: 2.6, target: [-0.6, -0.1, 0.0] },
  shots: [
    { from: { yaw: PI - 0.9, pitch: 0.2, dist: 1.8, target: [0, 0.02, -0.05] }, to: { yaw: PI - 0.25, pitch: 0.3, dist: 1.35, target: [0, 0.03, -0.1] } },
    { from: { yaw: PI + 0.55, pitch: -0.3, dist: 1.1, target: [0, -0.03, -0.2] }, to: { yaw: PI + 1.1, pitch: -0.18, dist: 0.9, target: [0, -0.03, -0.1] } },
    { from: { yaw: PI - 0.5, pitch: 0.3, dist: 0.5, target: [0, 0.14, 0] }, to: { yaw: PI - 1.4, pitch: 0.2, dist: 0.45, target: [0, 0.14, 0.02] } },
    { from: { yaw: 0.8, pitch: 0.25, dist: 1.0, target: [0, 0, 0.4] }, to: { yaw: -0.5, pitch: 0.3, dist: 1.15, target: [0, 0, 0.35] } },
    { from: { yaw: -0.3, pitch: 1.1, dist: 2.0, target: [0, 0, 0] }, to: { yaw: 0.6, pitch: 0.95, dist: 1.7, target: [0, 0, -0.05] } },
  ],
  lights: [
    { pos: [0, 0.222, 0.02], kind: 'strobe', size: 0.0012 },
    { pos: [-0.448, -0.03, 0.485], kind: 'strobe', size: 0.0014 },
    { pos: [0.448, -0.03, 0.485], kind: 'strobe', size: 0.0014 },
    { pos: [-0.113, 0.185, 0.495], kind: 'strobe', size: 0.0011 },
    { pos: [0.113, 0.185, 0.495], kind: 'strobe', size: 0.0011 },
    { pos: [-0.282, -0.02, -0.4], kind: 'port', size: 0.0035 },
    { pos: [0.282, -0.02, -0.4], kind: 'starboard', size: 0.0035 },
    { pos: [0, -0.093, -0.1], kind: 'beacon', size: 0.0028 },
  ],
  floods: [
    { from: [0, 0.2, 0.25], to: [0, 0.08, -0.15], angle: 0.5, intensity: 0.7 },
    { from: [0.32, 0.12, 0.2], to: [0.212, 0.0, -0.25], angle: 0.4, intensity: 0.6 },
    { from: [-0.32, 0.12, 0.2], to: [-0.212, 0.0, -0.25], angle: 0.4, intensity: 0.6 },
    { from: [0, -0.2, 0.3], to: [0, -0.05, -0.2], angle: 0.6, intensity: 0.45 },
  ],
  decals: [
    { text: 'SC-03', pos: [0.212, 0.0262, 0.16], rot: [-PI / 2, 0, 0], size: [0.08, 0.032] },
    { text: 'SC-03', pos: [-0.212, 0.0262, 0.16], rot: [-PI / 2, 0, 0], size: [0.08, 0.032] },
    { text: 'SC-03  WHITE HERON', pos: [0, 0.0615, -0.15], rot: [-PI / 2, 0, 0], size: [0.11, 0.014] },
  ],
  glow: { idle: [0.55, 0.85, 1.9], warp: [1.4, 1.9, 3.2] },
  swatch: ['#eef0f2', '#8d96a3', '#d9472b'],
}

const SORAKAZE: ShipSpec = {
  id: 'sorakaze',
  registry: 'LS-04',
  name: 'ソラカゼ',
  nameEn: 'Sorakaze',
  kind: '光帆の連絡船',
  kindEn: 'Light-sail courier',
  blurb: '6枚の細長い帆をゆっくり回し、太陽の光に押されて進む小さな船。身軽でよく曲がります。',
  blurbEn: 'A small ship that spins six long, thin sails and is pushed along by sunlight. Light and nimble.',
  lengthM: 150,
  metersPerUnit: 150 / 0.93,
  turn: 1.35,
  model: 'ship-sorakaze.glb',
  bridgeBase: [0, 0.047, -0.36],
  parts: [
    {
      id: 'blades',
      name: '光の帆',
      nameEn: 'Light sails',
      text: '光は、当たったものをほんの少し押します。うすい鏡の帆でその力を集めて進みます。2010年、日本の「イカロス」が、太陽の光の力で宇宙を進んだ初めての宇宙船になりました。イカロスの帆の厚さは0.0075mm。',
      textEn: 'Light gives a tiny push to whatever it hits. Thin mirror sails gather that push. In 2010 Japan’s IKAROS became the first spacecraft to travel through space on sunlight. Its sail was only 0.0075 mm thick.',
      pos: [0.45, 0, 0.05],
      side: null,
      view: { yaw: PI - 0.5, pitch: 0.5, dist: 1.9, target: [0, 0, 0] },
    },
    {
      id: 'hub',
      name: '帆の軸',
      nameEn: 'Sail hub',
      text: '帆はゆっくり回って、遠心力でぴんと張ります。こういう形を「ヘリオジャイロ」と呼び、NASAが研究してきました。イカロスも回転して帆を広げました。',
      textEn: 'The sails turn slowly, and the spin keeps them stretched tight. This design is called a heliogyro, and NASA has studied it. IKAROS also spun to unfold its sail.',
      pos: [0, 0.06, 0.05],
      side: null,
      view: { yaw: PI - 0.9, pitch: 0.3, dist: 0.5, target: [0, 0, 0.05] },
    },
    {
      id: 'capsule',
      name: '居住区',
      nameEn: 'Crew module',
      text: '2人が乗れる小さな区画。燃料をほとんど積まないので、船はとても軽くできます。',
      textEn: 'A small module for a crew of two. The ship carries almost no fuel, so it can be very light.',
      pos: [0, 0.05, -0.32],
      side: null,
      view: { yaw: PI - 0.7, pitch: 0.25, dist: 0.5, target: [0, 0, -0.3] },
    },
    {
      id: 'panels',
      name: '太陽電池と放熱板',
      nameEn: 'Solar panels and radiators',
      text: '電気をつくり、いらない熱を宇宙へ逃がす板。宇宙では空気で冷やせないので、熱は光（赤外線）にして捨てます。',
      textEn: 'Panels that make power and get rid of extra heat. There is no air in space to cool things, so heat is thrown away as light (infrared).',
      pos: [0.12, 0.01, 0.27],
      side: null,
      view: { yaw: 0.9, pitch: 0.5, dist: 0.55, target: [0.05, 0, 0.27] },
    },
    {
      id: 'ion',
      name: 'イオンエンジン',
      nameEn: 'Ion thrusters',
      text: '向きを変えたり、細かく速さを合わせたりする小さなエンジン。本物では「はやぶさ」や「はやぶさ2」がイオンエンジンで小惑星まで旅しました。',
      textEn: 'Small engines for turning and fine speed changes. In real life, Japan’s Hayabusa and Hayabusa2 used ion engines to reach asteroids.',
      pos: [0, 0, 0.43],
      side: [0, 0, 1],
      view: { yaw: 0.4, pitch: 0.25, dist: 0.4, target: [0, 0, 0.4] },
    },
  ],
  defaultView: { yaw: PI - 0.7, pitch: 0.35, dist: 2.1, target: [0, 0, 0] },
  compareView: { yaw: -1.2, pitch: 0.42, dist: 6.5, target: [-2.2, -0.2, 0.15] },
  shots: [
    { from: { yaw: PI - 0.9, pitch: 0.25, dist: 2.2, target: [0, 0, 0] }, to: { yaw: PI - 0.2, pitch: 0.35, dist: 1.8, target: [0, 0, -0.05] } },
    { from: { yaw: PI - 0.6, pitch: 0.2, dist: 0.6, target: [0, 0, -0.3] }, to: { yaw: PI - 1.3, pitch: 0.15, dist: 0.55, target: [0, 0, -0.2] } },
    { from: { yaw: 0.2, pitch: 0.05, dist: 2.4, target: [0, 0, 0] }, to: { yaw: -0.3, pitch: 0.1, dist: 2.0, target: [0, 0, 0] } },
    { from: { yaw: 1.4, pitch: 0.9, dist: 1.4, target: [0, 0, 0.1] }, to: { yaw: 0.8, pitch: 0.6, dist: 1.1, target: [0, 0, 0.1] } },
  ],
  lights: [
    { pos: [0, 0.048, -0.25], kind: 'strobe', size: 0.0009 },
    { pos: [0, -0.03, 0.4], kind: 'strobe', size: 0.0009 },
    { pos: [-0.16, 0.002, 0.27], kind: 'port', size: 0.0022 },
    { pos: [0.16, 0.002, 0.27], kind: 'starboard', size: 0.0022 },
  ],
  floods: [
    { from: [0, 0.15, 0.1], to: [0, 0, -0.3], angle: 0.4, intensity: 0.6 },
    { from: [0, -0.12, 0.2], to: [0, 0, 0.05], angle: 0.6, intensity: 0.4 },
  ],
  decals: [
    { text: 'LS-04 SORAKAZE', pos: [0.0465, 0, -0.355], rot: [0, PI / 2, 0], size: [0.08, 0.009] },
    { text: 'LS-04 SORAKAZE', pos: [-0.0465, 0, -0.355], rot: [0, -PI / 2, 0], size: [0.08, 0.009] },
  ],
  glow: { idle: [0.5, 0.75, 2.2], warp: [1.2, 1.8, 3.5] },
  swatch: ['#f2f2ee', '#c9d4e4', '#e0662f'],
}

const HAKOBUNE: ShipSpec = {
  id: 'hakobune',
  registry: 'HT-05',
  name: 'ハコブネ',
  nameEn: 'Hakobune',
  kind: '大型貨物船',
  kindEn: 'Heavy freighter',
  blurb: '長い骨組みにコンテナをびっしり抱え、後ろの核融合ロケットで進む大きな貨物船。ゆっくり、どっしり曲がります。',
  blurbEn: 'A big freighter: a long frame packed with cargo containers, pushed by a fusion rocket at the back. It turns slowly and steadily.',
  lengthM: 800,
  metersPerUnit: 800 / 1.053,
  turn: 0.7,
  model: 'ship-hakobune.glb',
  bridgeBase: [0, 0.069, -0.42],
  parts: [
    {
      id: 'cab',
      name: '操縦区画',
      nameEn: 'Command module',
      text: '乗組員が暮らし、船を動かす区画。前の黄色と黒の帯は、ほかの船や基地とつながるドッキング口の目印です。',
      textEn: 'Where the crew live and fly the ship. The yellow-and-black stripes at the front mark the docking port where it links to other ships and stations.',
      pos: [0, 0.07, -0.42],
      side: null,
      view: { yaw: PI - 0.6, pitch: 0.25, dist: 0.6, target: [0, 0, -0.42] },
    },
    {
      id: 'cargo',
      name: 'コンテナ',
      nameEn: 'Cargo containers',
      text: '同じ大きさの箱に荷物を入れて運ぶのは、地球の貨物船と同じ考え方です。積み下ろしが速く、どの港でも同じ道具で扱えます。',
      textEn: 'Packing goods into boxes of one size is the same idea as cargo ships on Earth. Loading is fast, and every port can handle them with the same tools.',
      pos: [0, 0.11, 0],
      side: null,
      view: { yaw: PI - 1.1, pitch: 0.3, dist: 0.95, target: [0, 0, 0] },
    },
    {
      id: 'radiators',
      name: '放熱板',
      nameEn: 'Radiators',
      text: '核融合炉の熱を宇宙へ逃がす大きな板。国際宇宙ステーションにも、白い大きな放熱板があります。',
      textEn: 'Big panels that shed the reactor’s heat into space. The International Space Station also has large white radiators.',
      pos: [0.2, 0.2, 0.2],
      side: null,
      view: { yaw: 0.9, pitch: 0.45, dist: 0.95, target: [0, 0, 0.2] },
    },
    {
      id: 'reactor',
      name: '核融合炉と遮へい板',
      nameEn: 'Fusion reactor and shield',
      text: '太陽と同じ「核融合」でエネルギーをつくる炉、という設定です。前の金色の板は、放射線から乗組員と荷物を守る盾。本物の核融合炉は、まだ地上で研究中です。',
      textEn: 'In the story, the reactor makes energy by fusion, like the Sun. The gold plate in front shields the crew and cargo from radiation. Real fusion reactors are still being researched on Earth.',
      pos: [0, 0.08, 0.36],
      side: null,
      view: { yaw: 0.7, pitch: 0.3, dist: 0.55, target: [0, 0, 0.37] },
    },
    {
      id: 'nozzle',
      name: '磁気ノズル',
      nameEn: 'Magnetic nozzle',
      text: 'とても熱いガス（プラズマ）は、どんな金属も溶かします。そこで、輪の形の電磁石が作る磁場で、プラズマに触れずに後ろへ吹き出します。',
      textEn: 'Very hot gas (plasma) would melt any metal. So ring-shaped electromagnets make a magnetic field that pushes the plasma out the back without touching it.',
      pos: [0, 0.08, 0.5],
      side: [0, 0, 1],
      view: { yaw: 0.45, pitch: 0.2, dist: 0.45, target: [0, 0, 0.48] },
    },
  ],
  defaultView: { yaw: PI - 0.8, pitch: 0.3, dist: 1.7, target: [0, 0, 0] },
  compareView: { yaw: -1.2, pitch: 0.42, dist: 1.7, target: [-0.4, -0.06, 0.04] },
  shots: [
    { from: { yaw: PI - 0.9, pitch: 0.2, dist: 1.7, target: [0, 0, -0.05] }, to: { yaw: PI - 0.3, pitch: 0.3, dist: 1.3, target: [0, 0, -0.1] } },
    { from: { yaw: PI - 1.4, pitch: 0.15, dist: 0.8, target: [0, 0, 0] }, to: { yaw: PI - 1.9, pitch: 0.2, dist: 0.75, target: [0, 0, 0.1] } },
    { from: { yaw: 0.8, pitch: 0.25, dist: 0.9, target: [0, 0, 0.35] }, to: { yaw: -0.4, pitch: 0.3, dist: 1.0, target: [0, 0, 0.35] } },
    { from: { yaw: -0.3, pitch: 1.1, dist: 1.9, target: [0, 0, 0] }, to: { yaw: 0.6, pitch: 0.95, dist: 1.6, target: [0, 0, -0.05] } },
  ],
  lights: [
    { pos: [0.03, 0.102, -0.36], kind: 'strobe', size: 0.0011 },
    { pos: [0, 0.0, 0.545], kind: 'strobe', size: 0.0012 },
    { pos: [-0.077, 0.0, -0.44], kind: 'port', size: 0.003 },
    { pos: [0.077, 0.0, -0.44], kind: 'starboard', size: 0.003 },
    { pos: [0.212, 0.212, 0.26], kind: 'beacon', size: 0.0025 },
    { pos: [-0.212, -0.212, 0.26], kind: 'beacon', size: 0.0025 },
  ],
  floods: [
    { from: [0, 0.25, -0.5], to: [0, 0.05, 0.05], angle: 0.45, intensity: 0.6 },
    { from: [0.25, -0.1, 0.25], to: [0, 0, -0.15], angle: 0.5, intensity: 0.5 },
  ],
  decals: [
    { text: 'HT-05 HAKOBUNE', pos: [0.0755, 0.01, -0.43], rot: [0, PI / 2, 0], size: [0.11, 0.013] },
    { text: 'HT-05 HAKOBUNE', pos: [-0.0755, 0.01, -0.43], rot: [0, -PI / 2, 0], size: [0.11, 0.013] },
  ],
  glow: { idle: [1.1, 0.6, 2.4], warp: [2.2, 1.4, 3.6] },
  swatch: ['#e5e2da', '#d5782a', '#2f7f86'],
}

export const SHIPS: ShipSpec[] = [SV01, HERON, SORAKAZE, HAKOBUNE]
export const SHIP_IDS = SHIPS.map((s) => s.id)

export const shipSpec = (id: ShipId) => SHIPS.find((s) => s.id === id) ?? SV01
/** 今乗っている船（描画のたびに読む所向け） */
export const currentShip = () => shipSpec(useStore.getState().settings.ship)
/** 今乗っている船（React 向け。替えたら描き直す） */
export const useShip = () => shipSpec(useStore((s) => s.settings.ship))

/** 大きさくらべの模型は SV-01 の座標で作ってあるので、ほかの船ではこの倍率で拡大・縮小する */
export const compareScale = (spec: ShipSpec) => METERS_PER_UNIT / spec.metersPerUnit

export const shipLabel = (spec: ShipSpec, ja: boolean) => (ja ? `${spec.registry} ${spec.name}` : `${spec.registry} ${spec.nameEn}`)
