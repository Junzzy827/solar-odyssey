# ISS の中（NASA 3D Resources の "ISS_Interior_PBR_24.05_revA"）を扱うスクリプトの共通部分。
# split_modules.py（調べて modules.json を作る）と build_module.py（モジュールごとに焼いて glb にする）が使う。
#
# 元の FBX の座標（Blender に読み込んだあと）：単位は約 10 cm（デシメートル）、+X が前（進む向き）、+Y が左舷、+Z が天頂。
# アプリの座標（このプロジェクトの決まり）：m、Blender では +X が右舷・+Y が前・+Z が天頂 → glb（Y 上）では
# three.js の +X 右舷・+Y 天頂・−Z 前。原点はノード 1（ユニティ）の真ん中。全部のモジュールをこの同じ座標で書き出すので、
# 並べるだけで組み上がる（モジュールごとのずらしは要らない）。
import bpy
import os
import math
from mathutils import Matrix, Vector

SRC_UNIT = 0.1  # 元の 1 単位 = 0.1 m

# モジュール：id、表示名のキー（i18n の issModules）、名前の頭
MODULES = [
    ('node1', 'unity', ['Node1_']),
    ('us_lab', 'destiny', ['US_Lab_', 'USLab_', 'CEVIS', 'Cevis', 'WORF']),
    ('node2', 'harmony', ['Node2_']),
    ('node3', 'tranquility', ['Node3_']),
    ('cupola', 'cupola', ['Cupola_']),
    ('airlock', 'quest', ['Airlock_']),
    ('columbus', 'columbus', ['Columbus_']),
    ('jpm', 'kiboPm', ['JPM_']),
    ('jlp', 'kiboElm', ['JLP_']),
    ('pmm', 'leonardo', ['PMM']),
    ('beam', 'beam', ['BEAM_']),
    ('bishop', 'bishop', ['Bishop_']),
]

# モジュールのあいだのつなぎ目（Module_Connect.*）：どの 2 つのあいだか。持ち主は先に書いた方
CONNECTORS = {
    'Module_Connect.000': ('airlock', 'node1'),
    'Module_Connect.001': ('node3', 'node1'),
    'Module_Connect.002': ('us_lab', 'node1'),
    'Module_Connect.003': ('us_lab', 'node2'),
    'Module_Connect.004': ('columbus', 'node2'),
    'Module_Connect.005': ('jpm', 'node2'),
    'Module_Connect.006': ('jlp', 'jpm'),
    'Module_Connect.007': ('pmm', 'node3'),
    'Module_Connect.008': ('node2', None),  # ノード 2 の下（今は何もつながっていない）
}

# ワッペン・シール（乗組員のパッチ）は出さない
HIDE_MATERIALS = {'Patches1', 'Patches2'}

# 材質にテクスチャがつながっていない（FBX の取りこみで切れた）ときに使う絵
DIFFUSE_FALLBACK = {
    'Generic_Misc_Details': 'Generic_Misc_Details_Diffuse.png',
    'Generic_Hub': 'Generic_HubAndMetals_Diffuse.png',
}

# 動く物・さわる物（まとめずに別の部品として残す）。名前に含まれる文字で決める
MOVABLE_KEYS = ['Hatch', 'CEVIS.Bike', 'Cupola_WC_', 'Cupola_Int_Glass', 'CrwQtr_LftDoor', 'CrwQtr_RgtDoor']


def module_of(name):
    if name in CONNECTORS:
        return CONNECTORS[name][0]
    for mid, _key, prefixes in MODULES:
        if any(name.startswith(p) for p in prefixes):
            return mid
    return None


def is_movable(name):
    return any(k in name for k in MOVABLE_KEYS)


def tex_key(image_name):
    """'USLab_Racks_01_Diffuse.png.001' → 'uslab_racks_01'（アプリのテクスチャの名前）"""
    base = image_name.split('.png')[0]
    base = base.replace('_Diffuse', '')
    return base.lower().replace('-', '_').replace(' ', '_')


def diffuse_image(mat):
    """材質の色の絵（Base Color につながっている画像）"""
    if mat is None or not mat.node_tree:
        return None
    for l in mat.node_tree.links:
        if l.to_socket.name == 'Base Color' and l.from_node.bl_idname == 'ShaderNodeTexImage':
            return l.from_node.image
    fb = DIFFUSE_FALLBACK.get(mat.name)
    if fb:
        return bpy.data.images.get(fb)
    return None


def uses_alpha(mat):
    if mat is None or not mat.node_tree:
        return False
    return any(l.to_socket.name == 'Alpha' for l in mat.node_tree.links)


def emissive(mat):
    if mat is None or not mat.node_tree:
        return False
    return any(l.to_socket.name.startswith('Emission') for l in mat.node_tree.links) or mat.name.endswith('LIGHTS') or mat.name == 'Generic_Lights'


def import_fbx(src):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=src)


def station_origin():
    """ノード 1 の真ん中（元の座標）：左右のつなぎ目（000・001）の真ん中"""
    a = bpy.data.objects['Module_Connect.000']
    b = bpy.data.objects['Module_Connect.001']
    def c(o):
        bb = [o.matrix_world @ Vector(v) for v in o.bound_box]
        return sum(bb, Vector()) / 8
    ca, cb = c(a), c(b)
    return Vector(((ca.x + cb.x) / 2, (ca.y + cb.y) / 2, (ca.z + cb.z) / 2))


def app_matrix(origin):
    """元の座標 → アプリの座標（Blender の m、+X 右舷・+Y 前・+Z 天頂）"""
    return Matrix.Scale(SRC_UNIT, 4) @ Matrix.Rotation(math.radians(90), 4, 'Z') @ Matrix.Translation(-origin)


def to_app_frame():
    """全部の物を、親を外してアプリの座標に置き直す（形はそのまま、置き場所の行列だけ）"""
    origin = station_origin()
    W = app_matrix(origin)
    objs = list(bpy.data.objects)
    mw = {o.name: o.matrix_world.copy() for o in objs}
    for o in objs:
        o.parent = None
    for o in objs:
        o.matrix_world = W @ mw[o.name]
    bpy.context.view_layer.update()
    return origin


def world_bbox(o):
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
    mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    return mn, mx


def b2three(v):
    """Blender（Z 上）→ three.js（Y 上）"""
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


def tris_of(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def env(name, default):
    return os.environ.get(name, default)
