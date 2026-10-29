import type { ja } from './ja'

// Short UI strings (English). Same keys as ja.ts

export const en: typeof ja = {
  missionsButton: 'Story mode (missions)',
  missionsTitle: 'Story mode',
  missionsIntro: 'You are the captain of the survey vessel SV-01. Take on requests from all over the solar system.',
  missionNumber: (n: number) => `Mission ${n}`,
  locked: 'Finish the previous mission to unlock',
  client: (name: string) => `Client: ${name}`,
  goals: 'Objectives',
  depart: 'Depart',
  back: 'Back to the list',
  close: 'Close',
  quit: 'Quit',
  navi: 'NAVI',
  progress: (pct: number) => `${pct}%`,
  hits: (n: number, total: number) => `Hits ${n} / ${total}`,
  waitNear: 'Get close to start',
  complete: 'Mission complete!',
  learned: 'What we learned',
  quizTitle: (n: number, total: number) => `Check quiz ${n} / ${total}`,
  right: 'Correct!',
  wrong: (answer: string) => `Not quite. The answer is "${answer}".`,
  next: 'Next',
  showResult: 'See the result',
  starsLabel: (n: number) => `${n} of 3 stars`,
  starsNote: 'One star for completing the mission, plus one for each correct answer.',
  best: (n: number) => `Best so far: ${n} stars`,
  nextMission: 'Next mission',
  retry: 'Try again',
  allDone:
    'You have completed every mission! Captain, how was your journey through the solar system? Keep exploring with the logbook and the quiz run to learn about the worlds you have not met yet.',
  noRace: 'You cannot start a mission during a race.',
  rockName: 'Asteroid 2026 SV',
}
