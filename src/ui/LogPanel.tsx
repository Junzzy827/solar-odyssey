import { useEffect, useRef, useState } from 'react'
import { FACTS } from '../data/facts'
import { PLANETS } from '../data/bodies'
import { useStore } from '../state/store'
import { bodyInfo } from '../state/flight'

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
  const markVisited = useStore((s) => s.markVisited)
  const [picked, setPicked] = useState<number | null>(null)
  const autoOpened = useRef<string | null>(null)

  // 目標に近づいたら一度だけ自動で開く
  useEffect(() => {
    if (!targetId || warpPhase !== 'idle' || distance === null) return
    if (distance < NEAR && autoOpened.current !== targetId) {
      autoOpened.current = targetId
      setLogOpen(true)
    }
  }, [targetId, distance, warpPhase, setLogOpen])

  useEffect(() => setPicked(null), [targetId])

  // I キーで開閉
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyI' && useStore.getState().targetId) setLogOpen(!useStore.getState().logOpen)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setLogOpen])

  const facts = targetId ? FACTS[targetId] : undefined
  const info = targetId ? bodyInfo(targetId) : null
  if (!logOpen || !facts || !info || !targetId) return null

  const done = visited.includes(targetId)
  const answered = picked !== null
  const correct = picked === facts.quiz.answer

  const rows: [string, string | undefined][] = [
    ['直径', facts.diameter],
    ['温度', facts.temperature],
    ['重力', facts.gravity],
    ['1日の長さ', facts.day],
    ['1年（公転）', facts.year],
    ['衛星', facts.moons],
  ]

  return (
    <section className="log-panel" aria-label="航海日誌">
      <header>
        <h2>
          航海日誌：{info.name}
          {done && <span className="badge">探査済み</span>}
        </h2>
        <button className="close" onClick={() => setLogOpen(false)} aria-label="閉じる">
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
            {correct ? '正解！' : '残念！'} {facts.quiz.explanation}
            {!correct && (
              <button className="retry" onClick={() => setPicked(null)}>
                もう一度
              </button>
            )}
          </div>
        )}
      </div>
      <footer className="muted">
        探査済み {visited.length} / {TOTAL}（<kbd>I</kbd> で開閉）
      </footer>
    </section>
  )
}
