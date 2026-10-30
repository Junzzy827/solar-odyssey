import { useEffect, useRef, useState } from 'react'
import { factsFor } from '../data/facts'
import { PLANETS } from '../data/bodies'
import { useStore } from '../state/store'
import { bodyInfo } from '../state/flight'
import { isSFObject } from '../data/sf'
import { isTelescope } from '../data/telescopes'
import { raceActive } from '../state/race'
import { openScope } from './Hud'
import { useQuiz } from '../state/quiz'
import { useProbes } from '../state/probes'
import { t, useLang } from '../i18n/lang'
import { TerraMarsNote } from './TerraMarsNote'

const TOTAL = 1 + PLANETS.reduce((n, p) => n + 1 + p.moons.length, 0)
const NEAR = 10

/** 航海日誌：目標に近づくと開き、解説とクイズを出す */
export function LogPanel() {
  const targetId = useStore((s) => s.targetId)
  const logOpen = useStore((s) => s.logOpen)
  const setLogOpen = useStore((s) => s.setLogOpen)
  const distance = useStore((s) => s.telemetry.distance)
  const warpPhase = useStore((s) => s.warpPhase)
  const visited = useStore((s) => s.visited)
  const scopeNear = useStore((s) => s.scopeNear)
  const markVisited = useStore((s) => s.markVisited)
  const quizOpen = useQuiz((q) => q.open)
  const probesOpen = useProbes((p) => p.open)
  const [picked, setPicked] = useState<number | null>(null)
  const autoOpened = useRef<string | null>(null)
  useLang()

  // 目標に近づいたら一度だけ自動で開く
  useEffect(() => {
    if (!targetId || warpPhase !== 'idle' || distance === null || raceActive()) return
    if (distance < NEAR && autoOpened.current !== targetId) {
      autoOpened.current = targetId
      setLogOpen(true)
    }
  }, [targetId, distance, warpPhase, setLogOpen])

  useEffect(() => setPicked(null), [targetId])

  // I キーで開閉
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyI' && useStore.getState().targetId && !useStore.getState().scope) setLogOpen(!useStore.getState().logOpen)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setLogOpen])

  const facts = targetId ? factsFor(targetId) : undefined
  const info = targetId ? bodyInfo(targetId) : null
  if (!logOpen || quizOpen || probesOpen || !facts || !info || !targetId) return null

  const done = visited.includes(targetId)
  const answered = picked !== null
  const correct = picked === facts.quiz.answer

  const rows: [string, string | undefined][] = facts.rows ?? [
    [t('直径', 'Diameter'), facts.diameter],
    [t('温度', 'Temperature'), facts.temperature],
    [t('重力', 'Gravity'), facts.gravity],
    [t('1日の長さ', 'Length of day'), facts.day],
    [t('1年（公転）', 'Year (orbit)'), facts.year],
    [t('衛星', 'Moons'), facts.moons],
  ]

  return (
    <section className="log-panel" aria-label={t('航海日誌', 'Ship’s log')}>
      <header>
        <h2>
          {t('航海日誌：', 'Ship’s log: ')}
          {info.name}
          {facts.fiction && <span className="log-fiction">{t('SF・フィクション', 'SF · fiction')}</span>}
          {done && <span className="badge">{t('探査済み', 'Explored')}</span>}
        </h2>
        <button className="close" onClick={() => setLogOpen(false)} aria-label={t('閉じる', 'Close')}>
          ×
        </button>
      </header>
      <dl>
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      <ul className="notes">
        {facts.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      {facts.real && (
        <div className="log-real">
          <h3>{t('現実の科学では', 'In real science')}</h3>
          <ul>
            {facts.real.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      {targetId === 'mars' && <TerraMarsNote />}
      {isTelescope(targetId) && (
        <button className="secondary scope-open" onClick={() => openScope(targetId)} disabled={scopeNear !== targetId}>
          {scopeNear === targetId ? t('望遠鏡でのぞく', 'Look through the telescope') : t('そばまで行くと、望遠鏡でのぞけます', 'Fly close to look through the telescope')} <kbd>T</kbd>
        </button>
      )}
      <div className="quiz">
        <div className="quiz-q">Q. {facts.quiz.question}</div>
        <div className="quiz-choices">
          {facts.quiz.choices.map((c, i) => (
            <button
              key={c}
              className={answered ? (i === facts.quiz.answer ? 'right' : i === picked ? 'wrong' : '') : ''}
              disabled={answered}
              onClick={() => {
                setPicked(i)
                if (i === facts.quiz.answer) markVisited(targetId)
              }}
            >
              {c}
            </button>
          ))}
        </div>
        {answered && (
          <div className="quiz-a">
            {correct ? t('正解！', 'Correct!') : t('残念！', 'Not quite!')} {facts.quiz.explanation}
            {!correct && (
              <button className="retry" onClick={() => setPicked(null)}>
                {t('もう一度', 'Try again')}
              </button>
            )}
          </div>
        )}
      </div>
      <footer className="muted">
        {t('探査済み', 'Explored')} {visited.filter((id) => !isSFObject(id) && !isTelescope(id)).length} / {TOTAL}
        {t('（', ' (')}
        <kbd>I</kbd>
        {t(' で開閉）', ' to open/close)')}
      </footer>
    </section>
  )
}
