import { useEffect, useState } from 'react'
import { nextCameraMode, useStore } from '../state/store'
import { bodyInfo, engage, travelFacts } from '../state/flight'
import { RACE_TEXT, raceActive } from '../state/race'
import type { Near } from '../state/proximity'
import { isTelescope, scopeName, TELESCOPE_TEXT } from '../data/telescopes'
import { canOpenGallery, closeGallery, openGallery } from '../state/gallery'
import { isTouchDevice } from '../state/input'
import { getLang, t, useLang } from '../i18n/lang'

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
      else if (e.code === 'KeyC') s.setCameraMode(nextCameraMode(s.cameraMode))
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

/** 大きな数を「約22万」（英語は「220,000」「1.5 million」）のように読みやすくする */
function roughly(n: number) {
  if (getLang() === 'en') {
    if (n >= 1e9) return `${Number((n / 1e9).toPrecision(2))} billion`
    if (n >= 1e6) return `${Number((n / 1e6).toPrecision(2))} million`
    if (n >= 1e4) return (Math.round(n / 1e4) * 1e4).toLocaleString('en-US')
  } else {
    if (n >= 1e8) return `${(n / 1e8).toPrecision(2)}億`
    if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}万`
  }
  if (n >= 100) return (Math.round(n / 10) * 10).toLocaleString('en-US')
  return n < 10 ? n.toFixed(1) : Math.round(n) + ''
}

/** 天体のそばでの高さ・雲の中の様子と、大きさくらべ */
function NearReadout({ near }: { near: Near }) {
  const big = near.timesEarth >= 1.5
  const where = near.kind === 'gas' ? t('雲の上', 'above the clouds of') : near.kind === 'star' ? t('表面から', 'above the surface of') : t('地表から', 'above the surface of')
  return (
    <div className="near">
      {near.dive ? (
        <div className="near-dive">
          {t(
            `${near.name}の雲の下 約${roughly(near.dive.km)}km・${near.dive.bar.toFixed(1)}気圧・${Math.round(near.dive.celsius)}℃`,
            `About ${roughly(near.dive.km)} km under the clouds of ${near.name} · ${near.dive.bar.toFixed(1)} bar · ${Math.round(near.dive.celsius)} °C`,
          )}
        </div>
      ) : (
        near.altitudeKm !== null && (
          <div>{t(`${near.name}の${where} 約${roughly(near.altitudeKm)}km`, `About ${roughly(near.altitudeKm)} km ${where} ${near.name}`)}</div>
        )
      )}
      <div className="muted">
        {t(
          `直径は${big ? `地球の約${roughly(near.timesEarth)}倍、` : ''}この船の約${roughly(near.timesShip)}倍`,
          `Diameter: ${big ? `about ${roughly(near.timesEarth)} × Earth, ` : ''}about ${roughly(near.timesShip)} × this ship`,
        )}
      </div>
    </div>
  )
}

/** ワープ中の、本物の光と探査機ならどのくらいかかるか */
function WarpFact({ name, lightMinutes, probeYears }: { name: string; lightMinutes: number; probeYears: number }) {
  const minutes = Math.round(lightMinutes)
  const months = Math.max(1, Math.round(probeYears * 12))
  const years = Math.round(probeYears)
  return (
    <div className="warp-fact">
      {t(
        `本物の光でも太陽から${name}まで約${minutes}分。実際の探査機なら約${probeYears < 1 ? `${months}か月` : `${years}年`}かかります。`,
        `Even real light takes about ${minutes} minutes from the Sun to ${name}. A real probe would take about ${probeYears < 1 ? `${months} month${months > 1 ? 's' : ''}` : `${years} year${years > 1 ? 's' : ''}`}.`,
      )}
      <span className="muted">{t('（ワープは空想の技術です）', ' (Warp is imaginary technology.)')}</span>
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
  useLang()

  return (
    <>
      <div className="hud">
        <h1>SOLAR ODYSSEY</h1>
        {touch ? (
          <div className="hud-hint">
            {mode === 'map'
              ? t('指でなぞって回転・2本指で拡大縮小・名前をタップで目標', 'Drag to rotate · pinch to zoom · tap a name to target it')
              : mode === 'gallery'
                ? t('指でなぞって回転・2本指で拡大縮小', 'Drag to rotate · pinch to zoom')
                : t('左のスティックで移動・画面をなぞって向きを変える', 'Left stick to move · drag the screen to turn')}
          </div>
        ) : mode === 'map' ? (
          <div>{t('ドラッグで回転・ホイールで拡大縮小・名前をクリックで目標設定', 'Drag to rotate · scroll to zoom · click a name to target it')}</div>
        ) : mode === 'gallery' ? (
          <div>{t('鑑賞モード：ドラッグで回転・ホイールで拡大縮小・V でもどる', 'Viewing mode: drag to rotate · scroll to zoom · V to go back')}</div>
        ) : (
          <div>
            {t('クリックで操縦開始（Escで解除）', 'Click to start flying (Esc to release)')}
            <br />
            {t('W/S 前後・A/D 左右・Space/Shift 上下・Q/E 回転・マウスで向き', 'W/S forward/back · A/D left/right · Space/Shift up/down · Q/E roll · mouse to steer')}
            <br />
            {t('F またはクリックでビーム・I で航海日誌・C でカメラ切り替え', 'F or click to fire the beam · I for the ship’s log · C to switch camera')}
          </div>
        )}
        {mode !== 'gallery' && (
          <div className="muted">
            {t('速度', 'Speed')} {telemetry.speed.toFixed(1)}
          </div>
        )}
        {mode === 'flight' && telemetry.near && <NearReadout near={telemetry.near} />}
      </div>

      {mode === 'gallery' ? (
        <button className="mode-button" onClick={closeGallery}>
          {t('操縦席へ', 'Cockpit')} <kbd>V</kbd>
        </button>
      ) : (
        <>
          <button className="mode-button" onClick={() => setMode(mode === 'map' ? 'flight' : 'map')}>
            {mode === 'map' ? t('操縦席へ', 'Cockpit') : t('全体マップ', 'Map')} <kbd>M</kbd>
          </button>
          {mode === 'flight' && (
            <button className="gallery-button" onClick={openGallery} disabled={warpPhase !== 'idle' || !canOpenGallery()}>
              {t('船を眺める', 'View the ship')} <kbd>V</kbd>
            </button>
          )}
        </>
      )}

      {mode === 'flight' && scopeNear && !scope && warpPhase === 'idle' && (
        <button className="scope-prompt" onClick={() => openScope(scopeNear)}>
          {t(`${scopeName(scopeNear)}でのぞく`, `Look through ${scopeName(scopeNear)}`)} <kbd>T</kbd>
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
          <div className="warp-title">{t(`ワープ${warpFactor}`, `Warp ${warpFactor}`)}</div>
          <div className="warp-dest">{t(`${info.name}へ`, `To ${info.name}`)}</div>
          {facts && <WarpFact name={info.name} lightMinutes={facts.lightMinutes} probeYears={facts.probeYears} />}
        </div>
      )}
    </>
  )
}
