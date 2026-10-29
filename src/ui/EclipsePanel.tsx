import { useEffect, useState } from 'react'
import { ECLIPSES, eclipseById, type Eclipse } from '../data/eclipses'
import { EPOCH_MS } from '../data/ephemeris'
import { closeEclipses, eclipseClock, eclipseNow, eclipseStage, playEclipse, seekEclipse, toggleEclipsePlay, useEclipse } from '../state/eclipse'
import { useStore } from '../state/store'
import { raceActive, useRace } from '../state/race'
import { getLang, t, useLang } from '../i18n/lang'

const HOUR_MS = 3_600_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')

/** 日本語は日本時間、英語は世界時（UTC）で読む */
const zoned = (ms: number) => new Date(ms + (getLang() === 'en' ? 0 : 9 * HOUR_MS))

function dayText(ms: number) {
  const d = zoned(ms)
  return t(`${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`, `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`)
}

function clockText(ms: number) {
  const d = zoned(ms)
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  return t(`${dayText(ms)} ${time}（日本時間）`, `${dayText(ms)} ${time} UTC`)
}

function typeName(e: Eclipse) {
  if (e.kind === 'solar') {
    if (e.type === 'total') return t('皆既日食', 'Total solar eclipse')
    if (e.type === 'annular') return t('金環日食', 'Annular solar eclipse')
    return t('部分日食', 'Partial solar eclipse')
  }
  if (e.type === 'total') return t('皆既月食', 'Total lunar eclipse')
  if (e.type === 'partial') return t('部分月食', 'Partial lunar eclipse')
  return t('半影月食', 'Penumbral lunar eclipse')
}

/** 今の様子の説明 */
function stageText(e: Eclipse, before: boolean) {
  const stage = eclipseStage()
  if (e.kind === 'solar') {
    if (stage === 'none')
      return before
        ? t('月が太陽と地球のあいだに入っていきます。月の影は、まだ地球にかかっていません。', 'The Moon is moving between the Sun and Earth. Its shadow has not reached Earth yet.')
        : t('月の影は、地球からはなれていきました。', 'The Moon’s shadow has moved off Earth.')
    if (stage === 'partial')
      return t(
        '月のうすい影（半影）が地球にかかっています。この影の中にいる人には、太陽が欠けて見えます。',
        'The Moon’s faint outer shadow (the penumbra) is on Earth. People inside it see part of the Sun covered.',
      )
    return eclipseNow.umbra < 0
      ? t(
          '月が地球から遠いので、濃い影は地球までとどきません。影の真ん中にいる人には、太陽が輪のように光って見えます（金環日食）。',
          'The Moon is far from Earth, so its dark shadow falls short. People in the middle see a ring of sunlight around the Moon (an annular eclipse).',
        )
      : t(
          '月の濃い影（本影）が地球に落ちています。小さな黒い点の中では、昼なのに空が暗くなり、星が見えます（皆既日食）。影は東へ動いていきます。',
          'The Moon’s dark inner shadow (the umbra) is on Earth. Inside that small dark spot the daytime sky goes dark and stars come out: a total eclipse. The shadow races east.',
        )
  }
  if (stage === 'none')
    return before
      ? t('満月が、地球の影のほうへ近づいていきます。', 'The full Moon is moving toward Earth’s shadow.')
      : t('月は地球の影からぬけて、いつもの満月にもどりました。', 'The Moon has left Earth’s shadow and is a normal full Moon again.')
  if (stage === 'penumbral')
    return t('月が地球のうすい影（半影）に入りました。少しだけ暗くなりますが、目ではほとんどわかりません。', 'The Moon is in Earth’s faint outer shadow (the penumbra). It dims a little, but it is hard to notice by eye.')
  if (stage === 'partial')
    return t('月が地球の濃い影（本影）に入っていきます。地上から見ると、月が欠けていくように見えます。', 'The Moon is entering Earth’s dark inner shadow (the umbra). From the ground it looks like a bite is being taken out of it.')
  return t(
    '皆既月食：月がまるごと地球の影の中にいます。地球の大気を通って曲がった赤い光だけがとどくので、月は赤銅色に見えます。',
    'Total lunar eclipse: the whole Moon is inside Earth’s shadow. Only red light bent through Earth’s air reaches it, so it glows a coppery red.',
  )
}

