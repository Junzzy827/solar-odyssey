import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { haloTexture } from './ShipModel'
import { useSpaceEnvOn } from '../SpaceLighting'
import { CATAPULT_END, FLY_END, READY_AT, STANDBY, launchFx, launchLander, launchNow, resetLaunch, useLaunch } from '../../state/launch'

// アルカディアの発進路（2 本の舳先のあいだ）にとめてある着陸船と、それを送り出す演出。
// 位置はアルカディアの模型の座標。Blender のメートル (x, y, z) は three.js の (x, z, -y) × AS
// （tools/blender/build_arcadia.py の launch_deck()：床の上面は z = -13 m、誘導灯は x = ±7.2 m、y = 170〜510 m）

const AS = 1.04 / 1252
const LANDER_M = 24 // 着陸船の全長（m）。glb の 1 = 24 m
const DECK_Z = -13
const START_Y = 190
const BOW_Y = 640
const LIGHT_YS = Array.from({ length: 25 }, (_, i) => 170 + i * 14)
/** 着陸船の 3 つの噴射口（着陸船の glb の座標。後ろが +Z） */
const LANDER_NOZZLES: [number, number, number][] = [
  [-0.21, 0.157, 0.4],
  [0.21, 0.157, 0.4],
  [0, 0.17, 0.5],
]
const TRAIL = 40

const url = (file: string) => `${import.meta.env.BASE_URL}models/${file}`
const ease = (u: number) => u * u * (3 - 2 * u)

/** 発進の時刻 T（秒）での、着陸船の位置（メートル、Blender の向き）と、機首の上下・左右の傾き */
function flightPath(T: number) {
  if (T < STANDBY) {
    // エンジンを温めて、床から少し浮く
    return { x: 0, y: START_Y, z: DECK_Z + 1.2 * ease(Math.min(1, T / STANDBY)), pitch: 0, yaw: 0, bank: 0, throttle: 0.25 + 0.35 * (T / STANDBY) }
  }
  const run = BOW_Y - START_Y
  const dur = CATAPULT_END - STANDBY
  if (T < CATAPULT_END) {
    const u = (T - STANDBY) / dur
    return { x: 0, y: START_Y + run * u * u, z: DECK_Z + 1.2, pitch: 0, yaw: 0, bank: 0, throttle: 1 }
  }
  // 舳先を出たら、そのままの速さに自分のエンジンの加速を足して、少し上へ、右へ曲がりながら離れていく
  const v0 = (2 * run) / dur
  const s = T - CATAPULT_END
  const y = BOW_Y + v0 * s + 0.5 * 120 * s * s
  const z = DECK_Z + 1.2 + 0.5 * 9 * s * s
  const x = 0.5 * 7 * s * s
  const vy = v0 + 120 * s
  return { x, y, z, pitch: Math.atan2(9 * s, vy), yaw: -Math.atan2(7 * s, vy), bank: -Math.min(0.5, 0.18 * s), throttle: 1 }
}

