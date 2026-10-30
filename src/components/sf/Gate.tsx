import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { mouthMaterial } from './lensShader'
import { useSite } from './useSite'
import { ship, engage } from '../../state/flight'
import { useStore } from '../../state/store'
import { useLayout } from '../../state/useLayout'
import { textureUrl } from '../../data/textures'
import { useOptionalTexture } from '../../hooks/useOptionalTexture'
import { BLACK_HOLE_ID, GATE_ANGLE, GATE_AU, GATE_ID, SF_SPACE_TEXT, sfEntry } from '../../data/sf'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'

/** ゲートの輪の半径と、口（向こう側が見える球）の半径（表示単位。自機の長さは約0.3） */
export const GATE_RING = 1.6
const MOUTH = 1.05

/**
 * 時空のゲートの形（オリジナル）：3つの弧に分かれた輪と、それをつなぐ3つの支え。
 * 内側に青紫に光る細い輪。真ん中の口には、向こう側の空がゆがんで見える
 */
export function GateModel() {
  const sky = useOptionalTexture(textureUrl('milkyWay'))
  const ring = useRef<THREE.Group>(null!)
  const parts = useMemo(
    () => ({
      arc: new THREE.TorusGeometry(GATE_RING, 0.11, 12, 48, (Math.PI * 2) / 3 - 0.32),
      node: new THREE.BoxGeometry(0.42, 0.42, 0.5),
      glow: new THREE.TorusGeometry(GATE_RING - 0.16, 0.025, 8, 128),
      mouth: new THREE.SphereGeometry(MOUTH, 64, 48),
      light: new THREE.SphereGeometry(0.035, 8, 8),
      hull: new THREE.MeshStandardMaterial({ color: '#5d5a6e', metalness: 0.75, roughness: 0.35, emissive: '#2a2440', emissiveIntensity: 0.6 }),
      glowMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.75, 2.6), toneMapped: false }),
      lightMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 0.6), toneMapped: false }),
      mouthMat: mouthMaterial(),
    }),
    [],
  )
  useEffect(() => {
    parts.mouthMat.uniforms.uSky.value = sky
    parts.mouthMat.uniforms.uHasSky.value = sky ? 1 : 0
  }, [sky, parts])
  const mouth = useRef<THREE.Mesh>(null!)
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    ring.current.rotation.z = t * 0.06
    parts.mouthMat.uniforms.uTime.value = t
    mouth.current.getWorldPosition(parts.mouthMat.uniforms.uCenter.value)
    const k = 0.8 + 0.2 * Math.sin(t * 1.3)
    parts.glowMat.color.setRGB(0.9 * k, 0.75 * k, 2.6 * k)
  })
  return (
    <group>
      <group ref={ring}>
        {[0, 1, 2].map((i) => {
          const a = (i * Math.PI * 2) / 3
          return (
            <group key={i} rotation={[0, 0, a]}>
              <mesh geometry={parts.arc} material={parts.hull} rotation={[0, 0, 0.16]} />
              <mesh geometry={parts.node} material={parts.hull} position={[GATE_RING, 0, 0]} />
              <mesh geometry={parts.light} material={parts.lightMat} position={[GATE_RING + 0.24, 0, 0]} />
            </group>
          )
        })}
        <mesh geometry={parts.glow} material={parts.glowMat} />
      </group>
      <mesh ref={mouth} geometry={parts.mouth} material={parts.mouthMat} />
    </group>
  )
}

/** くぐったか：輪の中心のそばを通ったら、行き先へワープする */
export function useGateTrigger(group: React.RefObject<THREE.Group>, destination: string) {
  const armed = useRef(true)
  const at = new THREE.Vector3()
  useFrame(() => {
    const st = useStore.getState()
    if (st.mode !== 'flight' || st.warpPhase !== 'idle' || !group.current) return
    const d = ship.position.distanceTo(group.current.getWorldPosition(at))
    if (d > GATE_RING * 3) armed.current = true
    if (armed.current && d < MOUTH * 1.1) {
      armed.current = false
      st.setTarget(destination)
      st.showToast(SF_SPACE_TEXT.through())
      engage()
    }
  })
}

/** 海王星の外に浮かぶ、時空のゲート（太陽系の側） */
export function Gate() {
  useLang()
  const group = useRef<THREE.Group>(null!)
  const label = useRef<HTMLSpanElement>(null)
  const layout = useLayout()
  useHideBehindSun(label, group)
  const moved = useSite(group, { id: GATE_ID, radius: GATE_RING, notice: { distance: 8, text: SF_SPACE_TEXT.gateFound } })
  useGateTrigger(group, BLACK_HOLE_ID)
  useFrame(() => {
    const r = layout.au(GATE_AU)
    group.current.position.set(Math.cos(GATE_ANGLE) * r, 2, Math.sin(GATE_ANGLE) * r)
    // 輪の面を太陽の方へ向ける（太陽系の内側から来ると、正面から入れる）
    group.current.lookAt(0, 2, 0)
    moved()
  })
  return (
    <group ref={group}>
      <GateModel />
      <Html position={[0, GATE_RING + 0.6, 0]} center className="label" zIndexRange={LABEL_Z}>
        <span ref={label} onClick={() => useStore.getState().setTarget(GATE_ID)}>
          {sfEntry(GATE_ID)?.name()}
        </span>
      </Html>
    </group>
  )
}
