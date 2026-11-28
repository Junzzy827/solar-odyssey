/// <reference lib="webworker" />
import { BufferAttribute, BufferGeometry } from 'three'
import { MeshBVH } from 'three-mesh-bvh'

// 部屋の当たり判定の形（三角形 2〜7 万）をまとめて、BVH（速く探すための木）を作る。別のスレッドで作るので、
// 部屋を読みこむときに絵が止まらない。作った木は serialize して送り返す（moduleLoader.ts が deserialize）

export type BvhPart = { position: Float32Array; index: Uint16Array | Uint32Array | null; matrix: number[] }
export type BvhRequest = { id: number; parts: BvhPart[] }
export type BvhReply = { id: number; position: Float32Array; roots: ArrayBuffer[]; index: Uint32Array | null; error?: string }

/** 部品をワールドの座標にして 1 つの形にまとめる */
export function mergeParts(parts: BvhPart[]) {
  let nv = 0
  let ni = 0
  for (const p of parts) {
    const v = p.position.length / 3
    nv += v
    ni += p.index ? p.index.length : v
  }
  const pos = new Float32Array(nv * 3)
  const idx = new Uint32Array(ni)
  let vo = 0
  let io = 0
  for (const p of parts) {
    const m = p.matrix
    const src = p.position
    const v = src.length / 3
    for (let i = 0; i < v; i++) {
      const x = src[i * 3]
      const y = src[i * 3 + 1]
      const z = src[i * 3 + 2]
      const o = (vo + i) * 3
      pos[o] = m[0] * x + m[4] * y + m[8] * z + m[12]
      pos[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]
      pos[o + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]
    }
    if (p.index) for (let i = 0; i < p.index.length; i++) idx[io + i] = p.index[i] + vo
    else for (let i = 0; i < v; i++) idx[io + i] = vo + i
    io += p.index ? p.index.length : v
    vo += v
  }
  return { pos, idx }
}

export function buildBvh(parts: BvhPart[]) {
  const { pos, idx } = mergeParts(parts)
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setIndex(new BufferAttribute(idx, 1))
  return { geometry: g, bvh: new MeshBVH(g, { maxLeafTris: 10 }) }
}

// ワーカーとして動いているときだけ、受け取って作る
const scope =
  typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope ? (self as unknown as DedicatedWorkerGlobalScope) : null
if (scope) {
  scope.onmessage = (e: MessageEvent<BvhRequest>) => {
    const { id, parts } = e.data
    try {
      const { geometry, bvh } = buildBvh(parts)
      const ser = MeshBVH.serialize(bvh, { cloneBuffers: false })
      const position = geometry.getAttribute('position').array as Float32Array
      const index = (ser.index as Uint32Array | null) ?? null
      const reply: BvhReply = { id, position, roots: ser.roots as ArrayBuffer[], index }
      const transfer: Transferable[] = [position.buffer as ArrayBuffer, ...reply.roots]
      if (index) transfer.push(index.buffer as ArrayBuffer)
      scope.postMessage(reply, transfer)
    } catch (err) {
      scope.postMessage({ id, position: new Float32Array(0), roots: [], index: null, error: String(err) } satisfies BvhReply)
    }
  }
}
