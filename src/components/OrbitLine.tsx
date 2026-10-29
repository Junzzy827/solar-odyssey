import { useMemo } from 'react'
import { Line } from '@react-three/drei'

export function OrbitLine({ radius, opacity = 0.25 }: { radius: number; opacity?: number }) {
  const points = useMemo(() => {
    const segments = 256
    return Array.from({ length: segments + 1 }, (_, i) => {
      const a = (i / segments) * Math.PI * 2
      return [Math.cos(a) * radius, 0, Math.sin(a) * radius] as [number, number, number]
    })
  }, [radius])

  return <Line points={points} color="#6c7fb8" lineWidth={1} transparent opacity={opacity} />
}
