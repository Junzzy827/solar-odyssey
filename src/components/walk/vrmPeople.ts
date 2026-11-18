import * as THREE from 'three'
import type { Age, Motion, Person } from './figure'
import { lowMemory } from '../../state/quality'
import { MOB_STYLE, addOutlines, semiMaterial } from './semiReal'

// 公園の人。MakeHuman（Blender の MPFB 2、素材は CC0）で作ったリアル寄りの 12 人（子ども 4・大人 5・シニア 3）。
// tools/mobs/mpfb_style.json（年齢ごとの幅、服・髪・肌、顔のパーツの揺れ幅）から mpfb_gen.py で決まった種で作り、
// finish_mpfb.py で髪の色・肌の色味をそろえ、テクスチャを縮めている（1 人 1.4〜1.9 MB）。
// 動きは Mixamo（public/walk/motions.json に、VRM 1.0 の正規化ボーン向けに変換したもの）。
// 同じ人を何人も出すので、VRM は 1 回だけ読み込み、形と材質を共有したまま骨だけを複製する（SkeletonUtils.clone）。
// そのため正規化ボーンを使わず、動きを人ごとの元の骨（raw bone）の回転に直してから再生する。

/** headScale：頭（髪ごと）の大きさ。phone：スマホ（メモリの少ない端末）でも読む人（半分にして軽くする） */
export type MobModel = { file: string; age: Age; height: number; headScale?: number; phone?: boolean }

export const MOB_MODELS: MobModel[] = [
  { file: 'mpfb_child_1', age: 'child', height: 1.278, phone: true },
  { file: 'mpfb_child_2', age: 'child', height: 1.349, phone: true },
  { file: 'mpfb_child_3', age: 'child', height: 1.175 },
  { file: 'mpfb_child_4', age: 'child', height: 1.295 },
  { file: 'mpfb_adult_1', age: 'adult', height: 1.619, phone: true },
  { file: 'mpfb_adult_2', age: 'adult', height: 1.897 },
  { file: 'mpfb_adult_3', age: 'adult', height: 1.494, phone: true },
  { file: 'mpfb_adult_4', age: 'adult', height: 1.491, phone: true },
  { file: 'mpfb_adult_5', age: 'adult', height: 1.683 },
  { file: 'mpfb_elder_1', age: 'elder', height: 1.508, phone: true },
  { file: 'mpfb_elder_2', age: 'elder', height: 1.537 },
  { file: 'mpfb_elder_3', age: 'elder', height: 1.446 },
]

/** 自分（歩く人）の姿。この人は 1.50 m と小柄なので、自分のときは 1.65 m ほどにする */
export const PLAYER_MODEL = 'mpfb_adult_4'
export const PLAYER_SCALE = 1.1

type ClipData = { fps: number; frames: number; loop: boolean; rot: string; pos: string }
type MotionData = { bones: string[]; clips: Record<string, ClipData> }

/** 1 人ぶんの型（共有する形と、その人の骨に合わせた動き） */
export type VrmModel = {
  info: MobModel
  scene: THREE.Object3D
  clips: Map<string, THREE.AnimationClip>
  /** 立ったときの腰の高さ m */
  hipsHeight: number
  /** 頭の骨の名前 */
  headName: string
  /** 首の骨の名前 */
  neckName: string
}

const int16 = (b64: string) => {
  const bin = atob(b64)
  const u8 = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
  return new Int16Array(u8.buffer)
}

