import { type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { ui } from '../../i18n'
import { issDebug, useIss } from '../../state/iss'
import type { Station, StationModule } from './station'

// 右上の小さな地図（上から見たステーション）。12 の部屋を角の丸い箱で描き、いる部屋は明るく、行った部屋は塗る。
// 自分の場所は点と向き。押すと大きくなって、部屋の名前が出る（もう一度押すと閉じる）。
// 上から見ると、真下のキューポラはトランクウィリティーと、真上のきぼう保管室はきぼう実験室と重なる。
// キューポラは本当の場所に丸く重ねて描き（「真下の窓」がわかる）、保管室は前へずらして描いて短い線でつなぐ。
// 地図の上が前（−Z）、右が右舷（+X）。単位は m のまま（viewBox）

type Box = { id: string; key: string; x: number; y: number; w: number; h: number; round?: boolean }
type Label = { x: number; y: number; anchor?: 'start' | 'middle' | 'end' }

/** 上から見て重なる部屋を、地図の上でずらす量（m） */
const SHIFT: Record<string, [number, number]> = { jlp: [0, -4.9] }
/** 名前の場所を決めて置く部屋（小さい・重なる部屋）。それ以外は箱の真ん中 */
const LABEL_AT: Record<string, Label> = {
  bishop: { x: -8.7, y: -1.25, anchor: 'end' },
  node3: { x: -5.2, y: -0.9 },
  cupola: { x: -6.4, y: 1.55 },
}
/** 箱どうしのすき間（m） */
const GAP = 0.18
const FONT = 0.62

function boxes(station: Station): Box[] {
  return station.modules.map((m: StationModule) => {
    const [dx, dz] = SHIFT[m.id] ?? [0, 0]
    const x0 = m.bboxMin[0] + dx + GAP
    const x1 = m.bboxMax[0] + dx - GAP
    const z0 = m.bboxMin[2] + dz + GAP
    const z1 = m.bboxMax[2] + dz - GAP
    if (m.id === 'cupola') {
      // 丸い窓。真上の部屋（トランクウィリティー）の真ん中に重ねる
      const r = Math.min(x1 - x0, z1 - z0) / 2
      return { id: m.id, key: m.key, x: m.center[0] - r, y: m.center[2] - r, w: 2 * r, h: 2 * r, round: true }
    }
    return { id: m.id, key: m.key, x: x0, y: z0, w: x1 - x0, h: z1 - z0 }
  })
}

/** 文字の幅（字の大きさの何倍か）：かな・漢字は 1、英字は 0.6 くらい */
function textEm(s: string) {
  let n = 0
  for (const ch of s) n += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.6
  return Math.max(1, n)
}

function frame(list: Box[]) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const b of list) {
    x0 = Math.min(x0, b.x)
    y0 = Math.min(y0, b.y)
    x1 = Math.max(x1, b.x + b.w)
    y1 = Math.max(y1, b.y + b.h)
  }
  const m = 0.8
  return { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m }
}

