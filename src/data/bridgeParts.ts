/** 艦橋の見どころの説明（位置は部屋の座標 m。-Z が前） */
export type BridgePart = {
  id: string
  name: string
  nameEn: string
  text: string
  textEn: string
  pos: [number, number, number]
}

export const BRIDGE_PARTS: BridgePart[] = [
  {
    id: 'captain',
    name: '艦長席',
    nameEn: 'Captain’s chair',
    text: '船の進む先を決める人の席。部屋の真ん中の一段低い所にあり、窓も、まわりのどの席もよく見えます。ひじ掛けに小さな操作盤があります。',
    textEn: 'The seat of the person who decides where the ship goes. It sits in the lower middle of the room, with a clear view of the window and every other station. The armrests have small control panels.',
    pos: [0, 1.65, 0.75],
  },
  {
    id: 'seats',
    name: '左右の席',
    nameEn: 'Side seats',
    text: '艦長のとなりで相談する人の席。間の低い台で、船の状態や航路をいっしょに確かめます。',
    textEn: 'Seats for the advisers beside the captain. The low consoles between them show the ship’s status and course.',
    pos: [-1.5, 1.4, 0.75],
  },
  {
    id: 'helm',
    name: '操舵席',
    nameEn: 'Helm',
    text: '船の向きと速さを決める席。目標の天体、距離、到着までの時間、ワープの準備などがこの画面に出ます。',
    textEn: 'The station that steers the ship and sets its speed. Its screen shows the target, distance, time to arrival and warp status.',
    pos: [-1.0, 1.25, -2.6],
  },
  {
    id: 'ops',
    name: '運用席',
    nameEn: 'Operations',
    text: '船の機械や電力がうまく働いているかを見張る席。ワープ機関の出力やシールド、生命維持のようすを見ています。',
    textEn: 'This station watches the ship’s machines and power: warp core output, shields and life support.',
    pos: [1.0, 1.25, -2.6],
  },
  {
    id: 'window',
    name: '正面の窓',
    nameEn: 'Front window',
    text: '大きな曲面ガラスの窓。Z キー（または「拡大画面に」）で、ガラスが大画面に変わり、目標の天体を望遠で映します。本物の宇宙船では、窓は放射線を防ぐために厚く小さくなりがちです。',
    textEn: 'A large curved glass window. Press Z (or “Zoom”) to turn the glass into a big screen showing the target through a telescope. Real spacecraft windows tend to be small and thick to block radiation.',
    pos: [0, 2.6, -6.2],
  },
  {
    id: 'skylight',
    name: '天窓',
    nameEn: 'Skylight',
    text: '天井の丸い窓。真上の星や、船のてっぺんで光る衝突防止灯が見えます。',
    textEn: 'A round window in the ceiling. You can see the stars overhead and the anti-collision light blinking on top of the ship.',
    pos: [0, 4.2, 0],
  },
  {
    id: 'tactical',
    name: '防御・センサー卓',
    nameEn: 'Defence and sensors',
    text: '手すりの後ろの、横に長い操作卓。まわりの天体をレーダーで見張り、シールドを管理します。この船は探査船なので、武器より観測が主な仕事です。',
    textEn: 'The long desk behind the rail. It watches nearby bodies on radar and manages the shields. This is a survey ship, so observing matters more than weapons.',
    pos: [0, 1.65, 4.2],
  },
  {
    id: 'rail',
    name: '木の手すり',
    nameEn: 'Wooden rail',
    text: '中央の低い床と、後ろの高い床を分ける手すり。最新の船にも、手ざわりのいい木を使うと落ち着いた部屋になります。左右のゆるい坂から上り下りします。',
    textEn: 'The rail between the lower centre and the raised aft deck. Real wood makes even a starship feel calm. Gentle ramps on each side lead up and down.',
    pos: [2.7, 1.5, 2.55],
  },
  {
    id: 'map',
    name: '太陽系の地図',
    nameEn: 'Solar system map',
    text: '後ろの壁の大きな画面。惑星の今の位置と、この船（四角）の位置を真上から見た図です。距離は内側が見えるように縮めてあります。',
    textEn: 'The big screen on the back wall shows where the planets are now, seen from above, with this ship marked by a square. Distances are squeezed so the inner planets show.',
    pos: [0, 2.6, 6.2],
  },
  {
    id: 'stations',
    name: '壁のステーション',
    nameEn: 'Wall stations',
    text: '機関・科学・環境・記録などの席。科学の画面には目標の天体の資料、環境の画面には室温や酸素の量が出ます。',
    textEn: 'Engineering, science, environment and records. The science screen shows facts about the target; the environment screen shows cabin temperature and oxygen.',
    pos: [-3.6, 2.4, 5.5],
  },
  {
    id: 'lift',
    name: '昇降機と銘板',
    nameEn: 'Lift and plaque',
    text: '左右の扉は、船の中を上下に移動する昇降機。左の扉の横の銘板には、この船の名前「SV-01 ソーラーボイジャー（探査船）」が刻まれています。',
    textEn: 'The doors on each side lead to lifts that move through the ship. The plaque beside the left door carries the ship’s name: “SV-01 Solar Voyager, survey vessel”.',
    pos: [-4.5, 2.2, 5.0],
  },
]
