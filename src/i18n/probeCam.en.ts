import type { probeCamJa } from './probeCam.ja'
import type { Translation } from './translation'

// The texts of ui/ProbeCamPane.tsx (English). Same keys as probeCam.ja.ts. Captions stay within two lines

const planet: Record<string, string> = { earth: 'Earth', jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune' }
const km = (v: number) =>
  v >= 1e9 ? `${(v / 1e9).toFixed(1)} billion km` : v >= 1e6 ? `${(v / 1e6).toFixed(1)} million km` : `${Math.round(v).toLocaleString('en-US')} km`
const kms = (v: number) => `${v.toFixed(1)} km/s`

export const probeCamEn: Translation<typeof probeCamJa> = {
  planet,
  distance: km,
  title: 'Probe',
  speed: 'Speed relative to the Sun',
  speedValue: (v: number) => `${v.toFixed(1)} km/s`,
  toPlanet: (name: string, d: string) => `${d} to ${name}`,
  fromEarth: (d: string, t: string) => `${d} from Earth · radio takes ${t}`,
  lightTime: (minutes: number) => (minutes < 1 ? `${(minutes * 60).toFixed(1)} s` : minutes < 60 ? `${Math.round(minutes)} min` : `${(minutes / 60).toFixed(1)} h`),
  arrow: 'speed arrow',
  loading: 'Loading the model…',
  credit: 'Model: NASA 3D Resources / Trajectory: NASA JPL Horizons',
  dragHint: 'Drag to turn it around',
  launch: {
    burnout: (v: number) => `About an hour after launch. The last rocket burn is over, and it leaves Earth at ${kms(v)}.`,
    moon: (d: string) => `Already ${d} from Earth. It passed the Moon's orbit (about 380,000 km) in half a day.`,
    helio: (v: number) => `Earth's own orbital speed (30 km/s) adds to the rocket's, so seen from the Sun it heads out at ${kms(v)}.`,
  },
  flyby: (name: string, n: { speedBefore: number; speedAfter: number; relSpeed: number; turnPlanet: number; turnSun: number; altitudeKm: number; planetSpeed: number }) => {
    const change =
      n.speedAfter > n.speedBefore + 0.5
        ? `Seen from the Sun, it sped up from ${kms(n.speedBefore)} to ${kms(n.speedAfter)}! It borrowed a little of ${name}'s motion. That's a gravity assist.`
        : n.speedAfter < n.speedBefore - 0.5
          ? `Seen from the Sun: ${kms(n.speedBefore)} → ${kms(n.speedAfter)}. To turn sharply it gave a little speed back to ${name}.`
          : `Seen from the Sun the speed hardly changed; only the direction turned by ${Math.round(n.turnSun)}°.`
    return [
      `Approaching ${name}. Its gravity pulls the probe in, slowly speeding it up.`,
      `${name}'s gravity bends the path hard (${Math.round(n.turnPlanet)}° as seen from ${name}).`,
      `Closest approach! About ${km(n.altitudeKm)} above ${name}'s clouds.`,
      `Seen from ${name}, it leaves at the same ${kms(n.relSpeed)} it came in with. But ${name} itself is moving around the Sun at ${kms(n.planetSpeed)}.`,
      change,
    ]
  },
  extra: {
    jupiter: "At Jupiter it photographed Io's volcanoes and the swirl of the Great Red Spot.",
    saturn: "Saturn's gravity put it on the road to Uranus.",
    uranus: 'Uranus spins on its side. Voyager 2 is still the only probe to have seen it up close.',
    neptune: "It skimmed over Neptune's north pole toward the moon Triton and was bent south of the planets' plane.",
  },
  cruise: [
    'Its big dish antenna (3.7 m across) always points at Earth.',
    (d: string, t: string) => `${d} from Earth. Radio from Earth takes ${t} to get here.`,
    "Power comes from nuclear batteries (RTGs). The Sun is too far away for solar panels.",
    'The Golden Record carries Earth’s music, voices and pictures, in case someone finds it one day.',
    "It hardly uses its engines: it borrows each planet's gravity to reach the next one.",
  ],
  beyond: (v: number) => `Now it keeps going south of the planets' plane at ${kms(v)}.`,
}
