import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(process.argv[2])
for (const n of doc.getRoot().listNodes()) console.log('node', n.getName(), n.getTranslation().map(v=>v.toFixed(3)).join(','), n.getMesh()?.listPrimitives().map(p => p.getMaterial()?.getName() + ':' + Object.keys(p.listSemantics ? {} : {}) + p.listSemantics().join('|') + ':' + p.getIndices()?.getCount()/3).join(' '))
