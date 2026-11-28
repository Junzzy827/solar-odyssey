import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { ui } from '../../i18n'
import { useLang } from '../../i18n/lang'
import { isTouchDevice } from '../../state/input'
import { berthHubble, closeShuttle, enterSpot, grabHubble, leaveSpot, openBayDoors, shuttleInput, toggleShuttleLight, useShuttle } from '../../state/shuttle'

// 乗員室の上に重ねる操作：階の名前、明かり、もどる、操作の案内（しばらくで消える）、見どころのボタンとカード、
// スマホの左のスティックと上下のボタン。スマホの縦でも重ならないように、上の端と下の端に分けて置く。

export function ShuttleHud() {
  useLang()
  const t = ui().shuttle
  const phase = useShuttle((s) => s.phase)
  const deck = useShuttle((s) => s.deck)
  const light = useShuttle((s) => s.light)
  const near = useShuttle((s) => s.near)
  const spot = useShuttle((s) => s.spot)
  const touch = isTouchDevice()
  const [help, setHelp] = useState(true)
  useEffect(() => {
    if (phase !== 'cabin') return
    const timer = setTimeout(() => setHelp(false), 12000)
    return () => clearTimeout(timer)
  }, [phase])
  const scene = useShuttle((s) => s.scene)
  // 軌道の章：今の段階のカードと、押すボタン（立てたカードは 12 秒で消える）
  const orbit = useShuttle((s) => s.orbit)
  const armReady = useShuttle((s) => s.armReady)
  const [doneCard, setDoneCard] = useState(true)
  useEffect(() => {
    if (orbit !== 'done') return setDoneCard(true)
    const timer = setTimeout(() => setDoneCard(false), 12000)
    return () => clearTimeout(timer)
  }, [orbit])
  if (phase === 'loading') return <div className="shuttle-loading">{scene === 'pad' ? t.loadingPad : t.loading}</div>
  const spotHelp = spot === 'seat' ? t.seatHelp[touch ? 'touch' : 'pc'] : spot === 'arm' ? t.armHelp[touch ? 'touch' : 'pc'] : spot === 'bag' ? t.bagHelp : null
  const armWork = spot === 'arm' && (orbit === 'grab' || orbit === 'berth')
  // 案内（最初の 12 秒）が出ている間はカードを待つ。席・寝ぶくろでは、その場所のカードを先に
  const mission = phase === 'cabin' && (orbit !== 'done' || doneCard) && (!spot || spot === 'arm') && !(help && !spot)
  const action =
    orbit === 'doors' ? (
      <button
        className="shuttle-btn shuttle-spot shuttle-go"
        onClick={() => {
          openBayDoors()
          if (spot !== 'arm') enterSpot('arm')
        }}
      >
        {t.orbit.doorsBtn}
      </button>
    ) : (orbit === 'grab' || orbit === 'berth') && spot !== 'arm' ? (
      <button className="shuttle-btn shuttle-spot shuttle-go" onClick={() => enterSpot('arm')}>
        {t.orbit.goArm}
      </button>
    ) : orbit === 'grab' ? (
      <button className="shuttle-btn shuttle-spot shuttle-go" disabled={!armReady} onClick={grabHubble}>
        {t.orbit.grabBtn}
      </button>
    ) : orbit === 'berth' ? (
      <button className="shuttle-btn shuttle-spot shuttle-go" disabled={!armReady} onClick={berthHubble}>
        {t.orbit.berthBtn}
      </button>
    ) : null
  return (
    <div className="surface-ui shuttle-ui">
      <div className="shuttle-top">
        <div className="shuttle-deck">
          <b>{t.deck[deck]}</b>
          <span>{t.mission}</span>
        </div>
        <div className="shuttle-top-buttons">
          <button className="shuttle-btn" title={t.lightTip[light]} onClick={toggleShuttleLight}>
            {t.light[light]}
          </button>
          <button className="shuttle-btn shuttle-exit" title={t.exitTip} onClick={closeShuttle}>
            {t.exit}
          </button>
        </div>
      </div>
      {help && !spot && (
        <div className="shuttle-help" onClick={() => setHelp(false)}>
          {t.help[touch ? 'touch' : 'pc'].map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}
      {mission ? (
        <div className="shuttle-card shuttle-mission" data-step={orbit}>
          {t.orbit[orbit].map((line) => (
            <div key={line}>{line}</div>
          ))}
          {armWork && spotHelp && <small>{spotHelp}</small>}
        </div>
      ) : (
        spot && (
          <div className="shuttle-card">
            {t.card[spot].map((line) => (
              <div key={line}>{line}</div>
            ))}
            {spotHelp && <small>{spotHelp}</small>}
          </div>
        )
      )}
      {armWork && (
        <div className="shuttle-pip">
          <div className="shuttle-pip-view" />
          <i />
          <span>{t.orbit.pip}</span>
        </div>
      )}
      <div className="shuttle-bottom">
        {action}
        {spot ? (
          <button className="shuttle-btn shuttle-spot" onClick={leaveSpot}>
            {t.leave}
          </button>
        ) : (
          near &&
          !(near === 'arm' && orbit !== 'doors' && action) && (
            <button className="shuttle-btn shuttle-spot" onClick={() => enterSpot(near)}>
              {t.spot[near]}
            </button>
          )
        )}
      </div>
      {touch && spot !== 'bag' && <Stick />}
      {touch && (!spot || armWork) && (
        <div className="shuttle-lift">
          <button className="shuttle-btn" {...hold(1)}>
            ▲ {armWork ? t.orbit.far : t.up}
          </button>
          <button className="shuttle-btn" {...hold(-1)}>
            ▼ {armWork ? t.orbit.near : t.down}
          </button>
        </div>
      )}
    </div>
  )
}

/** 押している間だけ上下に押す */
function hold(dir: number) {
  const on = (e: RPointerEvent) => {
    e.stopPropagation()
    shuttleInput.lift = dir
  }
  const off = () => (shuttleInput.lift = 0)
  return { onPointerDown: on, onPointerUp: off, onPointerCancel: off, onPointerLeave: off }
}

/** スマホの左のスティック */
function Stick() {
  const base = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const id = useRef<number | null>(null)
  const R = 46
  const set = (e: RPointerEvent) => {
    const b = base.current?.getBoundingClientRect()
    if (!b) return
    let x = e.clientX - (b.left + b.width / 2)
    let y = e.clientY - (b.top + b.height / 2)
    const d = Math.hypot(x, y)
    if (d > R) {
      x *= R / d
      y *= R / d
    }
    setKnob({ x, y })
    shuttleInput.stick.x = x / R
    shuttleInput.stick.z = -y / R
  }
  const end = () => {
    id.current = null
    setKnob({ x: 0, y: 0 })
    shuttleInput.stick.x = 0
    shuttleInput.stick.z = 0
  }
  useEffect(() => end, [])
  return (
    <div
      ref={base}
      className="shuttle-stick"
      onPointerDown={(e) => {
        e.stopPropagation()
        id.current = e.pointerId
        ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
        set(e)
      }}
      onPointerMove={(e) => {
        if (id.current === e.pointerId) {
          e.stopPropagation()
          set(e)
        }
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <i style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  )
}
