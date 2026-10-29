import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { Moon, Planet } from '../data/bodies'
import { angularSpeed, bodyRadius, moonOrbitRadius, moonSpeed, orbitRadius, spinSpeed } from '../data/scale'
import { textureUrl } from '../data/textures'
import { useOptionalTexture } from '../hooks/useOptionalTexture'
import { OrbitLine } from './OrbitLine'
import { Atmosphere } from './Atmosphere'
import { EarthSurface } from './EarthSurface'
import { SaturnRing } from './SaturnRing'

const DEG = Math.PI / 180

function TexturedSphere({ textureKey, radius, color }: { textureKey: string; radius: number; color: string }) {
  const map = useOptionalTexture(textureUrl(textureKey))
  return (
    <mesh>
      <sphereGeometry args={[radius, 64, 64]} />
      {map ? <meshStandardMaterial map={map} roughness={0.95} metalness={0} /> : <meshStandardMaterial color={color} roughness={0.9} />}
    </mesh>
  )
}

function MoonBody({ moon }: { moon: Moon }) {
  return <TexturedSphere textureKey={moon.id} radius={Math.max(0.12, bodyRadius(moon.radiusKm))} color={moon.color} />
}

export function PlanetBody({ planet, startAngle }: { planet: Planet; startAngle: number }) {
  const orbit = useRef<THREE.Group>(null!)
  const spin = useRef<THREE.Group>(null!)
  const moonPivots = useRef<THREE.Group[]>([])

  const distance = orbitRadius(planet.distanceAu)
  const radius = bodyRadius(planet.radiusKm)
  const isEarth = planet.id === 'earth'

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
          <group ref={spin}>
            {isEarth ? <EarthOrFallback radius={radius} color={planet.color} /> : <TexturedSphere textureKey={planet.id} radius={radius} color={planet.color} />}
          </group>
          {planet.atmosphere && <Atmosphere radius={radius} color={planet.atmosphere} power={isEarth ? 1 : 1.6} />}
          {planet.ring && <SaturnRing inner={radius * planet.ring.inner} outer={radius * planet.ring.outer} color={planet.ring.color} />}
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
                <group position={[r, 0, 0]}>
                  <MoonBody moon={moon} />
                </group>
              </group>
            </group>
          )
        })}
      </group>
    </>
  )
}

/** 昼夜テクスチャが揃うまでは昼の地図だけ（無ければ単色）で描く */
function EarthOrFallback({ radius, color }: { radius: number; color: string }) {
  const day = useOptionalTexture(textureUrl('earth'))
  const night = useOptionalTexture(textureUrl('earthNight'))
  if (day && night) return <EarthSurface radius={radius} />
  return <TexturedSphere textureKey="earth" radius={radius} color={color} />
}
