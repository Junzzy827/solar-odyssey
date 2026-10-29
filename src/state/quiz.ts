import { create } from 'zustand'
import { FACTS, type Quiz } from '../data/facts'
import { PLANETS, type Planet } from '../data/bodies'
import { CUBE_ID } from '../data/cube'
import { bodyInfo, engage } from './flight'
import { useStore } from './store'
import { closeProbes } from './probes'

// 連続クイズ：航海日誌のクイズと、天体のデータから作る「くらべる」問題を混ぜて10問続けて出す。
// まちがえた天体は、終わったあとにワープして見に行ける

export const QUIZ_LENGTH = 10
/** 10問のうち、天体のデータから作る問題の数 */
const MADE_COUNT = 4

const BEST_KEY = 'solar-voyager:quiz-best'

export type QuizQuestion = Quiz & {
  /** この問題の天体（まちがえたらワープで見に行く先） */
  bodyId: string
}

type QuizState = {
  open: boolean
  questions: QuizQuestion[]
  index: number
  /** 選んだ答え（まだなら null） */
  picked: number | null
  score: number
  streak: number
  bestStreak: number
  /** 答えた問題ごとの正解・不正解 */
  results: boolean[]
  /** まちがえた問題の天体（同じ天体は一度だけ） */
  missed: string[]
  finished: boolean
  /** これまでの最高点 */
  best: number | null
  newBest: boolean
}

function loadBest(): number | null {
  try {
    const v = localStorage.getItem(BEST_KEY)
    return v === null ? null : Number(v)
  } catch {
    return null
  }
}

export const useQuiz = create<QuizState>(() => ({
  open: false,
  questions: [],
  index: 0,
  picked: null,
  score: 0,
  streak: 0,
  bestStreak: 0,
  results: [],
  missed: [],
  finished: false,
  best: loadBest(),
  newBest: false,
}))

