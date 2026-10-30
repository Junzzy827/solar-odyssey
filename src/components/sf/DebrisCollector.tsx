import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { beamSweeps, bodies, type BeamSweep } from '../../state/registry'
import { useStore } from '../../state/store'
import { DEBRIS_ID, SF_TEXT, debrisName } from '../../data/sf'
import { useLang } from '../../i18n/lang'
import { LABEL_Z, useHideBehindSun } from '../labels'
import { useSite } from './useSite'

// 宇宙ごみの回収船（オリジナルのデザイン）。地球の低い軌道を回りながら、前から近づくごみを
// 腕の先の網で1つずつつかまえる。まわりの低い軌道には、たくさんのごみが点で散らばっている。
// 低い軌道では接近ズームで自機が小さくなるので、それに合わせた縮尺で作る（形は m で決める）。

/** そばでの自機の縮め方。この倍率で、1m が UNITS_PER_METER_HERE 表示単位 */
const ZOOM = 40
const UNITS_PER_METER_HERE = 0.3 / ZOOM / 640
/** 見やすいよう、回収船とごみは本物の想定の約3倍で描く */
const DRAW = 3
/** 地球の中心からの軌道の半径（地球の半径は 1.2。ハッブルは 1.85） */
const ORBIT = 1.5
/** 軌道の傾き */
const INCLINATION = 0.9
/** 1周の秒数（見やすい速さ） */
const PERIOD = 240
/** ごみ1つを網に入れるまでの秒数 */
const CATCH_SECONDS = 14
/** 軌道のまわりに散らばるごみの点の数 */
const CLOUD = 1800
/** 壊したごみが軌道に戻るまでの秒数 */
const JUNK_RESPAWN = 40

const rng = (seed: number) => {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

const earth = new THREE.Vector3()
const X = new THREE.Vector3(1, 0, 0)
const pos = new THREE.Vector3()
const ahead = new THREE.Vector3()

function makeParts() {
  return {
    body: new THREE.BoxGeometry(26, 18, 46),
    stripe: new THREE.BoxGeometry(26.4, 4, 20),
    panel: new THREE.BoxGeometry(60, 1, 22),
    arm: new THREE.CylinderGeometry(1.4, 1.4, 1, 8),
    joint: new THREE.SphereGeometry(3, 10, 8),
    net: new THREE.ConeGeometry(16, 26, 16, 3, true),
    nozzle: new THREE.CylinderGeometry(3, 5, 7, 12, 1, true),
    glow: new THREE.SphereGeometry(3.5, 8, 8),
    light: new THREE.SphereGeometry(1.2, 6, 6),
    metal: new THREE.MeshStandardMaterial({ color: '#d8dade', metalness: 0.4, roughness: 0.45, emissive: '#30333a', emissiveIntensity: 0.5 }),
    yellow: new THREE.MeshStandardMaterial({ color: '#f0b429', metalness: 0.2, roughness: 0.5, emissive: '#5a3f08', emissiveIntensity: 0.5 }),
    solar: new THREE.MeshStandardMaterial({ color: '#1d2b4a', metalness: 0.4, roughness: 0.3, emissive: '#0c1630', emissiveIntensity: 0.6 }),
    netMat: new THREE.MeshBasicMaterial({ color: '#9fe0ff', wireframe: true, transparent: true, opacity: 0.75 }),
    glowMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.2, 2.6), toneMapped: false }),
    lightMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.4, 1.8), toneMapped: false }),
    // つかまえに行くごみ：古いロケットの上段、こわれた太陽電池板、小さな破片
    stage: new THREE.CylinderGeometry(4, 4, 14, 12),
    shard: new THREE.BoxGeometry(6, 1, 4),
    chunk: new THREE.DodecahedronGeometry(2.5),
    junk: new THREE.MeshStandardMaterial({ color: '#8d8a84', metalness: 0.5, roughness: 0.6, emissive: '#26241f', emissiveIntensity: 0.6 }),
  }
}

