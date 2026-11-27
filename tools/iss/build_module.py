# 段階 1：ISS のモジュールを 1 つ、アプリ用の glb ＋ 焼いた光（ライトマップ）にする。
#   MODULE=us_lab ISS_SRC=<FBX> .venv/bin/python -I tools/iss/build_module.py
# 切り替え（環境変数）：
#   PREVIEW=1 VIEWS=aft,fwd,... PREVIEW_DIR=...   … Cycles で確かめの絵を撮る（焼く前の見え方。光は本物のランプの面）
#   BAKE=1 BAKE_SIZE=2048 SAMPLES=96 SUPER=1      … 照明（直接＋間接）を 2 番目の UV に焼く
#   EXPORT=1 OUT_DIR=public/models/iss            … <module>.glb（絵なし）と <module>.light.<size>.jpg を書く
#   SAMPLE_ENDS=1（us_lab の既定）                … 見本のために、両はしの開いたハッチの先に閉じたハッチを置く
# 作り方：
#   1. FBX を読み、アプリの座標（m、原点はノード 1 の真ん中）に置き直す（iss_common.to_app_frame）
#   2. このモジュールの物だけ残し、ワッペン（Patches1/2）の物は消す
#   3. 動く物（ハッチ・自転こぎ CEVIS など）は別の部品のまま、ほかは 1 つにまとめる（材質ごとに分かれたまま書き出される）
#   4. 全部の部品に光のための UV（2 番目）を 1 枚の絵の上で重ならないように作る
#   5. 焼くときだけ材質を「色の絵 × つや消し」に差しかえる（金属のままだと拡散の焼き込みが黒くなる）。
#      ランプの面（Generic_Lights など）は光る面にする。焼くのは光だけ（色を掛けない）なので、色の絵はアプリで別に貼る
#   6. 焼いた光（線形）を $WORK/<module>.light.raw.npy に置き、light_finish.py がノイズ取り・すきま埋め・明るさの調子を
#      して JPEG にする（保存は ×0.5。アプリで lightMapIntensity を 2π にする：three の MeshBasic は光の絵を π で割るため）
import bpy
import bmesh  # noqa: F401  （bpy の後に読む決まり）
import sys
import os
import json
import math
import time
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import iss_common as C  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ['ISS_SRC']
MODULE = C.env('MODULE', 'us_lab')
PREVIEW = C.env('PREVIEW', '0') == '1'
BAKE = C.env('BAKE', '0') == '1'
EXPORT = C.env('EXPORT', '0') == '1'
BAKE_SIZE = int(C.env('BAKE_SIZE', '2048'))
SAMPLES = int(C.env('SAMPLES', '96'))
SUPER = int(C.env('SUPER', '1'))
PREVIEW_DIR = C.env('PREVIEW_DIR', '/tmp/iss-work/preview')
PREVIEW_SAMPLES = int(C.env('PREVIEW_SAMPLES', '32'))
PREVIEW_W = int(C.env('PREVIEW_W', '1280'))
OUT_DIR = C.env('OUT_DIR', os.path.join(HERE, '..', '..', 'public', 'models', 'iss'))
WORK = C.env('WORK', '/tmp/iss-work')
SAMPLE_ENDS = C.env('SAMPLE_ENDS', '1' if MODULE == 'us_lab' else '0') == '1'
# ランプの面の明るさ（放射の強さ）と、焼いた光のそろえ方（壁の明るさの中央値をこの値に）
LAMP = float(C.env('LAMP', '150'))
# 地球からの照り返し（窓の外の面光源の強さ W）。窓のないモジュールでは使わない
EARTH_FILL = float(C.env('EARTH_FILL', '60'))
# PREVIEW のとき、カメラの位置に置く点の光（W）。0 で置かない
HEADLAMP = float(C.env('HEADLAMP', '0'))

info = json.load(open(os.path.join(HERE, 'modules.json')))
mod = next(m for m in info['modules'] if m['id'] == MODULE)

t0 = time.time()
C.import_fbx(SRC)
C.to_app_frame()
print('imported', round(time.time() - t0, 1), 's')

# ---- このモジュールの物だけ残す -------------------------------------------------------------------
keep = set(mod['objects'])
sample_hatch = None
if SAMPLE_ENDS:
    # 閉じたハッチの形を借りる（ノード 1 の後ろの閉じたハッチ）
    sample_hatch = bpy.data.objects.get('Node1_Int_Metal_Hatch_Aft_Closed')
    keep.add(sample_hatch.name)
for o in list(bpy.data.objects):
    if o.name not in keep:
        bpy.data.objects.remove(o, do_unlink=True)
for _ in range(3):
    bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)

scene = bpy.context.scene
if bpy.context.window:
    bpy.context.window.scene = scene


def bbox(o):
    return C.world_bbox(o)


