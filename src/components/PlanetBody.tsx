import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { Planet } from '../data/bodies'
import { angularSpeed, bodyRadius, moonOrbitRadius, moonSpeed, orbitRadius, spinSpeed } from '../data/scale'
import { OrbitLine } from './OrbitLine'

const DEG = Math.PI / 180

export function PlanetBody({ planet, startAngle }: { planet: Planet; startAngle: number }) {
  const orbit = useRef<THREE.Group>(null!)
  const spin = useRef<THREE.Mesh>(null!)
  const moonPivots = useRef<THREE.Group[]>([])

  const distance = orbitRadius(planet.distanceAu)
  const radius = bodyRadius(planet.radiusKm)

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime()
    const a = startAngle + t * angularSpeed(planet.orbitDays)
    orbit.current.position.set(Math.cos(a) * distance, 0, -Math.sin(a) * distance)
    spin.current.rotation.y += spinSpeed(planet.rotationHours) * delta
    planet.moons.forEach((moon, i) => {
      moonPivots.current[i].rotation.y = i * 1.7 + t * moonSpeed(moon.orbitDays)
    })
  })

  return (
    <>
      <OrbitLine radius={distance} />
      <group ref={orbit}>
        <group rotation={[0, 0, planet.tiltDeg * DEG]}>
          <mesh ref={spin}>
            <sphereGeometry args={[radius, 48, 48]} />
            <meshStandardMaterial color={planet.color} roughness={0.9} />
          </mesh>
          {planet.ring && (
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[radius * planet.ring.inner, radius * planet.ring.outer, 128]} />
              <meshStandardMaterial color={planet.ring.color} side={THREE.DoubleSide} transparent opacity={0.7} />
            </mesh>
          )}
        </group>
        <Html position={[0, radius + 1, 0]} center className="label">
          {planet.name}
        </Html>
        {planet.moons.map((moon, i) => {
          const r = moonOrbitRadius(radius * (planet.ring ? planet.ring.outer : 1), i)
          return (
            <group key={moon.id}>
              <OrbitLine radius={r} opacity={0.12} />
              <group ref={(g) => { if (g) moonPivots.current[i] = g }}>
                <mesh position={[r, 0, 0]}>
                  <sphereGeometry args={[Math.max(0.12, bodyRadius(moon.radiusKm)), 24, 24]} />
                  <meshStandardMaterial color={moon.color} roughness={1} />
                </mesh>
              </group>
            </group>
          )
        })}
      </group>
    </>
  )
}