/** 回収船の形（m。前は -Z。腕の先の網は前を向く） */
function Tug({ parts }: { parts: ReturnType<typeof makeParts> }) {
  return (
    <group>
      <mesh geometry={parts.body} material={parts.metal} />
      <mesh geometry={parts.stripe} material={parts.yellow} position={[0, 0, -8]} />
      <mesh geometry={parts.panel} material={parts.solar} position={[-45, 0, 6]} />
      <mesh geometry={parts.panel} material={parts.solar} position={[45, 0, 6]} />
      {/* 腕：肩から斜め前へ、ひじで折れて網へ */}
      <mesh geometry={parts.joint} material={parts.yellow} position={[0, 9, -20]} />
      <mesh geometry={parts.arm} material={parts.metal} position={[0, 18, -38]} rotation={[-1.1, 0, 0]} scale={[1, 40, 1]} />
      <mesh geometry={parts.joint} material={parts.yellow} position={[0, 27, -56]} />
      <mesh geometry={parts.arm} material={parts.metal} position={[0, 18, -78]} rotation={[-2.0, 0, 0]} scale={[1, 46, 1]} />
      <mesh geometry={parts.net} material={parts.netMat} position={[0, 8, -104]} rotation={[-Math.PI / 2, 0, 0]} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh geometry={parts.nozzle} material={parts.metal} position={[s * 7, 0, 26]} rotation={[Math.PI / 2, 0, 0]} />
          <mesh geometry={parts.glow} material={parts.glowMat} position={[s * 7, 0, 30]} />
        </group>
      ))}
      <mesh geometry={parts.light} material={parts.lightMat} position={[0, 10, -23]} />
    </group>
  )
}

