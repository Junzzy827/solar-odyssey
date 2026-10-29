import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { bodyInfo, engage, travelFacts } from '../state/flight'
import { RACE_TEXT, raceActive } from '../state/race'
import type { Near } from '../state/proximity'
import { isTelescope, scopeName, TELESCOPE_TEXT } from '../data/telescopes'
import { canOpenGallery, closeGallery, openGallery } from '../state/gallery'
import { isTouchDevice } from '../state/input'

/** 全体のキー操作：M 全体マップ／V 鑑賞モード／Enter エンゲージ／G 自動航行／C カメラ／1〜9 ワープ速度 */
export function useGlobalKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return
      const s = useStore.getState()
      // 望遠鏡の写真を見ているあいだは、T と Esc（閉じる）だけ
      if (s.scope) {
        if (e.code === 'KeyT' || e.code === 'Escape') s.setScope(null)
        return
      }
      // 鑑賞モードでは、V と Esc（もどる）と M（全体マップ）だけ
      if (s.mode === 'gallery') {
        if (e.code === 'KeyV' || e.code === 'Escape') closeGallery()
        else if (e.code === 'KeyM') s.setMode('map')
        return
      }
      if (e.code === 'KeyV') {
        openGallery()
        return
      }
      if (e.code === 'KeyT') {
        if (s.scopeNear && !raceActive()) openScope(s.scopeNear)
        else if (s.targetId && isTelescope(s.targetId)) s.showToast(TELESCOPE_TEXT.tooFar(scopeName(s.targetId)))
        return
      }
      if (e.code === 'KeyM') s.setMode(s.mode === 'map' ? 'flight' : 'map')
      else if (e.code === 'Enter') engage()
      else if (e.code === 'KeyC') s.setCameraMode(s.cameraMode === 'chase' ? 'hero' : 'chase')
      else if (e.code === 'KeyG' && raceActive()) s.showToast(RACE_TEXT.noWarp)
      else if (e.code === 'KeyG' && s.targetId && s.warpPhase === 'idle') s.setAutopilot(!s.autopilot)
      else if (/^Digit[1-9]$/.test(e.code) && s.warpPhase === 'idle') s.setWarpFactor(Number(e.code.slice(5)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** 望遠鏡の目で深宇宙をのぞく（マウスの固定を外して写真の画面を開く） */
export function openScope(id: NonNullable<ReturnType<typeof useStore.getState>['scope']>) {
  if (document.pointerLockElement) document.exitPointerLock()
  useStore.getState().setScope(id)
}

function usePointerLocked() {
  const [locked, setLocked] = useState(false)
  useEffect(() => {
    const onChange = () => setLocked(document.pointerLockElement !== null)
    document.addEventListener('pointerlockchange', onChange)
    return () => document.removeEventListener('pointerlockchange', onChange)
  }, [])
  return locked
}

function Toast() {
  const toast = useStore((s) => s.toast)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!toast) return
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), 7000)
    return () => clearTimeout(timer)
  }, [toast])
  if (!toast || !visible) return null
  return (
    <div className="toast" key={toast.id}>
      {toast.text}
    </div>
  )
}

/** 大きな数を「約22万」のように読みやすくする */
function roughly(n: number) {
  if (n >= 1e8) return `${(n / 1e8).toPrecision(2)}億`
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}万`
  if (n >= 100) return Math.round(n / 10) * 10 + ''
  return n < 10 ? n.toFixed(1) : Math.round(n) + ''
}

/** 天体のそばでの高さ・雲の中の様子と、大きさくらべ */
function NearReadout({ near }: { near: Near }) {
  const earth = near.timesEarth >= 1.5 ? `地球の約${roughly(near.timesEarth)}倍、` : ''
  return (
    <div className="near">
      {near.dive ? (
        <div className="near-dive">
          {near.name}の雲の下 約{roughly(near.dive.km)}km・{near.dive.bar.toFixed(1)}気圧・{Math.round(near.dive.celsius)}℃
        </div>
      ) : (
        near.altitudeKm !== null && (
          <div>
            {near.name}の{near.kind === 'gas' ? '雲の上' : near.kind === 'star' ? '表面から' : '地表から'} 約{roughly(near.altitudeKm)}km
          </div>
        )
      )}
      <div className="muted">
        直径は{earth}この船の約{roughly(near.timesShip)}倍
      </div>
    </div>
  )
}

export function Hud() {
  const locked = usePointerLocked()
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
  const targetId = useStore((s) => s.targetId)
  const warpPhase = useStore((s) => s.warpPhase)
  const warpFactor = useStore((s) => s.warpFactor)
  const telemetry = useStore((s) => s.telemetry)
  const scopeNear = useStore((s) => s.scopeNear)
  const scope = useStore((s) => s.scope)
  const info = targetId ? bodyInfo(targetId) : null
  const facts = info && info.au > 0 ? travelFacts(info.au) : null
  const touch = isTouchDevice()

  return (
    <>
      <div className="hud">
        <h1>SOLAR ODYSSEY</h1>
        {touch ? (
          <div className="hud-hint">
            {mode === 'map'
              ? '指でなぞって回転・2本指で拡大縮小・名前をタップで目標'
              : mode === 'gallery'
                ? '指でなぞって回転・2本指で拡大縮小'
                : '左のスティックで移動・画面をなぞって向きを変える'}
          </div>
        ) : mode === 'map' ? (
          <div>ドラッグで回転・ホイールで拡大縮小・名前をクリックで目標設定</div>
        ) : mode === 'gallery' ? (
          <div>鑑賞モード：ドラッグで回転・ホイールで拡大縮小・V でもどる</div>
        ) : (
          <div>
            クリックで操縦開始（Escで解除）
            <br />
            W/S 前後・A/D 左右・Space/Shift 上下・Q/E 回転・マウスで向き
            <br />F またはクリックでビーム・I で航海日誌・C でカメラ切り替え
          </div>
        )}
        {mode !== 'gallery' && <div className="muted">速度 {telemetry.speed.toFixed(1)}</div>}
        {mode === 'flight' && telemetry.near && <NearReadout near={telemetry.near} />}
      </div>

      {mode === 'gallery' ? (
        <button className="mode-button" onClick={closeGallery}>
          操縦席へ <kbd>V</kbd>
        </button>
      ) : (
        <>
          <button className="mode-button" onClick={() => setMode(mode === 'map' ? 'flight' : 'map')}>
            {mode === 'map' ? '操縦席へ' : '全体マップ'} <kbd>M</kbd>
          </button>
          {mode === 'flight' && (
            <button className="gallery-button" onClick={openGallery} disabled={warpPhase !== 'idle' || !canOpenGallery()}>
              船を眺める <kbd>V</kbd>
            </button>
          )}
        </>
      )}

      {mode === 'flight' && scopeNear && !scope && warpPhase === 'idle' && (
        <button className="scope-prompt" onClick={() => openScope(scopeNear)}>
          {scopeName(scopeNear)}でのぞく <kbd>T</kbd>
        </button>
      )}

      {mode === 'flight' && locked && <div className="crosshair" />}
      <Toast />

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