const shuffle = <T,>(items: T[]) => {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 選択肢の順番を混ぜる（正解の位置も一緒に動かす） */
function shuffleChoices(q: QuizQuestion): QuizQuestion {
  const order = shuffle(q.choices.map((_, i) => i))
  return { ...q, choices: order.map((i) => q.choices[i]), answer: order.indexOf(q.answer) }
}

const num = (v: number) => (v >= 100 ? Math.round(v).toLocaleString('ja-JP') : String(Number(v.toPrecision(2))))

/** 時間を、日か時間のわかりやすい方で */
const duration = (hours: number) => (hours >= 72 ? `約${num(hours / 24)}日` : `約${num(hours)}時間`)

const lightTime = (au: number) => {
  const minutes = Math.round(au * 8.317)
  return minutes < 60 ? `約${minutes}分` : `約${Math.floor(minutes / 60)}時間${minutes % 60 ? `${minutes % 60}分` : ''}`
}

const MAJOR = PLANETS.filter((p) => !p.dwarf)
const WITH_MOONS = PLANETS.filter((p) => p.moons.length > 0)

/** 天体のデータから作る「くらべる」問題。答えの天体を bodyId にする */
const MAKERS: (() => QuizQuestion)[] = [
  () => {
    const three = shuffle(MAJOR).slice(0, 3)
    const top = three.reduce((a, b) => (b.radiusKm > a.radiusKm ? b : a))
    return {
      bodyId: top.id,
      question: 'この中で、いちばん大きい惑星は？',
      choices: three.map((p) => p.name),
      answer: three.indexOf(top),
      explanation: `${top.name}の直径は約${num(top.radiusKm * 2)}km。地球の約${num(top.radiusKm / 6371)}倍です。`,
    }
  },
  () => {
    const three = shuffle(MAJOR).slice(0, 3)
    const top = three.reduce((a, b) => (b.distanceAu > a.distanceAu ? b : a))
    return {
      bodyId: top.id,
      question: 'この中で、太陽からいちばん遠い惑星は？',
      choices: three.map((p) => p.name),
      answer: three.indexOf(top),
      explanation: `${top.name}は太陽から地球の約${num(top.distanceAu)}倍の距離にあり、太陽の光が届くのに${lightTime(top.distanceAu)}かかります。`,
    }
  },
  () => {
    const three = shuffle(MAJOR).slice(0, 3)
    const top = three.reduce((a, b) => (b.orbitDays > a.orbitDays ? b : a))
    const years = top.orbitDays / 365.25
    return {
      bodyId: top.id,
      question: 'この中で、太陽のまわりを1周するのにいちばん時間がかかる惑星は？',
      choices: three.map((p) => p.name),
      answer: three.indexOf(top),
      explanation: `${top.name}の1年（太陽を1周する時間）は${years >= 1 ? `約${num(years)}年` : `約${num(top.orbitDays)}日`}。太陽から遠いほど、ゆっくり大回りします。`,
    }
  },
  () => {
    const three = shuffle(MAJOR).slice(0, 3)
    const spin = (p: Planet) => Math.abs(p.rotationHours)
    const top = three.reduce((a, b) => (spin(b) < spin(a) ? b : a))
    return {
      bodyId: top.id,
      question: 'この中で、1回の自転（1日）がいちばん短い惑星は？',
      choices: three.map((p) => p.name),
      answer: three.indexOf(top),
      explanation: `${top.name}は${duration(spin(top))}で1回自転します。木星や土星のような大きなガスの惑星は、とても速く回っています。`,
    }
  },
  () => {
    const parent = shuffle(WITH_MOONS)[0]
    const moon = shuffle(parent.moons)[0]
    const others = shuffle(WITH_MOONS.filter((p) => p !== parent)).slice(0, 2)
    const choices = shuffle([parent, ...others])
    return {
      bodyId: moon.id,
      question: `${moon.name}は、どの天体のまわりを回る衛星？`,
      choices: choices.map((p) => p.name),
      answer: choices.indexOf(parent),
      explanation: `${moon.name}は${parent.name}の衛星で、${duration(Math.abs(moon.orbitDays) * 24)}で${parent.name}を1周します${moon.orbitDays < 0 ? '（ほかの衛星と逆向き）' : ''}。`,
    }
  },
]

/** 10問を選ぶ。同じ天体の問題は続けて出さないよう、一つの天体から一問だけ */
function makeQuestions(): QuizQuestion[] {
  const used = new Set<string>()
  const made: QuizQuestion[] = []
  for (const make of shuffle(MAKERS)) {
    if (made.length >= MADE_COUNT) break
    // 答えの天体がほかの問題と重ならないものを、何回か作り直して探す
    for (let tries = 0; tries < 8; tries++) {
      const q = make()
      if (used.has(q.bodyId)) continue
      used.add(q.bodyId)
      made.push(q)
      break
    }
  }
  const fromLog = shuffle(Object.entries(FACTS).filter(([id]) => id !== CUBE_ID && !used.has(id)))
    .slice(0, QUIZ_LENGTH - made.length)
    .map(([id, f]) => ({ ...f.quiz, bodyId: id }))
  return shuffle([...fromLog, ...made]).map(shuffleChoices)
}

export function startQuiz() {
  closeProbes()
  if (document.pointerLockElement) document.exitPointerLock()
  useStore.getState().setLogOpen(false)
  useQuiz.setState({ open: true, questions: makeQuestions(), index: 0, picked: null, score: 0, streak: 0, bestStreak: 0, results: [], missed: [], finished: false, newBest: false })
}

export function closeQuiz() {
  useQuiz.setState({ open: false })
}

export function pickAnswer(choice: number) {
  const q = useQuiz.getState()
  const question = q.questions[q.index]
  if (!question || q.picked !== null || q.finished) return
  const right = choice === question.answer
  const streak = right ? q.streak + 1 : 0
  useQuiz.setState({
    picked: choice,
    score: q.score + (right ? 1 : 0),
    streak,
    bestStreak: Math.max(q.bestStreak, streak),
    results: [...q.results, right],
    missed: right || q.missed.includes(question.bodyId) ? q.missed : [...q.missed, question.bodyId],
  })
}

export function nextQuestion() {
  const q = useQuiz.getState()
  if (q.picked === null) return
  if (q.index + 1 < q.questions.length) {
    useQuiz.setState({ index: q.index + 1, picked: null })
    return
  }
  const newBest = q.best === null || q.score > q.best
  const best = newBest ? q.score : q.best
  try {
    localStorage.setItem(BEST_KEY, String(best))
  } catch {
    // 保存できなくても遊べる
  }
  useQuiz.setState({ finished: true, best, newBest })
}

/** 点数に応じた称号 */
export function quizTitle(score: number) {
  if (score >= QUIZ_LENGTH) return '太陽系マスター'
  if (score >= 8) return 'ベテラン航海士'
  if (score >= 5) return '一人前の航海士'
  return '見習い航海士'
}

/** まちがえた天体へワープする（クイズを閉じて目標に設定し、エンゲージ） */
export function warpToMissed(id: string) {
  closeQuiz()
  const s = useStore.getState()
  if (s.mode === 'gallery') s.setMode('flight')
  s.setTarget(id)
  engage()
}

export const quizBodyName = (id: string) => bodyInfo(id)?.name ?? id