/** 自分の点：毎コマ、場所と向きを書きかえる（React は通さない） */
function useYouDot(g: RefObject<SVGGElement | null>) {
  useEffect(() => {
    let raf = 0
    let last = ''
    const step = () => {
      raf = requestAnimationFrame(step)
      const el = g.current
      if (!el) return
      const p = issDebug.pose
      const deg = (-p.yaw * 180) / Math.PI
      // ずらして描いた部屋（保管室）にいるときは、点も同じだけずらす
      const [dx, dz] = SHIFT[useIss.getState().module] ?? [0, 0]
      const t = `translate(${(p.x + dx).toFixed(2)} ${(p.z + dz).toFixed(2)}) rotate(${deg.toFixed(1)})`
      if (t !== last) {
        el.setAttribute('transform', t)
        last = t
      }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [g])
}

function MapSvg({ station, big }: { station: Station; big: boolean }) {
  const t = ui().iss
  const here = useIss((s) => s.module)
  const visited = useIss((s) => s.visited)
  const list = useMemo(() => boxes(station), [station])
  const f = useMemo(() => frame(list), [list])
  const you = useRef<SVGGElement>(null)
  useYouDot(you)
  const jlp = list.find((b) => b.id === 'jlp')
  const jpm = list.find((b) => b.id === 'jpm')
  return (
    <svg className="iss-map-svg" viewBox={`${f.x} ${f.y} ${f.w} ${f.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden={!big}>
      {/* 保管室（真上の部屋）を、ずらした先とつなぐ線 */}
      {jlp && jpm && <line className="iss-map-link" x1={jlp.x + jlp.w / 2} y1={jlp.y + jlp.h} x2={jlp.x + jlp.w / 2} y2={jpm.y + jpm.h * 0.4} />}
      {list.map((b) => {
        const cls = `iss-map-room${b.id === here ? ' here' : visited.includes(b.id) ? ' visited' : ''}`
        return b.round ? (
          <circle key={b.id} className={cls} cx={b.x + b.w / 2} cy={b.y + b.h / 2} r={b.w / 2} data-room={b.id} />
        ) : (
          <rect key={b.id} className={cls} x={b.x} y={b.y} width={b.w} height={b.h} rx={Math.min(0.9, b.w / 3, b.h / 3)} data-room={b.id} />
        )
      })}
      {big &&
        list.map((b) => {
          const name = (t.modules as Record<string, { name: string }>)[b.key]?.name ?? b.id
          const fixed = LABEL_AT[b.id]
          if (fixed)
            return (
              <text key={b.id} className="iss-map-name" x={fixed.x} y={fixed.y} fontSize={b.id === 'cupola' ? 0.5 : FONT} textAnchor={fixed.anchor ?? 'middle'}>
                {name}
              </text>
            )
          // 横に入りきらない名前は、縦長の箱なら縦に書く（日本語は縦書き、英語は横にねかせる）。それでも長いと小さく
          const len = textEm(name)
          const cx = b.x + b.w / 2
          const cy = b.y + b.h / 2
          const across = Math.min(FONT, (b.w * 0.9) / len)
          const along = Math.min(FONT, (b.h * 0.9) / len)
          if (across < FONT * 0.85 && along > across && b.h > b.w * 1.4) {
            const jp = /[\u3040-\u30ff\u4e00-\u9fff]/.test(name)
            return jp ? (
              <text key={b.id} className="iss-map-name" x={cx} y={cy} fontSize={along} textAnchor="middle" writingMode="tb">
                {name}
              </text>
            ) : (
              <text key={b.id} className="iss-map-name" x={0} y={along * 0.35} fontSize={along} textAnchor="middle" transform={`translate(${cx} ${cy}) rotate(-90)`}>
                {name}
              </text>
            )
          }
          return (
            <text key={b.id} className="iss-map-name" x={cx} y={cy + across * 0.35} fontSize={Math.max(0.45, across)} textAnchor="middle">
              {name}
            </text>
          )
        })}
      <g ref={you} className="iss-map-you">
        <path d="M0 -1.05 L0.62 0.55 L0 0.22 L-0.62 0.55 Z" />
      </g>
    </svg>
  )
}

export function IssMap({ station }: { station: Station | null }) {
  const t = ui().iss
  const [big, setBig] = useState(false)
  const phase = useIss((s) => s.phase)
  useEffect(() => {
    if (phase !== 'inside') setBig(false)
  }, [phase])
  if (!station) return null
  return (
    <>
      <button className="iss-map" aria-label={t.map.open} onClick={() => setBig(true)}>
        <MapSvg station={station} big={false} />
      </button>
      {big && (
        <div className="iss-map-big" role="dialog" aria-label={t.map.title} onClick={() => setBig(false)}>
          <div className="iss-map-panel">
            <div className="iss-map-title">{t.map.title}</div>
            <MapSvg station={station} big />
            <div className="iss-map-legend">
              <span className="here">{t.map.here}</span>
              <span className="visited">{t.map.visited}</span>
              <span className="close">{t.map.close}</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
