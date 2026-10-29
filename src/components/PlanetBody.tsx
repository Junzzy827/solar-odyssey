import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { Moon, Planet } from '../data/bodies'
import { angularSpeed, bodyRadius, moonOrbitRadius, moonSpeed, orbitRadius, spinSpeed } from '../data/scale'
import { textureUrl } from '../data/textures'
import { useOptionalTexture } from '../hooks/useOptionalTexture'
import { registerBody, sim } from '../state/registry'
import { useStore } from '../state/store'
import { OrbitLine } from './OrbitLine'
import { Atmosphere } from './Atmosphere'
import { EarthSurface } from './EarthSurface'
import { SaturnRing } from './SaturnRing'
import { CloudInterior } from './CloudInterior'
import { PlanetSurface } from './PlanetSurface'
import { approachKind } from '../data/approach'

const DEG = Math.PI / 180

const moonRadius = (moon: Moon) => Math.max(0.12, bodyRadius(moon.radiusKm))

function MoonBody({ moon, position }: { moon: Moon; position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null!)
  useEffect(() => registerBody({ id: moon.id, name: moon.name, radius: moonRadius(moon), object: ref.current }), [moon])
  return (
    <group ref={ref} position={position}>
      <PlanetSurface id={moon.id} radius={moonRadius(moon)} color={moon.color} />
    </group>
  )
}

export function PlanetBody({ planet, startAngle }: { planet: Planet; startAngle: number }) {
  const orbit = useRef<THREE.Group>(null!)
  const spin = useRef<THREE.Group>(null!)
  const surface = useRef<THREE.Group>(null!)
  const moonPivots = useRef<THREE.Group[]>([])

  const distance = orbitRadius(planet.distanceAu)
  const radius = bodyRadius(planet.radiusKm)
  const isEarth = planet.id === 'earth'
  const isGas = approachKind(planet.id) === 'gas'
  const ringRadii = useMemo(() => (planet.ring ? { inner: radius * planet.ring.inner, outer: radius * planet.ring.outer } : undefined), [planet.ring, radius])
  const map = useOptionalTexture(isGas ? textureUrl(planet.id) : undefined)
  const deep = useMemo(() => '#' + new THREE.Color(planet.color).multiplyScalar(0.18).getHexString(), [planet.color])

  useEffect(() => registerBody({ id: planet.id, name: planet.name, radius, object: orbit.current }), [planet, radius])

  useFrame((_, delta) => {
    const t = sim.time
    const a = startAngle + t * angularSpeed(planet.orbitDays)
    orbit.current.position.set(Math.cos(a) * distance, 0, -Math.sin(a) * distance)
    spin.current.rotation.y += spinSpeed(planet.rotationHours) * delta * useStore.getState().timeScale
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
            <group ref={surface}>
              {isEarth ? (
                <EarthOrFallback radius={radius} color={planet.color} />
              ) : (
                <PlanetSurface id={planet.id} radius={radius} color={planet.color} haze={planet.atmosphere} ring={ringRadii} />
              )}
            </group>
            {isGas && <CloudInterior id={planet.id} radius={radius} haze={planet.atmosphere ?? planet.color} deep={deep} map={map} surface={surface} />}
          </group>
          {planet.atmosphere && <Atmosphere radius={radius} color={planet.atmosphere} power={isEarth ? 1 : 1.6} />}
          {planet.ring && <SaturnRing inner={radius * planet.ring.inner} outer={radius * planet.ring.outer} color={planet.ring.color} planetRadius={radius} />}
        </group>
        <Html position={[0, radius + 1, 0]} center className="label">
          <span onClick={() => useStore.getState().setTarget(planet.id)}>{planet.name}</span>
        </Html>
        {planet.moons.map((moon, i) => {
          const r = moonOrbitRadius(radius * (planet.ring ? planet.ring.outer : 1), i)
          return (
            <group key={moon.id}>
              <OrbitLine radius={r} opacity={0.12} />
              <group ref={(g) => { if (g) moonPivots.current[i] = g }}>
                <MoonBody moon={moon} position={[r, 0, 0]} />
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
  return <PlanetSurface id="earth" radius={radius} color={color} />
}
