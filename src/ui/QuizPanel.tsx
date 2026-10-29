import { useEffect } from 'react'
import { useStore } from '../state/store'
import { raceActive, useRace } from '../state/race'
import { playBeep } from '../audio/sfx'
import { closeQuiz, nextQuestion, pickAnswer, QUIZ_LENGTH, quizBodyName, quizText, quizTitle, startQuiz, useQuiz, warpToMissed } from '../state/quiz'
import { t, useLang } from '../i18n/lang'

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

/** クイズのあいだは 1〜3 で答え、Enter で次へ、Esc で閉じる（ワープ速度やエンゲージのキーより先に受け取る） */
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
      <section className="quiz-run" aria-label={t('連続クイズの結果', 'Quiz results')}>
        <header>
          <h2>{t(`結果：${q.score} / ${QUIZ_LENGTH}問 正解`, `Result: ${q.score} / ${QUIZ_LENGTH} correct`)}</h2>
          <button className="close" onClick={closeQuiz} aria-label={t('閉じる', 'Close')}>
            ×
          </button>
        </header>
        <div className="quiz-title">{t(`称号「${quizTitle(q.score)}」`, `Title: ${quizTitle(q.score)}`)}</div>
        <dl>
          <div>
            <dt>{t('いちばん長い連続正解', 'Longest streak')}</dt>
            <dd>{t(`${q.bestStreak}問`, String(q.bestStreak))}</dd>
          </div>
          <div>
            <dt>{t('これまでの最高', 'Best so far')}</dt>
            <dd>
              {t(`${q.best ?? q.score}問`, String(q.best ?? q.score))}
              {q.newBest && <span className="badge">{t('新記録！', 'New record!')}</span>}
            </dd>
          </div>
        </dl>
        {q.missed.length > 0 ? (
          <>
            <div className="nav-heading">{t('まちがえた天体を見に行こう', 'Go and see the ones you missed')}</div>
            <div className="quiz-missed">
              {q.missed.map((id) => (
                <button key={id} className="secondary" onClick={() => warpToMissed(id)}>
                  {t(`${quizBodyName(id)}へワープ`, `Warp to ${quizBodyName(id)}`)}
                </button>
              ))}
            </div>
            <p className="muted small">{t('着いたら航海日誌に、くわしい解説とクイズがあります。', 'When you arrive, the ship’s log has more facts and a quiz.')}</p>
          </>
        ) : (
          <p>{t('全問正解です。すばらしい！', 'All correct. Amazing!')}</p>
        )}
        <div className="quiz-actions">
          <button className="engage" onClick={startQuiz}>
            {t('もう一度挑戦', 'Try again')}
          </button>
          <button className="secondary" onClick={closeQuiz}>
            {t('閉じる', 'Close')}
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
    <section className="quiz-run" aria-label={t('連続クイズ', 'Quiz run')}>
      <header>
        <h2>
          {t('連続クイズ', 'Quiz run')} <span className="muted">{t(`第${q.index + 1}問 / ${QUIZ_LENGTH}`, `Question ${q.index + 1} / ${QUIZ_LENGTH}`)}</span>
        </h2>
        <button className="close" onClick={closeQuiz} aria-label={t('閉じる', 'Close')}>
          ×
        </button>
      </header>
      <div className="quiz-status">
        <span>
          {t('正解', 'Correct')} {q.score}
        </span>
        <span className={q.streak >= 3 ? 'hot' : ''}>
          {t('連続', 'Streak')} {q.streak}
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
                  ? t(`正解！ ${q.streak}問連続！`, `Correct! ${q.streak} in a row!`)
                  : t('正解！', 'Correct!')
                : t(`残念！ 正解は「${text.choices[question.answer]}」`, `Not quite! The answer is “${text.choices[question.answer]}.”`)}
            </strong>{' '}
            {text.explanation}
          </div>
          <button className="engage" onClick={nextQuestion}>
            {last ? t('結果を見る', 'See results') : t('次の問題', 'Next question')} <kbd>Enter</kbd>
          </button>
        </>
      )}
    </section>
  )
}
