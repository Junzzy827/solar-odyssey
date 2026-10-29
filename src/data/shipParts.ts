// 鑑賞モードで紹介する自機の各部と、大きさくらべの物。
// 位置は ShipModel の座標（全長約1.04、前方は -Z）。船の設定はオリジナルの空想で、
// 本物の科学や乗り物と結びつく話をそえる。

/** 自機の設定上の全長（m）。ShipModel の座標の1は約617m */
export const SHIP_LENGTH_M = 640
export const MODEL_LENGTH = 1.037
export const METERS_PER_UNIT = SHIP_LENGTH_M / MODEL_LENGTH

/** カメラの向き：yaw は船の上下の軸まわり（0 で真後ろ、π で真正面）、pitch は見上げ・見下ろし、dist は距離（模型の座標） */
export type View = { yaw: number; pitch: number; dist: number; target: [number, number, number] }

/** side は、その部分が見える向き（反対側から見ているときは名札を消す）。null はどこからでも */
export type ShipPart = { id: string; name: string; text: string; pos: [number, number, number]; side: [number, number, number] | null; view: View }

export const SHIP_PARTS: ShipPart[] = [
  {
    id: 'saucer',
    name: '円盤部',
    text: '乗組員が暮らし、働く場所という設定です。直径は約390m。円盤の形は、内側の部屋をたくさん取れて、外板も少なくてすみます。',
    pos: [0, 0.1, -0.17],
    side: [0, 1, 0],
    view: { yaw: Math.PI - 0.5, pitch: 0.35, dist: 1.25, target: [0, 0.07, -0.17] },
  },
  {
    id: 'bridge',
    name: '艦橋（ブリッジ）',
    text: '船を指揮する部屋。見晴らしのいい円盤のてっぺんにあります。上で白く光るのが衝突防止灯です。',
    pos: [0, 0.125, -0.16],
    side: [0, 1, 0],
    view: { yaw: Math.PI - 0.7, pitch: 0.3, dist: 0.32, target: [0, 0.115, -0.16] },
  },
  {
    id: 'name',
    name: '船名',
    text: '「SV-01 SOLAR VOYAGER」。太陽系（ソーラー）を旅する船（ボイジャー）という意味の、オリジナルの名前です。探査機ボイジャーにちなんでいます。',
    pos: [0, 0.105, -0.31],
    side: [0, 1, 0],
    // 船名は後ろから見て読める向き
    view: { yaw: 0, pitch: 0.85, dist: 0.5, target: [0, 0.1, -0.3] },
  },
  {
    id: 'strobe',
    name: '衝突防止灯（ストロボ）',
    text: '白く「チカッチカッ」と2回ずつ光ります。飛行機の翼の端や尾翼にもある灯りで、遠くからでも、ここに乗り物がいると気づいてもらうためのものです。',
    pos: [0, -0.045, 0.448],
    side: [0, 0.4, 1],
    view: { yaw: 0.5, pitch: 0.35, dist: 0.55, target: [0, -0.02, 0.4] },
  },
  {
    id: 'navlights',
    name: '航行灯',
    text: '円盤の縁の、左側が赤、右側が緑。飛行機や船と同じ決まりで、すれ違う相手に「こちらがどちらを向いているか」を知らせます。',
    pos: [-0.32, 0.075, -0.17],
    side: [-1, 0, 0],
    view: { yaw: Math.PI + 1.2, pitch: 0.15, dist: 0.6, target: [-0.3, 0.07, -0.17] },
  },
  {
    id: 'impulse',
    name: '通常エンジン',
    text: '光より遅い速さで進むための空想のエンジン（赤く光る部分）。本物の宇宙船では、はやぶさのイオンエンジンのように、少しずつ長い時間かけて加速するものが使われています。',
    pos: [0, 0.085, 0.088],
    side: [0, 0.4, 1],
    view: { yaw: 0.35, pitch: 0.45, dist: 0.45, target: [0, 0.08, 0.08] },
  },
  {
    id: 'deflector',
    name: '前方ディッシュ',
    text: '航路のちりや小石をはじく、という空想の装置。とても速く進むと、砂つぶ1つでも大きな衝撃になるからです。',
    pos: [0, -0.085, -0.01],
    side: [0, -0.2, -1],
    view: { yaw: Math.PI - 0.4, pitch: -0.12, dist: 0.5, target: [0, -0.085, 0] },
  },
  {
    id: 'secondary',
    name: '副船体（機関部）',
    text: '推進機関や動力を収めた部分という設定です。円盤部と首でつながっています。',
    pos: [0, -0.05, 0.22],
    side: null,
    view: { yaw: 1.4, pitch: 0.1, dist: 0.9, target: [0, -0.07, 0.22] },
  },
  {
    id: 'nacelle',
    name: 'ナセル（推進機関）',
    text: '左右2本の長い筒。空間そのものをゆがめて進む、という空想の推進方式の装置です。物理学者アルクビエレが1994年に理論上の形を示しましたが、実現するには、まだ見つかっていない性質の物質が必要です。',
    pos: [0.2, 0.11, 0.35],
    side: [1, 0.4, 0],
    view: { yaw: 1.9, pitch: 0.2, dist: 0.7, target: [0.2, 0.068, 0.35] },
  },
  {
    id: 'collector',
    name: '集光器（ナセルの先の赤い光）',
    text: '宇宙にうすく漂う水素を集めて燃料にする、という考え方（1960年に物理学者バサードが提案した「ラムジェット」）にもとづく空想の装置です。',
    pos: [0.2, 0.09, 0.14],
    side: [0.3, 0, -1],
    view: { yaw: Math.PI - 0.6, pitch: 0.1, dist: 0.35, target: [0.2, 0.068, 0.15] },
  },
  {
    id: 'coil',
    name: '推進コイル（青い光）',
    text: 'ナセルの側面の溝で青く光る部分。ワープの準備をすると、明るく輝きます。',
    pos: [0.24, 0.068, 0.3],
    side: [1, 0, 0],
    view: { yaw: 1.57, pitch: 0.05, dist: 0.45, target: [0.22, 0.068, 0.3] },
  },
  {
    id: 'bay',
    name: '格納庫',
    text: '副船体の後ろの扉。小型艇が発着する、という設定です。',
    pos: [0, -0.06, 0.5],
    side: [0, 0, 1],
    view: { yaw: 0.15, pitch: 0.12, dist: 0.4, target: [0, -0.08, 0.49] },
  },
]

