// NASA 3D Resources の glb は Draco で圧縮されていて、Blender（pip の bpy）ではそのまま読めないことがある。
// gltf-transform で Draco をほどいた glb を書き出す。
//   node tools/shuttle/decode_draco.mjs "<…>/Space Shuttle (A).glb" /tmp/shuttleA.glb
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3d'

const [src, out] = process.argv.slice(2)
if (!src || !out) {
  console.error('usage: node tools/shuttle/decode_draco.mjs <in.glb> <out.glb>')
  process.exit(1)
}
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
})
const doc = await io.read(src)
for (const e of doc.getRoot().listExtensionsUsed()) if (e.extensionName === 'KHR_draco_mesh_compression') e.dispose()
await io.write(out, doc)
console.log('wrote', out)
