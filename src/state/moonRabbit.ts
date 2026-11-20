import { create } from 'zustand'
import { saveSlot } from './save'
import { useSkyClock, dayHours } from '../components/surface/skyClock'
import { startLanding, useLanding } from './landing'
import { launchRover, roverActive } from './rover'
import { checkTitles } from './stamps'

// 月の光るウサギ（おとぎ話のイベント）。月の夕暮れに光るウサギが現れて「ついてきて」と言う。
// ローバーでついていくと、月の庭（光る石の輪と、おもちをつく臼）に着き、ウサギが月のでき方の話をしてくれる。
// 流れ：off → appear（現れて待っている）→ follow（ついていく）→ tale（お話、ページをめくる）→ leave（空へ帰る）→ off
// いつでも「やめる」で off に戻り、そのまま自由に走れる。会えたことは saveData の 'moon-rabbit' に残す（称号に使う）

export type RabbitPhase = 'off' | 'appear' | 'follow' | 'tale' | 'leave'

/** 夕暮れ（現地の時刻、時）：この間に月の地表にいると、ウサギが現れる */
export const DUSK_FROM = 16.8
export const DUSK_TO = 19.5
/** 「夕暮れを待つ」で飛ぶ時刻 */
const DUSK_AT = 17.2
/** お話のページ数（文言は src/i18n/moonRabbit） */
export const TALE_PAGES = 5

type Met = { first: number; times: number }
const metSlot = saveSlot<Met | null>('moon-rabbit', null, (v) => {
  const m = v as Met | null
  return m && m.first > 0 && Number.isInteger(m.times) ? m : null
})

type RabbitState = {
  phase: RabbitPhase
  /** 今の段階を始めた時刻（performance.now() / 1000） */
  since: number
  /** お話の今のページ（0 から） */
  page: number
  /** ウサギの出発点と、月の庭の場所（着陸地点を原点にした m、x 東・z 南） */
  start: { x: number; z: number } | null
  garden: { x: number; z: number } | null
  /** 庭までの残り（m、ときどき書き換える）。ウサギが待っているか（遠すぎる） */
  left: number
  waiting: boolean
  /** この着陸で、もう現れたか（やめたあと同じ夕暮れにすぐ出てこないように） */
  shown: boolean
  /** 前に会ったことがあるか（称号とお話の最初のことば） */
  met: Met | null
  /** ナビから来た：着いたら夕暮れまで時間を進める */
  pending: boolean
}

export const rabbitNow = () => performance.now() / 1000

/** 確認用（#debug）：arrive を true にすると、ウサギがすぐ庭の前まで行く（遅い試験機では跳ねていくのに時間がかかるため） */
export const rabbitDebug = { arrive: false }

export const useMoonRabbit = create<RabbitState>(() => ({
  phase: 'off',
  since: 0,
  page: 0,
  start: null,
  garden: null,
  left: 0,
  waiting: false,
  shown: false,
  met: metSlot.load(),
  pending: false,
}))

const setPhase = (phase: RabbitPhase) => useMoonRabbit.setState({ phase, since: rabbitNow() })

/** 月の地表にいて、今が夕暮れか */
export function isDusk(clock = useSkyClock.getState().clock) {
  return clock >= DUSK_FROM && clock <= DUSK_TO
}

/** ウサギを出す（MoonRabbit.tsx が夕暮れに呼ぶ）。出発点と庭の場所は MoonRabbit.tsx が地形を見て決める */
export function showRabbit(start: { x: number; z: number }, garden: { x: number; z: number }) {
  useMoonRabbit.setState({ start, garden, page: 0, shown: true, waiting: false, left: Math.hypot(garden.x - start.x, garden.z - start.z) })
  setPhase('appear')
}

/** ついていく（ローバーがまだ出ていなければ出す） */
export function followRabbit() {
  if (!roverActive()) launchRover(true)
  setPhase('follow')
}

/** 庭に着いた：お話を始める */
export function beginTale() {
  useMoonRabbit.setState({ page: 0 })
  setPhase('tale')
}

/** お話のページをめくる。最後のページのあとはウサギが空へ帰る */
export function nextPage() {
  const { page } = useMoonRabbit.getState()
  if (page + 1 < TALE_PAGES) {
    useMoonRabbit.setState({ page: page + 1 })
    return
  }
  // 会えた記録（はじめての日と回数）
  const prev = useMoonRabbit.getState().met
  const met = { first: prev?.first ?? Date.now(), times: (prev?.times ?? 0) + 1 }
  metSlot.save(met)
  useMoonRabbit.setState({ met })
  checkTitles()
  setPhase('leave')
}

/** やめる：ウサギと庭を消して、自由に走れるように */
export function quitRabbit() {
  useMoonRabbit.setState({ start: null, garden: null, page: 0, waiting: false })
  setPhase('off')
}

/** 夕暮れまで時間を進める（月の地表で） */
export function waitForDusk() {
  const id = useLanding.getState().bodyId
  if (!id) return
  const { clock, hours } = useSkyClock.getState()
  const ahead = (((DUSK_AT - clock) % 24) + 24) % 24
  useMoonRabbit.setState({ shown: false })
  if (ahead > 0.05 && !isDusk(clock)) useSkyClock.setState({ seek: hours + (ahead / 24) * Math.abs(dayHours(id)) })
}

/** ナビの「遊ぶ」から：月に着陸して、夕暮れを待つ。もう月にいれば、そのまま夕暮れへ */
export function goFindRabbit() {
  const l = useLanding.getState()
  if (l.phase === 'surface' && l.bodyId === 'moon') {
    waitForDusk()
    return
  }
  startLanding('moon')
  // 着陸を始められたときだけ（ほかの星にいる・キャンペーンでまだ開いていない、なら何もしない）
  const now = useLanding.getState()
  if (now.phase === 'fadeIn' && now.bodyId === 'moon') useMoonRabbit.setState({ pending: true, shown: false })
}

/** ナビのボタンを押せるか：月にいる、またはどこにも降りていない */
export function canFindRabbit(l = useLanding.getState()) {
  return l.phase === 'idle' || (l.phase === 'surface' && l.bodyId === 'moon')
}

// 月から離陸したり、別の着陸地点へ移ったら、ウサギはおしまい（次に月へ来たら、また夕暮れに出る）
useLanding.subscribe((l, prev) => {
  const onMoon = l.phase === 'surface' && l.bodyId === 'moon'
  const wasOnMoon = prev.phase === 'surface' && prev.bodyId === 'moon'
  if (wasOnMoon && (!onMoon || l.site !== prev.site)) {
    quitRabbit()
    useMoonRabbit.setState({ shown: false })
  }
  // 月に着いた：ナビから来たなら夕暮れへ（地表の時計が動き出してから）
  if (onMoon && !wasOnMoon && useMoonRabbit.getState().pending) {
    useMoonRabbit.setState({ pending: false })
    window.setTimeout(() => {
      const n = useLanding.getState()
      if (n.phase === 'surface' && n.bodyId === 'moon') waitForDusk()
    }, 1500)
  }
})
