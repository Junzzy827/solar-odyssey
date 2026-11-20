// 森の見本の一角で使う「森の部品」を作る。素材は Poly Haven（CC0）の、本物をスキャンした植物と小物。
//   node tools/forest/bake.mjs            … 部品の形（public/models/forest-kit.glb）と画像（public/textures/forest/）
//   node tools/forest/bake.mjs --canopy   … 樹冠の葉の房の絵（canopy.webp）も作り直す（時間がかかる）
// 元の素材は tools/forest/raw/ に取ってくる（git には入れない）。形は三角形を減らして、量子化と meshopt で圧縮する。
// glb には画像を入れない。画像は別のファイルにして、スマホでは半分の大きさのものを読めるようにする。
import { NodeIO, Document, PropertyType } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions'
import { copyToDocument, dedup, prune, quantize, reorder, simplifyPrimitive, weldPrimitive, transformPrimitive, getBounds } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

const here = new URL('.', import.meta.url).pathname
const RAW = join(here, 'raw')
const PUB = join(here, '../../public')
const UA = 'asset-fetch/1.0'

/** 部品の一覧。from = Poly Haven の名前、nodes = glTF の中の部品の名前、tris = 減らした後の三角形の数（0 = 減らさない）、mat = 画像の名前 */
const PARTS = [
  // 下草：オオタニワタリのようなシダ（葉は切り抜き）
  { name: 'fern_a', from: 'fern_02', nodes: ['fern_02_b'], tris: 1300, mat: 'fern', plant: true },
  { name: 'fern_b', from: 'fern_02', nodes: ['fern_02_d'], tris: 520, mat: 'fern', plant: true },
  // 下草：丸い大きな葉（カラテア）
  { name: 'calathea_a', from: 'calathea_orbifolia_01', nodes: ['calathea_orbifolia_01_a'], tris: 1000, mat: 'calathea', plant: true },
  { name: 'calathea_b', from: 'calathea_orbifolia_01', nodes: ['calathea_orbifolia_01_b'], tris: 650, mat: 'calathea', plant: true },
  { name: 'calathea_c', from: 'calathea_orbifolia_01', nodes: ['calathea_orbifolia_01_e'], tris: 400, mat: 'calathea', plant: true },
  // 下草：つやのある長い葉（アンスリウム）
  { name: 'anthurium_a', from: 'anthurium_botany_01', nodes: ['anthurium_botany_01_a'], tris: 1000, mat: 'anthurium', plant: true },
  { name: 'anthurium_b', from: 'anthurium_botany_01', nodes: ['anthurium_botany_01_c'], tris: 700, mat: 'anthurium', plant: true },
  { name: 'anthurium_c', from: 'anthurium_botany_01', nodes: ['anthurium_botany_06_f'], tris: 450, mat: 'anthurium', plant: true },
  // 中くらいの木（パキラ。幹と葉は別の画像）
  { name: 'pachira_a_bark', from: 'pachira_aquatica_01', nodes: ['pachira_aquatica_01_bark_d'], tris: 900, mat: 'pachira_bark' },
  { name: 'pachira_a_leaves', from: 'pachira_aquatica_01', nodes: ['pachira_aquatica_01_leaves_d'], tris: 3000, mat: 'pachira_leaves', plant: true },
  { name: 'pachira_b_bark', from: 'pachira_aquatica_01', nodes: ['pachira_aquatica_01_bark_c'], tris: 700, mat: 'pachira_bark' },
  { name: 'pachira_b_leaves', from: 'pachira_aquatica_01', nodes: ['pachira_aquatica_01_leaves_c'], tris: 2200, mat: 'pachira_leaves', plant: true },
  // 地面の小物
  { name: 'roots', from: 'root_cluster_01', nodes: ['root_cluster_01'], tris: 2400, mat: 'roots' },
  { name: 'stump', from: 'tree_stump_01', nodes: ['tree_stump_01'], tris: 1000, mat: 'stump' },
  { name: 'log', from: 'dead_tree_trunk_02', nodes: ['dead_tree_trunk_02'], tris: 1400, mat: 'log' },
  { name: 'rock_a', from: 'rock_moss_set_01', nodes: ['rock_moss_set_01_rock01'], tris: 450, mat: 'rock' },
  { name: 'rock_b', from: 'rock_moss_set_01', nodes: ['rock_moss_set_01_rock04'], tris: 450, mat: 'rock' },
]

