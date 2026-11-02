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
import { Tsumugi } from './Tsumugi'
import { HULL_R } from './hull'

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
  const H = TETHER_M + 6
  const halfW = HULL_R * 0.98
  return (
    <div className={`eva-map${taut ? ' edge' : ''}`}>
      <svg viewBox={`${-H} ${-H} ${H * 2} ${H * 2}`} aria-label={t('ミニマップ', 'Minimap')}>
        <rect x={-halfW} y={-H} width={halfW * 2} height={H * 2} className="m-hull" />
        {[-20, -10, 0, 10, 20].map((x) => (
          <line key={x} x1={x} y1={-H} x2={x} y2={H} className="m-seam" />
        ))}
        <circle cx={0} cy={0} r={TETHER_M} className="m-range" />
        <rect x={-1.6} y={-1.6} width={3.2} height={3.2} className="m-lock" />
        <line x1={0} y1={0} x2={hud.x} y2={hud.z} className="m-tether" />
        <g transform={`translate(${hud.x} ${hud.z}) rotate(${hud.hdg})`}>
          <path d="M 0 -4.2 L 2.8 3 L 0 1.6 L -2.8 3 Z" className="m-bot" />
        </g>
      </svg>
      <span className="m-fwd">{t('船首', 'BOW')} ▲</span>
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
              {view === 'chase' ? t('◉ ツムギの目', '◉ Tsumugi’s eyes') : t('◎ 後ろから', '◎ Chase view')}
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
