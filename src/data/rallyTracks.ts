import { RALLY_LINE } from './rallyCourse'
import { MOON_LINE } from './moonCourse'

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
}

/** その天体のレース場（無ければ null） */
export function trackForBody(body: string): string | null {
  for (const [id, tr] of Object.entries(TRACKS)) if (tr.body === body) return id
  return null
}
