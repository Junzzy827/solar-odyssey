import { create } from 'zustand'
import { MISSIONS, ROCK_ID } from '../data/missions'
import { missionText } from '../i18n'
import { playBeep } from '../audio/sfx'
import { raceActive } from './race'
import { useStore } from './store'

// ストーリーモード：任務の一覧 → 出発前の説明 → 手順を順番にこなす → まとめとクイズ → 星で評価。
// 時間切れや失敗で終わることはない。星の数は端末に保存する

export type MissionPhase = 'closed' | 'list' | 'briefing' | 'active' | 'debrief'

const STARS_KEY = 'solar-voyager:missions'

type MissionState = {
  phase: MissionPhase
  /** 選んでいる任務の番号（MISSIONS の順） */
  index: number
  /** いまの手順 */
  step: number
  /** いまの手順の進み具合（0〜1。deflect では命中の数） */
  progress: number
  /** 航法AIのことば（いちばん新しいもの） */
  message: string
  messageId: number
  /** 確認クイズ：いまの問題と、選んだ答え */
  quizIndex: number
  picked: (number | null)[]
  /** 任務ごとの最高の星の数（0 はまだ） */
  stars: number[]
  /** 今回の星（結果を見たあと） */
  earned: number | null
}

function loadStars(): number[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STARS_KEY) ?? '[]')
    return MISSIONS.map((_, i) => Number(saved[i]) || 0)
  } catch {
    return MISSIONS.map(() => 0)
  }
}

/** 星を記録する（前より多いときだけ） */
function saveStars(index: number, n: number) {
  const stars = [...useMission.getState().stars]
  stars[index] = Math.max(stars[index], n)
  try {
    localStorage.setItem(STARS_KEY, JSON.stringify(stars))
  } catch {
    // 保存できなくても遊べる
  }
  useMission.setState({ stars })
}

export const useMission = create<MissionState>(() => ({
  phase: 'closed',
  index: 0,
  step: 0,
  progress: 0,
  message: '',
  messageId: 0,
  quizIndex: 0,
  picked: [],
  stars: loadStars(),
  earned: null,
}))

export const missionActive = () => useMission.getState().phase === 'active'

export const isUnlocked = (i: number) => i === 0 || useMission.getState().stars[i - 1] > 0

const say = (message: string) => useMission.setState((s) => ({ message, messageId: s.messageId + 1 }))

export function openMissions() {
  if (document.pointerLockElement) document.exitPointerLock()
  useStore.getState().setLogOpen(false)
  // 任務の途中なら、一覧ではなく今の任務を表示したままにする
  if (useMission.getState().phase === 'active') return
  useMission.setState({ phase: 'list' })
}

export function closeMissions() {
  if (useMission.getState().phase !== 'active') useMission.setState({ phase: 'closed' })
}

export function showBriefing(index: number) {
  if (!isUnlocked(index)) return
  useMission.setState({ phase: 'briefing', index })
}

export function startMission() {
  if (raceActive()) return
  const s = useStore.getState()
  if (s.mode !== 'flight') s.setMode('flight')
  useMission.setState({ phase: 'active', step: 0, progress: 0, quizIndex: 0, picked: [], earned: null })
  say(beginStep(0))
}

/** 手順を始める：目標をセットして、説明を出す（小惑星の目標は、MissionRunner が出してからセットする） */
function beginStep(step: number) {
  const m = useMission.getState()
  const def = MISSIONS[m.index].steps[step]
  const text = missionText(MISSIONS[m.index].id).steps[step]
  if (def.body !== ROCK_ID && useStore.getState().targetId !== def.body) useStore.getState().setTarget(def.body)
  return text.start
}

/** いまの手順を終えて次へ。最後の手順なら結果の画面へ */
export function completeStep() {
  const m = useMission.getState()
  const mission = MISSIONS[m.index]
  const text = missionText(mission.id)
  const done = text.steps[m.step].done
  playBeep(880, 0.14)
  setTimeout(() => playBeep(1320, 0.22), 130)
  if (m.step + 1 >= mission.steps.length) {
    if (document.pointerLockElement) document.exitPointerLock()
    useStore.getState().setAutopilot(false)
    useStore.getState().setLogOpen(false)
    useMission.setState({ phase: 'debrief', progress: 0, quizIndex: 0, picked: text.quiz.map(() => null) })
    // クイズの途中で閉じても、任務を終えたぶんの星1つは残す（次の任務も開く）
    saveStars(m.index, 1)
    say(done)
    return
  }
  const next = m.step + 1
  useMission.setState({ step: next, progress: 0 })
  say(`${done}\n\n${beginStep(next)}`)
}

export function setProgress(progress: number) {
  useMission.setState({ progress })
}

/** 任務をやめる（星は記録しない） */
export function abortMission() {
  useMission.setState({ phase: 'closed', message: '' })
}

export function answerQuiz(choice: number) {
  const m = useMission.getState()
  if (m.picked[m.quizIndex] !== null) return
  const quiz = missionText(MISSIONS[m.index].id).quiz[m.quizIndex]
  const picked = [...m.picked]
  picked[m.quizIndex] = choice
  useMission.setState({ picked })
  if (choice === quiz.answer) {
    playBeep(880, 0.14)
    setTimeout(() => playBeep(1320, 0.2), 120)
  } else playBeep(260, 0.35)
}

/** 次の問題へ。最後なら星を数えて記録する */
export function nextQuiz() {
  const m = useMission.getState()
  const quiz = missionText(MISSIONS[m.index].id).quiz
  if (m.quizIndex + 1 < quiz.length) {
    useMission.setState({ quizIndex: m.quizIndex + 1 })
    return
  }
  const earned = 1 + quiz.filter((q, i) => m.picked[i] === q.answer).length
  saveStars(m.index, earned)
  useMission.setState({ earned, quizIndex: quiz.length })
}

export { say as missionSay }
