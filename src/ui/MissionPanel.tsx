import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { DEFLECT_HITS, MISSIONS } from '../data/missions'
import { missionText, ui } from '../i18n'
import { useStore } from '../state/store'
import { abortMission, answerQuiz, closeMissions, isUnlocked, nextQuiz, showBriefing, startMission, useMission, openMissions } from '../state/mission'
import { useRace } from '../state/race'

const Stars = ({ n, big }: { n: number; big?: boolean }) => (
  <span className={`stars${big ? ' big' : ''}`} aria-label={ui().starsLabel(n)}>
    {[0, 1, 2].map((i) => (
      <span key={i} className={i < n ? 'on' : ''}>
        ★
      </span>
    ))}
  </span>
)

/** 一覧・説明・結果のあいだは Esc で閉じる（クイズと同じく、ほかのキー操作より先に受け取る） */
function useEscape(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      onEscape()
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active, onEscape])
}

/** ストーリーモード：任務の一覧、出発前の説明、任務中の表示、結果とクイズ */
export function MissionPanel() {
  const phase = useMission((m) => m.phase)
  const mode = useStore((s) => s.mode)
  const scope = useStore((s) => s.scope)
  const modal = (phase === 'list' || phase === 'briefing' || phase === 'debrief') && mode !== 'gallery' && !scope
  useEscape(modal, closeMissions)

  if (phase === 'active') return mode === 'gallery' ? null : <MissionBar />
  if (!modal) return null
  return (
    <section className="quiz-run mission-panel" aria-label={ui().missionsTitle}>
      {phase === 'list' ? <MissionList /> : phase === 'briefing' ? <Briefing /> : <Debrief />}
    </section>
  )
}

function Header({ title, onClose = closeMissions }: { title: string; onClose?: () => void }) {
  return (
    <header>
      <h2>{title}</h2>
      <button className="close" onClick={onClose} aria-label={ui().close}>
        ×
      </button>
    </header>
  )
}

function MissionList() {
  const stars = useMission((m) => m.stars)
  const t = ui()
  return (
    <>
      <Header title={t.missionsTitle} />
      <p className="muted small">{t.missionsIntro}</p>
      <ol className="mission-list">
        {MISSIONS.map((m, i) => {
          const open = isUnlocked(i)
          return (
            <li key={m.id}>
              <button disabled={!open} onClick={() => showBriefing(i)}>
                <span className="mission-no">{t.missionNumber(i + 1)}</span>
                <span className="mission-name">{open ? missionText(m.id).title : t.locked}</span>
                {open && <Stars n={stars[i]} />}
              </button>
            </li>
          )
        })}
      </ol>
    </>
  )
}

