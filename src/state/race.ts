import { create } from 'zustand'
import { t } from '../i18n/lang'

// レース：火星を出発し、木星のそばを通って土星でスイングバイし、火星へ戻る。
// コースには光る輪（ゲート）が並び、順番にくぐっていく。

export type RacePhase = 'idle' | 'countdown' | 'running' | 'finished'

export type RaceResult = { time: number; rivalTime: number | null; win: boolean; best: number; newBest: boolean }

const BEST_KEY = 'solar-voyager:race-best'

function loadBest(): number | null {
  try {
    const v = Number(localStorage.getItem(BEST_KEY))
    return v > 0 ? v : null
  } catch {
    return null
  }
}

type RaceState = {
  phase: RacePhase
  /** 次にくぐるゲートの番号（0 から） */
  gate: number
  gateCount: number
  rivalGate: number
  /** カウントダウンの残り（秒） */
  countdown: number
  elapsed: number
  boosted: boolean
  result: RaceResult | null
  best: number | null
  start: () => void
  stop: () => void
  update: (patch: Partial<Pick<RaceState, 'phase' | 'gate' | 'gateCount' | 'rivalGate' | 'countdown' | 'elapsed' | 'boosted'>>) => void
  finish: (time: number, rivalTime: number | null) => void
}

export const useRace = create<RaceState>((set, get) => ({
  phase: 'idle',
  gate: 0,
  gateCount: 0,
  rivalGate: 0,
  countdown: 0,
  elapsed: 0,
  boosted: false,
  result: null,
  best: loadBest(),
  start: () => set({ phase: 'countdown', gate: 0, rivalGate: 0, countdown: 3.5, elapsed: 0, boosted: false, result: null }),
  stop: () => set({ phase: 'idle', result: null }),
  update: (patch) => set(patch),
  finish: (time, rivalTime) => {
    const prev = get().best
    const newBest = prev === null || time < prev
    const best = newBest ? time : prev
    try {
      localStorage.setItem(BEST_KEY, String(best))
    } catch {
      // 保存できなくても遊べる
    }
    set({ phase: 'finished', elapsed: time, best, result: { time, rivalTime, win: rivalTime === null || time < rivalTime, best, newBest } })
  },
}))

export const raceActive = () => {
  const p = useRace.getState().phase
  return p === 'countdown' || p === 'running'
}

export const RACE_TEXT = {
  get start() {
    return t(
      'レース開始！光る輪を順番にくぐって、木星のそばを通り、土星でスイングバイして火星へ戻ろう。',
      'Race start! Fly through the glowing rings in order, pass close to Jupiter, swing by Saturn and head back to Mars.',
    )
  },
  get jupiter() {
    return t('木星を通過！木星は太陽系でいちばん大きな惑星で、地球が1,300個以上入る大きさです。', 'Past Jupiter! It is the biggest planet in the solar system, big enough to hold more than 1,300 Earths.')
  },
  get swingby() {
    return t(
      'スイングバイ成功！惑星の重力を借りると、燃料を使わずに加速と方向転換ができます。探査機ボイジャーも木星と土星でこの技を使いました。',
      'Swing-by complete! Borrowing a planet’s gravity lets you speed up and change direction without using fuel. The Voyager probes used this trick at Jupiter and Saturn.',
    )
  },
  get finish() {
    return t(
      '本物の探査機ボイジャー2号は、スイングバイで木星・土星・天王星・海王星を次々にめぐり、打ち上げから12年で海王星に着きました。',
      'The real Voyager 2 probe used swing-bys to visit Jupiter, Saturn, Uranus and Neptune one after another, reaching Neptune 12 years after launch.',
    )
  },
  get noWarp() {
    return t('レース中はワープと自動航行は使えません。自分の手で操縦しよう！', 'Warp and autopilot are off during the race. Fly it yourself!')
  },
}

export const formatTime = (t: number) => {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}
