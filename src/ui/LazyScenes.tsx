import { lazy, Suspense, useEffect } from 'react'
import { useLanding } from '../state/landing'
import { labEnabled } from '../state/surfaceLab'
import { useEva } from '../state/eva'
import { useWalk } from '../state/walk'
import { useMoonMission } from '../state/moonMission'
import { SceneBoundary } from './SceneBoundary'
import { recallRover } from '../state/rover'
import { useStore } from '../state/store'
import { ISS_SAMPLE, closeIss, openIss, useIss } from '../state/iss'
import { useShuttle } from '../state/shuttle'
import { ShuttleEntry } from '../components/shuttle/ShuttleEntry'

// 地表・船外活動・コロニーの中を歩く場面は、それぞれ別のファイルに分けて、使うときに読み込む。
// 起動のときに読むプログラムが減り、スマホのメモリにも優しい。
// 場面に入る前（暗転しているあいだ）に読み終わるように、起動して落ち着いたら裏でゆっくり先読みもしておく。

const loadSurface = () => import('../components/surface/SurfaceView')
const loadEva = () => import('../components/eva/EvaView')
const loadWalk = () => import('../components/walk/WalkView')
const loadMoonMission = () => import('../components/moonMission/MoonMissionView')
// ISS は試しの URL（?iss=sample）のときだけ読む（先読みもしない）
const loadIss = () => import('../components/iss/IssView')
const loadShuttle = () => import('../components/shuttle/ShuttleView')

const SurfaceView = lazy(() => loadSurface().then((m) => ({ default: m.SurfaceView })))
const EvaView = lazy(() => loadEva().then((m) => ({ default: m.EvaView })))
const WalkView = lazy(() => loadWalk().then((m) => ({ default: m.WalkView })))
const MoonMissionView = lazy(() => loadMoonMission().then((m) => ({ default: m.MoonMissionView })))
const IssView = lazy(() => loadIss().then((m) => ({ default: m.IssView })))
const ShuttleView = lazy(() => loadShuttle().then((m) => ({ default: m.ShuttleView })))

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

/** 地表の場面を閉じて母船へ（失敗したとき。離陸の演出は飛ばす） */
function backFromSurface() {
  try {
    recallRover()
  } catch {
    // ローバーが壊れていても母船へはもどる
  }
  useLanding.setState({ phase: 'idle', bodyId: null, site: null })
}

/** ?iss=sample：言葉を選び、読み込みの画面が消えたら ISS に入る */
function useIssSample() {
  const lang = useStore((s) => s.settings.lang)
  useEffect(() => {
    if (!ISS_SAMPLE || lang === null) return
    const id = window.setInterval(() => {
      if (document.getElementById('boot')) return
      window.clearInterval(id)
      openIss()
    }, 300)
    return () => window.clearInterval(id)
  }, [lang])
}

export function LazyScenes() {
  usePrefetch()
  useIssSample()
  const landing = useLanding((l) => l.phase !== 'idle') || labEnabled()
  const eva = useEva((e) => e.phase !== 'none')
  const walk = useWalk((w) => w.phase !== 'none')
  const moon = useMoonMission((m) => m.phase !== 'none')
  const iss = useIss((s) => s.phase !== 'none')
  const shuttle = useShuttle((s) => s.phase !== 'none')
  return (
    <>
      {/* 場面が失敗したら「問題が起きました。もどる」：その場面を閉じて、宇宙の自由探索へ */}
      <SceneBoundary name="surface" onBack={backFromSurface}>
        <Suspense fallback={null}>{landing && <SurfaceView />}</Suspense>
      </SceneBoundary>
      <SceneBoundary name="eva" onBack={() => useEva.setState({ phase: 'none' })}>
        <Suspense fallback={null}>{eva && <EvaView />}</Suspense>
      </SceneBoundary>
      <SceneBoundary name="walk" onBack={() => useWalk.setState({ phase: 'none' })}>
        <Suspense fallback={null}>{walk && <WalkView />}</Suspense>
      </SceneBoundary>
      <SceneBoundary name="moonMission" onBack={() => useMoonMission.setState({ phase: 'none' })}>
        <Suspense fallback={null}>{moon && <MoonMissionView />}</Suspense>
      </SceneBoundary>
      <SceneBoundary name="iss" onBack={closeIss}>
        <Suspense fallback={null}>{iss && <IssView />}</Suspense>
      </SceneBoundary>
      {/* スペースシャトルの乗員室（試しの URL ?shuttle=sample のときだけ入口が出る） */}
      <SceneBoundary name="shuttle" onBack={() => useShuttle.setState({ phase: 'none', spot: null })}>
        <Suspense fallback={null}>{shuttle && <ShuttleView />}</Suspense>
      </SceneBoundary>
      <ShuttleEntry />
    </>
  )
}