function Briefing() {
  const index = useMission((m) => m.index)
  const racing = useRace((r) => r.phase === 'countdown' || r.phase === 'running')
  const text = missionText(MISSIONS[index].id)
  const t = ui()
  return (
    <>
      <Header title={`${t.missionNumber(index + 1)}　${text.title}`} />
      <div className="muted small">{t.client(text.client)}</div>
      <div className="mission-comm">
        <b>{t.navi}</b>
        {text.briefing.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      <div className="nav-heading">{t.goals}</div>
      <ol className="mission-goals">
        {text.steps.map((s) => (
          <li key={s.goal}>{s.goal}</li>
        ))}
      </ol>
      {racing && <p className="muted small">{t.noRace}</p>}
      <div className="quiz-actions">
        <button className="engage" onClick={startMission} disabled={racing}>
          {t.depart}
        </button>
        <button className="secondary" onClick={openListFromBriefing}>
          {t.back}
        </button>
      </div>
    </>
  )
}

const openListFromBriefing = () => useMission.setState({ phase: 'list' })

/** 任務中：いまの目標と進み具合、航法AIのことば。トーストと重ならないよう、トーストをこの下へずらす */
function MissionBar() {
  const m = useMission()
  const def = MISSIONS[m.index]
  const text = missionText(def.id)
  const step = def.steps[m.step]
  const t = ui()
  const [folded, setFolded] = useState(false)
  const bar = useRef<HTMLDivElement>(null)

  useEffect(() => setFolded(false), [m.messageId])

  useLayoutEffect(() => {
    const el = bar.current
    if (!el) return
    const root = document.documentElement
    const place = () => {
      const rect = el.getBoundingClientRect()
      // 画面の上にあるときだけ（スマホの縦向きでは下にあるので、トーストはそのまま）
      if (rect.top < window.innerHeight / 2) root.style.setProperty('--toast-top', `${Math.round(rect.bottom + 10)}px`)
      else root.style.removeProperty('--toast-top')
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(el)
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
      root.style.removeProperty('--toast-top')
    }
  }, [])

  let status: string
  if (step.kind === 'deflect') status = t.hits(m.progress, DEFLECT_HITS)
  else if (step.kind === 'unload' || step.kind === 'scan') status = m.progress > 0 ? t.progress(Math.round(m.progress * 100)) : t.waitNear
  else status = ''
  const fraction = step.kind === 'deflect' ? m.progress / DEFLECT_HITS : step.kind === 'unload' || step.kind === 'scan' ? m.progress : 0

  return (
    <div className="mission-bar" ref={bar}>
      <div className="mission-head">
        <span className="mission-no">{t.missionNumber(m.index + 1)}</span>
        <span className="mission-name">{text.title}</span>
        <button className="race-quit" onClick={abortMission}>
          {t.quit}
        </button>
      </div>
      <div className="mission-goal">
        <span>▶ {text.steps[m.step].goal}</span>
        {status && <span className="mission-status">{status}</span>}
      </div>
      {fraction > 0 && (
        <div className="mission-meter">
          <div style={{ width: `${Math.round(fraction * 100)}%` }} />
        </div>
      )}
      {m.message && (
        <button className={`mission-comm${folded ? ' folded' : ''}`} key={m.messageId} onClick={() => setFolded(!folded)} aria-expanded={!folded}>
          <b>{t.navi}</b> {m.message}
        </button>
      )}
    </div>
  )
}

function Debrief() {
  const m = useMission()
  const def = MISSIONS[m.index]
  const text = missionText(def.id)
  const t = ui()
  const quiz = text.quiz[m.quizIndex]
  const picked = m.picked[m.quizIndex]
  const last = m.index + 1 >= MISSIONS.length

  return (
    <>
      <Header title={`${t.complete} ${text.title}`} />
      {m.message && (
        <div className="mission-comm">
          <b>{t.navi}</b> {m.message}
        </div>
      )}
      <div className="nav-heading">{t.learned}</div>
      <ul className="mission-summary">
        {text.summary.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>

      {quiz ? (
        <>
          <div className="nav-heading">{t.quizTitle(m.quizIndex + 1, text.quiz.length)}</div>
          <div className="quiz-q">Q. {quiz.question}</div>
          <div className="quiz-choices">
            {quiz.choices.map((c, i) => (
              <button
                key={c}
                className={picked != null ? (i === quiz.answer ? 'right' : i === picked ? 'wrong' : '') : ''}
                disabled={picked != null}
                onClick={() => answerQuiz(i)}
              >
                {c}
              </button>
            ))}
          </div>
          {picked != null && (
            <>
              <div className="quiz-a">
                <strong>{picked === quiz.answer ? t.right : t.wrong(quiz.choices[quiz.answer])}</strong> {quiz.explanation}
              </div>
              <button className="engage" onClick={nextQuiz}>
                {m.quizIndex + 1 < text.quiz.length ? t.next : t.showResult}
              </button>
            </>
          )}
        </>
      ) : (
        <>
          <div className="mission-result">
            <Stars n={m.earned ?? 1} big />
            <div className="muted small">{t.starsNote}</div>
            <div className="muted small">{t.best(m.stars[m.index])}</div>
          </div>
          {last && <p>{t.allDone}</p>}
          <div className="quiz-actions">
            {!last && (
              <button className="engage" onClick={() => showBriefing(m.index + 1)}>
                {t.nextMission}
              </button>
            )}
            <button className="secondary" onClick={() => showBriefing(m.index)}>
              {t.retry}
            </button>
            <button className="secondary" onClick={openMissions}>
              {t.back}
            </button>
          </div>
        </>
      )}
    </>
  )
}
