import { ui } from '../../i18n'
import { CORRIDOR, EI_ANGLE, entryAuto, type Entry } from '../../data/reentry'
import { inCorridor } from '../../state/moonReturn'

// 章9 の大気圏突入：子ども向けの「揚力と重力」の絵（ReturnHud の中）。
// 角度を決めるあいだは、横から見た「大気に入る道」：浅いと はねて宇宙へ、深いと 地面へ急に。
// 火の玉のあいだは、うしろから見た司令船：重力はいつも下、揚力は船の傾きと一緒に回る。点線は今の目安の向き。
// 絵は船の値（ret.angle、e.lift）を読むだけで、船の回し方は変えない

const DEG = 180 / Math.PI
/** 角度を見やすくするための倍率（本物の −6.5° は、絵では約 −33°） */
const EXAG = 5

function arrowHead(x: number, y: number, ang: number, s = 6) {
  // ang：矢の向き（ラジアン、SVG の座標）
  const a1 = ang + Math.PI * 0.82
  const a2 = ang - Math.PI * 0.82
  return `M${x},${y} L${x + Math.cos(a1) * s},${y + Math.sin(a1) * s} L${x + Math.cos(a2) * s},${y + Math.sin(a2) * s} Z`
}

/** 地球の表面と大気の上のふち（絵の y） */
const GROUND = 104
const AIR_TOP = 56

/** 横から見た道。angle：突入の角度（度、負）。浅いと大気の上ではねて上がり、深いと地面へ急に落ちる */
function pathOf(angle: number) {
  const th = (-angle * EXAG) / DEG
  const x0 = 12
  const y0 = 14
  const dx = Math.cos(th)
  const dy = Math.sin(th)
  const xE = x0 + (AIR_TOP - y0) / Math.tan(th)
  const depth = (a: number) => (-a - 4) / 5
  const k = Math.min(1, Math.max(0, depth(angle)))
  const kS = depth(CORRIDOR.shallow)
  const kD = depth(CORRIDOR.steep)
  let cx: number, cy: number, endX: number, endY: number
  if (k < kS) {
    // はねる：大気に少しだけ入って、上へもどる
    cx = xE + dx * 24
    cy = AIR_TOP + dy * 24
    endX = 154
    endY = AIR_TOP - 8 - (kS - k) * 160
  } else if (k <= kD) {
    // ちょうどいい：大気の中で、だんだん水平に
    cx = xE + dx * 26
    cy = AIR_TOP + dy * 26
    endX = 154
    endY = 66 + ((k - kS) / (kD - kS)) * 18
  } else {
    // 深すぎる：まっすぐ地面へ
    cx = xE + dx * 16
    cy = AIR_TOP + dy * 16
    endX = Math.min(154, xE + 36 - (k - kD) * 40)
    endY = GROUND + 2
  }
  const ang = Math.atan2(endY - cy, endX - cx)
  return { d: `M${x0},${y0} L${xE},${AIR_TOP} Q${cx},${cy} ${endX},${endY}`, endX, endY, ang }
}

export function AnglePicture({ angle }: { angle: number }) {
  const T = ui().moonReturn
  const ok = inCorridor(angle)
  const p = pathOf(angle)
  const ideal = pathOf(EI_ANGLE)
  const col = ok ? '#9ff0b8' : '#ff8a70'
  const line = angle > CORRIDOR.shallow ? T.picShallow : angle < CORRIDOR.steep ? T.picSteep : T.picGood
  return (
    <div className="rt-pic">
      <div className="rt-pic-title">{T.picPath}</div>
      <svg viewBox="0 0 160 112" role="img" aria-label={T.picPath}>
        {/* 地球と大気（上の方ほどうすい） */}
        <circle cx="80" cy={GROUND + 460} r={460 + GROUND - AIR_TOP} fill="rgba(110,170,255,0.13)" />
        <circle cx="80" cy={GROUND + 460} r={460 + (GROUND - AIR_TOP) * 0.45} fill="rgba(110,170,255,0.22)" />
        <circle cx="80" cy={GROUND + 460} r="460" fill="#1d4f8a" />
        <text x="6" y={AIR_TOP + 12} className="rt-pic-air">
          {T.picAir}
        </text>
        {/* ちょうどいい道（点線） */}
        <path d={ideal.d} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.4" strokeDasharray="4 3" />
        {/* いまの道 */}
        <path d={p.d} fill="none" stroke={col} strokeWidth="2.6" strokeLinecap="round" />
        <path d={arrowHead(p.endX, p.endY, p.ang, 7)} fill={col} />
        {/* 司令船と重力 */}
        <circle cx="12" cy="14" r="4" fill="#dfe6ee" />
        <line x1="12" y1="19" x2="12" y2="36" stroke="#ffd27a" strokeWidth="2.2" />
        <path d={arrowHead(12, 40, Math.PI / 2, 6)} fill="#ffd27a" />
        <text x="17" y="38" className="rt-pic-g">
          {T.picGravity}
        </text>
      </svg>
      <div className={`rt-pic-line ${ok ? 'good' : 'bad'}`}>{line}</div>
      <div className="rt-pic-note">{T.picIdeal}</div>
    </div>
  )
}

