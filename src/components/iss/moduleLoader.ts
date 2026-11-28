import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { MeshBVH } from 'three-mesh-bvh'
import { ISS_BASE, type Station, type StationModule } from './station'
import type { TexPool, TexWant } from './texManager'
import { buildBvh, type BvhPart, type BvhReply } from './bvhWorker'

// ISS のモジュールを 1 つ読む：形（glb）、材質（色の絵 × 焼いた光。絵は TexPool で部屋どうし共有）、当たり判定（BVH）。
// 部屋は Blender で焼いた光（ライトマップ）× 色の絵だけで描く（MeshBasic、照明の計算なし）。
// 段（tier）：0 = near（いる部屋。大きい絵）、1 = far（となりの部屋。半分の大きさ）

export type Tier = 0 | 1

export type LoadedModule = {
  id: string
  info: StationModule
  root: THREE.Group
  bvh: MeshBVH
  /** キューポラの窓のガラス（窓の外の地球を描く型） */
  windows: THREE.Mesh[]
  /** 自転こぎ（CEVIS）の部品と、その箱 */
  bike: THREE.Object3D | null
  bikeBox: THREE.Box3
  /** 自転こぎのクランク（模型から測った軸の場所・腕の長さ・止まっていた向き）。測れなかったら null */
  bikeCrank: BikeCrank | null
  tier: Tier
  /** 絵が全部そろった（GPU に載った） */
  ready: () => boolean
  setTier: (t: Tier) => void
  dispose: () => void
}

export type BikeCrank = {
  /** 軸の中心（ステーションの座標 m）。軸は X の向き */
  hub: THREE.Vector3
  /** 腕の長さ m */
  radius: number
  /** 右（+X）の腕の、X まわりの角（0 = 真上） */
  angle: number
}

/** 自転こぎの体の半分の幅 m（これより外で軸の近くは、クランクとペダル） */
const CEVIS_HALF_WIDTH = 0.115
/** ペダルの先とみなす、体の中心からの X の離れ m */
const CEVIS_PEDAL_TIP = 0.2

/**
 * 模型の自転こぎ（CEVIS）には、止まったクランクとペダルが形の一部として入っている。回るペダルを
 * 同じ所に足すので、止まった方から軸の場所・腕の長さ・向きを測り、その三角形を消す（二重に見えないように）
 */
function takeStaticCrank(bike: THREE.Object3D, box: THREE.Box3): BikeCrank | null {
  const cx = (box.min.x + box.max.x) / 2
  const meshes: THREE.Mesh[] = []
  bike.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh)
  })
  const v = new THREE.Vector3()
  // 左右のペダルの先の点の平均：2 つは軸をはさんで反対にあるので、まん中が軸
  const tip = [new THREE.Vector3(), new THREE.Vector3()]
  const n = [0, 0]
  for (const m of meshes) {
    const pos = m.geometry.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)
      if (Math.abs(v.x - cx) < CEVIS_PEDAL_TIP) continue
      const k = v.x > cx ? 1 : 0
      tip[k].add(v)
      n[k]++
    }
  }
  if (!n[0] || !n[1]) return null
  const l = tip[0].divideScalar(n[0])
  const r = tip[1].divideScalar(n[1])
  const hub = new THREE.Vector3(cx, (l.y + r.y) / 2, (l.z + r.z) / 2)
  const radius = Math.hypot(r.y - l.y, r.z - l.z) / 2
  if (radius < 0.05 || radius > 0.3) return null
  for (const m of meshes) {
    const g = m.geometry
    const idx = g.index
    if (!idx) continue
    const pos = g.getAttribute('position')
    const out = (i: number) => {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)
      return Math.abs(v.x - cx) > CEVIS_HALF_WIDTH && Math.abs(v.z - hub.z) < 0.1
    }
    const keep: number[] = []
    for (let k = 0; k < idx.count; k += 3) {
      const a = idx.getX(k)
      const b = idx.getX(k + 1)
      const c = idx.getX(k + 2)
      if (!(out(a) && out(b) && out(c))) keep.push(a, b, c)
    }
    if (keep.length < idx.count) g.setIndex(keep)
  }
  return { hub, radius, angle: Math.atan2(r.z - hub.z, r.y - hub.y) }
}

/** 自転こぎ（名前に CEVIS）の、いちばん外の物 */
function findBike(root: THREE.Object3D): THREE.Object3D | null {
  let found: THREE.Object3D | null = null
  root.traverse((o) => {
    if (!found && /CEVIS/i.test(o.name)) found = o
  })
  return found
}

const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
let decoderWorkers = false

// ---- 当たり判定の木を作るワーカー（作れないときは、この場で作る） ----
let worker: Worker | null = null
let workerBroken = false
let nextId = 1
const waiting = new Map<number, (r: BvhReply) => void>()

function bvhWorker(): Worker | null {
  if (workerBroken || typeof Worker === 'undefined') return null
  if (!worker) {
    try {
      worker = new Worker(new URL('./bvhWorker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (e: MessageEvent<BvhReply>) => {
        const cb = waiting.get(e.data.id)
        waiting.delete(e.data.id)
        cb?.(e.data)
      }
      worker.onerror = () => {
        // ワーカーが動かない：待っている分はこの場で作り直す（下の catch）
        workerBroken = true
        for (const cb of waiting.values()) cb({ id: 0, position: new Float32Array(0), roots: [], index: null, error: 'worker failed' })
        waiting.clear()
      }
    } catch {
      workerBroken = true
      return null
    }
  }
  return worker
}

async function makeBvh(parts: BvhPart[]): Promise<MeshBVH> {
  const w = bvhWorker()
  if (w) {
    const id = nextId++
    const reply = await new Promise<BvhReply>((res) => {
      waiting.set(id, res)
      w.postMessage(
        { id, parts },
        parts.map((p) => p.position.buffer as ArrayBuffer),
      )
    })
    if (!reply.error && reply.index) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(reply.position, 3))
      return MeshBVH.deserialize({ roots: reply.roots, index: reply.index }, g, { setIndex: true })
    }
    console.warn('[iss] bvh worker', reply.error ?? 'no index')
  }
  return buildBvh(parts).bvh
}

