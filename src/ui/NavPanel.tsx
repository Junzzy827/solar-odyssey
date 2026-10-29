import { useState } from 'react'
import { PLANETS } from '../data/bodies'
import { computeLayout } from '../data/layout'
import { bodyRadius } from '../data/scale'
import { useStore } from '../state/store'
import { bodyInfo, engage, travelFacts } from '../state/flight'
import { CUBE_ID, CUBE_NAME } from '../data/cube'
import { HUBBLE_ID, HUBBLE_NAME, WEBB_ID, WEBB_NAME } from '../data/telescopes'
import { useRace } from '../state/race'

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

const EARTH = PLANETS.find((p) => p.id === 'earth')!

const count = (n: number) => (n < 10 ? n.toFixed(1) : Math.round(n).toString())

/** 表示の設定：距離の広さ、天体の大きさ、旋回の傾き */
function Settings({ racing }: { racing: boolean }) {
  const settings = useStore((s) => s.settings)
  const update = useStore((s) => s.updateSettings)
  const layout = computeLayout(settings.distance, settings.size)
  const earth = bodyRadius(EARTH.radiusKm)
  // 月までの距離を、地球の直径いくつ分かで見せる（本物は約30個分）
  const moonGap = layout.moon.get('moon')!.radius / (2 * earth)
  // 太陽の直径は地球のいくつ分か（本物は約109個分）
  const sunSize = layout.sun / earth
  return (
    <details className="nav-settings">
      <summary>表示の設定</summary>
      <label className="nav-slider">
        <span>
          距離 <span className="muted">{settings.distance < 0.01 ? '見やすい距離' : settings.distance > 0.99 ? '本物に近い' : ''}</span>
        </span>
        <input type="range" min={0} max={1} step={0.01} value={settings.distance} onChange={(e) => update({ distance: Number(e.target.value) })} disabled={racing} />
      </label>
      <div className="muted small">
        月まで：地球の直径の約{count(moonGap)}個分（本物は約30個分）。右にすると衛星は本物の比率に、惑星どうしも本物の約20〜50分の1まで離れます。
      </div>
      <label className="nav-slider">
        <span>
          大きさ <span className="muted">{settings.size < 0.01 ? '見やすい大きさ' : settings.size > 0.99 ? '本物の比率' : ''}</span>
        </span>
        <input type="range" min={0} max={1} step={0.05} value={settings.size} onChange={(e) => update({ size: Number(e.target.value) })} disabled={racing} />
      </label>
      <div className="muted small">
        太陽：地球の約{count(sunSize)}倍（本物は約109倍）。地球の大きさはそのままで、右にすると太陽や木星は大きく、月や小さな惑星は小さくなります。小さな衛星は見失わないよう、ある大きさより小さくはしません。
        {racing && 'レース中は見やすい距離と大きさで走ります。'}
      </div>
      <label className="nav-check">
        <input type="checkbox" checked={settings.banking} onChange={(e) => update({ banking: e.target.checked })} />
        旋回で船体を傾ける
      </label>
      <div className="muted small">宇宙には空気がないので、本当は傾けなくても曲がれます（飛行機が傾くのは、翼で空気を押して曲がるため）。</div>
    </details>
  )
}

export function NavPanel() {
  const [open, setOpen] = useState<string | null>('saturn')
  const s = useStore()
  const info = s.targetId ? bodyInfo(s.targetId) : null
  const facts = info && info.au > 0 ? travelFacts(info.au) : null
  const racePhase = useRace((r) => r.phase)
  const startRace = useRace((r) => r.start)
  const racing = racePhase === 'countdown' || racePhase === 'running'
  const busy = s.warpPhase !== 'idle' || racing
  if (s.mode === 'gallery') return null

  return (
    <aside className="nav-panel">
      <h2>航法コンピュータ</h2>
      <div className="nav-list">
        <TargetButton id="sun" name="太陽" />
        {PLANETS.map((p) => (
          <div key={p.id}>
            {p.dwarf && <div className="nav-heading">準惑星</div>}
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
        <div className="nav-heading">宇宙望遠鏡</div>
        <TargetButton id={HUBBLE_ID} name={HUBBLE_NAME} />
        <TargetButton id={WEBB_ID} name={WEBB_NAME} />
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
      <button className="secondary race-start" onClick={startRace} disabled={busy}>
        レース：火星 → 木星 → 土星スイングバイ → 火星
      </button>
      <div className="nav-time">
        時間
        {[0, 1, 10].map((k) => (
          <button key={k} className={s.timeScale === k ? 'on' : ''} onClick={() => s.setTimeScale(k)} disabled={racing}>
            {k === 0 ? '停止' : `${k}倍`}
          </button>
        ))}
      </div>
      <Settings racing={racing} />
    </aside>
  )
}
