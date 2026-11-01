// ローバーで採集できる岩・試料。天体ごとに、実際にその天体で見つかっている（または、あると考えられている）ものから選んだ。
// 成分はおおよその割合（%）。分析カードの棒グラフにする。

export type RockSample = {
  id: string
  name: [string, string]
  /** 岩の色（見た目） */
  color: string
  /** つや：0 = ざらざら、1 = つるつる */
  gloss?: number
  /** 丸い（氷・小石） */
  round?: boolean
  comp: [string, number][]
  note: [string, string]
}

const MARS: RockSample[] = [
  {
    id: 'mudstone',
    name: ['泥岩（でいがん）', 'Mudstone'],
    color: '#8e6a55',
    comp: [['SiO₂', 43], ['FeO', 19], ['Al₂O₃', 9], ['MgO', 9], ['CaO', 6], ['粘土鉱物 Clay', 20]],
    note: [
      '細かい泥が水の底にたまって固まった岩。キュリオシティはゲール・クレーターでこうした岩を見つけ、昔ここに湖があったことを確かめました。',
      'Fine mud that settled at the bottom of water and hardened. Curiosity found rocks like this in Gale Crater, showing a lake once filled it.',
    ],
  },
  {
    id: 'basalt',
    name: ['玄武岩（げんぶがん）', 'Basalt'],
    color: '#4b4038',
    comp: [['SiO₂', 46], ['FeO', 19], ['MgO', 9], ['Al₂O₃', 10], ['CaO', 7]],
    note: [
      '火山の溶岩が冷えて固まった、黒っぽい岩。火星の表面の多くはこの岩でできていて、細かく砕けたものが赤い砂になります。',
      'Dark rock from cooled volcanic lava. Much of Mars is made of it, and when it breaks down it becomes the red sand.',
    ],
  },
  {
    id: 'blueberry',
    name: ['ヘマタイトの粒（ブルーベリー）', 'Hematite "blueberries"'],
    color: '#3b3b44',
    gloss: 0.5,
    round: true,
    comp: [['Fe₂O₃', 80], ['SiO₂', 10], ['その他 Other', 10]],
    note: [
      '直径数ミリの鉄の多い丸い粒。オポチュニティがメリディアニ平原で見つけ、地下を水がしみ通っていたしるしと考えられています。',
      'Millimetre-sized iron-rich spheres. Opportunity found them on Meridiani Planum; they formed where groundwater seeped through rock.',
    ],
  },
  {
    id: 'vein',
    name: ['石こうの白い脈', 'Gypsum vein'],
    color: '#d9d2c3',
    gloss: 0.3,
    comp: [['CaSO₄', 85], ['H₂O', 10], ['その他 Other', 5]],
    note: [
      '岩の割れ目を水が流れ、溶けていた成分が白く固まったもの。火星に液体の水があった、はっきりした証拠のひとつです。',
      'White mineral that formed when water flowed through cracks and left dissolved salts behind — clear evidence of liquid water on Mars.',
    ],
  },
  {
    id: 'meteorite',
    name: ['鉄いん石', 'Iron meteorite'],
    color: '#5d5a58',
    gloss: 0.7,
    comp: [['Fe', 92], ['Ni', 7], ['Co', 1]],
    note: [
      '宇宙から落ちてきた鉄とニッケルのかたまり。火星の上でも、探査車が何度もいん石を見つけています。',
      'A lump of iron and nickel that fell from space. Mars rovers have come across several meteorites like this.',
    ],
  },
]

