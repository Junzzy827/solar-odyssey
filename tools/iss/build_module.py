# 段階 1：ISS のモジュールを 1 つ、アプリ用の glb ＋ 焼いた光（ライトマップ）にする。
#   MODULE=us_lab ISS_SRC=<FBX> .venv/bin/python -I tools/iss/build_module.py
# 切り替え（環境変数）：
#   PREVIEW=1 VIEWS=aft,fwd,... PREVIEW_DIR=...   … Cycles で確かめの絵を撮る（焼く前の見え方。光は本物のランプの面）
#   BAKE=1 BAKE_SIZE=2048 SAMPLES=64 SUPER=1      … 照明（直接＋間接）を 2 番目の UV に焼く（BAKE_SIZE の既定は面積で 1024 / 2048）
#   EXPORT=1 OUT_DIR=public/models/iss            … <module>.glb（絵なし）と <module>.light.<size>.jpg を書く
#   UVTEST=1                                      … 光の UV を作って、絵の何 % を使うか（島の詰まり方）だけ数える（焼かない）
#   DENOISE_LM=1（既定）                          … 焼いた光（生の浮動小数）を OpenImageDenoise でならす（段階 2）
#   SAMPLE_ENDS=1                                 … 段階 1 の見本用：両はしの開いたハッチの先に閉じたハッチを置く（段階 2 では使わない）
#   SHUTTERS=open（既定）/ closed                 … キューポラの窓のふた。open は出さない（窓の外の地球をアプリで見せる）
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
SAMPLES = int(C.env('SAMPLES', '64'))
UVTEST = C.env('UVTEST', '0') == '1'
DENOISE_LM = C.env('DENOISE_LM', '1') == '1'
SHUTTERS = C.env('SHUTTERS', 'open')
# 光の絵の大きさ：見える面の広さで決める（約 110 m² 以上は 2048、小さい部屋は 1024。1 画素 約 1〜1.5 cm）。
# ビームは小さいが、1024 では島のすき間が多くて半分も使えない（48%）ので 2048（60%）
BIG_LIGHTMAP = {'node1', 'us_lab', 'node2', 'node3', 'airlock', 'columbus', 'jpm', 'pmm', 'beam'}
# 材質 1 つで三角形の多いモジュールは、見た目を変えない程度に間引く（三角形の割合）
DECIMATE = {'beam': 0.5, 'bishop': 0.5}
# ランプの材質の無いモジュールに置く光（three の座標 m、強さ W）。本物も持ち運びのランプや壁の照明で明るい
FILL_LIGHTS = {
    'beam': [((-6.43, 0.6, 3.3), 60), ((-6.43, -0.6, 4.6), 40), ((-5.6, 0.0, 2.4), 30)],
    'bishop': [((-8.9, 0.3, 0.0), 25), ((-9.4, -0.3, 0.0), 15)],
    'cupola': [((-6.43, -2.0, 0.0), 12)],
    'jlp': [((-9.75, 3.6, -15.05), 50), ((-10.6, 3.6, -15.05), 30)],
    'jpm': [((-4.5, 1.2, -15.05), 40), ((-8.0, 1.2, -15.05), 40), ((-11.0, 1.0, -15.05), 30)],
}
# 窓から入る地球の照り返し（面の光、three の座標で光の真ん中・大きさ m・強さ W）。上へ向ける
EARTH_WINDOWS = {
    # 実験棟の下（天底）の窓（WORF の窓）：床の下のくぼみの底
    'us_lab': ((0.02, -1.99, -6.85), 0.5, 60),
    # キューポラ：いちばん下の丸い窓のさらに下から、大きな面の光（窓のふたを開けた形のとき）
    'cupola': ((-6.43, -3.9, 0.0), 2.4, 900),
}
SUPER = int(C.env('SUPER', '1'))
PREVIEW_DIR = C.env('PREVIEW_DIR', '/tmp/iss-work/preview')
PREVIEW_SAMPLES = int(C.env('PREVIEW_SAMPLES', '32'))
PREVIEW_W = int(C.env('PREVIEW_W', '1280'))
OUT_DIR = C.env('OUT_DIR', os.path.join(HERE, '..', '..', 'public', 'models', 'iss'))
WORK = C.env('WORK', '/tmp/iss-work')
SAMPLE_ENDS = C.env('SAMPLE_ENDS', '0') == '1'
BAKE_SIZE = int(C.env('BAKE_SIZE', '2048' if MODULE in BIG_LIGHTMAP else '1024'))
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
if MODULE == 'cupola' and SHUTTERS == 'open':
    # 窓のふた（外側にある）は出さない：窓の外にアプリで地球を見せる
    keep = {n for n in keep if not n.startswith('Cupola_WC_')}
