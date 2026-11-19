import { lazy, Suspense, useEffect } from 'react'
import { useLanding } from '../state/landing'
import { labEnabled } from '../state/surfaceLab'
import { useEva } from '../state/eva'
import { useWalk } from '../state/walk'

// 地表・船外活動・コロニーの中を歩く場面は、それぞれ別のファイルに分けて、使うときに読み込む。
// 起動のときに読むプログラムが減り、スマホのメモリにも優しい。
// 場面に入る前（暗転しているあいだ）に読み終わるように、起動して落ち着いたら裏でゆっくり先読みもしておく。

const loadSurface = () => import('../components/surface/SurfaceView')
const loadEva = () => import('../components/eva/EvaView')
const loadWalk = () => import('../components/walk/WalkView')

const SurfaceView = lazy(() => loadSurface().then((m) => ({ default: m.SurfaceView })))
const EvaView = lazy(() => loadEva().then((m) => ({ default: m.EvaView })))
const WalkView = lazy(() => loadWalk().then((m) => ({ default: m.WalkView })))

/** 起動してからこの秒数たったら、場面のプログラムを先読みする（起動の読み込みと重ならないように） */
const PREFETCH_AFTER = 12

function usePrefetch() {
  useEffect(() => {
    // Safari には requestIdleCallback がない
    const idle = (fn: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 5000 }) : setTimeout(fn, 200))
    const timer = setTimeout(() => {
      // 1 つずつ、間をあけて読む
      idle(() => void loadSurface().then(() => idle(() => void loadEva().then(() => idle(() => void loadWalk())))))
    }, PREFETCH_AFTER * 1000)
    return () => clearTimeout(timer)
  }, [])
}

export function LazyScenes() {
  usePrefetch()
  const landing = useLanding((l) => l.phase !== 'idle') || labEnabled()
  const eva = useEva((e) => e.phase !== 'none')
  const walk = useWalk((w) => w.phase !== 'none')
  return (
    <>
      <Suspense fallback={null}>{landing && <SurfaceView />}</Suspense>
      <Suspense fallback={null}>{eva && <EvaView />}</Suspense>
      <Suspense fallback={null}>{walk && <WalkView />}</Suspense>
    </>
  )
}
