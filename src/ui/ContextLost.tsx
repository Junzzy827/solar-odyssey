import { useEffect, useState } from 'react'
import { useLang } from '../i18n/lang'
import { ui } from '../i18n'

/**
 * 端末の GPU が描画をあきらめたとき（メモリ不足など）、3D が真っ黒のまま止まるので、
 * 何が起きたかと、読みこみ直すボタンを出す
 */
export function ContextLost() {
  useLang()
  const [lost, setLost] = useState(false)
  useEffect(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return
    const onLost = () => setLost(true)
    const onRestored = () => setLost(false)
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
    }
  }, [])
  if (!lost) return null
  return (
    <div className="context-lost" role="alert">
      <p>{ui().contextLost.drawingStopped}</p>
      <button onClick={() => location.reload()}>{ui().contextLost.reload}</button>
    </div>
  )
}