# 開いた形の無いハッチ（ノード 3 の左舷 → ビショップ）：同じモジュールの開いたハッチを回して作る
for closed_name in mod.get('synthHatches', []):
    spec = C.SYNTH_HATCHES[closed_name]
    src = bpy.data.objects[spec['from']]
    a0, a1 = C.world_bbox(bpy.data.objects[spec['pivot_from'][0]])
    b0, b1 = C.world_bbox(bpy.data.objects[spec['pivot_from'][1]])
    # 右舷の隔壁の外の面（大きい x）と左舷の隔壁の外の面（小さい x）の真ん中。y（three の −z）はモジュールの軸
    # （両はしの口の真ん中）
    px = (max(a1.x, b1.x) + min(a0.x, b0.x)) / 2
    ends = [h for h in mod['hatches'] if h['to'] in spec['axis_links']]
    py = -sum(h['center'][2] for h in ends) / len(ends)
    h = src.copy()
    h.data = src.data.copy()
    bpy.context.scene.collection.objects.link(h)
    h.name = spec['name']
    h.matrix_world = Matrix.Translation(Vector((px, py, 0))) @ Matrix.Rotation(math.pi, 4, 'Z') @ Matrix.Translation(Vector((-px, -py, 0))) @ src.matrix_world
    keep.add(h.name)
    print('synth hatch', h.name, 'pivot', round(px, 3), round(py, 3), [tuple(round(v, 2) for v in x) for x in C.world_bbox(h)])
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
# 動く物（別の部品）：自転こぎ・寝室の戸・キューポラの窓のガラスとふた。ハッチは段階 2 では動かさない（開いた形・
# 閉じた形を選んで出す）ので、部屋にまとめて描画の数を減らす
movable = [o for o in meshes if C.is_movable(o.name) and not C.is_hatch(o.name) and not o.name.startswith('Sample_Hatch')]
static = [o for o in meshes if o not in movable]
print('static', len(static), 'movable', [o.name for o in movable])
# 光の絵を貼らない部品：キューポラの窓のガラス（アプリでは窓の外の地球を描く型にする）
NO_LIGHT = [o for o in movable if o.name == 'Cupola_Int_Glass']

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
if MODULE in DECIMATE:
    t = time.time()
    n0 = C.tris_of(room)
    dm = room.modifiers.new('dec', 'DECIMATE')
    dm.decimate_type = 'COLLAPSE'
    dm.ratio = float(C.env('DECIMATE_RATIO', str(DECIMATE[MODULE])))
    dm.use_collapse_triangulate = True
    with bpy.context.temp_override(object=room, active_object=room):
        bpy.ops.object.modifier_apply(modifier=dm.name)
    print('decimated', n0, '->', C.tris_of(room), round(time.time() - t, 1), 's')
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

def t2b(p):
    """three の座標 → Blender の座標"""
    return Vector((p[0], -p[2], p[1]))


# 地球の照り返し：窓（あれば）の外、真下から上へ向く青白い面の光。
# 実験棟の窓のガラスは不透明（ラック 003 の絵の黒い八角形）なので、光はくぼみの底のすぐ上から上へ出す
if MODULE in EARTH_WINDOWS and EARTH_FILL > 0 and not (MODULE == 'cupola' and SHUTTERS != 'open'):
    at, size, energy = EARTH_WINDOWS[MODULE]
    if MODULE == 'us_lab':
        energy = EARTH_FILL
    ld = bpy.data.lights.new('earth_fill', 'AREA')
    ld.energy = energy
    ld.size = size
    ld.color = (0.75, 0.85, 1.0)
    lo = bpy.data.objects.new('earth_fill', ld)
    lo.location = t2b(at)
    scene.collection.objects.link(lo)  # 面の光は既定で −Z（下）を向くので、上へ向けるために 180°
    lo.rotation_euler = (math.pi, 0, 0)