const MOON: RockSample[] = [
  {
    id: 'anorthosite',
    name: ['斜長岩（しゃちょうがん）', 'Anorthosite'],
    color: '#c9c6bf',
    comp: [['SiO₂', 44], ['Al₂O₃', 32], ['CaO', 18], ['FeO', 3], ['MgO', 3]],
    note: [
      '月の白っぽい高地をつくる岩。生まれたばかりの月の表面をおおっていた「マグマの海」で、軽い結晶が浮かんで固まったものです。',
      'The rock of the bright lunar highlands. Light crystals floated to the top of the young Moon\'s magma ocean and hardened.',
    ],
  },
  {
    id: 'mare-basalt',
    name: ['海の玄武岩', 'Mare basalt'],
    color: '#4a4846',
    comp: [['SiO₂', 42], ['FeO', 20], ['TiO₂', 8], ['CaO', 10], ['Al₂O₃', 10], ['MgO', 10]],
    note: [
      '月の「海」と呼ばれる黒い平原は、30〜40億年前に流れ出した溶岩でできています。アポロ11号もこの岩を持ち帰りました。',
      'The dark lunar "seas" are lava that flooded out 3–4 billion years ago. Apollo 11 brought this rock home.',
    ],
  },
  {
    id: 'breccia',
    name: ['角れき岩（かくれきがん）', 'Breccia'],
    color: '#8b8781',
    comp: [['SiO₂', 45], ['Al₂O₃', 22], ['CaO', 13], ['FeO', 9], ['MgO', 11]],
    note: [
      'いん石がぶつかった衝撃で砕けた岩のかけらが、また押し固められた岩。月の歴史が何度もの衝突でできたことを物語ります。',
      'Broken rock fragments welded back together by meteorite impacts — a record of the Moon\'s violent history.',
    ],
  },
  {
    id: 'orange-soil',
    name: ['オレンジ色のガラス玉', 'Orange glass beads'],
    color: '#b8743c',
    gloss: 0.6,
    round: true,
    comp: [['SiO₂', 39], ['FeO', 22], ['TiO₂', 9], ['MgO', 15], ['その他 Other', 15]],
    note: [
      '昔の火山の噴水から飛び散ったしずくが固まった、小さなガラス玉。アポロ17号の宇宙飛行士が見つけて驚きました。',
      'Tiny glass beads from ancient fire fountains. Apollo 17 astronauts were amazed to find this orange soil.',
    ],
  },
]

const EARTH: RockSample[] = [
  {
    id: 'sandstone',
    name: ['赤い砂岩', 'Red sandstone'],
    color: '#a8573a',
    comp: [['SiO₂', 85], ['Fe₂O₃', 4], ['Al₂O₃', 6], ['その他 Other', 5]],
    note: [
      'モニュメント・バレーの岩山をつくる砂岩。砂漠の砂が積もって固まり、鉄さびの色で赤く見えます。',
      'The sandstone of Monument Valley\'s buttes: desert sand turned to stone, coloured red by iron oxide.',
    ],
  },
  {
    id: 'shale',
    name: ['頁岩（けつがん）', 'Shale'],
    color: '#6d5d55',
    comp: [['SiO₂', 58], ['Al₂O₃', 16], ['FeO', 7], ['K₂O', 3], ['その他 Other', 16]],
    note: [
      '泥が薄い層になって固まった岩。地層の中には、昔の生き物の化石が見つかることもあります。',
      'Mud hardened in thin layers. Fossils of ancient life are often found in rocks like this.',
    ],
  },
  {
    id: 'quartz',
    name: ['石英（せきえい）', 'Quartz'],
    color: '#e8e4dc',
    gloss: 0.8,
    comp: [['SiO₂', 99], ['その他 Other', 1]],
    note: ['地球の地殻にいちばん多い鉱物のひとつ。透明な結晶は水晶と呼ばれます。', 'One of the most common minerals in Earth\'s crust. Clear crystals of it are called rock crystal.'],
  },
]

const VENUS: RockSample[] = [
  {
    id: 'venus-basalt',
    name: ['焼けた玄武岩', 'Scorched basalt'],
    color: '#5e4a36',
    comp: [['SiO₂', 46], ['FeO', 9], ['MgO', 11], ['Al₂O₃', 16], ['CaO', 8], ['その他 Other', 10]],
    note: [
      '金星の地表は 460℃。旧ソ連のベネラ探査機が、このような玄武岩を地表で分析しました。',
      'Venus\'s surface is 460 °C. Soviet Venera landers analysed basalt like this on the ground.',
    ],
  },
]

