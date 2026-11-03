import { Suspense, memo, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type MouseEvent as RMouseEvent } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { dprFor, useLevel } from '../../state/quality'
import { QualityGovernor } from '../QualityGovernor'
import { t, useLang } from '../../i18n/lang'
import { useShip } from '../../data/ships'
import {
  DEPLOY_SEC,
  EVA_FADE,
  EVA_TOOLS,
  LAUNCH_SEC,
  RECALL_SEC,
  TETHER_M,
  TOOL_ICON,
  TOOL_NAME,
  bindEvaKeys,
  evaInput,
  evaNow,
  evaScene,
  pickTool,
  recallEva,
  useEva,
} from '../../state/eva'
import { EvaWorld } from './EvaWorld'
import { EvaJobs } from './EvaJobs'
import { JOBS, JOB_TYPES, rackRt, useEvaJobs, useEvaLog } from '../../state/evaJobs'
import { Tsumugi } from './Tsumugi'
import { ARC_W, HULL_R, SITE_NAME, arcTaper, evaSite } from './hull'

// 船外活動の場面。宇宙の場面とは別の Canvas で描く（そのあいだ宇宙の場面は止める）。

/**
 * 船外の Canvas。発進・回収のあいだは幕のために外側が毎フレーム描き直すので、memo でそこから切り離す
 * （Canvas を描き直すたびに影の設定がかけ直され、影の地図が作り直されて、影を受ける材質が描けなくなることがある）。
 * 影は PCF（three.js にはもう PCFSoft がなく、指定すると毎回 PCF に置き換えて作り直す）
 */
const EvaCanvas = memo(function EvaCanvas() {
  const level = useLevel()
  const spec = useShip()
  const tint = useMemo(() => new THREE.Color(spec.swatch[0]), [spec])
  return (
    <Canvas shadows="percentage" dpr={Math.min(dprFor(level), 1.75)} gl={{ alpha: false }} camera={{ fov: 62, near: 0.05, far: 12000, position: [2.4, 1.7, 3.3] }}>
      <color attach="background" args={['#000']} />
      <Suspense fallback={null}>
        <EvaWorld spec={spec} />
        <Tsumugi shipTint={tint} />
        <EvaJobs />
      </Suspense>
      <QualityGovernor />
    </Canvas>
  )
})

/** ボタンを押しているあいだだけ入力する */
function holdProps(on: () => void, off: () => void) {
  return {
    onPointerDown: (e: RPointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      on()
    },
    onPointerUp: off,
    onPointerCancel: off,
    onContextMenu: (e: RMouseEvent) => e.preventDefault(),
  }
}