/** 再生中の時刻と様子（0.2秒おきに読む） */
function useReadout(id: string | null) {
  const [now, setNow] = useState(0)
  useEffect(() => {
    if (!id) return
    const read = () => setNow(eclipseClock.ms)
    read()
    const timer = setInterval(read, 200)
    return () => clearInterval(timer)
  }, [id])
  return now
}

/** 宇宙から見る日食・月食：一覧から選ぶと、その日時の地球と月を、影が落ちるところまで再生する */
export function EclipsePanel() {
  const { open, eclipseId, playing } = useEclipse()
  const mode = useStore((s) => s.mode)
  const racePhase = useRace((r) => r.phase)
  const ms = useReadout(open ? eclipseId : null)
  const eclipse = eclipseById(eclipseId)
  useLang()

  // 全体マップを離れたり、レースが始まったりしたら閉じる（惑星を元の時間に戻す）
  useEffect(() => {
    if (open && (mode !== 'map' || raceActive())) closeEclipses()
  }, [open, mode, racePhase])

  if (!open) return null

  return (
    <section className="probe-panel eclipse-panel" aria-label={t('日食・月食', 'Eclipses')}>
      <header>
        <h2>
          {t('宇宙から見る日食・月食', 'Eclipses from space')}
          {eclipse && <span className="eclipse-kind">{t('：', ': ')}{typeName(eclipse)}</span>}
        </h2>
        <button className="close" onClick={closeEclipses} aria-label={t('閉じる', 'Close')}>
          ×
        </button>
      </header>

      {!eclipse ? (
        <>
          <p className="muted">
            {t(
              '本物の日時の、太陽・地球・月の並びを再生します。月の影が地球に落ちるところ（日食）や、月が地球の影に入って赤くなるところ（月食）を、宇宙から見てみよう。',
              'Replay the real line-up of the Sun, Earth and Moon. Watch from space as the Moon’s shadow falls on Earth (a solar eclipse), or as the Moon slides into Earth’s shadow and turns red (a lunar eclipse).',
            )}
          </p>
          <div className="probe-list">
            {ECLIPSES.map((e) => {
              const past = Date.parse(e.at) < EPOCH_MS
              return (
                <button key={e.id} className="nav-item" onClick={() => playEclipse(e.id)}>
                  <span className={`probe-dot eclipse-dot ${e.kind}`} />
                  <span>
                    {dayText(Date.parse(e.at))} {typeName(e)}
                    {past && <span className="muted small"> {t('（過去）', ' (past)')}</span>}
                    <span className="muted small"> {t(e.where, e.whereEn)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <>
          <div className="probe-date">{clockText(ms)}</div>
          <p className="eclipse-where muted small">
            {t('見られる場所：', 'Seen from: ')}
            {t(eclipse.where, eclipse.whereEn)}
          </p>
          <p className="eclipse-stage">{stageText(eclipse, ms < eclipseClock.peak)}</p>
          <input
            className="eclipse-seek"
            type="range"
            min={eclipseClock.peak - eclipseClock.span}
            max={eclipseClock.peak + eclipseClock.span}
            step={60_000}
            value={ms}
            onChange={(e) => seekEclipse(Number(e.target.value))}
            aria-label={t('時刻', 'Time')}
          />
          <p className="muted small">{t(eclipse.note, eclipse.noteEn)}</p>
          <div className="probe-controls">
            <button className="secondary" onClick={toggleEclipsePlay}>
              {playing ? t('一時停止', 'Pause') : ms >= eclipseClock.peak + eclipseClock.span ? t('もう一度', 'Replay') : t('再生', 'Play')}
            </button>
            <button className="secondary" onClick={() => useEclipse.setState({ eclipseId: null, playing: false })}>
              {t('ほかの日食・月食', 'Other eclipses')}
            </button>
          </div>
        </>
      )}
      <p className={`muted small eclipse-about${eclipse ? ' watching' : ''}`}>
        {t(
          '日食は「太陽・月・地球」、月食は「太陽・地球・月」の順に一直線に並ぶと起きます。月の通り道は少し傾いているので、毎月は起きません。月の大きさと距離は見やすく変えてありますが、日時と影の当たる場所は計算した本物です。',
          'A solar eclipse happens when the Sun, Moon and Earth line up in that order, and a lunar eclipse when it is Sun, Earth, Moon. The Moon’s path is slightly tilted, so this does not happen every month. The Moon’s size and distance are changed for easy viewing, but the dates and where the shadows fall are calculated for real.',
        )}
      </p>
    </section>
  )
}