const MERCURY: RockSample[] = [
  {
    id: 'mercury-crust',
    name: ['硫黄の多い地殻の岩', 'Sulfur-rich crust'],
    color: '#6f6a64',
    comp: [['SiO₂', 50], ['MgO', 20], ['S', 3], ['Al₂O₃', 12], ['その他 Other', 15]],
    note: [
      '水星の地殻には、思ったより硫黄や揮発しやすい成分が多いことを、探査機メッセンジャーが見つけました。',
      'NASA\'s MESSENGER found surprisingly high sulfur and other volatile elements in Mercury\'s crust.',
    ],
  },
]

const IO: RockSample[] = [
  {
    id: 'sulfur',
    name: ['硫黄のかたまり', 'Sulfur crust'],
    color: '#d6c04a',
    gloss: 0.3,
    comp: [['S', 70], ['SO₂ 霜 frost', 20], ['ケイ酸塩 Silicates', 10]],
    note: [
      'イオは太陽系でいちばん火山活動の激しい天体。黄色や赤の色は、噴き出した硫黄の化合物の色です。',
      'Io is the most volcanically active world in the Solar System. Its yellows and reds are sulfur compounds from the eruptions.',
    ],
  },
]

const ICY: RockSample[] = [
  {
    id: 'ice',
    name: ['水の氷の岩盤', 'Water-ice bedrock'],
    color: '#d4dce4',
    gloss: 0.6,
    comp: [['H₂O 氷 ice', 92], ['塩類 Salts', 4], ['その他 Other', 4]],
    note: [
      'とても冷たいので、水の氷が岩のように固い。氷の下に海がある衛星もあると考えられています。',
      'At these temperatures water ice is as hard as rock. Some icy moons are thought to hide oceans beneath.',
    ],
  },
  {
    id: 'salt',
    name: ['赤茶色の塩の筋', 'Reddish salt streak'],
    color: '#8a5a3a',
    comp: [['H₂O 氷 ice', 60], ['塩類 Salts', 30], ['その他 Other', 10]],
    note: [
      '氷の割れ目にそって見つかる色の筋。下の海から上がってきた塩の成分かもしれません。',
      'Coloured streaks along cracks in the ice — perhaps salts that rose from an ocean below.',
    ],
  },
]

const TITAN: RockSample[] = [
  {
    id: 'titan-pebble',
    name: ['氷の小石', 'Ice pebble'],
    color: '#9a8466',
    round: true,
    comp: [['H₂O 氷 ice', 80], ['有機物 Organics', 20]],
    note: [
      'ホイヘンス探査機が見た、丸い小石。岩のように固い水の氷で、メタンの川に削られて丸くなったと考えられています。',
      'Rounded pebbles like those seen by the Huygens probe: rock-hard water ice, worn smooth by methane rivers.',
    ],
  },
]

const ROCKY: RockSample[] = [
  {
    id: 'regolith-rock',
    name: ['表面の岩', 'Surface rock'],
    color: '#6a655f',
    comp: [['SiO₂', 45], ['FeO', 15], ['MgO', 15], ['その他 Other', 25]],
    note: [
      'いん石の衝突で砕けた岩のかけら。表面は宇宙からの放射線で少しずつ色が変わっていきます。',
      'A fragment broken off by impacts. Its surface slowly darkens under radiation from space.',
    ],
  },
]

const ICY_IDS = new Set(['europa', 'ganymede', 'callisto', 'enceladus', 'mimas', 'tethys', 'dione', 'rhea', 'iapetus', 'miranda', 'ariel', 'umbriel', 'titania', 'oberon', 'triton', 'pluto', 'charon'])

export function samplesFor(bodyId: string): RockSample[] {
  if (bodyId === 'mars') return MARS
  if (bodyId === 'moon') return MOON
  if (bodyId === 'earth') return EARTH
  if (bodyId === 'venus') return VENUS
  if (bodyId === 'mercury') return MERCURY
  if (bodyId === 'io') return IO
  if (bodyId === 'titan') return TITAN
  if (ICY_IDS.has(bodyId)) return ICY
  return ROCKY
}
