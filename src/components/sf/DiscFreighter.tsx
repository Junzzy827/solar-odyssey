import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { bodies } from '../../state/registry'
import { useStore } from '../../state/store'
import { UNITS_PER_METER } from '../../data/sf'
import { FREIGHTER_ID, SPACE_TEXT, freighterName } from '../../data/sfSpace'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'
import { useSite } from './useSite'

// 円盤形の小さな貨物船（オリジナルのデザイン）。直径約250mのレンズ形。
// 操縦室は真ん中の丸い屋根、下に貨物の箱を輪のように抱え、後ろの縁にエンジンの光の帯。
// 月と L5 のコロニー群のあいだを、ゆっくり行き来する。形は m で決める。前は -Z。

/** 片道の時間と、両端で止まっている時間（秒） */
const TRIP = 100
const DWELL = 25
/** 両端で、月やコロニーから離れて止まる距離（表示単位） */
const STOP_MOON = 0.5
const STOP_COLONY = 0.7

const ease = (t: number) => t * t * (3 - 2 * t)
const moon = new THREE.Vector3()
const colony = new THREE.Vector3()
const from = new THREE.Vector3()
const to = new THREE.Vector3()
const dir = new THREE.Vector3()
const look = new THREE.Vector3()

export function DiscFreighter() {
  useLang()
  const group = useRef<THREE.Group>(null!)
  const label = useRef<HTMLSpanElement>(null)
  useHideBehindSun(label, group)
  const size = 140 * UNITS_PER_METER
  const moved = useSite(group, {
    id: FREIGHTER_ID,
    radius: size,
    zoom: { start: size * 14, full: size * 5 },
    notice: { distance: size * 8, text: SPACE_TEXT.freighterFound },
  })
  const parts = useMemo(() => {
    // レンズ形：縁が薄く、真ん中がふくらむ（下 → 縁 → 上）
    const profile = [
      [0, -32], [40, -30], [80, -22], [110, -12], [125, -2], [125, 2], [110, 12], [80, 22], [40, 30], [0, 33],
    ].map(([r, y]) => new THREE.Vector2(r, y))
    return {
      body: new THREE.LatheGeometry(profile, 64),
      hull: new THREE.MeshStandardMaterial({ color: '#c9c3b6', metalness: 0.4, roughness: 0.5, flatShading: true }),
      dome: new THREE.SphereGeometry(26, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      glass: new THREE.MeshStandardMaterial({ color: '#4fa3c0', metalness: 0.8, roughness: 0.1, emissive: '#16485a', emissiveIntensity: 0.8 }),
      pod: new THREE.BoxGeometry(34, 26, 34),
      podMat: new THREE.MeshStandardMaterial({ color: '#b5683a', metalness: 0.3, roughness: 0.6 }),
      rim: new THREE.TorusGeometry(125, 3, 6, 64, Math.PI * 0.6),
      glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.6, 2.6), toneMapped: false }),
      lamp: new THREE.SphereGeometry(5, 8, 8),
      white: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.6, 2.4), toneMapped: false }),
    }
  }, [])

  const state = useRef({ t: 0 })
  useFrame((_, rawDelta) => {
    const m = bodies.get('moon')
    // コロニーがなければ、地球
    const c = bodies.get('colony') ?? bodies.get('earth')
    if (!m || !c) return
    m.object.getWorldPosition(moon)
    c.object.getWorldPosition(colony)
    dir.copy(colony).sub(moon).normalize()
    from.copy(moon).addScaledVector(dir, m.radius + STOP_MOON)
    to.copy(colony).addScaledVector(dir, -STOP_COLONY)
    // 行き → 止まる → 帰り → 止まる をくり返す
    const s = state.current
    s.t = (s.t + Math.min(rawDelta, 0.1)) % (2 * (TRIP + DWELL))
    const t = s.t
    const going = t < TRIP + DWELL
    const k = going ? ease(Math.min(1, t / TRIP)) : 1 - ease(Math.min(1, (t - TRIP - DWELL) / TRIP))
    const g = group.current
    g.position.lerpVectors(from, to, k).y += 0.08
    // 進む向きへ前（-Z）を向ける
    g.lookAt(look.copy(g.position).addScaledVector(dir, going ? -1 : 1))
    moved()
  })

  return (
    <group ref={group}>
      <group scale={UNITS_PER_METER}>
        <mesh geometry={parts.body} material={parts.hull} castShadow receiveShadow />
        <mesh geometry={parts.dome} material={parts.glass} position={[0, 30, 0]} />
        {Array.from({ length: 8 }, (_, k) => {
          const a = (k / 8) * Math.PI * 2
          return <mesh key={k} geometry={parts.pod} material={parts.podMat} position={[Math.cos(a) * 62, -40, Math.sin(a) * 62]} rotation={[0, -a, 0]} />
        })}
        {/* 後ろの縁のエンジンの光（+Z が後ろ） */}
        <mesh geometry={parts.rim} material={parts.glow} rotation={[Math.PI / 2, 0, Math.PI * 0.2]} />
        <mesh geometry={parts.lamp} material={parts.white} position={[0, 0, -126]} />
      </group>
      <Html position={[0, size * 1.8, 0]} center className="label" zIndexRange={LABEL_Z}>
        <span ref={label} onClick={() => useStore.getState().setTarget(FREIGHTER_ID)}>
          {freighterName()}
        </span>
      </Html>
    </group>
  )
}