/** VRM の材質（MToon）を、場面の光（昼夜・街灯）に合う軽い Lambert に置き換える。輪郭線は描かない */
function toLambert(root: THREE.Object3D) {
  const hidden = new THREE.MeshBasicMaterial({ visible: false })
  const conv = new Map<THREE.Material, THREE.Material>()
  const swap = (m: THREE.Material) => {
    let r = conv.get(m)
    if (r) return r
    const src = m as THREE.Material & { map?: THREE.Texture | null; color?: THREE.Color; isOutline?: boolean }
    if (src.isOutline) r = hidden
    else if (m.name.endsWith('.eyes'))
      // 目はツヤを出す（光が映り込まないと「死んだ目」に見える）
      r = new THREE.MeshPhongMaterial({
        map: src.map ?? null,
        shininess: 140,
        specular: 0x8a8a8a,
        // セミリアルでは白目が影で灰色に沈まないよう、少しだけ自分で光らせる
        ...(MOB_STYLE === 'semi' ? { emissiveMap: src.map ?? null, emissive: 0x3a3a3a } : {}),
      })
    else if (MOB_STYLE === 'semi') r = semiMaterial(src)
    else
      r = new THREE.MeshLambertMaterial({
        map: src.map ?? null,
        color: src.color ? src.color.clone() : 0xffffff,
        transparent: m.transparent,
        alphaTest: m.alphaTest,
        side: m.side,
        depthWrite: m.depthWrite,
      })
    conv.set(m, r)
    return r
  }
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
  })
  if (MOB_STYLE === 'semi') addOutlines(root)
}

/** 正規化ボーン向けの動きを、この VRM の元の骨の回転に直す（three-vrm の VRMHumanoidRig.update と同じ式） */
function bakeClips(vrm: import('@pixiv/three-vrm').VRM, data: MotionData) {
  const scene = vrm.scene
  scene.updateMatrixWorld(true)
  const bones = data.bones.map((name) => {
    const node = vrm.humanoid.getRawBoneNode(name as never)
    if (!node || !node.parent) return null
    const pw = node.parent.getWorldQuaternion(new THREE.Quaternion())
    return { node, pw, pwInv: pw.clone().invert(), rest: node.quaternion.clone() }
  })
  const hipsNode = vrm.humanoid.getRawBoneNode('hips')!
  const hipsWorld = hipsNode.getWorldPosition(new THREE.Vector3())
  const hipsParentInv = hipsNode.parent!.matrixWorld.clone().invert()
  const H = hipsWorld.y
  const clips = new Map<string, THREE.AnimationClip>()
  const q = new THREE.Quaternion()
  const v = new THREE.Vector3()
  for (const [name, c] of Object.entries(data.clips)) {
    const rot = int16(c.rot)
    const pos = int16(c.pos)
    const n = c.frames + (c.loop ? 1 : 0)
    const times = new Float32Array(n)
    for (let f = 0; f < n; f++) times[f] = f / c.fps
    const tracks: THREE.KeyframeTrack[] = []
    bones.forEach((b, bi) => {
      if (!b) return
      const vals = new Float32Array(n * 4)
      for (let f = 0; f < n; f++) {
        const o = ((f % c.frames) * data.bones.length + bi) * 4
        q.set(rot[o] / 32767, rot[o + 1] / 32767, rot[o + 2] / 32767, rot[o + 3] / 32767).normalize()
        q.multiply(b.pw).premultiply(b.pwInv).multiply(b.rest)
        q.toArray(vals, f * 4)
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${b.node.name}.quaternion`, times, vals))
    })
    const pv = new Float32Array(n * 3)
    for (let f = 0; f < n; f++) {
      const o = (f % c.frames) * 3
      v.set(hipsWorld.x + (pos[o] / 10000) * H, (pos[o + 1] / 10000) * H, hipsWorld.z + (pos[o + 2] / 10000) * H).applyMatrix4(hipsParentInv)
      v.toArray(pv, f * 3)
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${hipsNode.name}.position`, times, pv))
    clips.set(name, new THREE.AnimationClip(name, -1, tracks))
  }
  return { clips, hipsHeight: H }
}

let loading: Promise<VrmModel[]> | null = null

/** 公園の人の VRM と動きを読み込む（歩く場面に来たとき 1 回だけ） */
export function loadMobModels(): Promise<VrmModel[]> {
  return (loading ??= (async () => {
    const base = import.meta.env.BASE_URL
    const [{ GLTFLoader }, { VRMLoaderPlugin, VRMUtils }, motions] = await Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('@pixiv/three-vrm'),
      fetch(`${base}walk/motions.json`).then((r) => r.json() as Promise<MotionData>),
    ])
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))
    const models = await Promise.all(
      MOB_MODELS.filter((m) => m.phone || !lowMemory()).map(async (info) => {
        const gltf = await loader.loadAsync(`${base}walk/mobs/${info.file}.vrm`)
        const vrm = gltf.userData.vrm as import('@pixiv/three-vrm').VRM
        VRMUtils.removeUnnecessaryVertices(gltf.scene)
        VRMUtils.combineSkeletons(gltf.scene)
        // 揺れ物・視線・表情は使わない（骨を複製するので、元の VRM の仕組みは動かさない）
        const { clips, hipsHeight } = bakeClips(vrm, motions)
        toLambert(vrm.scene)
        return { info, scene: vrm.scene, clips, hipsHeight, headName: vrm.humanoid.getRawBoneNode('head')?.name ?? '', neckName: vrm.humanoid.getRawBoneNode('neck')?.name ?? '' }
      }),
    )
    return models
  })())
}

