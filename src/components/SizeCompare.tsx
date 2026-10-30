import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { PLANETS, SUN } from '../data/bodies'
import { radiusKm } from '../data/approach'
import { textureUrl } from '../data/textures'
import { useOptionalTexture } from '../hooks/useOptionalTexture'
import { named, t, useLang } from '../i18n/lang'
import { compareWith, useCompare } from '../state/compare'
import { nearRange } from '../state/proximity'
import { ship } from '../state/flight'
import { bodies } from '../state/registry'
import { useStore } from '../state/store'
import { LABEL_Z } from './labels'

// 大きさくらべ：近くの天体の横（画面の左側。右は航法コンピュータの陰になる）に、本当の大きさの比で地球などを並べる。
// 表示の惑星は大きさを縮めて並べているので、ここだけは本物の比で見せる

const ALL = [{ id: 'sun', ...SUN }, ...PLANETS, ...PLANETS.flatMap((p) => p.moons)]
const nameOf = (id: string) => {
  const b = ALL.find((x) => x.id === id)
  return b ? named(b) : id
}

const center = new THREE.Vector3()
const right = new THREE.Vector3()
const toCam = new THREE.Vector3()

function Ghost({ id, index, baseId }: { id: string; index: number; baseId: string }) {
  const group = useRef<THREE.Group>(null!)
  const sphere = useRef<THREE.Mesh>(null!)
  const ring = useRef<THREE.Mesh>(null!)
  const label = useRef<THREE.Group>(null!)
  const map = useOptionalTexture(textureUrl(id))
  const color = useMemo(() => new THREE.Color(ALL.find((x) => x.id === id)?.color ?? '#ffffff'), [id])
  useLang()

  useFrame(({ camera }) => {
    const near = bodies.get(baseId)
    const km = radiusKm(baseId)
    const own = radiusKm(id)
    const list = compareWith(baseId)
    group.current.visible = !!near && !!km && !!own
    if (!near || !km || !own) return
    // 本当の大きさの比で、表示の半径に合わせる
    const r = near.radius * (own / km)
    near.object.getWorldPosition(center)
    ring.current.scale.setScalar(r)
    ring.current.quaternion.copy(camera.quaternion)
    toCam.set(0, 1, 0).applyQuaternion(camera.quaternion)
    label.current.position.copy(toCam).multiplyScalar(r * 1.15)
    // 近くの天体より大きいものは、同じ中心に輪郭だけを描いて囲む（火星を地球の輪郭で囲む、など）
    const around = own > km
    sphere.current.visible = !around
    if (around) {
      group.current.position.copy(center)
      // 名札は輪の左下（上は画面の外に出やすい）
      right.set(-0.6, -0.8, 0).applyQuaternion(camera.quaternion)
      label.current.position.copy(right).multiplyScalar(r * 1.05)
      return
    }
    // 画面の左へ並べる（天体と同じ奥行きの面の上）
    right.set(-1, 0, 0).applyQuaternion(camera.quaternion)
    let offset = near.radius * 1.15
    for (let i = 0; i < index; i++) {
      const other = radiusKm(list[i]) ?? 0
      if (other <= km) offset += near.radius * (other / km) * 2 + near.radius * 0.12
    }
    offset += r
    group.current.position.copy(center).addScaledVector(right, offset)
    sphere.current.scale.setScalar(r)
  })

  return (
    <group ref={group}>
      <mesh ref={sphere} renderOrder={3}>
        <sphereGeometry args={[1, 64, 48]} />
        <meshBasicMaterial key={map ? 'map' : 'plain'} map={map} color={map ? '#d8d8d8' : color} transparent opacity={0.92} />
      </mesh>
      {/* 輪郭（点線のかわりに細い光る輪） */}
      <mesh ref={ring} renderOrder={4}>
        <ringGeometry args={[1.0, 1.035, 96]} />
        <meshBasicMaterial color="#9fd4ff" transparent opacity={0.8} depthTest={false} />
      </mesh>
      <group ref={label}>
        <Html center className="label compare-label" zIndexRange={LABEL_Z}>
          <span>{t(`${nameOf(id)}（本当の大きさの比）`, `${nameOf(id)} (true size ratio)`)}</span>
        </Html>
      </group>
    </group>
  )
}

/**
 * くらべる天体：目標にしている天体がそばにあればそれ、なければそばにある天体のうちいちばん大きいもの
 * （木星のそばでイオの方が近くても、木星とくらべる）
 */
function baseBody() {
  const target = useStore.getState().targetId
  let best: string | null = null
  let bestKm = 0
  for (const body of bodies.values()) {
    const km = radiusKm(body.id)
    if (!km) continue
    body.object.getWorldPosition(center)
    const altitude = center.distanceTo(ship.position) - body.radius
    if (altitude > nearRange(body.radius)) continue
    if (body.id === target) return body.id
    if (km > bestKm) {
      bestKm = km
      best = body.id
    }
  }
  return best
}

export function SizeCompare() {
  const on = useCompare((s) => s.on)
  const flight = useStore((s) => s.mode === 'flight')
  // そばにいる天体が変わったら、並べる天体を選び直す
  const [nearId, setNearId] = useState<string | null>(null)
  useFrame(() => {
    const id = baseBody()
    if (id !== nearId) setNearId(id)
  })
  if (!on || !flight || !nearId) return null
  return (
    <>
      {compareWith(nearId).map((id, index) => (
        <Ghost key={`${nearId}-${id}`} id={id} index={index} baseId={nearId} />
      ))}
    </>
  )
}
