import { RALLY_LINE } from './rallyCourse'
import { MOON_LINE } from './moonCourse'
import { EUROPA_LINE } from './europaCourse'

// ローバーレースのコース（レース場ごと）。キーは着陸地点（SITES、surfaces.ts）の名前

export type RallyTrack = {
  /** どの天体か */
  body: string
  /** 走行ライン（10 m ごと、x 東・z 南） */
  line: [number, number][]
  /** スタート欄の題 */
  title: [string, string]
  /** スタート欄の説明 */
  intro: [string, string]
  /** 運転中・着陸船のボタン */
  button: [string, string]
  /** もとの着陸地点へ戻るボタン */
  home: [string, string]
  /** 追いかけっこ：ライバルが先に逃げて、ゴールまでにタッチしてつかまえる（月） */
  chase?: boolean
  /** 氷：タイヤの横の力の倍率（1 がふつう）。コンピューターのカーブの速さと、すべる見た目に使う */
  ice?: number
}

export const TRACKS: Record<string, RallyTrack> = {
  coprates: {
    body: 'mars',
    line: RALLY_LINE,
    title: ['峡谷トライアル', 'Canyon trial'],
    intro: [
      '4台のローバーで、峡谷の谷底を約1.2 km競走します。光の門を順にくぐってゴールへ。岩に乗ると車輪が浮いて遅くなり、曲がれません。ジャンプで飛び越えよう！',
      'Four rovers race about 1.2 km along the canyon floor. Pass the light gates in order to the finish. Driving onto rocks lifts the wheels: you slow down and can’t steer. Jump over them!',
    ],
    button: ['峡谷レース', 'Canyon race'],
    home: ['ゲール・クレーターへ', 'To Gale crater'],
  },
  taurus: {
    body: 'moon',
    line: MOON_LINE,
    title: ['月の谷の追いかけっこ', 'Moon valley chase'],
    intro: [
      'アポロ17号が降りた谷で追いかけっこ！先に逃げた3台のローバーに、約1.6 km先のゴールまでに追いついてタッチしよう。重力が地球の6分の1なので、ジャンプは長く飛びます。空中では◀▶で横に、▼で早く着地できます。',
      'A chase through the valley where Apollo 17 landed! Three rovers get a head start: catch up and touch them before the finish, about 1.6 km away. Gravity is 1/6 of Earth’s, so jumps are long: in the air, ◀▶ thrusts you sideways and ▼ brings you down sooner.',
    ],
    button: ['月の追いかけっこ', 'Moon chase'],
    home: ['もとの着陸地点へ', 'Back to the landing site'],
    chase: true,
  },
  conamara: {
    body: 'europa',
    line: EUROPA_LINE,
    title: ['エウロパ 氷のドリフトレース', 'Europa ice drift race'],
    intro: [
      'エウロパの氷の尾根の溝を約1.7 km競走！氷はつるつるで、速いままハンドルを切るとお尻が横にすべります。すべり始めたら、ハンドルを少し反対に切って立て直そう（カウンターステア）。カーブの手前でアクセルをゆるめるのがコツ。重力は地球の約7分の1なので、ジャンプ台ではとても高く飛びます。',
      'Race about 1.7 km along the trough of a Europa ice ridge! The ice is slick: steer hard at speed and the back end slides out. When it starts to slide, steer a little the other way to catch it (counter-steer). Ease off before the corners. Gravity is about 1/7 of Earth’s, so the jumps send you flying.',
    ],
    button: ['氷のレース', 'Ice race'],
    home: ['もとの着陸地点へ', 'Back to the landing site'],
    ice: 0.3,
  },
}

/** その天体のレース場（無ければ null） */
export function trackForBody(body: string): string | null {
  for (const [id, tr] of Object.entries(TRACKS)) if (tr.body === body) return id
  return null
}
