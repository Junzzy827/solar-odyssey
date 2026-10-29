import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import type { Line2 } from 'three-stdlib'
import { useStore } from '../state/store'
import { shipZoom } from '../state/zoom'

export function OrbitLine({ radius, opacity = 0.25 }: { radius: number; opacity?: number }) {
  const points = useMemo(() => {
    const segments = 256
    return Array.from({ length: segments + 1 }, (_, i) => {
      const a = (i / segments) * Math.PI * 2
      return [Math.cos(a) * radius, 0, Math.sin(a) * radius] as [number, number, number]
    })
  }, [radius])
  const line = useRef<Line2>(null!)
  // 接近ズーム中（惑星の低い軌道）は、空を横切る線にしか見えないので消していく
  useFrame(() => {
    const fade = useStore.getState().mode === 'map' ? 1 : Math.min(1, Math.max(0, (6 - shipZoom.factor) / 4))
    line.current.material.opacity = opacity * fade
    line.current.visible = fade > 0
  })

  return <Line ref={line} points={points} color="#6c7fb8" lineWidth={1} transparent opacity={opacity} />
}
