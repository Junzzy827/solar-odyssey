import { useEffect } from 'react'
import { useStore } from '../state/store'
import { bodyInfo, engage, travelFacts } from '../state/flight'

/** 全体のキー操作：M 全体マップ／Enter エンゲージ／G 自動航行／1〜9 ワープ速度 */
export function useGlobalKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return
      const s = useStore.getState()
      if (e.code === 'KeyM') s.setMode(s.mode === 'map' ? 'flight' : 'map')
      else if (e.code === 'Enter') engage()
      else if (e.code === 'KeyG' && s.targetId && s.warpPhase === 'idle') s.setAutopilot(!s.autopilot)
      else if (/^Digit[1-9]$/.test(e.code) && s.warpPhase === 'idle') s.setWarpFactor(Number(e.code.slice(5)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function Hud() {
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
  const targetId = useStore((s) => s.targetId)
  const warpPhase = useStore((s) => s.warpPhase)
  const warpFactor = useStore((s) => s.warpFactor)
  const telemetry = useStore((s) => s.telemetry)
  const info = targetId ? bodyInfo(targetId) : null
  const facts = info && info.au > 0 ? travelFacts(info.au) : null

  return (
    <>
      <div className="hud">
        <h1>SOLAR VOYAGER</h1>
        {mode === 'map' ? (
          <div>ドラッグで回転・ホイールで拡大縮小・名前をクリックで目標設定</div>
        ) : (
          <div>
            クリックで操縦開始（Escで解除）
            <br />
            W/S 前後・A/D 左右・Space/Shift 上下・Q/E 回転・マウスで向き
          </div>
        )}
        <div className="muted">速度 {telemetry.speed.toFixed(1)}</div>
      </div>

      <button className="mode-button" onClick={() => setMode(mode === 'map' ? 'flight' : 'map')}>
        {mode === 'map' ? '操縦席へ' : '全体マップ'} <kbd>M</kbd>
      </button>

      <div id="target-marker">
        <div className="reticle" />
        <div className="arrow">➤</div>
        {info && <div className="marker-label">{info.name}</div>}
      </div>

      {warpPhase !== 'idle' && info && (
        <div className={`warp-banner ${warpPhase}`}>
          <div className="warp-title">ワープ{warpFactor}</div>
          <div className="warp-dest">{info.name}へ</div>
          {facts && (
            <div className="warp-fact">
              本物の光でも太陽から{info.name}まで約{Math.round(facts.lightMinutes)}分。実際の探査機なら約{facts.probeYears < 1 ? `${Math.max(1, Math.round(facts.probeYears * 12))}か月` : `${Math.round(facts.probeYears)}年`}かかります。
              <span className="muted">（ワープは空想の技術です）</span>
            </div>
          )}
        </div>
      )}
    </>
  )
}
