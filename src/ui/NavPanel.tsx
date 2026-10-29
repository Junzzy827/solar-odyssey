import { useEffect, useState } from 'react'
import { PLANETS } from '../data/bodies'
import { computeLayout } from '../data/layout'
import { bodyRadius, TIME_RATES } from '../data/scale'
import { useStore } from '../state/store'
import { bodyInfo, engage, travelFacts } from '../state/flight'
import { CUBE_ID, cubeName } from '../data/cube'
import { HUBBLE_ID, scopeName, WEBB_ID } from '../data/telescopes'
import { useRace } from '../state/race'
import { QUIZ_LENGTH, startQuiz, useQuiz } from '../state/quiz'
import { openProbes, useProbes } from '../state/probes'
import { sim } from '../state/registry'
import { formatDate, simDate, SIM_SECONDS_PER_HOUR } from '../data/ephemeris'
import { closeMissions, openMissions, useMission } from '../state/mission'
import { closeEclipses, openEclipses, useEclipse } from '../state/eclipse'
import { openStamps, useStamps } from '../state/stamps'
import { NATURAL } from '../data/stamps'
import { ui } from '../i18n'
import { named, setLang, t, useLang } from '../i18n/lang'

const fmtDistance = (d: number | null) => (d === null ? '—' : d < 10 ? d.toFixed(1) : Math.round(d).toString())

/** 小さい画面（スマホ）か */
function useSmallScreen() {
  // 縦長のスマホと、横向きにしたスマホ（高さが低い）
  const query = '(max-width: 720px), (max-height: 500px)'
  const [small, setSmall] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const onChange = () => setSmall(m.matches)
    m.addEventListener('change', onChange)
    return () => m.removeEventListener('change', onChange)
  }, [])
  return small
}

function TargetButton({ id, name, sub, onPick }: { id: string; name: string; sub?: boolean; onPick?: () => void }) {
  const targetId = useStore((s) => s.targetId)
  const setTarget = useStore((s) => s.setTarget)
  return (
    <button
      className={`nav-item${sub ? ' sub' : ''}${targetId === id ? ' active' : ''}`}
      onClick={() => {
        setTarget(id)
        onPick?.()
      }}
    >
      {name}
    </button>
  )
}

const EARTH = PLANETS.find((p) => p.id === 'earth')!

const count = (n: number) => (n < 10 ? n.toFixed(1) : Math.round(n).toString())

/** 表示の設定：距離の広さ、天体の大きさ、旋回の傾き */
function Settings({ racing }: { racing: boolean }) {
  const settings = useStore((s) => s.settings)
  const lang = useLang()
  const update = useStore((s) => s.updateSettings)
  const layout = computeLayout(settings.distance, settings.size)
  const earth = bodyRadius(EARTH.radiusKm)
  // 月までの距離を、地球の直径いくつ分かで見せる（本物は約30個分）
  const moonGap = layout.moon.get('moon')!.radius / (2 * earth)
  // 太陽の直径は地球のいくつ分か（本物は約109個分）
  const sunSize = layout.sun / earth
  return (
    <details className="nav-settings">
      <summary>{t('表示の設定', 'Display settings')}</summary>
      <div className="nav-check">
        {t('言語', 'Language')}
        <span className="nav-lang-pick">
          <button className={lang === 'ja' ? 'on' : ''} onClick={() => setLang('ja')} lang="ja">
            日本語
          </button>
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')} lang="en">
            English
          </button>
        </span>
      </div>
      <label className="nav-slider">
        <span>
          {t('距離', 'Distance')}{' '}
          <span className="muted">{settings.distance < 0.01 ? t('見やすい距離', 'easy to see') : settings.distance > 0.99 ? t('本物に近い', 'close to real') : ''}</span>
        </span>
        <input type="range" min={0} max={1} step={0.01} value={settings.distance} onChange={(e) => update({ distance: Number(e.target.value) })} disabled={racing} />
      </label>
      <div className="muted small">
        {t(
          `月まで：地球の直径の約${count(moonGap)}個分（本物は約30個分）。右にすると衛星は本物の比率に、惑星どうしも本物の約20〜50分の1まで離れます。`,
          `To the Moon: about ${count(moonGap)} Earth diameters (really about 30). Slide right and the moons move to their real spacing, and the planets spread out to about 1/20 to 1/50 of the real distances.`,
        )}
      </div>
      <label className="nav-slider">
        <span>
          {t('大きさ', 'Size')} <span className="muted">{settings.size < 0.01 ? t('見やすい大きさ', 'easy to see') : settings.size > 0.99 ? t('本物の比率', 'real proportions') : ''}</span>
        </span>
        <input type="range" min={0} max={1} step={0.05} value={settings.size} onChange={(e) => update({ size: Number(e.target.value) })} disabled={racing} />
      </label>
      <div className="muted small">
        {t(
          `太陽：地球の約${count(sunSize)}倍（本物は約109倍）。地球の大きさはそのままで、右にすると太陽や木星は大きく、月や小さな惑星は小さくなります。小さな衛星は見失わないよう、ある大きさより小さくはしません。`,
          `The Sun: about ${count(sunSize)} times Earth (really about 109). Earth stays the same size; slide right and the Sun and Jupiter grow while the Moon and small planets shrink. Tiny moons never get too small to find.`,
        )}
        {racing && t('レース中は見やすい距離と大きさで走ります。', ' During the race, the easy-to-see distance and size are used.')}
      </div>
      <label className="nav-slider">
        <span>
          {t('音の大きさ', 'Volume')} <span className="muted">{settings.muted ? t('消音中', 'muted') : `${Math.round(settings.volume * 100)}%`}</span>
        </span>
        <input type="range" min={0} max={1} step={0.05} value={settings.volume} onChange={(e) => update({ volume: Number(e.target.value), muted: false })} />
      </label>
      <label className="nav-check">
        <input type="checkbox" checked={settings.muted} onChange={(e) => update({ muted: e.target.checked })} />
        {t('音を消す', 'Mute')}
      </label>
      <label className="nav-check">
        <input type="checkbox" checked={settings.music} onChange={(e) => update({ music: e.target.checked })} />
        {t('BGM を流す', 'Play music')}
      </label>
      <label className="nav-check">
        <input type="checkbox" checked={settings.banking} onChange={(e) => update({ banking: e.target.checked })} />
        {t('旋回で船体を傾ける', 'Bank the ship when turning')}
      </label>
      <div className="muted small">
        {t(
          '宇宙には空気がないので、本当は傾けなくても曲がれます（飛行機が傾くのは、翼で空気を押して曲がるため）。',
          'There is no air in space, so a ship can really turn without tilting (airplanes tilt because their wings push on the air to turn).',
        )}
      </div>
    </details>
  )
}