/** 大きさくらべ：自機の横に、本物の大きさで並べる */
export type CompareItem = { id: string; name: string; meters: number; note: string }

export const COMPARE: CompareItem[] = [
  { id: 'skytree', name: '東京スカイツリー', meters: 634, note: 'この船とほぼ同じ長さ（寝かせて並べています）' },
  { id: 'iss', name: '国際宇宙ステーション', meters: 109, note: '人が住んでいる、いちばん大きな宇宙の建物' },
  { id: 'jet', name: 'ジャンボジェット', meters: 71, note: 'ボーイング747' },
  { id: 'hubble', name: 'ハッブル宇宙望遠鏡', meters: 13, note: '大型バスくらい' },
]

export const COMPARE_VIEW: View = { yaw: -1.2, pitch: 0.42, dist: 1.9, target: [-0.45, -0.06, 0.04] }
export const DEFAULT_VIEW: View = { yaw: Math.PI - 0.75, pitch: 0.28, dist: 1.6, target: [0, 0, 0.02] }

/** おまかせ（ゆっくり流すカメラ）のショット。from から to へ、ショットの長さをかけて動く */
export const SHOTS: { from: View; to: View }[] = [
  {
    from: { yaw: Math.PI - 0.9, pitch: 0.18, dist: 1.7, target: [0, 0.02, -0.05] },
    to: { yaw: Math.PI - 0.2, pitch: 0.28, dist: 1.25, target: [0, 0.04, -0.1] },
  },
  {
    from: { yaw: Math.PI + 0.5, pitch: -0.32, dist: 0.95, target: [0, 0, -0.12] },
    to: { yaw: Math.PI + 1.1, pitch: -0.2, dist: 0.75, target: [0, 0, -0.05] },
  },
  {
    from: { yaw: 2.3, pitch: 0.06, dist: 0.6, target: [0.2, 0.068, 0.25] },
    to: { yaw: 1.3, pitch: 0.12, dist: 0.5, target: [0.2, 0.068, 0.38] },
  },
  {
    from: { yaw: 0.7, pitch: 0.3, dist: 1.0, target: [0, -0.02, 0.38] },
    to: { yaw: -0.5, pitch: 0.36, dist: 1.15, target: [0, 0, 0.3] },
  },
  {
    from: { yaw: -0.3, pitch: 1.15, dist: 1.9, target: [0, 0, 0] },
    to: { yaw: 0.6, pitch: 1.0, dist: 1.6, target: [0, 0, -0.05] },
  },
]
export const SHOT_SECONDS = 10
