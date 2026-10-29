import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { Moon, Planet } from '../data/bodies'
import { moonSpeed, spinSpeed } from '../data/scale'
import { planetPosition } from '../data/ephemeris'
import { textureUrl } from '../data/textures'
import { useOptionalTexture } from '../hooks/useOptionalTexture'
import { registerBody, sim } from '../state/registry'
import { useStore } from '../state/store'
import { useLayout } from '../state/useLayout'
import { OrbitLine } from './OrbitLine'
import { Atmosphere } from './Atmosphere'
import { EarthSurface } from './EarthSurface'
import { SaturnRing } from './SaturnRing'
import { CloudInterior } from './CloudInterior'
import { PlanetSurface } from './PlanetSurface'
import { approachKind } from '../data/approach'
import { LABEL_Z, useHideBehindSun } from './labels'
import { named, useLang } from '../i18n/lang'
import { eclipseMoonOffset, eclipseNow } from '../state/eclipse'

const DEG = Math.PI / 180

const moonWorld = new THREE.Vector3()
const moonTilt = new THREE.Quaternion()
const moonOffset = new THREE.Vector3()

/** 衛星。名札は、その衛星の近くまで来たときだけ出す（いつも出すと惑星のまわりが名札だらけになる） */
function MoonBody({ moon, radius, orbitRadius }: { moon: Moon; radius: number; orbitRadius: number }) {
  const ref = useRef<THREE.Group>(null!)
  const label = useRef<HTMLSpanElement>(null!)
  useLang()
  const labelAt = useRef<THREE.Group>(null!)
  useEffect(() => registerBody({ id: moon.id, get name() { return named(moon) }, radius, object: ref.current }), [moon, radius])
  useFrame(({ camera }) => {
    if (!label.current) return
    ref.current.getWorldPosition(moonWorld)
    const near = camera.position.distanceTo(moonWorld) < Math.max(10, orbitRadius * 4)
    label.current.style.display = near ? '' : 'none'
    // 軌道が傾いていても、名札は衛星の真上に出す
    if (near) labelAt.current.position.set(0, radius + 0.35, 0).applyQuaternion(ref.current.getWorldQuaternion(moonTilt).invert())
  })
  return (
    <group ref={ref} position={[orbitRadius, 0, 0]}>
      {/* 月は、地図の真ん中（経度0度）の「表側」を、いつも地球に向ける */}
      <group scale={moon.shape ?? 1} rotation={[0, moon.id === 'moon' ? Math.PI : 0, 0]}>
        <PlanetSurface id={moon.id} radius={radius} color={moon.color} />
      </group>
      <group ref={labelAt}>
        <Html center className="label moon-label" zIndexRange={LABEL_Z}>
          <span ref={label} style={{ display: 'none' }} onClick={() => useStore.getState().setTarget(moon.id)}>
            {named(moon)}
          </span>
        </Html>
      </group>
    </group>
  )
}

