import type { stampBookJa } from './stampBook.ja'
import type { Translation } from './translation'

// The texts of ui/StampBook.tsx (English). Same keys as stampBook.ja.ts

export const stampBookEn: Translation<typeof stampBookJa> = {
  setTarget: (name: string) => `Set ${name} as the target`,
  quizAnswered: 'Quiz answered',
  stampBook: 'Stamp book',
  close: 'Close',
  currentTitle: 'Current title: ',
  noneYet: 'None yet',
  stamps: 'Stamps',
  quizzes: 'Quizzes',
  titles: 'Titles',
  howToCollect: 'Fly close to a body to collect its stamp. Answer its ship’s log quiz to add a ★. Tap a stamp to set that body as your target.',
  done: 'Done',
  shortDate: (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear() % 100}`,
}