/** 宇宙ごみの回収船と、低い軌道に散らばるごみ */
export function DebrisCollector() {
  useLang()
  const group = useRef<THREE.Group>(null!)
  const label = useRef<HTMLSpanElement>(null)
  useHideBehindSun(label, group)
  const size = 120 * DRAW * UNITS_PER_METER_HERE
  const moved = useSite(group, {
    id: DEBRIS_ID,
    radius: size,
    zoom: { start: size * 60, full: size * 15, factor: ZOOM },
    notice: { distance: size * 40, text: SF_TEXT.debrisFound },
  })
  const parts = useMemo(makeParts, [])
  const target = useRef<THREE.Group>(null!)
  const targetMeshes = useRef<THREE.Mesh[]>([])

  // まわりの低い軌道のごみ（点）。軌道の半径と傾きを少しずつ散らす
  const cloud = useMemo(() => {
    const rand = rng(41)
    const elements = Array.from({ length: CLOUD }, () => ({
      r: 1.38 + rand() * 0.42,
      incl: (rand() - 0.5) * 2.2,
      node: rand() * Math.PI * 2,
      phase: rand() * Math.PI * 2,
    }))
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CLOUD * 3), 3))
    const material = new THREE.PointsMaterial({ color: '#b9b4aa', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false })
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    // チャージビームで壊したごみ：壊した時刻（しばらくすると、また軌道に戻る）
    const dead = new Float32Array(CLOUD).fill(-1)
    return { elements, points, dead }
  }, [])

  // チャージビームで、ビームの通り道のごみを壊す
  useEffect(() => {
    const p = new THREE.Vector3()
    const sweep: BeamSweep = (from, dir, length, radius, spread, hit) => {
      const arr = cloud.points.geometry.getAttribute('position').array as Float32Array
      for (let i = 0; i < CLOUD; i++) {
        if (cloud.dead[i] >= 0) continue
        p.fromArray(arr, i * 3).sub(from)
        const along = p.dot(dir)
        if (along < 0 || along > length) continue
        const reach = radius * 3 + along * spread
        if (p.lengthSq() - along * along > reach * reach) continue
        cloud.dead[i] = clock.current
        hit(p.fromArray(arr, i * 3), radius * 1.5)
      }
    }
    beamSweeps.add(sweep)
    return () => void beamSweeps.delete(sweep)
  }, [cloud])
  useEffect(
    () => () => {
      cloud.points.geometry.dispose()
      ;(cloud.points.material as THREE.Material).dispose()
    },
    [cloud],
  )

  const clock = useRef(0)
  useFrame((_, rawDelta) => {
    const e = bodies.get('earth')
    if (!e) return
    // 時間を止めたら回収船とごみも止まる
    if (useStore.getState().timeScale > 0) clock.current += Math.min(rawDelta, 0.05)
    const t = clock.current
    e.object.getWorldPosition(earth)

    // 回収船：傾いた円軌道。進む向きを前（-Z）にする
    const a = (t / PERIOD) * Math.PI * 2
    pos.set(Math.cos(a) * ORBIT, 0, -Math.sin(a) * ORBIT).applyAxisAngle(X, INCLINATION)
    ahead.set(Math.cos(a + 0.01) * ORBIT, 0, -Math.sin(a + 0.01) * ORBIT).applyAxisAngle(X, INCLINATION)
    const g = group.current
    g.position.copy(earth).add(pos)
    ahead.add(earth)
    g.up.copy(pos).normalize()
    g.lookAt(ahead)
    g.rotateY(Math.PI) // lookAt は +Z を向けるので、前（-Z）を進む向きに
    moved()

    // つかまえに行くごみ：前方の遠くから網へ近づき、網に入ると小さくなって消える。次のごみに替わる
    const k = (t % CATCH_SECONDS) / CATCH_SECONDS
    const round = Math.floor(t / CATCH_SECONDS)
    targetMeshes.current.forEach((m, i) => (m.visible = i === round % 3))
    const z = THREE.MathUtils.lerp(-1400, -110, Math.min(1, k / 0.8))
    const shrink = k < 0.8 ? 1 : Math.max(0, 1 - (k - 0.8) / 0.12)
    target.current.position.set(Math.sin(round) * 40 * (1 - k), 8 + Math.cos(round) * 25 * (1 - k), z)
    target.current.scale.setScalar(shrink)
    target.current.rotation.set(t * 0.4, t * 0.25, t * 0.15)

    // 散らばるごみ（遠くからは地球のまわりのかすみに見える）。低いものほど速く回る
    const attr = cloud.points.geometry.getAttribute('position') as THREE.BufferAttribute
    const arr = attr.array as Float32Array
    cloud.elements.forEach((el, i) => {
      // 壊れたごみは地球の中に隠しておき、時間がたったら戻す
      if (cloud.dead[i] >= 0) {
        if (t - cloud.dead[i] < JUNK_RESPAWN && t >= cloud.dead[i]) {
          arr[i * 3] = earth.x
          arr[i * 3 + 1] = earth.y
          arr[i * 3 + 2] = earth.z
          return
        }
        cloud.dead[i] = -1
      }
      const b = el.phase + (t / PERIOD) * Math.PI * 2 * (ORBIT / el.r) ** 1.5
      const x = Math.cos(b) * el.r
      const zz = -Math.sin(b) * el.r
      // 傾き（x 軸まわり）と、昇交点の向き（y 軸まわり）
      const y1 = -zz * Math.sin(el.incl)
      const z1 = zz * Math.cos(el.incl)
      arr[i * 3] = earth.x + x * Math.cos(el.node) + z1 * Math.sin(el.node)
      arr[i * 3 + 1] = earth.y + y1
      arr[i * 3 + 2] = earth.z - x * Math.sin(el.node) + z1 * Math.cos(el.node)
    })
    attr.needsUpdate = true
  })

  return (
    <>
      <primitive object={cloud.points} />
      <group ref={group}>
        <group scale={UNITS_PER_METER_HERE * DRAW}>
          <Tug parts={parts} />
          <group ref={target}>
            {[parts.stage, parts.shard, parts.chunk].map((geo, i) => (
              <mesh
                key={i}
                ref={(m: THREE.Mesh | null) => {
                  if (m) targetMeshes.current[i] = m
                }}
                geometry={geo}
                material={parts.junk}
              />
            ))}
          </group>
        </group>
        <Html position={[0, size * 1.5, 0]} center className="label" zIndexRange={LABEL_Z}>
          <span ref={label} onClick={() => useStore.getState().setTarget(DEBRIS_ID)}>
            {debrisName()}
          </span>
        </Html>
      </group>
    </>
  )
}
