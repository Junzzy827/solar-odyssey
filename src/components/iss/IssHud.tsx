import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { useLang } from '../../i18n/lang'
import { ui } from '../../i18n'
import { isTouchDevice } from '../../state/input'
import { ISS_SPOTS, closeIss, issInput, playSpot, useIss, type IssSpot } from '../../state/iss'
import { bindAnchorEl } from './anchors'
import { pokeRef } from './WaterBall'

// ISS の場面の画面：読みこみの幕、モジュールの名前、もどるボタン、遊んだ印のしるし、操作の説明、
// 3D の中の光る印（押すと遊べる）、カード（3 行まで）、スマホのスティックと上下・宙返りのボタン

const MODULE_KEY: Record<string, keyof ReturnType<typeof ui>['iss']['modules']> = { us_lab: 'destiny', node1: 'unity', node2: 'harmony' }

/** 左下のスティック（押す向き） */
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
    issInput.stickX = Math.abs(x) < 0.12 ? 0 : x
    issInput.stickY = Math.abs(y) < 0.12 ? 0 : y
    setKnob([x, y])
  }
  const end = () => {
    issInput.stickX = 0
    issInput.stickY = 0
    setKnob([0, 0])
  }
  return (
    <div
      className="iss-stick"
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
      <div className="iss-knob" style={{ transform: `translate(${knob[0] * 30}px, ${knob[1] * 30}px)` }} />
    </div>
  )
}

/** 押しているあいだだけ */
function Hold({ k, label, className }: { k: 'up' | 'down'; label: string; className: string }) {
  const off = () => (issInput[k] = false)
  return (
    <button
      className={className}
      onPointerDown={(e) => {
        e.preventDefault()
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        issInput[k] = true
      }}
      onPointerUp={off}
      onPointerCancel={off}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  )
}

function SpotDot({ id }: { id: IssSpot }) {
  const t = ui().iss
  const done = useIss((s) => s.done.includes(id))
  const on = useIss((s) => s.spot === id)
  return (
    <button
      className={`iss-dot${done ? ' done' : ''}${on ? ' on' : ''}`}
      data-spot={id}
      ref={(el) => bindAnchorEl(id, el)}
      onClick={() => {
        if (id === 'water') pokeRef.current?.()
        else playSpot(on ? null : id)
      }}
    >
      <i />
      <span>{t.spots[id].name}</span>
    </button>
  )
}

export function IssHud() {
  useLang()
  const t = ui().iss
  const phase = useIss((s) => s.phase)
  const module = useIss((s) => s.module)
  const spot = useIss((s) => s.spot)
  const done = useIss((s) => s.done)
  const moved = useIss((s) => s.moved)
  const touch = isTouchDevice()
  // 入ったときは名前を大きく、4 秒たったら小さく
  const [big, setBig] = useState(true)
  useEffect(() => {
    if (phase !== 'inside') return
    setBig(true)
    const timer = setTimeout(() => setBig(false), 4000)
    return () => clearTimeout(timer)
  }, [phase, module])
  const name = t.modules[MODULE_KEY[module] ?? 'destiny']
  return (
    <div className={`iss-hud${touch ? ' touch' : ''}`}>
      {phase === 'loading' && (
        <div className="iss-loading">
          <div className="iss-loading-title">{t.title}</div>
          <div className="iss-loading-text">{t.loading}</div>
        </div>
      )}
      <div className="iss-anchors">
        {ISS_SPOTS.map((id) => (
          <SpotDot key={id} id={id} />
        ))}
        {['node1', 'node2'].map((to) => (
          <div key={to} className="iss-soon" ref={(el) => bindAnchorEl(`hatch:${to}`, el)}>
            {t.soon}
          </div>
        ))}
      </div>
      <div className={`iss-name${big ? ' big' : ''}`}>
        <b>{name.name}</b>
        <small>{name.sub}</small>
      </div>
      <div className="iss-stamps">
        {ISS_SPOTS.map((id) => (
          <span key={id} className={done.includes(id) ? 'ok' : ''}>
            <i>{done.includes(id) ? '✓' : ''}</i>
            {t.spots[id].name}
          </span>
        ))}
      </div>
      <button className="iss-exit" onClick={closeIss}>
        {t.exit}
      </button>
      {phase === 'inside' && !moved && !spot && <div className="iss-help">{touch ? t.helpTouch : t.help}</div>}
      {spot && (
        <div className="iss-card" data-spot={spot}>
          <div className="iss-card-name">{t.spots[spot].name}</div>
          {t.spots[spot].lines.slice(0, 3).map((l, i) => (
            <p key={i}>{l}</p>
          ))}
          <button onClick={() => playSpot(null)}>{spot === 'bike' ? t.bikeOff : t.close}</button>
        </div>
      )}
      {touch && <Stick />}
      <div className="iss-moves">
        {touch && <Hold k="up" label={t.up} className="iss-up" />}
        {touch && <Hold k="down" label={t.down} className="iss-down" />}
        <button className="iss-flip" onClick={() => useIss.setState({ flips: useIss.getState().flips + 1 })}>
          {t.flip}
        </button>
      </div>
    </div>
  )
}
