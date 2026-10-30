import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { lensMaterial } from './lensShader'
import { GateModel, GATE_RING, useGateTrigger } from './Gate'
import { useSite } from './useSite'
import { ship } from '../../state/flight'
import { colliders } from '../../state/registry'
import { useStore } from '../../state/store'
import { textureUrl } from '../../data/textures'
import { useOptionalTexture } from '../../hooks/useOptionalTexture'
import { BH_DISK, BH_LENS, BH_RS, BLACK_HOLE_ID, BLACK_HOLE_POS, GATE_ID, SF_SPACE_TEXT, sfEntry } from '../../data/sf'
import { t, useLang } from '../../i18n/lang'
import { LABEL_Z } from '../labels'

/** 円盤の面を、太陽系の側から見て少し上から見下ろすよう傾ける（ラジアン） */
const TILT = 0.12
/** 帰りのゲートの位置（ブラックホールの中心から。着いたところから見える横） */
const RETURN_GATE: [number, number, number] = [26, 5, 72]
/** これ以上は近づけない距離（事象の地平面の何倍か） */
const LIMIT = 3.6

const center = new THREE.Vector3(...BLACK_HOLE_POS)
const FAR_DRAW = 4000
const rel = new THREE.Vector3()

/**
 * 太陽系からずっと離れた場所にある、回転するブラックホール。
 * 大きな球の内側に、光の曲がりを計算するシェーダーを貼る（球の外は、ふつうの星空のまま）
 */
export function BlackHole() {
  useLang()
  const group = useRef<THREE.Group>(null!)
  const back = useRef<THREE.Group>(null!)
  const lens = useRef<THREE.Mesh>(null!)
  const labels = useRef<HTMLSpanElement[]>([])
  const labelRef = (el: HTMLSpanElement | null) => {
    if (el && !labels.current.includes(el)) labels.current.push(el)
  }
  const sky = useOptionalTexture(textureUrl('milkyWay'))
  const material = useMemo(() => {
    const m = lensMaterial()
    m.uniforms.uCenter.value.copy(center)
    m.uniforms.uRs.value = BH_RS
    m.uniforms.uLens.value = BH_LENS
    m.uniforms.uInner.value = BH_DISK.inner
    m.uniforms.uOuter.value = BH_DISK.outer
    // 世界の向き → ブラックホールの向き（円盤の面が XZ）。X のまわりに TILT だけ傾けた向きの逆
    const toWorld = new THREE.Matrix4().makeRotationX(TILT)
    m.uniforms.uToLocal.value.setFromMatrix4(toWorld).transpose()
    return m
  }, [])
  const geometry = useMemo(() => new THREE.SphereGeometry(BH_RS * BH_LENS, 64, 48), [])
  useEffect(() => {
    material.uniforms.uSky.value = sky
    material.uniforms.uHasSky.value = sky ? 1 : 0
  }, [sky, material])
  useEffect(
    () => () => {
      material.dispose()
      geometry.dispose()
    },
    [material, geometry],
  )

  const moved = useSite(group, { id: BLACK_HOLE_ID, radius: BH_RS * BH_DISK.outer, notice: { distance: BH_RS * BH_LENS, text: SF_SPACE_TEXT.arrived } })
  useGateTrigger(back, GATE_ID)

  // 事象の地平面に近づきすぎないよう、押しもどす
  useEffect(() => {
    let warned = 0
    const collide = () => {
      rel.copy(ship.position).sub(center)
      const min = BH_RS * LIMIT
      if (rel.length() >= min) return
      ship.position.copy(center).add(rel.setLength(min))
      const into = ship.velocity.dot(rel.normalize())
      if (into < 0) ship.velocity.addScaledVector(rel, -into)
      if (performance.now() - warned > 15000) {
        warned = performance.now()
        useStore.getState().showToast(SF_SPACE_TEXT.tooClose())
      }
    }
    colliders.add(collide)
    return () => {
      colliders.delete(collide)
    }
  }, [])

  useFrame(({ clock, camera }) => {
    material.uniforms.uTime.value = clock.getElapsedTime()
    // 光の道すじを画面の点ごとにたどる重い描き方なので、近くにいるときだけ描く（遠くでは点にもならない）
    lens.current.visible = camera.position.distanceTo(center) < FAR_DRAW
    moved()
    // 名札は、ブラックホールのそばにいるときだけ（太陽系から見ると、遠い方向に名札だけが浮いてしまう）
    const show = ship.position.distanceTo(center) < BH_RS * BH_LENS * 3 ? '' : 'none'
    labels.current.forEach((el) => (el.style.display = show))
  })

  return (
    <>
      <group ref={group} position={BLACK_HOLE_POS}>
        <mesh ref={lens} geometry={geometry} material={material} renderOrder={1} frustumCulled={false} />
        <Html position={[0, BH_RS * 9, 0]} center className="label" zIndexRange={LABEL_Z}>
          <span ref={labelRef} onClick={() => useStore.getState().setTarget(BLACK_HOLE_ID)}>{sfEntry(BLACK_HOLE_ID)?.name()}</span>
        </Html>
      </group>
      {/* 帰りのゲート：くぐると太陽系の側のゲートへもどる */}
      <group ref={back} position={[BLACK_HOLE_POS[0] + RETURN_GATE[0], BLACK_HOLE_POS[1] + RETURN_GATE[1], BLACK_HOLE_POS[2] + RETURN_GATE[2]]} rotation={[0, -0.6, 0]}>
        <GateModel />
        <Html position={[0, GATE_RING + 0.6, 0]} center className="label" zIndexRange={LABEL_Z}>
          <span ref={labelRef}>{t('帰りのゲート', 'Gate home')}</span>
        </Html>
      </group>
    </>
  )
}
