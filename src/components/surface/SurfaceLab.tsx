import { useEffect } from 'react'
import { SURFACES, surfaceFor } from '../../data/surfaces'
import { skipDescent, startLanding, useLanding } from '../../state/landing'
import { useLevel, useQuality } from '../../state/quality'
import { useStore } from '../../state/store'
import { labBodyFromHash, useSurfaceLab } from '../../state/surfaceLab'

// 地表の調整ページ（#surface-lab）。天体を選んで降り、太陽・霞・露出を動かしながら FPS を見る。
// #surface-lab=mars なら、開いてすぐ火星に降りる（末尾に &skip で降下を飛ばす）

function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <label className="lab-row">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <b>{fmt ? fmt(value) : value}</b>
    </label>
  )
}

export function SurfaceLab() {
  const lab = useSurfaceLab()
  const phase = useLanding((l) => l.phase)
  const bodyId = useLanding((l) => l.bodyId)
  const fps = useQuality((q) => q.fps)
  const level = useLevel()
  const quality = useStore((s) => s.settings.quality)
  const def = bodyId ? surfaceFor(bodyId) : null

  // URL に天体があれば、読み込みが落ち着いてから降りる
  useEffect(() => {
    const id = labBodyFromHash()
    if (!id || !surfaceFor(id)) return
    const timer = window.setTimeout(() => {
      startLanding(id)
      if (location.hash.includes('skip')) window.setTimeout(skipDescent, 900)
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [])

  const go = (id: string) => {
    lab.set({ sunEl: null, sunAz: null })
    if (phase === 'idle') startLanding(id)
    else useLanding.setState({ bodyId: id })
  }

  return (
    <div className="surface-lab">
      <div className="lab-head">
        地表の調整 <span className="muted">{fps ? `${fps} fps` : '— fps'} · {level}{quality === 'auto' ? '（自動）' : ''}</span>
      </div>
      <label className="lab-row">
        <span>天体</span>
        <select value={bodyId ?? ''} onChange={(e) => go(e.target.value)}>
          <option value="" disabled>
            選ぶ…
          </option>
          {[...SURFACES.keys()].map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
      <Slider label="太陽の高さ" value={lab.sunEl ?? def?.sunEl ?? 24} min={-8} max={90} step={0.5} onChange={(v) => lab.set({ sunEl: v })} fmt={(v) => `${v}°`} />
      <Slider label="太陽の方位" value={lab.sunAz ?? def?.sunAz ?? 150} min={0} max={360} step={1} onChange={(v) => lab.set({ sunAz: v })} fmt={(v) => `${v}°`} />
      <Slider label="霞" value={lab.haze} min={0} max={4} step={0.05} onChange={(v) => lab.set({ haze: v })} fmt={(v) => `×${v.toFixed(2)}`} />
      <Slider label="露出" value={lab.ev} min={-3} max={3} step={0.1} onChange={(v) => lab.set({ ev: v })} fmt={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`} />
      <div className="lab-foot muted">露出 ×{lab.exposure.toPrecision(3)}</div>
      <button className="secondary" onClick={() => lab.set({ sunEl: null, sunAz: null, haze: 1, ev: 0 })}>
        元に戻す
      </button>
    </div>
  )
}