export function PlanetBody({ planet }: { planet: Planet }) {
  const orbit = useRef<THREE.Group>(null!)
  const spin = useRef<THREE.Group>(null!)
  const surface = useRef<THREE.Group>(null!)
  const moonPivots = useRef<THREE.Group[]>([])
  const moonOrbits = useRef<THREE.Group[]>([])
  const label = useRef<HTMLSpanElement>(null!)
  useLang()
  // 衛星の位置（角度）。距離を変えると回る速さも変わるので、時間をかけて足していく
  const moonAngles = useRef<number[] | null>(null)
  const lastTime = useRef(sim.time)

  const layout = useLayout()
  const distance = layout.orbit.get(planet.id)!
  const radius = layout.radius.get(planet.id)!
  const isEarth = planet.id === 'earth'
  const isGas = approachKind(planet.id) === 'gas'
  const ringRadii = useMemo(() => (planet.ring ? { inner: radius * planet.ring.inner, outer: radius * planet.ring.outer } : undefined), [planet.ring, radius])
  const map = useOptionalTexture(isGas ? textureUrl(planet.id) : undefined)
  const deep = useMemo(() => '#' + new THREE.Color(planet.color).multiplyScalar(0.18).getHexString(), [planet.color])

  useEffect(() => registerBody({ id: planet.id, get name() { return named(planet) }, radius, object: orbit.current }), [planet, radius])

  useHideBehindSun(label, orbit)

  useFrame((_, delta) => {
    const t = sim.time
    planetPosition(planet, distance, t, orbit.current.position)
    spin.current.rotation.y += spinSpeed(planet.rotationHours) * delta * useStore.getState().timeScale
    if (!moonAngles.current) moonAngles.current = planet.moons.map((moon, i) => i * 1.7 + t * moonSpeed(moon.orbitDays))
    // 日食・月食を見ているあいだは、月と地球の自転を、その日時の本当の向きにする
    if (isEarth && eclipseMoonOffset(orbit.current.position, radius, layout.radius.get('moon')!, layout.moon.get('moon')!.radius, moonOffset)) {
      spin.current.rotation.y = eclipseNow.spin
      const pivot = moonPivots.current[0]
      const a = Math.atan2(-moonOffset.z, moonOffset.x)
      const r = layout.moon.get('moon')!.radius
      pivot.rotation.y = a
      pivot.position.set(moonOffset.x - Math.cos(a) * r, moonOffset.y, moonOffset.z + Math.sin(a) * r)
      moonOrbits.current[0].visible = false
      lastTime.current = NaN
      return
    }
    if (isEarth && !moonOrbits.current[0].visible) {
      moonPivots.current[0].position.set(0, 0, 0)
      moonOrbits.current[0].visible = true
    }
    // 食を見終わって時間を戻したときは、月をそこから続けて回す（飛ばない）
    const step = Number.isNaN(lastTime.current) ? 0 : t - lastTime.current
    lastTime.current = t
    planet.moons.forEach((moon, i) => {
      moonAngles.current![i] += step * moonSpeed(moon.orbitDays) * (layout.moon.get(moon.id)?.speed ?? 1)
      moonPivots.current[i].rotation.y = moonAngles.current![i]
    })
    // 冥王星はカロンと同じ速さで自転し、+X の面をいつもカロンに向ける
    if (planet.lockedToMoon && moonPivots.current[0]) spin.current.rotation.y = moonPivots.current[0].rotation.y
  })

  return (
    <>
      <group rotation={[0, (planet.nodeDeg ?? 0) * DEG, 0]}>
        <group rotation={[(planet.inclinationDeg ?? 0) * DEG, 0, 0]}>
          <OrbitLine radius={distance} />
        </group>
      </group>
      <group ref={orbit}>
        {/* 地軸の傾き。地球の北極は、本物どおり黄経90度の向き（夏至の日に太陽の側）へ傾ける */}
        <group rotation={isEarth ? [-planet.tiltDeg * DEG, 0, 0] : [0, 0, planet.tiltDeg * DEG]}>
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
        <Html position={[0, radius + 1, 0]} center className="label" zIndexRange={LABEL_Z}>
          <span ref={label} onClick={() => useStore.getState().setTarget(planet.id)}>
            {named(planet)}
          </span>
        </Html>
        {/* 衛星はふつう惑星の赤道の上を回る（横倒しの天王星では縦に回る）。地球の月は公転の面の近く */}
        <group rotation={[0, 0, planet.moonsInOrbitPlane ? 0 : planet.tiltDeg * DEG]}>
          {planet.moons.map((moon, i) => {
            const r = layout.moon.get(moon.id)!.radius
            return (
              <group key={moon.id}>
                <group ref={(g) => { if (g) moonOrbits.current[i] = g }}>
                  <OrbitLine radius={r} opacity={0.12} />
                </group>
                <group ref={(g) => { if (g) moonPivots.current[i] = g }}>
                  <MoonBody moon={moon} radius={layout.radius.get(moon.id)!} orbitRadius={r} />
                </group>
              </group>
            )
          })}
        </group>
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