/** 腰の高さあたりの、動きの中の進む速さ（Mixamo の Y Bot：歩き 1.85 m / 1.03 s、走り 3.06 m / 0.70 s、腰の高さ 1.04 m） */
const WALK_PER_HIP = 1.85 / 1.04 / 1.033
const RUN_PER_HIP = 3.06 / 1.04 / 0.7

/** VRM の人。pose の motion を Mixamo の動きに当て、変わるときはなめらかにつなぐ */
export class VrmPerson implements Person {
  readonly group = new THREE.Group()
  private mixer: THREE.AnimationMixer
  private actions = new Map<string, THREE.AnimationAction>()
  private current: THREE.AnimationAction | null = null
  private lastMotion: Motion | null = null
  private choice: Record<'idle' | 'sit' | 'ground' | 'wave', string>
  private hips: number

  constructor(
    readonly model: VrmModel,
    rand: () => number,
    scale = 1,
    /** 跳ぶ高さを動きの外（自分の操作）で決める：跳ぶ動きの腰の上下を使わない */
    private codeJump = false,
  ) {
    const { clone } = skeletonUtils!
    const body = clone(model.scene)
    // VRM 1.0 は +z を向いている。この場面の人は -z が前
    body.rotation.y = Math.PI
    body.scale.setScalar(scale)
    const hs = model.info.headScale ?? 1
    this.head = body.getObjectByName(model.headName) ?? null
    this.neck = model.neckName ? (body.getObjectByName(model.neckName) ?? null) : null
    if (hs !== 1) this.head?.scale.setScalar(hs)
    this.group.add(body)
    this.hips = model.hipsHeight * scale
    this.mixer = new THREE.AnimationMixer(body)
    const pick = (list: string[]) => list[Math.floor(rand() * list.length)]
    this.choice = {
      idle: model.info.age === 'child' ? pick(['idleHappy', 'idleBreath', 'idle']) : pick(['idle', 'idleBreath', 'idleNeutral']),
      sit: pick(['sitIdle', 'sitIdle2', 'sitIdle3', 'sitFidget']),
      ground: pick(['groundSit', 'groundSit2']),
      wave: pick(['wave', 'waveShort']),
    }
    this.mixer.timeScale = 0.92 + rand() * 0.16
    this.offset = rand() * 10
  }
  private offset: number
  /** 見る先（世界の位置）。null なら見ない */
  private lookTarget: THREE.Vector3 | null = null
  private lookW = 0
  private head: THREE.Object3D | null = null
  private neck: THREE.Object3D | null = null

  /** 近くの人の顔を見る（首 4 割・頭 6 割で向ける）。null で前に戻す */
  look(target: THREE.Vector3 | null) {
    this.lookTarget = target
  }

