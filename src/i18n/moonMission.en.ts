// components/moonMission/MoonMissionView.tsx・state/moonMission.ts の文言（英語）
import type { moonMissionJa } from './moonMission.ja'
import type { Translation } from './translation'

export const moonMissionEn: Translation<typeof moonMissionJa> = {
  navLabel: 'Crewed flight to the Moon (Apollo 17)',
  saveLabel: 'Moon mission record',
  title: 'Apollo 17: Journey to the Moon',
  intro: 'Midnight, 7 December 1972. The only night launch of Apollo.',
  crew: 'Commander Cernan · Evans · Schmitt',
  tMinus: (s: number) => `T-${Math.ceil(s)}`,
  met: (t: number) => {
    const h = Math.floor(t / 3600)
    const m = Math.floor((t % 3600) / 60)
    const s = Math.floor(t % 60)
    return `T+${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  },
  igniteHold: 'Ignition (tap / Space)',
  igniteHint: 'At T-9, press to light the engines',
  ignitionGo: 'Ignition!',
  altitude: 'Altitude',
  speed: 'Speed',
  gee: 'G',
  km: (v: number) => `${v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString('en-US')} km`,
  kms: (v: number) => `${v.toFixed(2)} km/s`,
  stageName: ['Stage 1 S-IC (5 × F-1)', 'Stage 2 S-II (5 × J-2)', 'Stage 3 S-IVB (1 × J-2)'],
  tiltHint: '← → keep the nose on the green guide',
  autoOn: 'Autopilot',
  auto: 'Autopilot',
  manual: 'Fly it myself',
  camera: 'Camera',
  camNames: { pad: 'From the ground', chase: 'Side view', onboard: 'Onboard camera' },
  quit: 'Quit',
  warp: (w: number) => `Time ×${Math.round(w)}`,
  orbitInfo: (peri: number, apo: number) => `Orbit ${Math.round(peri / 1000)}–${Math.round(apo / 1000)} km`,
  tliBar: 'Window to the Moon',
  tliGo: 'Burn for the Moon',
  tliHint: 'Burn in the middle of the window for the shortest way',
  captions: {
    ignition: ['Ignition', 'Five F-1 engines light up: 3,400 tonnes of thrust'],
    liftoff: ['Liftoff!', 'The night sky turns bright as day'],
    towerClear: ['Tower cleared', 'Now the nose slowly tips east, out over the ocean'],
    maxQ: ['Max Q', 'Through the point of strongest air pressure'],
    centerCutoff: ['Center engine cutoff', 'The rocket is lighter now, so it must not push too hard'],
    stage1Sep: ['Stage 1 separation', '67 km up. The empty first stage falls back to the sea'],
    stage2Ign: ['Stage 2 ignition', 'Liquid hydrogen engines: the flame is almost invisible'],
    interstage: ['Interstage jettisoned', 'The ring under stage 2 drops away'],
    les: ['Escape tower jettisoned', 'High enough that the escape tower is no longer needed'],
    stage2Sep: ['Stage 2 separation', 'Stage 3 takes over'],
    stage3Ign: ['Stage 3 ignition', 'Almost at orbital speed: 7.8 km per second'],
    orbit: ['In Earth orbit', '170 km up. Once around the Earth every 90 minutes'],
    sunrise: ['Orbital sunrise', 'In orbit, morning comes every 90 minutes'],
    tliWindow: ['The window to the Moon is open', 'Burn in the middle of the window'],
    tliIgnition: ['Trans-lunar injection', 'Stage 3 burns again, for about 6 minutes'],
    tliCutoff: ['On the way to the Moon', '10.8 km per second: free of Earth, a three-day trip ahead'],
  },
  endTitle: 'End of part 1: heading for the Moon',
  endNext: 'Next part: the burn behind the Moon and the landing in Taurus-Littrow',
  stars: (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n),
  starsNote: 'Stars for staying on the guide and for the timing of the burn to the Moon',
  again: 'Fly again',
  back: 'Back to the ship',
  best: (n: number) => `Best ${'★'.repeat(n)}`,
}