if SAMPLE_ENDS:
    # 実験棟（デスティニー）の前後のつなぎ目（Module_Connect.002 / .003）のすぐ外に、閉じたハッチを 1 枚ずつ。
    # 見本ではノード 1・2 を読まないので、その先の何もない所が見えないように、また外へ出られないようにする
    aft_c = bbox(bpy.data.objects['Module_Connect.002'])
    fwd_c = bbox(bpy.data.objects['Module_Connect.003'])
    h = sample_hatch
    mn, mx = bbox(h)
    c = (mn + mx) / 2
    # 後ろ：つなぎ目の手前（ノード 1 の側）に、ノード 1 の中から見る向きのまま
    a = h.copy()
    a.data = h.data.copy()
    scene.collection.objects.link(a)
    a.name = 'Sample_Hatch_Aft'
    a.matrix_world = Matrix.Translation(Vector((-c.x, aft_c[0].y - 0.02 - mx.y, 0))) @ h.matrix_world
    # 前：つなぎ目の向こう（ノード 2 の側）に、180° 回して実験棟の側へ向ける
    f = h.copy()
    f.data = h.data.copy()
    scene.collection.objects.link(f)
    f.name = 'Sample_Hatch_Fwd'
    rot = Matrix.Translation(c) @ Matrix.Rotation(math.pi, 4, 'Z') @ Matrix.Translation(-c)
    f.matrix_world = Matrix.Translation(Vector((-c.x, fwd_c[1].y + 0.02 - mn.y, 0))) @ rot @ h.matrix_world
    bpy.data.objects.remove(h, do_unlink=True)
    bpy.context.view_layer.update()
    for o in (a, f):
        mn2, mx2 = bbox(o)
        print('sample hatch', o.name, tuple(round(v, 3) for v in mn2), tuple(round(v, 3) for v in mx2))

meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in [o for o in bpy.data.objects if o.type != 'MESH']:
    bpy.data.objects.remove(o, do_unlink=True)
movable = [o for o in meshes if C.is_movable(o.name) and not o.name.startswith('Sample_Hatch')]
static = [o for o in meshes if o not in movable]
print('static', len(static), 'movable', [o.name for o in movable])

# FBX の法線（カスタムの法線）は、向きが面と逆の所があり、光が当たっても黒くなる（焼き込みが黒い壁になった）。
# アプリでは法線を使わないので（MeshBasic と当たり判定だけ）、消して面の向きのままにする
for o in meshes:
    if o.data.has_custom_normals:
        bpy.context.view_layer.objects.active = o
        o.data = o.data.copy() if o.data.users > 1 else o.data
        with bpy.context.temp_override(object=o, active_object=o):
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
# UV の名前をそろえる（名前がちがうとまとめたときに別々の UV になり、ほかの部品の UV が 0 になって黒く・透明になった）
for o in meshes:
    me = o.data
    while len(me.uv_layers) > 1:
        me.uv_layers.remove(me.uv_layers[-1])
    if me.uv_layers:
        me.uv_layers[0].name = 'UVMap'
    else:
        me.uv_layers.new(name='UVMap')
# 動く物は、原点をそのままに（FBX の原点は部品の付け根）変形を形に焼きこまない。まとめる物は変形を形へ
for o in meshes:
    o.data = o.data.copy() if o.data.users > 1 else o.data
bpy.ops.object.select_all(action='DESELECT')
for o in static:
    o.select_set(True)