# ランプの材質の無いモジュールの光（点の光）
for i, (at, energy) in enumerate(FILL_LIGHTS.get(MODULE, [])):
    ld = bpy.data.lights.new(f'fill{i}', 'POINT')
    ld.energy = energy * float(C.env('FILL', '1'))
    ld.shadow_soft_size = 0.35
    ld.color = (1.0, 0.97, 0.92)
    lo = bpy.data.objects.new(f'fill{i}', ld)
    lo.location = t2b(at)
    scene.collection.objects.link(lo)

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
# 段階 1 は smart_project → pack_islands（すきま 3 画素）で、絵の約 33% しか使わず、細い手すりやラックのふちの島が
# 1〜2 画素の幅しかなく、にじみ・段差が見えた。段階 2：
#   1. smart_project（角度 66°）で島を作り、1 回詰める（形にそって詰める CONCAVE、どの向きにも回す）
#   2. 細い島（短い辺が MIN_PX 画素より細い）を、MIN_PX になるまで（最大 MAX_GROW 倍）大きくする
#   3. もう一度詰める。すきまは MARGIN_PX 画素
MARGIN_PX = float(C.env('MARGIN_PX', '2'))
MIN_PX = float(C.env('MIN_PX', '4'))
MAX_GROW = float(C.env('MAX_GROW', '4'))


def light_parts():
    return [o for o in parts if o not in NO_LIGHT]