export function LanderLaunch() {
  const { scene } = useGLTF(url('ship-lander.glb'))
  const lander = useRef<THREE.Group>(null)
  const start = useLaunch((l) => l.start)

  const built = useMemo(() => {
    const model = scene.clone(true)
    const lit: THREE.MeshStandardMaterial[] = []
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.75, 2), toneMapped: false })
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const src = mesh.material as THREE.MeshStandardMaterial
      if (src.name === 'Glow') mesh.material = glow
      else if (src.name === 'NavRed') mesh.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 0.04, 0.04), toneMapped: false })
      else if (src.name === 'NavGreen') mesh.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.04, 1.3, 0.15), toneMapped: false })
      else {
        const m = src.clone()
        m.emissive.setRGB(1, 1, 1)
        m.emissiveIntensity = 1
        lit.push(m)
        mesh.material = m
      }
    })
    // 噴射の光（3 つ）と、通ったあとに残る光の粒
    const halo = haloTexture()
    const flame = new THREE.SpriteMaterial({ map: halo, color: new THREE.Color(0.9, 1.3, 2.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    const flames = LANDER_NOZZLES.map((p) => {
      const sp = new THREE.Sprite(flame)
      sp.position.set(p[0], p[1], p[2] + 0.05)
      model.add(sp)
      return sp
    })
    const trailMat = new THREE.SpriteMaterial({ map: halo, color: new THREE.Color(0.5, 0.8, 2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    const trail = Array.from({ length: TRAIL }, () => {
      const sp = new THREE.Sprite(trailMat.clone())
      sp.visible = false
      return sp
    })
    // 発進路の誘導灯の上に重ねる光（前へ流れる）
    const deckMat = new THREE.SpriteMaterial({ map: halo, color: new THREE.Color(0.4, 0.9, 2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    const deck = LIGHT_YS.flatMap((y) =>
      [-7.2, 7.2].map((x) => {
        const sp = new THREE.Sprite(deckMat.clone())
        sp.position.set(x * AS, (DECK_Z - 0.2) * AS, -y * AS)
        sp.scale.setScalar(0)
        return { sp, y }
      }),
    )
    return { model, lit, glow, flame, flames, trail, deck }
  }, [scene])
  useSpaceEnvOn(built.lit)

  useEffect(
    () => () => {
      built.lit.forEach((m) => m.dispose())
      built.glow.dispose()
      built.flame.dispose()
      built.trail.forEach((s) => s.material.dispose())
      built.deck.forEach((d) => d.sp.material.dispose())
      resetLaunch()
      launchFx.camera = 0
    },
    [built],
  )

  // L キーで発進（物語モードの探査艇の場面では、そちらが L キーを使う）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyL' || e.repeat) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      launchLander()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const trailHead = useRef(0)
  const trailClock = useRef(0)
  const v = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, dt) => {
    const g = lander.current
    if (!g) return
    const T = start === null ? -1 : launchNow() - start
    const scale = LANDER_M * AS
    let throttle = 0.12
    if (T < 0 || T >= READY_AT) {
      // 待機：発進路にとめてある
      g.position.set(0, DECK_Z * AS, -START_Y * AS)
      g.rotation.set(0, 0, 0, 'YXZ')
      g.visible = true
      g.scale.setScalar(scale)
    } else if (T < FLY_END) {
      const p = flightPath(T)
      g.visible = true
      g.position.set(p.x * AS, p.z * AS, -p.y * AS)
      // glb の原点は足の裏。機首（-Z）を進む向きへ：左右に曲げて、機首を上げて、翼を傾ける
      g.rotation.set(p.pitch, p.yaw, p.bank, 'YXZ')
      throttle = p.throttle
      // 遠くへ行ったら小さく消えていく
      const fade = Math.min(1, Math.max(0, (FLY_END - T) / 1.5))
      g.scale.setScalar(scale * (0.3 + 0.7 * fade))
    } else {
      // 次の着陸船が下の格納庫から上がってくる
      const u = (T - FLY_END) / (READY_AT - FLY_END)
      g.visible = u > 0.05
      g.position.set(0, (DECK_Z - 14 * (1 - ease(u))) * AS, -START_Y * AS)
      g.rotation.set(0, 0, 0, 'YXZ')
      g.scale.setScalar(scale)
    }
    // 発進カメラ：発進準備から飛び去るまで（終わりぎわに追いかけカメラへもどす）
    launchFx.camera = T < 0 || T >= FLY_END ? 0 : Math.min(1, T / 0.6, (FLY_END - 1 - T) / 1.2)
    launchFx.camera = Math.max(0, launchFx.camera)
    g.getWorldPosition(launchFx.pos)
    // 噴射の光：大きさは着陸船の座標（1 = 24 m）で
    const flicker = 0.9 + 0.1 * Math.sin(launchNow() * 37)
    const far = T > CATAPULT_END ? 1 + Math.min(2, (T - CATAPULT_END) * 0.6) : 1
    built.flames.forEach((f, i) => f.scale.setScalar((i === 2 ? 0.5 : 0.38) * (0.4 + 1.6 * throttle) * flicker * far))
    built.flame.opacity = Math.min(1, 0.35 + throttle)

    // 光の粒の尾：飛んでいる間、一定の間隔で今の位置に置き、だんだん薄く小さく
    trailClock.current += dt
    const flying = T >= STANDBY && T < FLY_END
    if (flying && trailClock.current > 0.03) {
      trailClock.current = 0
      const sp = built.trail[trailHead.current % TRAIL]
      trailHead.current++
      v.set(0, 0.16, 0.55).applyEuler(g.rotation).multiplyScalar(g.scale.x).add(g.position)
      sp.position.copy(v)
      sp.visible = true
      sp.userData.age = 0
    }
    built.trail.forEach((sp) => {
      if (!sp.visible) return
      sp.userData.age += dt
      const a = sp.userData.age as number
      const life = 1.2
      if (a > life) {
        sp.visible = false
        return
      }
      sp.material.opacity = 0.8 * (1 - a / life)
      sp.scale.setScalar(scale * (0.35 + 0.8 * a))
    })

    // 誘導灯：発進準備からカタパルトの間、光の帯が後ろから前へ何度も流れる
    const chase = T >= 0 && T < CATAPULT_END + 0.3
    built.deck.forEach(({ sp, y }) => {
      if (!chase) {
        sp.scale.setScalar(0)
        return
      }
      const phase = (y - 170) / 340
      const wave = (T * 1.4) % 1
      const d = Math.abs(phase - wave)
      const k = Math.exp(-(d * d) / 0.006) + 0.25
      sp.material.opacity = Math.min(1, k)
      sp.scale.setScalar(9 * AS * (0.6 + k))
    })
  })

  return (
    <group>
      <group ref={lander}>
        <primitive object={built.model} />
      </group>
      {built.trail.map((sp, i) => (
        <primitive key={`t${i}`} object={sp} />
      ))}
      {built.deck.map((d, i) => (
        <primitive key={`d${i}`} object={d.sp} />
      ))}
    </group>
  )
}
