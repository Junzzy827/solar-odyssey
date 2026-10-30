import { toggleTerra, useSF, useTerra } from '../data/sf'
import { t, useLang } from '../i18n/lang'

/**
 * SF モードで火星の航海日誌を開いたときに足す欄：今はテラフォーミングした火星を見せていること、
 * 本物の火星と見くらべるボタン、そして「現実の科学では」
 */
export function TerraMarsNote() {
  useLang()
  const sf = useSF()
  const on = useTerra((s) => s.on)
  if (!sf) return null
  const real = [
    t(
      '火星は磁場が弱く、太陽から吹きつける太陽風に、大気が少しずつはぎ取られてきました。NASAの探査機MAVEN（2014年から）が、その様子を調べています。',
      'Mars has a weak magnetic field, so the solar wind has slowly stripped away its air. NASA’s MAVEN spacecraft (since 2014) studies how this happens.',
    ),
    t(
      '昔の火星には水が流れていました。探査車パーサビアランスは、ジェゼロ・クレーターにある古い川の三角州を調べています。',
      'Water once flowed on Mars. The Perseverance rover is exploring an ancient river delta in Jezero Crater.',
    ),
    t(
      '2018年のNASAの研究では、火星に残っている二酸化炭素を全部使っても、地球のような厚い大気にはとても足りないとわかりました。今の技術ではテラフォーミングはできません。',
      'A 2018 NASA-funded study found that even all the carbon dioxide left on Mars could not make an air as thick as Earth’s. Terraforming is not possible with today’s technology.',
    ),
  ]
  return (
    <div className="log-real">
      <h3>
        {t('SFモード：テラフォーミングした火星', 'SF mode: a terraformed Mars')} <span className="log-fiction">{t('SF・フィクション', 'SF · fiction')}</span>
      </h3>
      <p className="small">
        {t(
          '北の低地と大きな盆地を海に、陸を緑にした「もしも」の火星を表示しています。',
          'You are seeing a “what if” Mars, with seas in the northern lowlands and big basins and green land.',
        )}
      </p>
      <button className="secondary" onClick={toggleTerra}>
        {on ? t('本物の火星を見る', 'Show the real Mars') : t('テラフォーミング後の火星を見る', 'Show the terraformed Mars')}
      </button>
      <h3>{t('現実の科学では', 'In real science')}</h3>
      <ul>
        {real.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  )
}