def uv_islands(o, layer):
    """UV の島ごとの面の番号（UV がつながっている面どうし）"""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(o.data)
    uvl = bm.loops.layers.uv[layer]
    parent = list(range(len(bm.faces)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    bm.faces.ensure_lookup_table()
    for e in bm.edges:
        lf = e.link_loops
        if len(lf) != 2:
            continue
        l1, l2 = lf
        # 同じ辺の 2 つの面で、UV の端の点が同じならつながっている（向きは逆）
        a1, b1 = l1[uvl].uv, l1.link_loop_next[uvl].uv
        a2, b2 = l2[uvl].uv, l2.link_loop_next[uvl].uv
        if (a1 - b2).length < 1e-6 and (b1 - a2).length < 1e-6:
            i, j = find(l1.face.index), find(l2.face.index)
            if i != j:
                parent[i] = j
    groups = {}
    for f in bm.faces:
        groups.setdefault(find(f.index), []).append(f.index)
    bm.free()
    return list(groups.values())


def grow_thin_islands(objs, size):
    """細い島を大きくする（光の UV の上で、島の真ん中を中心に）"""
    grown = 0
    for o in objs:
        me = o.data
        uv = np.empty(len(me.loops) * 2, np.float32)
        me.uv_layers['light'].data.foreach_get('uv', uv)
        uv = uv.reshape(-1, 2)
        loop_start = np.empty(len(me.polygons), np.int32)
        loop_total = np.empty(len(me.polygons), np.int32)
        me.polygons.foreach_get('loop_start', loop_start)
        me.polygons.foreach_get('loop_total', loop_total)
        for faces in uv_islands(o, 'light'):
            loops = np.concatenate([np.arange(loop_start[f], loop_start[f] + loop_total[f]) for f in faces])
            p = uv[loops]
            c = p.mean(0)
            q = p - c
            # 島の細い向き（主成分）だけを広げる（面積は k 倍で済む。光はなめらかなので、縦横の比が変わってもよい）
            cov = q.T @ q
            w, v = np.linalg.eigh(cov)
            minor = v[:, 0]
            t = q @ minor
            short = float(t.max() - t.min()) * size
            if short >= MIN_PX:
                continue
            k = min(MAX_GROW, MIN_PX / max(short, 0.25))
            uv[loops] = c + q + np.outer(t * (k - 1), minor)
            grown += 1
        me.uv_layers['light'].data.foreach_set('uv', uv.ravel())
    return grown


def uv_mask(objs, size, layer='light'):
    """光の UV の島の画素（True = 島の中）。Blender の絵の向き（下の行が 0）"""
    from PIL import Image, ImageDraw
    im = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(im)
    for o in objs:
        me = o.data
        me.calc_loop_triangles()
        n = len(me.loop_triangles)
        uv = np.empty(len(me.loops) * 2, np.float32)
        me.uv_layers[layer].data.foreach_get('uv', uv)
        tl = np.empty(n * 3, np.int32)
        me.loop_triangles.foreach_get('loops', tl)
        q = uv.reshape(-1, 2)[tl].reshape(n, 3, 2) * size
        for t in q:
            d.polygon([(float(t[0, 0]), float(t[0, 1])), (float(t[1, 0]), float(t[1, 1])), (float(t[2, 0]), float(t[2, 1]))], fill=255)
    return np.array(im) > 0


def pack(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(margin=MARGIN_PX / BAKE_SIZE, margin_method='FRACTION', rotate=True, rotate_method='ANY', shape_method='CONCAVE', scale=True)
    bpy.ops.object.mode_set(mode='OBJECT')


def lightmap_uv():
    objs = light_parts()
    for o in parts:
        me = o.data
        while len(me.uv_layers) > 1:
            me.uv_layers.remove(me.uv_layers[-1])
    for o in objs:
        uv = o.data.uv_layers.new(name='light')
        o.data.uv_layers.active = uv
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    t = time.time()
    bpy.ops.uv.smart_project(angle_limit=math.radians(float(C.env('UV_ANGLE', '66'))), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    print('smart_project', round(time.time() - t), 's')
    t = time.time()
    pack(objs)
    print('pack 1', round(time.time() - t), 's', 'coverage', round(float(uv_mask(objs, 512).mean()), 3))
    if MIN_PX > 0:
        # 細い島を広げて詰め直す。細い部品ばかりのモジュール（ビショップのホース）では、かえって詰まりが悪くなる
        # ことがあるので、そのときは 1 回目の詰め方にもどす
        t = time.time()
        cov1 = float(uv_mask(objs, 1024).mean())
        keep_uv = {}
        for o in objs:
            a = np.empty(len(o.data.loops) * 2, np.float32)
            o.data.uv_layers['light'].data.foreach_get('uv', a)
            keep_uv[o.name] = a
        g = grow_thin_islands(objs, BAKE_SIZE)
        pack(objs)
        cov2 = float(uv_mask(objs, 1024).mean())
        print('grew', g, 'thin islands; pack 2', round(time.time() - t), 's', 'coverage', round(cov1, 3), '->', round(cov2, 3))
        if cov2 < cov1 - 0.03:
            for o in objs:
                o.data.uv_layers['light'].data.foreach_set('uv', keep_uv[o.name])
            print('kept the first packing')
    cov = float(uv_mask(objs, 1024).mean())
    print('lightmap uv coverage', round(cov, 3))
    for o in objs:
        o.data.uv_layers.active = o.data.uv_layers['light']
    return cov


def denoise_lm(lm):
    """焼いた光のざらつきを、コンポジターの Denoise（OpenImageDenoise）で消す（tools/blender/build_shuttle_cabin.py から）。
    焼くときのデノイザーの設定は bake には効かないので、焼いた後の絵（生の浮動小数）に掛ける。
    8 ビットにした後や、ぼかした後では効かない（ノイズとして見分けられなくなる）"""
    h, w = lm.shape[:2]
    img = bpy.data.images.new('lm_den_in', w, h, alpha=False, float_buffer=True)
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(np.dstack([lm[::-1], np.ones((h, w, 1), np.float32)]).astype(np.float32).ravel())
    img.update()
    sc = bpy.data.scenes.new('lm_den')
    cam = bpy.data.objects.new('lm_den_cam', bpy.data.cameras.new('lm_den_cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    tree = bpy.data.node_groups.new('lm_den', 'CompositorNodeTree')
    sc.compositing_node_group = tree
    n_img = tree.nodes.new('CompositorNodeImage')
    n_img.image = img
    den = tree.nodes.new('CompositorNodeDenoise')
    tree.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    out = tree.nodes.new('NodeGroupOutput')
    tree.links.new(n_img.outputs['Image'], den.inputs['Image'])
    tree.links.new(den.outputs['Image'], out.inputs['Image'])
    den.inputs['HDR'].default_value = True
    den.inputs['Quality'].default_value = 'High'
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = w, h, 100
    sc.render.image_settings.file_format = 'OPEN_EXR'
    sc.render.image_settings.color_depth = '32'
    sc.render.compositor_device = 'CPU'  # 画面の無い環境では GPU のコンポジターが動かない
    path = os.path.join(WORK, f'{MODULE}.lm_den.exr')
    sc.render.filepath = path
    t = time.time()
    bpy.ops.render.render(write_still=True, scene=sc.name)
    res = bpy.data.images.load(path)
    px = np.empty(w * h * 4, np.float32)
    res.pixels.foreach_get(px)
    o = px.reshape(h, w, 4)[::-1, :, :3].copy()
    print(f'denoise {w}px in {time.time() - t:.1f}s, changed {float(np.abs(o - lm).mean() / max(1e-6, lm.mean())) * 100:.1f}%')
    bpy.data.images.remove(res)
    bpy.data.images.remove(img)
    bpy.data.scenes.remove(sc)
    bpy.data.node_groups.remove(tree)
    return o


def bake():
    from scipy import ndimage
    objs = light_parts()
    size = BAKE_SIZE * SUPER
    img = bpy.data.images.new('light', size, size, float_buffer=True, alpha=False)
    for m in bake_mats.values():
        nt = m.node_tree
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = img
        n.select = True
        nt.nodes.active = n
    # 窓のガラスは焼かない（光を通す）
    for o in NO_LIGHT:
        o.hide_render = True
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 0
    scene.render.bake.use_pass_direct = True
    scene.render.bake.use_pass_indirect = True
    scene.render.bake.use_pass_color = False
    scene.render.bake.target = 'IMAGE_TEXTURES'
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = room
    t = time.time()
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, use_clear=True, margin=0)
    print(f'baked {size}px x {SAMPLES} spp in {time.time() - t:.0f}s')
    for o in NO_LIGHT:
        o.hide_render = False
    px = np.array(img.pixels[:], dtype=np.float32).reshape(size, size, 4)[..., :3]
    # 島の画素（UV の三角形）で、値の入っている所。すきまと真っ黒な隠れた面は、近い島の値で埋めてからノイズを取る
    # （黒いすきまが残っていると、デノイザーが島のふちを暗くする）
    island = uv_mask(objs, size)
    lum = px[..., 0] * 0.2126 + px[..., 1] * 0.7152 + px[..., 2] * 0.0722
    valid = island & (lum > 1e-5)
    idx = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
    filled = px[idx[0], idx[1]]
    if DENOISE_LM:
        filled = denoise_lm(np.ascontiguousarray(filled))
    np.save(os.path.join(WORK, f'{MODULE}.light.raw.npy'), filled)
    np.save(os.path.join(WORK, f'{MODULE}.light.mask.npy'), valid)


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
if UVTEST:
    lightmap_uv()
if BAKE:
    t = time.time()
    coverage = lightmap_uv()
    bake()
    import light_finish  # noqa: E402
    stats = light_finish.finish(MODULE, size=BAKE_SIZE)
    tri_total = sum(C.tris_of(o) for o in parts)
    meta = {'module': MODULE, 'triangles': tri_total, 'samples': SAMPLES, 'size': BAKE_SIZE, 'lamp': LAMP, 'earthFill': EARTH_FILL,
            'uvCoverage': coverage, 'denoised': DENOISE_LM, 'bakeSeconds': round(time.time() - t), **stats}
    json.dump(meta, open(os.path.join(WORK, f'{MODULE}.bake.json'), 'w'), indent=1)
if EXPORT:
    export()
print('done', round(time.time() - t0), 's')
