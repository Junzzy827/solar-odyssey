import { useEffect } from 'react'
import { useStore } from '../state/store'
import { raceActive, useRace } from '../state/race'
import { playBeep } from '../audio/sfx'
import { closeQuiz, nextQuestion, pickAnswer, QUIZ_LENGTH, quizBodyName, quizText, quizTitle, startQuiz, useQuiz, warpToMissed } from '../state/quiz'
import { useLang } from '../i18n/lang'
import { ui } from '../i18n'

/** 正解・不正解の短い音 */
function chime(right: boolean) {
  if (right) {
    playBeep(880, 0.14)
    setTimeout(() => playBeep(1320, 0.2), 120)
  } else {
    playBeep(260, 0.35)
  }
}

function choose(i: number) {
  const q = useQuiz.getState()
  if (q.picked !== null) return
  pickAnswer(i)
  chime(i === q.questions[q.index].answer)
}

/** クイズのあいだは 1〜3 で答え、Enter で次へ、Esc で閉じる（ワープ速度やワープのキーより先に受け取る） */
function useQuizKeys(active: boolean) {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.target instanceof HTMLInputElement) return
      const q = useQuiz.getState()
      const digit = /^Digit[1-9]$/.test(e.code) ? Number(e.code.slice(5)) - 1 : -1
      if (!q.finished && digit >= 0 && digit < (q.questions[q.index]?.choices.length ?? 0)) choose(digit)
      else if (e.code === 'Enter' && !q.finished && q.picked !== null) nextQuestion()
      else if (e.code === 'Escape') closeQuiz()
      else return
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active])
}

/** 連続クイズ：10問続けて答え、得点と連続正解を数える。終わったら、まちがえた天体へワープできる */
export function QuizPanel() {
  const q = useQuiz()
  const mode = useStore((s) => s.mode)
  const scope = useStore((s) => s.scope)
  const racePhase = useRace((r) => r.phase)
  const visible = q.open && mode !== 'gallery' && !scope
  useQuizKeys(visible)
  useLang()

  // レースが始まったら閉じる
  useEffect(() => {
    if (raceActive() && useQuiz.getState().open) closeQuiz()
  }, [racePhase])

  if (!visible) return null

  if (q.finished) {
    return (
      <section className="quiz-run" aria-label={ui().quizPanel.quizResults}>
        <header>
          <h2>{ui().quizPanel.resultScore(q.score, QUIZ_LENGTH)}</h2>
          <button className="close" onClick={closeQuiz} aria-label={ui().quizPanel.close}>
            ×
          </button>
        </header>
        <div className="quiz-title">{ui().quizPanel.earnedTitle(quizTitle(q.score))}</div>
        <dl>
          <div>
            <dt>{ui().quizPanel.longestStreak}</dt>
            <dd>{ui().quizPanel.longestStreakCount(q.bestStreak)}</dd>
          </div>
          <div>
            <dt>{ui().quizPanel.bestSoFar}</dt>
            <dd>
              {ui().quizPanel.bestSoFarCount(q.best ?? q.score)}
              {q.newBest && <span className="badge">{ui().quizPanel.newRecord}</span>}
            </dd>
          </div>
        </dl>
        {q.missed.length > 0 ? (
          <>
            <div className="nav-heading">{ui().quizPanel.goSeeMissed}</div>
            <div className="quiz-missed">
              {q.missed.map((id) => (
                <button key={id} className="secondary" onClick={() => warpToMissed(id)}>
                  {ui().quizPanel.warpTo(quizBodyName(id))}
                </button>
              ))}
            </div>
            <p className="muted small">{ui().quizPanel.arriveNote}</p>
          </>
        ) : (
          <p>{ui().quizPanel.allCorrect}</p>
        )}
        <div className="quiz-actions">
          <button className="engage" onClick={startQuiz}>
            {ui().quizPanel.tryAgain}
          </button>
          <button className="secondary" onClick={closeQuiz}>
            {ui().quizPanel.close}
          </button>
        </div>
      </section>
    )
  }

  const question = q.questions[q.index]
  if (!question) return null
  const answered = q.picked !== null
  const right = q.picked === question.answer
  const last = q.index + 1 >= q.questions.length
  const text = quizText(question)

  return (
    <section className="quiz-run" aria-label={ui().quizPanel.quizRun}>
      <header>
        <h2>
          {ui().quizPanel.quizRun} <span className="muted">{ui().quizPanel.questionNumber(q.index + 1, QUIZ_LENGTH)}</span>
        </h2>
        <button className="close" onClick={closeQuiz} aria-label={ui().quizPanel.close}>
          ×
        </button>
      </header>
      <div className="quiz-status">
        <span>
          {ui().quizPanel.correctCount} {q.score}
        </span>
        <span className={q.streak >= 3 ? 'hot' : ''}>
          {ui().quizPanel.streak} {q.streak}
        </span>
      </div>
      <ol className="quiz-dots" aria-hidden>
        {q.questions.map((_, i) => (
          <li key={i} className={i < q.results.length ? (q.results[i] ? 'right' : 'wrong') : i === q.index ? 'now' : ''} />
        ))}
      </ol>
      <div className="quiz-q">Q. {text.question}</div>
      <div className="quiz-choices">
        {text.choices.map((c, i) => (
          <button
            key={c}
            className={answered ? (i === question.answer ? 'right' : i === q.picked ? 'wrong' : '') : ''}
            disabled={answered}
            onClick={() => choose(i)}
          >
            <kbd>{i + 1}</kbd> {c}
          </button>
        ))}
      </div>
      {answered && (
        <>
          <div className="quiz-a">
            <strong>
              {right
                ? q.streak >= 3
                  ? ui().quizPanel.correctStreak(q.streak)
                  : ui().quizPanel.correct
                : ui().quizPanel.notQuiteAnswer(text.choices[question.answer])}
            </strong>{' '}
            {text.explanation}
          </div>
          <button className="engage" onClick={nextQuestion}>
            {last ? ui().quizPanel.seeResults : ui().quizPanel.nextQuestion} <kbd>Enter</kbd>
          </button>
        </>
      )}
    </section>
  )
}