/** スマホの移動スティック（左下） */
function Stick() {
  const base = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState<[number, number]>([0, 0])
  const move = (e: RPointerEvent) => {
    const el = base.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const R = r.width / 2
    let x = (e.clientX - r.left - R) / R
    let y = (e.clientY - r.top - R) / R
    const l = Math.hypot(x, y)
    if (l > 1) {
      x /= l
      y /= l
    }
    evaInput.stickX = Math.abs(x) < 0.12 ? 0 : x
    evaInput.stickY = Math.abs(y) < 0.12 ? 0 : y
    setKnob([x, y])
  }
  const end = () => {
    evaInput.stickX = 0
    evaInput.stickY = 0
    setKnob([0, 0])
  }
  return (
    <div
      className="eva-stick"
      ref={base}
      onPointerDown={(e) => {
        e.stopPropagation()
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        move(e)
      }}
      onPointerMove={(e) => e.buttons && move(e)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="eva-knob" style={{ transform: `translate(${knob[0] * 34}px, ${knob[1] * 34}px)` }} />
    </div>
  )
}

function Bar({ v, warn }: { v: number; warn?: boolean }) {
  return (
    <span className={`eva-bar${warn ? ' warn' : ''}`}>
      <span style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
    </span>
  )
}

/** 計器：速さ・命綱・外壁からの高さ・ガス・電池 */
function EvaHud() {
  useLang()
  const hud = useEva((e) => e.hud)
  const taut = useEva((e) => e.taut)
  const assist = useEva((e) => e.assist)
  const left = Math.max(0, TETHER_M - hud.dist)
  return (
    <div className="eva-hud">
      <div className="eva-badge">EVR-1 TSUMUGI</div>
      <div className="eva-site">{t(...SITE_NAME[evaSite.id])}</div>
      <div className="eh-speed">
        {hud.speed.toFixed(2)}
        <small> m/s</small>
      </div>
      <div className="eh-row">
        <span className="eh-k">{t('命綱', 'TETHER')}</span>
        <Bar v={(left / TETHER_M) * 100} warn={taut || left < 5} />
        <span className="eh-v">
          {left.toFixed(0)}
          <small> m</small>
        </span>
      </div>
      <div className="eh-row">
        <span className="eh-k">{t('ガス', 'GAS')}</span>
        <Bar v={hud.gas} warn={hud.gas < 15} />
        <span className="eh-v">{hud.gas}%</span>
      </div>
      <div className="eh-row">
        <span className="eh-k">{t('電池', 'BATT')}</span>
        <Bar v={hud.battery} />
        <span className="eh-v">{hud.battery}%</span>
      </div>
      <div className="eh-row">
        <span className="eh-k">{t('高さ', 'ALT')}</span>
        <span className="eh-v wide">
          {hud.alt.toFixed(1)}
          <small> m</small>
        </span>
        <span className={`eh-assist${assist ? ' on' : ''}`}>{assist ? t('自動ブレーキ', 'AUTO-BRAKE') : t('慣性', 'INERTIA')}</span>
      </div>
    </div>
  )
}

/** ミニマップ：真上から見た外壁の帯、エアロック、命綱の届く円、ツムギの位置と向き */
function EvaMap() {
  useLang()
  const hud = useEva((e) => e.hud)
  const taut = useEva((e) => e.taut)
  const jobs = useEvaJobs((j) => j.ui.jobs)
  const focus = useEvaJobs((j) => j.ui.focus)
  const H = TETHER_M + 6
  const site = evaSite.id
  const halfW = site === 'hull' ? HULL_R * 0.98 : site === 'dock' ? 110 : ARC_W
  // アルカディアの発進路は前へ行くほど広い
  const trench = `M ${-ARC_W - arcTaper(-H)} ${-H} L ${ARC_W + arcTaper(-H)} ${-H} L ${ARC_W + arcTaper(H)} ${H} L ${-ARC_W - arcTaper(H)} ${H} Z`
  const seams = site === 'arcadia' ? [-4.5, 4.5] : [-20, -10, 0, 10, 20]
  return (
    <div className={`eva-map${taut ? ' edge' : ''}`}>
      <svg viewBox={`${-H} ${-H} ${H * 2} ${H * 2}`} aria-label={t('ミニマップ', 'Minimap')}>
        {site === 'arcadia' ? <path d={trench} className="m-hull" /> : <rect x={-halfW} y={-H} width={halfW * 2} height={H * 2} className="m-hull" />}
        {seams.map((x) => (
          <line key={x} x1={x} y1={-H} x2={x} y2={H} className="m-seam" />
        ))}
        <circle cx={0} cy={0} r={TETHER_M} className="m-range" />
        <rect x={-1.6} y={-1.6} width={3.2} height={3.2} className="m-lock" />
        <rect x={rackRt.P.x - 1.1} y={rackRt.P.z - 1.1} width={2.2} height={2.2} className="m-rack" />
        {jobs.map((j, i) => (
          <g key={i} transform={`translate(${j.x} ${j.z})`} className={j.done ? 'm-job done' : i === focus ? 'm-job on' : 'm-job'}>
            {j.done ? <circle r={2} /> : <path d="M 0 -3 L 3 0 L 0 3 L -3 0 Z" />}
          </g>
        ))}
        <line x1={0} y1={0} x2={hud.x} y2={hud.z} className="m-tether" />
        <g transform={`translate(${hud.x} ${hud.z}) rotate(${hud.hdg})`}>
          <path d="M 0 -4.2 L 2.8 3 L 0 1.6 L -2.8 3 Z" className="m-bot" />
        </g>
      </svg>
      <span className="m-fwd">{site === 'dock' ? t('リングの向き', 'ALONG RING') : t('船首', 'BOW')} ▲</span>
    </div>
  )
}

function ToolBar() {
  const lang = useLang()
  const tool = useEva((e) => e.tool)
  const swapping = useEva((e) => e.swapping)
  return (
    <div className="eva-tools">
      {EVA_TOOLS.map((k, i) => (
        <button key={k} className={`eva-tool${tool === k ? ' on' : ''}`} disabled={swapping} onClick={() => pickTool(k)} title={lang === 'en' ? TOOL_NAME[k][1] : TOOL_NAME[k][0]}>
          <span className="et-icon">{TOOL_ICON[k]}</span>
          <kbd>{i + 1}</kbd>
        </button>
      ))}
    </div>
  )
}

const toolLabel = (k: keyof typeof TOOL_NAME, lang: string) => `${TOOL_ICON[k]} ${lang === 'en' ? TOOL_NAME[k][1] : TOOL_NAME[k][0]}`

/** 修理の依頼：3 つの一覧と、いま向かっている依頼の手順 */
function JobPanel() {
  const lang = useLang()
  const ui = useEvaJobs((j) => j.ui)
  const carrying = useEvaJobs((j) => j.carrying)
  const [open, setOpen] = useState(true)
  if (!ui.jobs.length) return null
  const L = (p: [string, string]) => (lang === 'en' ? p[1] : p[0])
  const done = ui.jobs.filter((j) => j.done).length
  const fj = ui.jobs[ui.focus]
  const def = fj ? JOBS[fj.type] : null
  return (
    <div className={`eva-jobs${open ? '' : ' shut'}`}>
      <button className="ej-head" onClick={() => setOpen(!open)}>
        <span className="ej-kicker">{t('修理の依頼', 'REPAIR ORDERS')}</span>
        <span className="ej-count">
          {done} / {ui.jobs.length}
        </span>
        <span className="ej-fold">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <>
          <ul className="ej-list">
            {ui.jobs.map((j, i) => (
              <li key={i} className={j.done ? 'done' : i === ui.focus ? 'on' : ''}>
                <span className="ej-mark">{j.done ? '✓' : i === ui.focus ? '▶' : '・'}</span>
                {L(JOBS[j.type].name)}
              </li>
            ))}
          </ul>
          {fj && def && !fj.done && (
            <ol className="ej-steps">
              {def.steps.map((st, k) => (
                <li key={k} className={k < fj.step ? 'done' : k === fj.step ? 'on' : ''}>
                  <span className="ej-tool">{TOOL_ICON[st.tool]}</span>
                  <span className="ej-text">{L(st.text)}</span>
                  {k === fj.step && (
                    <span className="eva-bar ej-bar">
                      <span style={{ width: `${ui.prog * 100}%` }} />
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      {fj && def && !fj.done && <JobHint ui={ui} carrying={!!carrying} lang={lang} />}
      {done === ui.jobs.length && <div className="ej-hint ok">{t('今日の修理はすべて終わりました。回収して船にもどりましょう', 'All repairs done for today. Recall Tsumugi and head back in')}</div>}
    </div>
  )
}

function JobHint({ ui, carrying, lang }: { ui: ReturnType<typeof useEvaJobs.getState>['ui']; carrying: boolean; lang: string }) {
  const blockedAt = useEvaJobs((j) => j.blockedAt)
  const fj = ui.jobs[ui.focus]
  const st = JOBS[fj.type].steps[fj.step]
  const key = EVA_TOOLS.indexOf(st.tool) + 1
  if (carrying && evaNow() - blockedAt < 2.5) return <div className="ej-hint warn">{t('部品を運んでいるあいだは、ツールを付け替えられません', 'You can’t swap tools while carrying a part')}</div>
  if (ui.need) return <div className="ej-hint warn">{t(`${toolLabel(ui.need, lang)}に付け替えてください（${key} キー）`, `Switch to the ${toolLabel(ui.need, lang)} (key ${key})`)}</div>
  if (ui.near) return <div className="ej-hint go">{t('E を長押しして作業（体が自動で寄ります）', 'Hold E to work — Tsumugi lines up by itself')}</div>
  const where = ui.toRack ? t('青い光の部品棚へ', 'Go to the parts rack (blue light)') : carrying ? t('部品をオレンジの光の所へ運ぶ', 'Carry the part to the orange light') : t('オレンジの光の柱へ', 'Head for the orange light')
  return (
    <div className="ej-hint">
      {where} <b>{ui.dist.toFixed(0)} m</b>
    </div>
  )
}

/** 修理が終わったときのカード：作業の中身と、本当の宇宙の船外作業の豆知識 */
function JobCard() {
  const lang = useLang()
  const card = useEvaJobs((j) => j.card)
  const ui = useEvaJobs((j) => j.ui)
  const log = useEvaLog((l) => l.log)
  const j = card !== null ? ui.jobs[card] : null
  if (!j) return null
  const def = JOBS[j.type]
  const L = (p: [string, string]) => (lang === 'en' ? p[1] : p[0])
  const kinds = JOB_TYPES.filter((k) => log[k]).length
  return (
    <div className="sample-card eva-card">
      <div className="sample-head">
        <span className="ec-check">✓</span>
        <div>
          <div className="sample-kicker">{t('修理完了 ・ 作業記録', 'REPAIR COMPLETE · WORK LOG')}</div>
          <div className="sample-name">{L(def.name)}</div>
        </div>
      </div>
      <ol className="ec-steps">
        {def.steps.map((st, k) => (
          <li key={k}>
            <span className="ej-tool">{TOOL_ICON[st.tool]}</span>
            {L(st.text)}
          </li>
        ))}
      </ol>
      <p className="sample-note">
        <span className="ec-tag">{t('本当の宇宙では', 'In real space')}</span>
        {L(def.note)}
      </p>
      <div className="sample-foot">
        <span>
          {t('作業記録', 'Work log')} {kinds} / {JOB_TYPES.length} {t('種類', 'kinds')} ・ {t('この種類', 'this kind')} ×{log[j.type] ?? 0}
        </span>
        <button className="secondary" onClick={() => useEvaJobs.setState({ card: null })}>
          {t('閉じる', 'Close')}
        </button>
      </div>
    </div>
  )
}

function EvaPanel() {
  const lang = useLang()
  const phase = useEva((e) => e.phase)
  const view = useEva((e) => e.view)
  const assist = useEva((e) => e.assist)
  const taut = useEva((e) => e.taut)
  const tool = useEva((e) => e.tool)
  const working = useEva((e) => e.working)
  const swapping = useEva((e) => e.swapping)
  const gas = useEva((e) => e.hud.gas)
  useEffect(() => bindEvaKeys(), [])
  const fly = phase === 'fly'
  const toolName = lang === 'en' ? TOOL_NAME[tool][1] : TOOL_NAME[tool][0]
  return (
    <div className="surface-ui eva-ui">
      {phase === 'launch' && <div className="surface-caption">{t('エアロックを開けています…', 'Opening the airlock…')}</div>}
      {phase === 'deploy' && <div className="surface-caption">{t('ツムギ、展開して起動中…', 'Tsumugi unfolding and booting up…')}</div>}
      {phase === 'recall' && <div className="surface-caption">{t('命綱を巻き取って、船内へもどります', 'Reeling in the tether and heading back inside')}</div>}
      {fly && (
        <>
          <div className="surface-hint eva-hint">
            {t('W A S D 移動・R/F 上下・ドラッグ／矢印 向き・Z/C 横回転・X ブレーキ・E 作業・1〜5 ツール・V 見方', 'WASD move · R/F up/down · drag or arrows to turn · Z/C roll · X brake · E use tool · 1–5 tools · V view')}
          </div>
          <EvaHud />
          <EvaMap />
          <JobPanel />
          <JobCard />
          <ToolBar />
          <div className="eva-status">
            {swapping ? (
              <span className="es-busy">{t('ツールを付け替え中…', 'Swapping tools…')}</span>
            ) : working ? (
              <span className="es-busy">{t(`${toolName}で作業中`, `Working with the ${toolName.toLowerCase()}`)}</span>
            ) : (
              <button className="eva-work" {...holdProps(() => (evaInput.work = true), () => (evaInput.work = false))}>
                {t(`${toolName}を使う`, `Use the ${toolName.toLowerCase()}`)} <kbd>E</kbd>
              </button>
            )}
          </div>
          {taut && (
            <div className="rover-edge">
              {t('命綱がいっぱいです', 'The tether is at full length')}
              <small>{t(`エアロックから ${TETHER_M} m までしか離れられません`, `Tsumugi can go up to ${TETHER_M} m from the airlock`)}</small>
            </div>
          )}
          {gas === 0 && <div className="eva-warn">{t('ガスが空です。ゆっくりしか動けません', 'Out of gas — thrust is weak')}</div>}
          <Stick />
          <div className="eva-pad">
            <button {...holdProps(() => (evaInput.padUp = 1), () => (evaInput.padUp = 0))}>{t('上', 'Up')}</button>
            <button {...holdProps(() => (evaInput.padUp = -1), () => (evaInput.padUp = 0))}>{t('下', 'Down')}</button>
            <button className="go" {...holdProps(() => (evaInput.work = true), () => (evaInput.work = false))}>
              {t('作業', 'Use')}
            </button>
          </div>
        </>
      )}
      <div className="surface-buttons rover-actions eva-actions">
        {fly && (
          <>
            <button className="secondary" onClick={() => useEva.setState({ view: view === 'chase' ? 'head' : 'chase' })}>
              {view === 'chase' ? t('◉ ツムギの目に切替', '◉ Switch to Tsumugi’s eyes') : t('◎ 後ろからの視点に切替', '◎ Switch to chase cam')}
            </button>
            <button className={`secondary${assist ? ' on' : ''}`} onClick={() => useEva.setState({ assist: !assist })}>
              {assist ? t('自動ブレーキ ON', 'Auto-brake ON') : t('自動ブレーキ OFF', 'Auto-brake OFF')}
            </button>
          </>
        )}
        {(fly || phase === 'deploy') && (
          <button className="primary" onClick={recallEva}>
            {t('回収して船にもどる', 'Recall and go back aboard')}
          </button>
        )}
      </div>
    </div>
  )
}

/** 画面をなぞって向きを変える（マウスでも指でも） */
function useLookDrag() {
  const last = useRef<{ id: number; x: number; y: number } | null>(null)
  return {
    onPointerDown: (e: RPointerEvent) => {
      if (useEva.getState().phase !== 'fly') return
      last.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
    },
    onPointerMove: (e: RPointerEvent) => {
      const l = last.current
      if (!l || l.id !== e.pointerId) return
      const k = e.pointerType === 'touch' ? 0.006 : 0.004
      evaInput.lookX += (e.clientX - l.x) * k
      evaInput.lookY += (e.clientY - l.y) * k
      l.x = e.clientX
      l.y = e.clientY
    },
    onPointerUp: () => (last.current = null),
    onPointerCancel: () => (last.current = null),
  }
}

export function EvaView() {
  const phase = useEva((e) => e.phase)
  const since = useEva((e) => e.since)
  const scene3d = evaScene(phase)
  const look = useLookDrag()
  const [, setTick] = useState(0)
  useEffect(() => {
    if (phase === 'none' || phase === 'fly') return
    let raf = 0
    const loop = () => {
      setTick((n) => n + 1)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [phase])
  if (phase === 'none') return null
  const T = evaNow() - since
  let curtain = 0
  if (phase === 'fadeIn') curtain = Math.min(1, T / EVA_FADE)
  else if (phase === 'launch') curtain = Math.max(0, 1 - T / EVA_FADE)
  else if (phase === 'recall') curtain = Math.max(0, (T - RECALL_SEC) / EVA_FADE)
  else if (phase === 'fadeOut') curtain = Math.max(0, 1 - T / EVA_FADE)
  void LAUNCH_SEC
  void DEPLOY_SEC
  return (
    <div className={scene3d ? 'surface-view solid eva-view' : 'surface-view eva-view'} {...look}>
      {scene3d && <EvaCanvas />}
      {scene3d && <EvaPanel />}
      <div className="surface-curtain" style={{ opacity: curtain, pointerEvents: curtain > 0.5 ? 'auto' : 'none' }} />
    </div>
  )
}