export function LiftPicture({ e }: { e: Entry }) {
  const T = ui().moonReturn
  const bank = Math.acos(Math.max(-1, Math.min(1, e.lift))) * DEG
  const want = Math.acos(Math.max(-1, Math.min(1, entryAuto(e)))) * DEG
  // 揚力の大きさ（重力を 1 として）：空気の力のうち、横向きの分（揚抗比 0.3）
  const liftG = e.g * 0.287
  const len = 30 * Math.min(1.7, Math.max(0.2, liftG))
  const cx = 80
  const cy = 62
  const line = e.lift > 0.5 ? T.picLiftUp : e.lift < -0.5 ? T.picLiftDown : T.picLiftSide
  const close = Math.abs(bank - want) < 25
  // 揚力が下のときは、重力の矢と重ならないように、重力の矢を少し横へ
  const down = Math.cos(bank / DEG) < -0.3
  const gx = Math.cos(bank / DEG) < -0.5 ? cx + 14 : cx
  return (
    <div className="rt-pic">
      <div className="rt-pic-title">{T.picBack}</div>
      <svg viewBox="0 0 160 124" role="img" aria-label={T.picBack}>
        {/* 地平線（下が地球） */}
        <circle cx="80" cy="560" r="454" fill="rgba(110,170,255,0.2)" />
        <circle cx="80" cy="560" r="442" fill="#1d4f8a" />
        {/* 目安の向き（点線） */}
        <g transform={`rotate(${want} ${cx} ${cy})`}>
          <line x1={cx} y1={cy} x2={cx} y2={cy - 50} stroke="rgba(255,255,255,0.8)" strokeWidth="1.6" strokeDasharray="4 3" />
          <path d={arrowHead(cx, cy - 54, -Math.PI / 2, 6)} fill="rgba(255,255,255,0.8)" />
        </g>
        {/* 司令船（うしろから：丸い熱よけと、とがった先）と揚力。船と一緒に回る */}
        <g transform={`rotate(${bank} ${cx} ${cy})`}>
          <circle cx={cx} cy={cy} r="17" fill="#c9d0d8" stroke="#8d97a3" strokeWidth="1.5" />
          <circle cx={cx} cy={cy} r="6" fill="#6f7884" />
          {/* 窓・ハッチの側（揚力が出る側） */}
          <rect x={cx - 4} y={cy - 15} width="8" height="5" rx="1" fill="#2b3644" />
          <line x1={cx} y1={cy - 18} x2={cx} y2={cy - len + 4} stroke="#9ff0b8" strokeWidth="3" />
          <path d={arrowHead(cx, cy - len - 2, -Math.PI / 2, 8)} fill="#9ff0b8" />
        </g>
        {/* 揚力の名前（字は回さない）：矢の先の横 */}
        <text
          x={cx + Math.sin(bank / DEG) * (len + 8) + (down ? -8 : 6)}
          y={cy - Math.cos(bank / DEG) * (len + 8) + 4}
          textAnchor={down ? 'end' : 'start'}
          className="rt-pic-l"
        >
          {T.picLift}
        </text>
        {/* 重力はいつも下 */}
        <line x1={gx} y1={cy + 18} x2={gx} y2={cy + 48} stroke="#ffd27a" strokeWidth="3" />
        <path d={arrowHead(gx, cy + 54, Math.PI / 2, 8)} fill="#ffd27a" />
        <text x={gx + 6} y={cy + 46} className="rt-pic-g">
          {T.picGravity}
        </text>
      </svg>
      <div className="rt-pic-line">{line}</div>
      <div className={`rt-pic-note ${close ? 'good' : ''}`}>{liftG < 0.3 ? T.picThin : T.picMatch}</div>
    </div>
  )
}
