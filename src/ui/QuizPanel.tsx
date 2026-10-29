import { useEffect } from 'react'
import { useStore } from '../state/store'
import { raceActive, useRace } from '../state/race'
import { playBeep } from '../audio/sfx'
import { closeQuiz, nextQuestion, pickAnswer, QUIZ_LENGTH, quizBodyName, quizTitle, startQuiz, useQuiz, warpToMissed } from '../state/quiz'

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

  // レースが始まったら閉じる
  useEffect(() => {
    if (raceActive() && useQuiz.getState().open) closeQuiz()
  }, [racePhase])

  if (!visible) return null

  if (q.finished) {
    return (
      <section className="quiz-run" aria-label="連続クイズの結果">
        <header>
          <h2>結果：{q.score} / {QUIZ_LENGTH}問 正解</h2>
          <button className="close" onClick={closeQuiz} aria-label="閉じる">
            ×
          </button>
        </header>
        <div className="quiz-title">称号「{quizTitle(q.score)}」</div>
        <dl>
          <div>
            <dt>いちばん長い連続正解</dt>
            <dd>{q.bestStreak}問</dd>
          </div>
          <div>
            <dt>これまでの最高</dt>
            <dd>
              {q.best ?? q.score}問{q.newBest && <span className="badge">新記録！</span>}
            </dd>
          </div>
        </dl>
        {q.missed.length > 0 ? (
          <>
            <div className="nav-heading">まちがえた天体を見に行こう</div>
            <div className="quiz-missed">
              {q.missed.map((id) => (
                <button key={id} className="secondary" onClick={() => warpToMissed(id)}>
                  {quizBodyName(id)}へワープ
                </button>
              ))}
            </div>
            <p className="muted small">着いたら航海日誌に、くわしい解説とクイズがあります。</p>
          </>
        ) : (
          <p>全問正解です。すばらしい！</p>
        )}
        <div className="quiz-actions">
          <button className="engage" onClick={startQuiz}>
            もう一度挑戦
          </button>
          <button className="secondary" onClick={closeQuiz}>
            閉じる
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

  return (
    <section className="quiz-run" aria-label="連続クイズ">
      <header>
        <h2>
          連続クイズ <span className="muted">第{q.index + 1}問 / {QUIZ_LENGTH}</span>
        </h2>
        <button className="close" onClick={closeQuiz} aria-label="閉じる">
          ×
        </button>
      </header>
      <div className="quiz-status">
        <span>正解 {q.score}</span>
        <span className={q.streak >= 3 ? 'hot' : ''}>連続 {q.streak}</span>
      </div>
      <ol className="quiz-dots" aria-hidden>
        {q.questions.map((_, i) => (
          <li key={i} className={i < q.results.length ? (q.results[i] ? 'right' : 'wrong') : i === q.index ? 'now' : ''} />
        ))}
      </ol>
      <div className="quiz-q">Q. {question.question}</div>
      <div className="quiz-choices">
        {question.choices.map((c, i) => (
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
            <strong>{right ? (q.streak >= 3 ? `正解！ ${q.streak}問連続！` : '正解！') : `残念！ 正解は「${question.choices[question.answer]}」`}</strong> {question.explanation}
          </div>
          <button className="engage" onClick={nextQuestion}>
            {last ? '結果を見る' : '次の問題'} <kbd>Enter</kbd>
          </button>
        </>
      )}
    </section>
  )
}