/** モジュールを読む。絵は TexPool に頼むだけで、そろうのは ready() が true になったとき */
export async function loadModule(station: Station, id: string, pool: TexPool, phone: boolean, tier: Tier): Promise<LoadedModule> {
  const info = station.modules.find((m) => m.id === id)
  if (!info) throw new Error(`unknown module ${id}`)
  if (!decoderWorkers) {
    // meshopt のほどきも別のスレッドで
    decoderWorkers = true
    ;(MeshoptDecoder as unknown as { useWorkers?: (n: number) => void }).useWorkers?.(2)
  }
  const platform = phone ? 'phone' : 'pc'
  const gltf = await gltfLoader.loadAsync(ISS_BASE + info.glb)
  const wants: { w: TexWant; size: (t: Tier) => number }[] = []
  const mats = new Map<string, THREE.Material>()
  const owned: THREE.Material[] = []

  // 焼いた光（この部屋だけの絵）
  const lightMats: THREE.MeshBasicMaterial[] = []
  const lightSize = (t: Tier) => info.light[platform][t]
  wants.push({
    w: pool.want(
      `light:${id}`,
      (s) => `${id}.light.${s}.jpg`,
      lightSize(tier),
      (t) => {
        for (const m of lightMats) {
          if (!m.lightMap) m.needsUpdate = true
          m.lightMap = t
        }
      },
      true,
    ),
    size: lightSize,
  })

  // 窓のガラスの型：色も奥行きも書かず、ステンシルに 1 を書く（IssEarth が、印 1 の所にだけ地球を描く）
  const windowMat = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
    side: THREE.DoubleSide,
  })
  owned.push(windowMat)

  for (const [name, m] of Object.entries(info.materials)) {
    if (m.window) {
      mats.set(name, windowMat)
      continue
    }
    const mat = new THREE.MeshBasicMaterial({
      // ランプの面は、光の絵を掛けずに明るく（暗くしない）
      lightMapIntensity: station.lightIntensity,
      color: m.lamp ? new THREE.Color(1.15, 1.12, 1.05) : new THREE.Color(1, 1, 1),
      alphaTest: m.alpha ? 0.5 : 0,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    mat.name = name
    if (!m.lamp) lightMats.push(mat)
    if (m.tex) {
      const tex = station.textures[m.tex]
      const minor = info.minorTex.includes(m.tex)
      const size = (t: Tier) => tex[platform][minor ? 1 : t]
      wants.push({
        w: pool.want(`tex:${m.tex}`, (s) => `tex/${m.tex}.${s}.webp`, size(tier), (t) => {
          if (!mat.map) mat.needsUpdate = true
          mat.map = t
        }),
        size,
      })
    }
    mats.set(name, mat)
    owned.push(mat)
  }

  const root = gltf.scene
  root.name = `iss-${id}`
  const parts: BvhPart[] = []
  const windows: THREE.Mesh[] = []
  root.updateMatrixWorld(true)
  // 自転こぎ：箱を測り、止まったペダルを消す（当たり判定を写す前に）
  const bike = findBike(root)
  const bikeBox = new THREE.Box3()
  let bikeCrank: BikeCrank | null = null
  if (bike) {
    bikeBox.setFromObject(bike)
    bikeCrank = takeStaticCrank(bike, bikeBox)
  }
  root.traverse((o) => {
    o.matrixAutoUpdate = false
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const name = (mesh.material as THREE.Material).name
    const mat = mats.get(name)
    if (mat) mesh.material = mat
    if (mat === windowMat) {
      // 部屋の後に描く（奥行きで隠れた所には印を付けない）
      mesh.renderOrder = 100
      windows.push(mesh)
    }
    // 当たり判定：形の位置だけを写して、置き場所の行列と一緒にワーカーへ
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | THREE.InterleavedBufferAttribute
    const index = mesh.geometry.index
    // ふつうは 3 つずつ並んだ Float32。ちがう形（まぜて並べた・整数）のときは 1 点ずつ写す
    let position: Float32Array
    if (!(pos as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && pos.array instanceof Float32Array && pos.itemSize === 3 && !pos.normalized) {
      position = new Float32Array(pos.array)
    } else {
      position = new Float32Array(pos.count * 3)
      for (let i = 0; i < pos.count; i++) {
        position[i * 3] = pos.getX(i)
        position[i * 3 + 1] = pos.getY(i)
        position[i * 3 + 2] = pos.getZ(i)
      }
    }
    parts.push({
      position,
      index: index ? (index.array.slice() as Uint16Array | Uint32Array) : null,
      matrix: mesh.matrixWorld.toArray(),
    })
  })
  const bvh = await makeBvh(parts)

  const mod: LoadedModule = {
    id,
    info,
    root,
    bvh,
    windows,
    bike,
    bikeBox,
    bikeCrank,
    tier,
    ready: () => wants.every((x) => pool.ready(x.w)),
    setTier: (t) => {
      if (mod.tier === t) return
      mod.tier = t
      for (const x of wants) pool.resize(x.w, x.size(t))
    },
    dispose: () => {
      root.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (mesh.isMesh) mesh.geometry.dispose()
      })
      bvh.geometry.dispose()
      owned.forEach((m) => m.dispose())
      for (const x of wants) pool.release(x.w)
    },
  }
  return mod
}