  private applyLook(dt: number) {
    const t = this.lookTarget
    let want = 0
    let yaw = 0
    let pitch = 0
    if (t && this.head) {
      const g = this.group
      g.updateMatrixWorld(true)
      this.head.getWorldPosition(lv)
      g.worldToLocal(lv)
      ld.copy(t)
      g.worldToLocal(ld).sub(lv)
      yaw = Math.atan2(-ld.x, -ld.z)
      pitch = Math.atan2(ld.y, Math.hypot(ld.x, ld.z))
      // 真後ろの人は見ない（首が回りすぎる）
      if (Math.abs(yaw) < 1.9) want = 1
      this.lastYaw = THREE.MathUtils.clamp(yaw, -1.25, 1.25)
      this.lastPitch = THREE.MathUtils.clamp(pitch, -0.45, 0.35)
    }
    this.lookW += (want - this.lookW) * Math.min(1, dt * 2.5)
    if (this.lookW < 0.01 || !this.head) return
    lq.setFromAxisAngle(AX_Y, this.lastYaw * this.lookW).multiply(lq2.setFromAxisAngle(AX_X, this.lastPitch * this.lookW))
    // 人の向きの中での回し方を、世界の回し方に直す
    this.group.getWorldQuaternion(gq)
    wq.copy(gq).multiply(lq).multiply(gq.invert())
    for (const [bone, k] of [[this.neck, 0.4], [this.head, 0.6]] as const) {
      if (!bone || !bone.parent) continue
      part.identity().slerp(wq, this.neck ? k : 1)
      bone.getWorldQuaternion(bq)
      bq.premultiply(part)
      bone.parent.getWorldQuaternion(pq)
      bone.quaternion.copy(pq.invert().multiply(bq))
      bone.updateMatrixWorld(true)
    }
  }
  private lastYaw = 0
  private lastPitch = 0

  private action(name: string) {
    let a = this.actions.get(name)
    if (!a) {
      let clip = this.model.clips.get(name)!
      if (this.codeJump && name === 'hop') clip = new THREE.AnimationClip(clip.name + '-inPlace', clip.duration, clip.tracks.filter((t) => !t.name.endsWith('.position')))
      a = this.mixer.clipAction(clip)
      if (name === 'hop' || name === 'jump') {
        a.setLoop(THREE.LoopOnce, 1)
        a.clampWhenFinished = true
      }
      this.actions.set(name, a)
    }
    return a
  }

  private play(name: string, fade = 0.3) {
    const a = this.action(name)
    if (this.current === a) return a
    a.reset()
    a.time = a.loop === THREE.LoopOnce ? 0 : this.offset % a.getClip().duration
    a.enabled = true
    a.setEffectiveWeight(1)
    a.play()
    if (this.current) a.crossFadeFrom(this.current, fade, false)
    this.current = a
    return a
  }

  /** speed：進む速さ m/s（歩く・走るの足の運びを合わせる） */
  pose(motion: Motion, _phase: number, dt: number, speed = 0) {
    const changed = motion !== this.lastMotion
    this.lastMotion = motion
    if (motion === 'walk') this.play('walk').timeScale = Math.max(0.4, speed / (WALK_PER_HIP * this.hips))
    else if (motion === 'run') this.play('run').timeScale = Math.max(0.5, speed / (RUN_PER_HIP * this.hips))
    else if (motion === 'jump') {
      const a = this.play('hop', 0.12)
      if (changed) a.reset().play()
    } else if (motion === 'sit') this.play(this.choice.sit, 0.5)
    else if (motion === 'ground') this.play(this.choice.ground, 0.5)
    else if (motion === 'wave') this.play(this.choice.wave)
    else this.play(this.choice.idle)
    this.mixer.update(dt)
    this.applyLook(dt)
  }

  dispose() {
    this.mixer.stopAllAction()
    this.group.removeFromParent()
  }
}

const lv = new THREE.Vector3()
const ld = new THREE.Vector3()
const lq = new THREE.Quaternion()
const lq2 = new THREE.Quaternion()
const gq = new THREE.Quaternion()
const wq = new THREE.Quaternion()
const part = new THREE.Quaternion()
const bq = new THREE.Quaternion()
const pq = new THREE.Quaternion()
const AX_X = new THREE.Vector3(1, 0, 0)
const AX_Y = new THREE.Vector3(0, 1, 0)

let skeletonUtils: typeof import('three/examples/jsm/utils/SkeletonUtils.js') | null = null
/** VrmPerson を作る前に呼ぶ */
export async function prepareVrmPeople() {
  skeletonUtils ??= await import('three/examples/jsm/utils/SkeletonUtils.js')
  return loadMobModels()
}