/** 1秒に進む時間の名前（1秒で1秒＝本物と同じ速さ） */
const rateName = (hours: number) =>
  hours === 0 ? t('停止', 'Stop') : hours < 1 / 60 ? t('1秒', '1 s') : hours < 1 ? t('1分', '1 min') : hours === 1 ? t('1時間', '1 hr') : t('1日', '1 day')

/** 表示している日時（惑星はこの日の本当の位置にある）。時間を進めていたら、今に戻せる */
function SimDate() {
  useLang()
  const [time, setTime] = useState(sim.time)
  useEffect(() => {
    const id = setInterval(() => setTime(sim.time), 250)
    return () => clearInterval(id)
  }, [])
  // 今から2時間以内なら「今」のまま
  const today = Math.abs(time) < 2 * SIM_SECONDS_PER_HOUR
  return (
    <div className="nav-date muted small">
      {t('日時', 'Date')} {formatDate(simDate(time))} {simDate(time).toTimeString().slice(0, 5)}
      {!today && (
        <button className="nav-today" onClick={() => (sim.time = 0)}>
          {t('今へ', 'Now')}
        </button>
      )}
    </div>
  )
}

export function NavPanel() {
  const [open, setOpen] = useState<string | null>('saturn')
  // スマホでは、ふだんは目標とエンゲージだけの小さな形にたたんでおく
  const small = useSmallScreen()
  const [expanded, setExpanded] = useState(false)
  const collapsed = small && !expanded
  const pick = () => small && setExpanded(false)
  const s = useStore()
  const info = s.targetId ? bodyInfo(s.targetId) : null
  const facts = info && info.au > 0 ? travelFacts(info.au) : null
  const racePhase = useRace((r) => r.phase)
  const startRace = useRace((r) => r.start)
  const racing = racePhase === 'countdown' || racePhase === 'running'
  const busy = s.warpPhase !== 'idle' || racing
  const quizOpen = useQuiz((q) => q.open)
  const probesOpen = useProbes((p) => p.open)
  const eclipsesOpen = useEclipse((e) => e.open)
  const stampsOpen = useStamps((b) => b.open)
  const stampCount = useStamps((b) => NATURAL.filter((id) => id in b.stamps).length)
  const missionPhase = useMission((m) => m.phase)
  const onMission = missionPhase === 'active'
  const lang = useLang()
  if (s.mode === 'gallery') return null
  const other = (
    <button className="nav-lang" onClick={() => setLang(lang === 'en' ? 'ja' : 'en')} lang={lang === 'en' ? 'ja' : 'en'} title={t('Switch to English', '日本語にする')}>
      {lang === 'en' ? '日本語' : 'English'}
    </button>
  )

  return (
    <aside className={`nav-panel${collapsed ? ' collapsed' : ''}`}>
      {small ? (
        <h2 className="nav-head">
          <button className="nav-collapse" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
            {t('航法コンピュータ', 'Nav computer')} <span>{expanded ? t('▲ たたむ', '▲ Close') : t('▼ ひらく', '▼ Open')}</span>
          </button>
          {/* たたんだ小さな形には入りきらないので、ひらいたときだけ */}
          {expanded && other}
        </h2>
      ) : (
        <h2 className="nav-head">
          {t('航法コンピュータ', 'Navigation computer')}
          {other}
        </h2>
      )}
      <div className="nav-list">
        <TargetButton id="sun" name={t('太陽', 'Sun')} onPick={pick} />
        {PLANETS.map((p) => (
          <div key={p.id}>
            {p.dwarf && <div className="nav-heading">{t('準惑星', 'Dwarf planet')}</div>}
            <div className="nav-row">
              <TargetButton id={p.id} name={named(p)} onPick={pick} />
              {p.moons.length > 0 && (
                <button className="nav-toggle" onClick={() => setOpen(open === p.id ? null : p.id)} aria-label={t(`${p.name}の衛星`, `Moons of ${p.nameEn}`)}>
                  {open === p.id ? '−' : `+${p.moons.length}`}
                </button>
              )}
            </div>
            {open === p.id && p.moons.map((m) => <TargetButton key={m.id} id={m.id} name={named(m)} sub onPick={pick} />)}
          </div>
        ))}
        <div className="nav-heading">{t('宇宙望遠鏡', 'Space telescopes')}</div>
        <TargetButton id={HUBBLE_ID} name={scopeName(HUBBLE_ID)} onPick={pick} />
        <TargetButton id={WEBB_ID} name={scopeName(WEBB_ID)} onPick={pick} />
        <div className="nav-heading">{t('未確認', 'Unidentified')}</div>
        <TargetButton id={CUBE_ID} name={cubeName()} onPick={pick} />
      </div>

      <div className="nav-target">
        {info ? (
          <>
            <div className="nav-target-name">
              {t('目標：', 'Target: ')}
              {info.name}
              {info.parent && <span className="muted">{t(`（${info.parent}の衛星）`, ` (moon of ${info.parent})`)}</span>}
            </div>
            <div className="muted">
              {t('距離', 'Distance')} {fmtDistance(s.telemetry.distance)}
            </div>
            {facts && <div className="muted">{t(`太陽から光で約${Math.round(facts.lightMinutes)}分`, `About ${Math.round(facts.lightMinutes)} light-minutes from the Sun`)}</div>}
            {!s.logOpen && (
              <button className="nav-log" onClick={() => s.setLogOpen(true)}>
                {t('航海日誌をひらく', 'Open ship’s log')} <kbd>I</kbd>
              </button>
            )}
          </>
        ) : (
          <div className="muted">{t('目標を選んでください', 'Choose a target')}</div>
        )}
      </div>

      <label className="nav-warp">
        {t('ワープ', 'Warp')} {s.warpFactor}
        <input type="range" min={1} max={9} step={1} value={s.warpFactor} onChange={(e) => s.setWarpFactor(Number(e.target.value))} disabled={busy} />
      </label>
      <button className="engage" onClick={engage} disabled={!s.targetId || busy}>
        {t('エンゲージ', 'Engage')} <kbd>Enter</kbd>
      </button>
      <button className={`secondary nav-auto${s.autopilot ? ' on' : ''}`} onClick={() => s.setAutopilot(!s.autopilot)} disabled={!s.targetId || busy}>
        {t('自動航行', 'Autopilot')} <kbd>G</kbd>
      </button>
      <button className={`secondary mission-start${missionPhase !== 'closed' ? ' on' : ''}`} onClick={() => (pick(), closeEclipses(), openMissions())} disabled={racing}>
        {ui().missionsButton}
      </button>
      <button className="secondary race-start" onClick={startRace} disabled={busy || onMission}>
        {t('レース：火星 → 木星 → 土星スイングバイ → 火星', 'Race: Mars → Jupiter → Saturn swing-by → Mars')}
      </button>
      <button className={`secondary quiz-start${quizOpen ? ' on' : ''}`} onClick={() => (pick(), closeEclipses(), startQuiz())} disabled={racing}>
        {t(`連続クイズ（${QUIZ_LENGTH}問）`, `Quiz run (${QUIZ_LENGTH} questions)`)}
      </button>
      <button className={`secondary stamp-start${stampsOpen ? ' on' : ''}`} onClick={() => (pick(), openStamps())}>
        {t('訪問スタンプ帳', 'Stamp book')} <span className="muted">{stampCount}/{NATURAL.length}</span>
      </button>
      <button className={`secondary probe-start${probesOpen ? ' on' : ''}`} onClick={() => (pick(), closeEclipses(), openProbes())} disabled={busy}>
        {t('探査機の旅（ボイジャーなど）', 'Probe journeys (Voyager and more)')}
      </button>
      <button className={`secondary eclipse-start${eclipsesOpen ? ' on' : ''}`} onClick={() => (pick(), closeMissions(), openEclipses())} disabled={busy || onMission}>
        {t('宇宙から見る日食・月食', 'Eclipses from space')}
      </button>
      {/* 1秒にどれだけ時間が進むか */}
      <div className="nav-time">
        <span className="nav-time-label">{t('時間の速さ（1秒に進む時間）', 'Time speed (time passed per second)')}</span>
        {TIME_RATES.map((k) => (
          <button key={k} className={s.timeScale === k ? 'on' : ''} onClick={() => s.setTimeScale(k)} disabled={racing}>
            {rateName(k)}
          </button>
        ))}
      </div>
      <SimDate />
      <Settings racing={racing} />
    </aside>
  )
}