/** 画像の一覧。out = 出すファイル名、src = 元の画像（raw からの道）、alpha = 切り抜きの画像、size = 大きい方の一辺。小さい方（半分）も出す */
const model = (id, file) => `${id}/textures/${id}_${file}_1k.jpg`
const map = (id, name) => `${id}/maps/${name}.jpg`
const IMAGES = [
  { out: 'fern', src: model('fern_02', 'diff'), alpha: map('fern_02', 'Alpha'), size: 1024 },
  { out: 'calathea', src: model('calathea_orbifolia_01', 'diff'), alpha: map('calathea_orbifolia_01', 'Alpha'), size: 1024 },
  { out: 'anthurium', src: model('anthurium_botany_01', 'diff'), alpha: map('anthurium_botany_01', 'Alpha'), size: 1024 },
  { out: 'pachira_leaves', src: model('pachira_aquatica_01', 'leaves_diff'), alpha: map('pachira_aquatica_01', 'leaves_alpha'), size: 1024 },
  { out: 'pachira_bark', src: model('pachira_aquatica_01', 'bark_diff'), size: 512 },
  { out: 'roots', src: model('root_cluster_01', 'diff'), size: 512 },
  { out: 'stump', src: model('tree_stump_01', 'diff'), size: 512 },
  { out: 'log', src: model('dead_tree_trunk_02', 'diff'), size: 512 },
  { out: 'rock', src: model('rock_moss_set_01', 'diff'), size: 512 },
  // 葉の凹凸（高画質のときだけ読む）
  { out: 'fern_n', src: model('fern_02', 'nor_gl'), size: 512, data: true, half: false },
  { out: 'calathea_n', src: model('calathea_orbifolia_01', 'nor_gl'), size: 512, data: true, half: false },
  { out: 'anthurium_n', src: model('anthurium_botany_01', 'nor_gl'), size: 512, data: true, half: false },
  { out: 'pachira_leaves_n', src: model('pachira_aquatica_01', 'leaves_nor_gl'), size: 512, data: true, half: false },
  // 高い木の樹皮（くり返して貼る）
  { out: 'bark', src: map('chinese_hackberry_bark', 'Diffuse'), size: 1024 },
  { out: 'bark_n', src: map('chinese_hackberry_bark', 'nor_gl'), size: 1024, data: true, half: false },
  // 地面（くり返して貼る）：落ち葉、苔、ぬれた土
  { out: 'floor_leaves', src: map('forest_leaves_04', 'Diffuse'), size: 1024 },
  { out: 'floor_moss', src: map('forrest_ground_01', 'Diffuse'), size: 512 },
  { out: 'floor_mud', src: map('mud_forest', 'Diffuse'), size: 512 },
]
/** 樹冠の葉の房の絵のもと（tools/forest/canopy.html が使う） */
const CANOPY = { from: 'island_tree_02', maps: ['leaves_alpha'] }

/* ---------- 元の素材を取ってくる ---------- */

function curl(url, to) {
  if (existsSync(to) && statSync(to).size > 0) return
  mkdirSync(dirname(to), { recursive: true })
  const r = spawnSync('curl', ['-s', '-f', '-A', UA, '-o', to, url])
  if (r.status !== 0) throw new Error(`download failed: ${url}`)
}
const fileLists = new Map()
function files(id) {
  if (!fileLists.has(id)) {
    const to = join(RAW, `${id}.json`)
    curl(`https://api.polyhaven.com/files/${id}`, to)
    fileLists.set(id, JSON.parse(readFileSync(to, 'utf8')))
  }
  return fileLists.get(id)
}
/** glTF（1k）とその画像・形 */
function fetchModel(id) {
  const e = files(id).gltf['1k'].gltf
  curl(e.url, join(RAW, id, `${id}.gltf`))
  for (const [path, v] of Object.entries(e.include ?? {})) curl(v.url, join(RAW, id, path))
}
/** 画像 1 枚（1k の jpg） */
function fetchMap(id, name) {
  curl(files(id)[name]['1k'].jpg.url, join(RAW, id, 'maps', `${name}.jpg`))
}
function fetchAll() {
  for (const id of new Set([...PARTS.map((p) => p.from), CANOPY.from])) fetchModel(id)
  for (const im of IMAGES)
    for (const path of [im.src, im.alpha]) {
      const m = path?.match(/^([^/]+)\/maps\/(.+)\.jpg$/)
      if (m) fetchMap(m[1], m[2])
    }
  for (const m of CANOPY.maps) fetchMap(CANOPY.from, m)
}

/* ---------- 形 ---------- */

