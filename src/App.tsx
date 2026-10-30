import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { PLANETS } from './data/bodies'
import { useStore } from './state/store'
import { Sun } from './components/Sun'
import { PlanetBody } from './components/PlanetBody'
import { Sky } from './components/Sky'
import { SimClock } from './components/SimClock'
import { Ship } from './components/Ship'
import { SpaceDust } from './components/SpaceDust'
import { SizeCompare } from './components/SizeCompare'
import { CloudWake } from './components/CloudWake'
import { AsteroidBelt } from './components/AsteroidBelt'
import { WarpStreaks } from './components/WarpStreaks'
import { TargetMarker } from './components/TargetMarker'
import { Phaser } from './components/Phaser'
import { SFWorld } from './components/sf/SFWorld'
import { SFBoundary } from './components/sf/SFBoundary'
import { useSF } from './data/sf'
import { SFBadge } from './ui/SFBadge'
import { ContextLost } from './ui/ContextLost'
import { Telescopes } from './components/telescope/Telescopes'
import { Race } from './components/race/Race'
import { RacePanel } from './ui/RacePanel'
import { Hud, useGlobalKeys } from './ui/Hud'
import { NavPanel } from './ui/NavPanel'
import { LogPanel } from './ui/LogPanel'
import { TelescopeView } from './ui/TelescopeView'
import { useLayout } from './state/useLayout'
import { QUALITY, dprFor, useLevel } from './state/quality'
import { QualityGovernor } from './components/QualityGovernor'
import { GalleryCamera } from './components/ship/GalleryCamera'
import { GalleryPanel } from './ui/GalleryPanel'
import { GalleryLabels } from './ui/GalleryLabels'
import { TouchControls, TouchWarp } from './ui/TouchControls'
import { TouchBar } from './ui/TouchBar'
import { BootFrames, BootScreen } from './ui/Boot'
import { QuizPanel } from './ui/QuizPanel'
import { ProbeScene } from './components/ProbeScene'
import { ProbePanel } from './ui/ProbePanel'
import { MissionRunner } from './components/mission/MissionRunner'
import { MissionPanel } from './ui/MissionPanel'
import { LanguagePicker } from './ui/LanguagePicker'
import { EclipseScene } from './components/EclipseScene'
import { EclipsePanel } from './ui/EclipsePanel'
import { useEclipse } from './state/eclipse'
import { StampBook } from './ui/StampBook'
import { BridgeInterior } from './components/bridge/BridgeInterior'
import { BridgePanel } from './ui/BridgePanel'
import { BridgeLabels } from './ui/BridgeLabels'
import { PhotoNote } from './ui/PhotoNote'

/** 全体マップの視点。距離のスライダーで太陽系を広げたら、そのぶん遠くまで引ける */
function MapControls() {
  const layout = useLayout()
  return <OrbitControls enablePan maxDistance={Math.max(1200, Math.max(...layout.orbit.values()) * 3)} />
}

export default function App() {
  const mode = useStore((s) => s.mode)
  // SF モードのときだけ、架空の船や構造物を出す
  const sf = useSF()
  const bridge = useStore((s) => s.mode === 'flight' && s.cameraMode === 'bridge')
  // 日食・月食を見ているあいだは、EclipseScene のカメラ操作を使う
  const eclipseView = useEclipse((e) => e.open && e.eclipseId !== null)
  useGlobalKeys()
  const level = useLevel()
  const quality = QUALITY[level]

  return (
    <>
      <Canvas shadows dpr={dprFor(level)} camera={{ position: [0, 120, 220], fov: 50, near: 0.01, far: 200_000 }} gl={{ logarithmicDepthBuffer: true }}>
        <SimClock />
        <QualityGovernor />
        <ambientLight intensity={0.08} />
        <Sky />
        <Sun />
        {PLANETS.map((planet) => (
          <PlanetBody key={planet.id} planet={planet} />
        ))}
        <AsteroidBelt />
        {sf && (
          <SFBoundary>
            <SFWorld />
          </SFBoundary>
        )}
        <Telescopes />
        <Race />
        <MissionRunner />
        <Ship />
        {mode === 'gallery' && <GalleryCamera />}
        <CloudWake />
        <SpaceDust />
        <SizeCompare />
        <WarpStreaks />
        <TargetMarker />
        <ProbeScene />
        <EclipseScene />
        <Phaser />
        {mode === 'map' && !eclipseView && <MapControls />}
        {/* 軽い画質では後処理を使わない（明るい光のにじみは無くなるが、描く回数と GPU のメモリが大きく減る） */}
        {quality.bloom && (
          <EffectComposer key={quality.msaa} multisampling={quality.msaa}>
            <Bloom intensity={1.2} luminanceThreshold={1} luminanceSmoothing={0.2} mipmapBlur />
          </EffectComposer>
        )}
        {bridge && <BridgeInterior />}
        <BootFrames />
      </Canvas>
      <BootScreen />
      <GalleryLabels />
      <BridgeLabels />
      <Hud />
      <NavPanel />
      <GalleryPanel />
      <TouchControls />
      <TouchWarp />
      <TouchBar />
      <BridgePanel />
      <RacePanel />
      <MissionPanel />
      <LogPanel />
      <QuizPanel />
      <ProbePanel />
      <EclipsePanel />
      <StampBook />
      <TelescopeView />
      <LanguagePicker />
      <SFBadge />
      <PhotoNote />
      <ContextLost />
      <div className="credit">
        Planet textures: <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noreferrer">Solar System Scope</a> (CC BY 4.0) · Hubble 3D model:{' '}
        <a href="https://science.nasa.gov/resource/hubble-space-telescope-3d-model/" target="_blank" rel="noreferrer">NASA VTAD</a>
      </div>
    </>
  )
}
