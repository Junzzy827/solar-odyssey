import type { quizJa } from './quiz.ja'
import type { Translation } from './translation'

// The texts of state/quiz.ts (English): the "compare" questions made from the planet data, and the score titles.
// name etc. are body names; numbers given as strings are already formatted by state/quiz.ts. Same keys as quiz.ja.ts

export const quizEn: Translation<typeof quizJa> = {
  biggest: {
    question: 'Which of these planets is the biggest?',
    explanation: (name: string, diameterKm: string, timesEarth: string) => `${name} is about ${diameterKm} km across, about ${timesEarth} times Earth.`,
  },
  farthest: {
    question: 'Which of these planets is farthest from the Sun?',
    explanation: (name: string, au: string, sunlight: string) => `${name} is about ${au} times as far from the Sun as Earth, and sunlight takes ${sunlight} to get there.`,
  },
  longestYear: {
    question: 'Which of these planets takes the longest to go around the Sun once?',
    explanation: (name: string, year: string) => `A year on ${name} (one trip around the Sun) is ${year}. The farther from the Sun, the slower and wider the loop.`,
  },
  shortestDay: {
    question: 'Which of these planets has the shortest day (one spin)?',
    explanation: (name: string, spin: string) => `${name} spins once in ${spin}. Big gas planets like Jupiter and Saturn spin very fast.`,
  },
  moonOf: {
    question: (moon: string) => `Which world does ${moon} orbit?`,
    explanation: (moon: string, parent: string, period: string, backwards: boolean) => `${moon} is a moon of ${parent} and goes around it once in ${period}${backwards ? ' (the opposite way to the other moons)' : ''}.`,
  },
  aboutYears: (n: string) => `about ${n} years`,
  aboutDays: (n: string) => `about ${n} days`,
  aboutHours: (n: string) => `about ${n} hours`,
  aboutMinutes: (minutes: number) => `about ${minutes} minutes`,
  aboutHoursMinutes: (hours: number, minutes: number) => `about ${hours} h ${minutes ? `${minutes} min` : ''}`.trim(),
  title: {
    master: 'Solar System Master',
    veteran: 'Veteran Navigator',
    skilled: 'Skilled Navigator',
    trainee: 'Navigator in Training',
  },
}