async function bakeKit() {
  await MeshoptEncoder.ready
  await MeshoptSimplifier.ready
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
  const out = new Document()
  const buffer = out.createBuffer()
  const scene = out.createScene('forest-kit')
  const sources = new Map()
  const mats = new Map()
  const report = []
  for (const part of PARTS) {
    if (!sources.has(part.from)) sources.set(part.from, await io.read(join(RAW, part.from, `${part.from}.gltf`)))
    const src = sources.get(part.from)
    for (const nodeName of part.nodes) {
      const node = src.getRoot().listNodes().find((n) => n.getName() === nodeName)
      if (!node) throw new Error(`${part.from}: no node ${nodeName} (have ${src.getRoot().listNodes().map((n) => n.getName()).join(', ')})`)
      const copied = copyToDocument(out, src, [node.getMesh()])
      const mesh = copied.get(node.getMesh())
      if (!mats.has(part.mat)) mats.set(part.mat, out.createMaterial(part.mat).setDoubleSided(true))
      const before = mesh.listPrimitives().reduce((n, p) => n + p.getIndices().getCount() / 3, 0)
      for (const prim of mesh.listPrimitives()) {
        // 部品の向き・大きさ（位置は使わない：並べて置いてあるだけなので）を形に焼きこむ
        const m = node.getMatrix()
        m[12] = m[13] = m[14] = 0
        transformPrimitive(prim, m)
        for (const sem of prim.listSemantics()) if (!['POSITION', 'NORMAL', 'TEXCOORD_0'].includes(sem)) prim.setAttribute(sem, null)
        weldPrimitive(prim, {})
        const now = prim.getIndices().getCount() / 3
        if (part.tris && now > part.tris) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: part.tris / now, error: 0.2 })
        if (part.plant) shade(out, prim)
        prim.setMaterial(mats.get(part.mat))
      }
      const after = mesh.listPrimitives().reduce((n, p) => n + p.getIndices().getCount() / 3, 0)
      const made = out.createNode(part.name).setMesh(mesh.setName(part.name))
      scene.addChild(made)
      const b = getBounds(made)
      report.push(`${part.name.padEnd(18)} ${String(before).padStart(7)} → ${String(after).padStart(6)} tris   ${b.max.map((v, i) => (v - b.min[i]).toFixed(2)).join(' × ')} m`)
    }
  }
  for (const a of out.getRoot().listAccessors()) a.setBuffer(buffer)
  // 材質は名前で画像を決めるので、まとめない。画像のない材質でも uv は残す
  await out.transform(dedup({ propertyTypes: [PropertyType.ACCESSOR] }), prune({ keepAttributes: true }), reorder({ encoder: MeshoptEncoder, target: 'size' }), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12, quantizeColor: 8 }))
  out.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER })
  const to = join(PUB, 'models/forest-kit.glb')
  await io.write(to, out)
  console.log(report.join('\n'))
  console.log(`wrote public/models/forest-kit.glb (${(statSync(to).size / 1e6).toFixed(2)} MB)`)
}

/** 植物の「根元と奥の暗がり」を頂点の色に入れる：低いところ・株のまん中に近いところほど暗い */
function shade(doc, prim) {
  const pos = prim.getAttribute('POSITION')
  const n = pos.getCount()
  let top = 0
  let far = 0
  const p = [0, 0, 0]
  for (let i = 0; i < n; i++) {
    pos.getElement(i, p)
    top = Math.max(top, p[1])
    far = Math.max(far, Math.hypot(p[0], p[2]))
  }
  const col = new Uint8Array(n * 4)
  for (let i = 0; i < n; i++) {
    pos.getElement(i, p)
    const h = Math.min(1, Math.max(0, p[1] / (top * 0.6)))
    const r = Math.min(1, Math.hypot(p[0], p[2]) / (far * 0.6))
    const ao = (0.38 + 0.62 * h * h * (3 - 2 * h)) * (0.7 + 0.3 * r)
    const v = Math.round(255 * Math.min(1, ao))
    col.set([v, v, v, 255], i * 4)
  }
  prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC4').setArray(col).setNormalized(true))
}

/* ---------- 画像 ---------- */

function bakeImages() {
  const r = spawnSync('python3', ['-I', join(here, 'images.py'), RAW, join(PUB, 'textures/forest'), JSON.stringify(IMAGES)], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error('images.py failed')
}

fetchAll()
await bakeKit()
bakeImages()
if (process.argv.includes('--canopy')) await import('./canopy.mjs')