bpy.context.view_layer.objects.active = static[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.join()
room = bpy.context.view_layer.objects.active
room.name = f'{MODULE}_static'
for o in movable:
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
parts = [room, *movable]
tri_total = sum(C.tris_of(o) for o in parts)
print('triangles', tri_total, 'materials', sorted({s.material.name for o in parts for s in o.material_slots if s.material}))

# 元の材質（書き出しで名前だけ使う）を覚えておく
orig_slots = {o.name: [s.material for s in o.material_slots] for o in parts}


# ---- 焼くとき・撮るときの材質 ---------------------------------------------------------------------
def lin(c):
    return ((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92


bake_mats = {}


def bake_material(m):
    """色の絵 × つや消し（金属をやめる）。ランプは光る面。透けるところ（アルファ）は透けたまま"""
    if m is None:
        return None
    if m.name in bake_mats:
        return bake_mats[m.name]
    nm = bpy.data.materials.new(f'BK_{m.name}')
    nt = nm.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    img = C.diffuse_image(m)
    tex = None
    if img is not None:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = img
    if C.emissive(m) and m.name in ('Generic_Lights',):
        em = nt.nodes.new('ShaderNodeEmission')
        em.inputs['Color'].default_value = (1.0, 0.97, 0.92, 1)
        em.inputs['Strength'].default_value = LAMP
        nt.links.new(em.outputs[0], out.inputs[0])
    else:
        bs = nt.nodes.new('ShaderNodeBsdfDiffuse')
        if tex:
            nt.links.new(tex.outputs['Color'], bs.inputs['Color'])
        else:
            bs.inputs['Color'].default_value = (0.7, 0.7, 0.7, 1)
        if C.emissive(m):
            # 画面などの光る絵：自分の絵の色でうすく光る
            em = nt.nodes.new('ShaderNodeEmission')
            if tex:
                nt.links.new(tex.outputs['Color'], em.inputs['Color'])
            em.inputs['Strength'].default_value = 1.0
            add = nt.nodes.new('ShaderNodeAddShader')
            nt.links.new(bs.outputs[0], add.inputs[0])
            nt.links.new(em.outputs[0], add.inputs[1])
            shader = add
        else:
            shader = bs
        if C.uses_alpha(m) and tex and C.env('ALPHA', '1') == '1':
            tr = nt.nodes.new('ShaderNodeBsdfTransparent')
            mix = nt.nodes.new('ShaderNodeMixShader')
            nt.links.new(tex.outputs['Alpha'], mix.inputs[0])
            nt.links.new(tr.outputs[0], mix.inputs[1])
            nt.links.new(shader.outputs[0], mix.inputs[2])
            shader = mix
        nt.links.new(shader.outputs[0], out.inputs[0])
    bake_mats[m.name] = nm
    return nm


for o in parts:
    for i, s in enumerate(o.material_slots):
        s.material = bake_material(orig_slots[o.name][i])
if C.env('DIAG', '') == 'white':
    wm = bpy.data.materials.new('diag')
    for o in parts:
        for s in o.material_slots:
            s.material = wm


def module_box():
    mn = Vector((1e9,) * 3)
    mx = Vector((-1e9,) * 3)
    for o in parts:
        a, b = bbox(o)
        for i in range(3):
            mn[i] = min(mn[i], a[i])
            mx[i] = max(mx[i], b[i])
    return mn, mx


BOX = module_box()
print('module box', tuple(round(v, 2) for v in BOX[0]), tuple(round(v, 2) for v in BOX[1]))

# 地球の照り返し：窓（あれば）の外、真下から上へ向く青白い面の光
win = None
if MODULE == 'us_lab':
    # 実験棟の下（天底）の窓（WORF の窓）：床の下のくぼみの底。窓のガラスは底の黒い八角形（ラック 003 の絵）。
    # ガラスの面は不透明なので、光はくぼみの底のすぐ上から上へ向けて出す
    win = Vector(json.loads(C.env('WINDOW', 'null')) or (0.02, 6.85, -1.99))
if win is not None and EARTH_FILL > 0:
    ld = bpy.data.lights.new('earth_fill', 'AREA')
    ld.energy = EARTH_FILL
    ld.size = 0.5
    ld.color = (0.75, 0.85, 1.0)
    lo = bpy.data.objects.new('earth_fill', ld)
    lo.location = win
    scene.collection.objects.link(lo)  # 面の光は既定で −Z（下）を向くので、上へ向けるために 180°
    lo.rotation_euler = (math.pi, 0, 0)

w = bpy.data.worlds.new('w')
scene.world = w
w.color = (0, 0, 0)
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.view_settings.view_transform = 'Standard'
scene.cycles.max_bounces = 6
scene.cycles.diffuse_bounces = 4
scene.cycles.transparent_max_bounces = 8


# ---- 確かめの絵 ---------------------------------------------------------------------------------------
# 目の位置と見る点は three.js の座標（x 右舷, y 天頂, z 後ろ）。Blender へは (x, -z, y)
VIEWS = {
    'us_lab': {
        'aft': ((0.0, 0.15, -2.6), (0.0, 0.0, -10.0)),
        'fwd': ((0.0, 0.1, -10.2), (0.0, 0.0, -2.0)),
        'mid': ((0.4, 0.3, -5.0), (-1.0, -0.4, -7.5)),
        'worf': ((0.0, 0.5, -6.0), (0.0, -2.0, -7.0)),
        'bike': ((0.6, 0.2, -6.0), (-0.8, -0.7, -7.6)),
        'ceiling': ((0.0, -0.6, -4.0), (0.0, 1.2, -6.5)),
        'stbd': ((-0.7, 0.0, -6.0), (1.2, 0.0, -6.0)),
        'port': ((0.7, 0.0, -6.0), (-1.2, 0.0, -6.0)),
    },
}


def look(eye, at, lens=14):
    e = Vector((eye[0], -eye[2], eye[1]))
    a = Vector((at[0], -at[2], at[1]))
    cam = scene.camera
    cam.location = e
    cam.rotation_euler = (a - e).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens


def default_views():
    mn, mx = BOX
    c = (mn + mx) / 2
    size = mx - mn
    ax = max(range(3), key=lambda i: size[i])
    e1 = c.copy()
    e2 = c.copy()
    e1[ax] = mn[ax] + size[ax] * 0.12
    e2[ax] = mx[ax] - size[ax] * 0.12
    tb = lambda v: (v.x, v.z, -v.y)  # noqa: E731
    return {'a': (tb(e1), tb(e2)), 'b': (tb(e2), tb(e1))}


def preview():
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    cd = bpy.data.cameras.new('cam')
    cd.clip_start = 0.02
    cam = bpy.data.objects.new('cam', cd)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.resolution_x = PREVIEW_W
    scene.render.resolution_y = PREVIEW_W * 9 // 16
    scene.cycles.samples = PREVIEW_SAMPLES
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = 'AgX'
    views = VIEWS.get(MODULE) or default_views()
    if HEADLAMP > 0:
        ld = bpy.data.lights.new('head', 'POINT')
        ld.energy = HEADLAMP
        ld.shadow_soft_size = 0.3
        head = bpy.data.objects.new('head', ld)
        scene.collection.objects.link(head)
    only = C.env('VIEWS', '')
    prefix = C.env('PREFIX', f's1-{MODULE}')
    for name, (eye, at) in views.items():
        if only and name not in only.split(','):
            continue
        look(eye, at)
        if HEADLAMP > 0:
            # ランプの材質が無いモジュール（きぼう・BEAM など）の確かめ用：カメラの位置に点の光
            head.location = cam.location
        scene.render.filepath = os.path.join(PREVIEW_DIR, f'{prefix}-{name}.png')
        t = time.time()
        bpy.ops.render.render(write_still=True)
        print('rendered', scene.render.filepath, round(time.time() - t), 's')
    scene.view_settings.view_transform = 'Standard'


# ---- 光の UV と焼き込み -------------------------------------------------------------------------------
def lightmap_uv():
    for o in parts:
        me = o.data
        while len(me.uv_layers) > 1:
            me.uv_layers.remove(me.uv_layers[-1])
        uv = me.uv_layers.new(name='light')
        me.uv_layers.active = uv
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = room
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    t = time.time()
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    print('smart_project', round(time.time() - t), 's')
    t = time.time()
    # すきま：焼く絵の 3 画素ほど（にじみ止め）
    bpy.ops.uv.pack_islands(margin=3.0 / BAKE_SIZE, rotate=True, margin_method='FRACTION')
    print('pack_islands', round(time.time() - t), 's')
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in parts:
        o.data.uv_layers.active = o.data.uv_layers['light']


def bake():
    size = BAKE_SIZE * SUPER
    img = bpy.data.images.new('light', size, size, float_buffer=True, alpha=False)
    for m in bake_mats.values():
        nt = m.node_tree
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = img
        n.select = True
        nt.nodes.active = n
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 0
    scene.render.bake.use_pass_direct = True
    scene.render.bake.use_pass_indirect = True
    scene.render.bake.use_pass_color = False
    scene.render.bake.target = 'IMAGE_TEXTURES'
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = room
    t = time.time()
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, use_clear=True, margin=0)
    print(f'baked {size}px x {SAMPLES} spp in {time.time() - t:.0f}s')
    px = np.array(img.pixels[:], dtype=np.float32).reshape(size, size, 4)[..., :3]
    np.save(os.path.join(WORK, f'{MODULE}.light.raw.npy'), px)


def export():
    # 書き出す材質は名前だけ（元の材質にもどす。絵は書き出さないので、中身はアプリで色の絵と光の絵を貼る）
    for o in parts:
        for i, s in enumerate(o.material_slots):
            s.material = orig_slots[o.name][i]
    for l in list(bpy.data.lights):
        bpy.data.lights.remove(l)
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f'{MODULE}.glb')
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_normals=False,
        export_texcoords=True,
        export_materials='EXPORT',
        export_image_format='NONE',
        export_vertex_color='NONE',
        export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=False,
        export_lights=False,
        export_cameras=False,
        export_yup=True,
        export_apply=False,
    )
    print('wrote', path, os.path.getsize(path) // 1024, 'KB')


if PREVIEW:
    preview()
if BAKE:
    lightmap_uv()
    bake()
    import light_finish  # noqa: E402
    stats = light_finish.finish(MODULE, size=BAKE_SIZE)
    meta = {'module': MODULE, 'triangles': tri_total, 'samples': SAMPLES, 'size': BAKE_SIZE, 'lamp': LAMP, 'earthFill': EARTH_FILL, **stats}
    json.dump(meta, open(os.path.join(WORK, f'{MODULE}.bake.json'), 'w'), indent=1)
if EXPORT:
    export()
print('done', round(time.time() - t0), 's')
