import { useState } from 'react'
import { PLANETS } from '../data/bodies'
import { useStore } from '../state/store'
import { bodyInfo, engage, travelFacts } from '../state/flight'
import { CUBE_ID, CUBE_NAME } from '../data/cube'

const fmtDistance = (d: number | null) => (d === null ? '—' : d < 10 ? d.toFixed(1) : Math.round(d).toString())

function TargetButton({ id, name, sub }: { id: string; name: string; sub?: boolean }) {
  const targetId = useStore((s) => s.targetId)
  const setTarget = useStore((s) => s.setTarget)
  return (
    <button className={`nav-item${sub ? ' sub' : ''}${targetId === id ? ' active' : ''}`} onClick={() => setTarget(id)}>
      {name}
    </button>
  )
}

export function NavPanel() {
  const [open, setOpen] = useState<string | null>('saturn')
  const s = useStore()
  const info = s.targetId ? bodyInfo(s.targetId) : null
  const facts = info && info.au > 0 ? travelFacts(info.au) : null
  const busy = s.warpPhase !== 'idle'

  return (
    <aside className="nav-panel">
      <h2>航法コンピュータ</h2>
      <div className="nav-list">
        <TargetButton id="sun" name="太陽" />
        {PLANETS.map((p) => (
          <div key={p.id}>
            <div className="nav-row">
              <TargetButton id={p.id} name={p.name} />
              {p.moons.length > 0 && (
                <button className="nav-toggle" onClick={() => setOpen(open === p.id ? null : p.id)} aria-label={`${p.name}の衛星`}>
                  {open === p.id ? '−' : `+${p.moons.length}`}
                </button>
              )}
            </div>
            {open === p.id && p.moons.map((m) => <TargetButton key={m.id} id={m.id} name={m.name} sub />)}
          </div>
        ))}
        <div className="nav-heading">未確認</div>
        <TargetButton id={CUBE_ID} name={CUBE_NAME} />
      </div>

      <div className="nav-target">
        {info ? (
          <>
            <div className="nav-target-name">
              目標：{info.name}
              {info.parent && <span className="muted">（{info.parent}の衛星）</span>}
            </div>
            <div className="muted">距離 {fmtDistance(s.telemetry.distance)}</div>
            {facts && <div className="muted">太陽から光で約{Math.round(facts.lightMinutes)}分</div>}
          </>
        ) : (
          <div className="muted">目標を選んでください</div>
        )}
      </div>

      <label className="nav-warp">
        ワープ {s.warpFactor}
        <input type="range" min={1} max={9} step={1} value={s.warpFactor} onChange={(e) => s.setWarpFactor(Number(e.target.value))} disabled={busy} />
      </label>
      <button className="engage" onClick={engage} disabled={!s.targetId || busy}>
        エンゲージ <kbd>Enter</kbd>
      </button>
      <button className={`secondary${s.autopilot ? ' on' : ''}`} onClick={() => s.setAutopilot(!s.autopilot)} disabled={!s.targetId || busy}>
        自動航行 <kbd>G</kbd>
      </button>
      <div className="nav-time">
        時間
        {[0, 1, 10].map((k) => (
          <button key={k} className={s.timeScale === k ? 'on' : ''} onClick={() => s.setTimeScale(k)}>
            {k === 0 ? '停止' : `${k}倍`}
          </button>
        ))}
      </div>
    </aside>
  )
}
