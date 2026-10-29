import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { DEEP_SPACE, SCOPE_LIGHT, SCOPE_LIGHT_SHORT, deepSpaceThumb, deepSpaceUrl, type DeepSpaceImage } from '../data/deepSpace'
import { HUBBLE_ID, scopeName, type ScopeId } from '../data/telescopes'

const MAX_ZOOM = 8

type View = { scale: number; x: number; y: number }
const FIT: View = { scale: 1, x: 0, y: 0 }

/** 写真を拡大・移動して見る。ホイールで拡大、ドラッグで移動、ダブルクリックで拡大／元に戻す */
function Viewer({ image }: { image: DeepSpaceImage }) {
  const box = useRef<HTMLDivElement>(null!)
  const aspect = useRef(1)
  const drag = useRef<{ id: number; x: number; y: number } | null>(null)
  const [view, setView] = useState<View>(FIT)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setView(FIT)
    setLoaded(false)
  }, [image.id])

  // 拡大しても、写真が枠の外へ逃げないようにする
  const clamp = (v: View): View => {
    const r = box.current.getBoundingClientRect()
    const width = Math.min(r.width, r.height * aspect.current)
    const height = width / aspect.current
    const mx = Math.max(0, (width * v.scale - r.width) / 2)
    const my = Math.max(0, (height * v.scale - r.height) / 2)
    return { scale: v.scale, x: Math.max(-mx, Math.min(mx, v.x)), y: Math.max(-my, Math.min(my, v.y)) }
  }

  /** 画面上の点を動かさずに倍率を変える（点の指定がなければ真ん中） */
  const zoomBy = (factor: number, clientX?: number, clientY?: number) =>
    setView((v) => {
      const r = box.current.getBoundingClientRect()
      const px = clientX === undefined ? 0 : clientX - (r.left + r.width / 2)
      const py = clientY === undefined ? 0 : clientY - (r.top + r.height / 2)
      const scale = Math.max(1, Math.min(MAX_ZOOM, v.scale * factor))
      const k = scale / v.scale
      return clamp({ scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k })
    })

  // ホイールは画面のスクロールを止めたいので、受け身でないリスナーで受ける
  useEffect(() => {
    const el = box.current
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  return (
    <div
      ref={box}
      className={`scope-viewer${view.scale > 1 ? ' zoomed' : ''}`}
      onPointerDown={(e) => {
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d || d.id !== e.pointerId) return
        const dx = e.clientX - d.x
        const dy = e.clientY - d.y
        d.x = e.clientX
        d.y = e.clientY
        setView((v) => clamp({ ...v, x: v.x + dx, y: v.y + dy }))
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={(e) => (view.scale > 1.01 ? setView(FIT) : zoomBy(2.5, e.clientX, e.clientY))}
    >
      <img
        key={image.id}
        src={deepSpaceUrl(image)}
        alt={image.name}
        draggable={false}
        onLoad={(e) => {
          aspect.current = e.currentTarget.naturalWidth / e.currentTarget.naturalHeight
          setLoaded(true)
        }}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, opacity: loaded ? 1 : 0 }}
      />
      {!loaded && <div className="scope-loading">望遠鏡から受信中…</div>}
      <div className="scope-zoom" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <button onClick={() => zoomBy(1.6)} aria-label="拡大">＋</button>
        <button onClick={() => zoomBy(1 / 1.6)} aria-label="縮小" disabled={view.scale <= 1}>−</button>
        <button onClick={() => setView(FIT)} disabled={view.scale <= 1}>
          全体
        </button>
      </div>
      <div className="scope-hint">ホイールで拡大・ドラッグで移動</div>
    </div>
  )
}

/** 望遠鏡の目：その望遠鏡が撮った深宇宙の写真を、解説と一緒に見る */
export function TelescopeView() {
  const scope = useStore((s) => s.scope)
  return scope ? <ScopeScreen scope={scope} /> : null
}

function ScopeScreen({ scope }: { scope: ScopeId }) {
  const setScope = useStore((s) => s.setScope)
  const [selected, setSelected] = useState<string | null>(null)
  const [showPair, setShowPair] = useState(false)
  const side = useRef<HTMLElement>(null!)

  const list = DEEP_SPACE.filter((i) => i.scope === scope)
  const base = list.find((i) => i.id === selected) ?? list[0]
  const pair = base.pair ? DEEP_SPACE.find((i) => i.id === base.pair) : undefined
  const current = showPair && pair ? pair : base

  // 写真を切り替えたら、解説を先頭から読めるようにする
  useEffect(() => {
    side.current.scrollTop = 0
  }, [current.id])
  const other = scope === HUBBLE_ID ? 'ウェッブ宇宙望遠鏡（地球から見て太陽と反対側）のそばでは、赤外線の写真が見られます。' : 'ハッブル宇宙望遠鏡（地球のまわり）のそばでは、目に見える光の写真が見られます。'

  return (
    <div className="scope-view" role="dialog" aria-label={`${scopeName(scope)}の目`}>
      <header className="scope-head">
        <div>
          <h2>{scopeName(scope)}の目</h2>
          <div className="muted">
            {current.scope === scope ? '見ている光' : `${scopeName(current.scope)}の写真`}：{SCOPE_LIGHT[current.scope]}
          </div>
        </div>
        <button className="close" onClick={() => setScope(null)} aria-label="閉じる">
          × <kbd>Esc</kbd>
        </button>
      </header>

      <div className="scope-body">
        <div className="scope-main">
          <Viewer image={current} />
          {pair && (
            <div className="scope-compare">
              <span className="muted">同じ場所を見くらべる</span>
              {[base, pair].map((img) => (
                <button key={img.id} className={img === current ? 'on' : ''} onClick={() => setShowPair(img === pair)}>
                  {scopeName(img.scope)}（{SCOPE_LIGHT_SHORT[img.scope]}）
                </button>
              ))}
            </div>
          )}
          <div className="scope-credit">
            画像：{current.credit}（CC BY 4.0）{' '}
            <a href={current.source} target="_blank" rel="noreferrer">
              元の画像
            </a>
          </div>
        </div>

        <aside className="scope-side" ref={side}>
          <h3>{current.name}</h3>
          <div className="muted">{current.kind}</div>
          <dl>
            <div>
              <dt>距離</dt>
              <dd>{current.distance}</dd>
            </div>
          </dl>
          <div className="scope-lookback">
            <div className="muted">この光が出発したのは</div>
            {current.lookback}
          </div>
          <ul className="notes">
            {current.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <div className="scope-list">
            {list.map((item) => (
              <button
                key={item.id}
                className={item.id === base.id ? 'on' : ''}
                onClick={() => {
                  setSelected(item.id)
                  setShowPair(false)
                }}
              >
                <img src={deepSpaceThumb(item)} alt="" />
                <span>{item.name}</span>
              </button>
            ))}
          </div>
          <div className="muted">{other}</div>
        </aside>
      </div>
    </div>
  )
}
