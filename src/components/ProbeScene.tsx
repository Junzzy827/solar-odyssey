import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { dateMs, RYUGU, RYUGU_ID } from '../data/probes'
import { endMs, pathAt, probeById, probeClock, probePath, ryuguAu, useProbes } from '../state/probes'
import { useLayout } from '../state/useLayout'
import type { Layout } from '../data/layout'
import { LABEL_Z } from './labels'

// 探査機の旅：道すじの線（通ったところは明るく）、今いるところの光る点と名前、はやぶさ2のときはリュウグウ

const DAY_MS = 86_400_000
const OVERVIEW = new THREE.Vector3(0, 120, 220)
/** OVERVIEW の位置から全体が見える半径（Ship の全体マップと同じ） */
const OVERVIEW_FITS = 200

/** 天文単位の空間の点を、今の並べ方の位置に直す（向きはそのまま、太陽からの距離だけ並べ方に合わせる） */
function toWorld(p: THREE.Vector3, layout: Layout, out: THREE.Vector3) {
  const r = p.length()
  return r === 0 ? out.set(0, 0, 0) : out.copy(p).multiplyScalar(layout.au(r) / r)
}

function lineOf(points: THREE.Vector3[], color: string, opacity: number) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
  return new THREE.Line(geometry, material)
}

function Ryugu({ layout }: { layout: Layout }) {
  const marker = useRef<THREE.Group>(null!)
  const orbit = useMemo(() => {
    const start = dateMs(RYUGU.epoch)
    const points = Array.from({ length: 129 }, (_, i) => toWorld(ryuguAu(start + (i / 128) * RYUGU.periodDays * DAY_MS), layout, new THREE.Vector3()))
    return lineOf(points, '#a89c8c', 0.35)
  }, [layout])
  const at = new THREE.Vector3()
  useFrame(() => toWorld(ryuguAu(probeClock.ms, at), layout, marker.current.position))
  return (
    <>
      <primitive object={orbit} />
      <group ref={marker}>
        <mesh>
          <sphereGeometry args={[0.35, 12, 12]} />
          <meshStandardMaterial color="#8d8378" roughness={1} />
        </mesh>
        <Html position={[0, 1.2, 0]} center className="label" zIndexRange={LABEL_Z}>
          <span>リュウグウ</span>
        </Html>
      </group>
    </>
  )
}

export function ProbeScene() {
  const { open, probeId } = useProbes()
  const probe = open ? probeById(probeId) : null
  const layout = useLayout()
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const head = useRef<THREE.Group>(null!)

  const lines = useMemo(() => {
    if (!probe) return null
    const path = probePath(probe)
    const world = path.map((pt) => toWorld(pt.p, layout, new THREE.Vector3()))
    const full = lineOf(world, probe.color, 0.22)
    const done = lineOf(world, probe.color, 0.95)
    done.geometry.setDrawRange(0, 0)
    const reach = Math.max(...world.map((w) => w.length()))
    return { path, full, done, reach }
  }, [probe, layout])

  // 選んだら、道すじ全体が入るところまでカメラを引く（内側だけの旅は寄る）
  useEffect(() => {
    if (!lines) return
    camera.position.copy(OVERVIEW).multiplyScalar(Math.max(0.35, (lines.reach * 1.25) / OVERVIEW_FITS))
    camera.up.set(0, 1, 0)
    camera.lookAt(0, 0, 0)
  }, [lines, camera])

  useEffect(
    () => () => {
      lines?.full.geometry.dispose()
      lines?.done.geometry.dispose()
    },
    [lines],
  )

  // 説明のパネルにかからないよう、太陽系をパネルの横（せまい画面では上）へずらして見せる
  useEffect(() => {
    if (!open) return
    return () => {
      camera.clearViewOffset()
      camera.updateProjectionMatrix()
    }
  }, [open, camera])
  useFrame(() => {
    if (!open) return
    const panel = document.querySelector('.probe-panel')?.getBoundingClientRect()
    const shiftX = panel && panel.right < size.width / 2 ? -panel.right / 2 : 0
    const shiftY = panel && panel.top > size.height / 3 ? (size.height - panel.top) / 2 : 0
    camera.setViewOffset(size.width, size.height, shiftX, shiftY, size.width, size.height)
  })

  const p = new THREE.Vector3()
  useFrame(() => {
    if (!lines || !probe) return
    const ms = Math.min(probeClock.ms, endMs(probe))
    const { index, point } = pathAt(lines.path, ms, p)
    toWorld(point, layout, head.current.position)
    // 遠くから見ても見失わないよう、離れるほど点を大きく
    head.current.scale.setScalar(Math.max(1, camera.position.distanceTo(head.current.position) / 120))
    // 通ったところまでを明るく（今の位置へは、最後の点から直線でつながって見える）
    lines.done.geometry.setDrawRange(0, index)
  })

  if (!probe || !lines) return null
  return (
    <>
      <primitive object={lines.full} />
      <primitive object={lines.done} />
      <group ref={head}>
        <mesh>
          <sphereGeometry args={[0.5, 12, 12]} />
          <meshBasicMaterial color={new THREE.Color(probe.color).multiplyScalar(2.5)} toneMapped={false} />
        </mesh>
        <Html position={[0, 1.6, 0]} center className="label probe-label" zIndexRange={LABEL_Z}>
          <span style={{ color: probe.color }}>{probe.name}</span>
        </Html>
      </group>
      {probe.stops.some((s) => s.body === RYUGU_ID) && <Ryugu layout={layout} />}
    </>
  )
}
