"""
人が乗る与圧ローバー PR-2「ミチカケ」（全長 6.0 m、全幅 4.6 m、全高 3.7 m）を Blender で組み立てる。

アルテミス計画で日本が開発している「有人与圧ローバー」（宇宙服を着ずに中で暮らせる月面の車）を
参考にした、このアプリのオリジナルのデザイン。実在の車の名前・ロゴ・形はまねしていない。
  - 車体：前が斜めに切れた、角の丸い白い与圧キャビン（中は 2 人、非常時は 4 人）
  - 前面：大きな 2 枚の窓と、窓の下の前照灯の帯、左右の丸い灯
  - 屋根：放熱板 2 枚、後ろに立てた太陽電池、通信アンテナ、前のカメラ台
  - 後ろ：エアロックのハッチ、はしご、足場
  - 足まわり：6 輪（片側 3 輪）。車輪は金網のタイヤに山形のラグ
  - 横：手すり、物入れ、金色の断熱材の帯

座標は Blender のまま（Z が上、前方が +Y、右が +X）。単位はメートル。地面が z=0。
車輪は別のオブジェクト Wheel_{F,M,R}{R,L}（原点が車軸）。そのほかはまとめて Body。
three.js 側（src/components/surface/CrewRover.tsx）は WHEELS の位置をこのファイルの数字と合わせている。

実行:
  /home/user/.bpyvenv/bin/python tools/blender/build_crew_rover.py
  PREVIEW=1     確認用の画像を PREVIEW_DIR に書き出す（VIEWS=hero,rear,side,front,top）
  EXPORT=1      public/models/rover-crew.glb に書き出す（そのあと node tools/glb/compress.mjs で圧縮する）
"""

import math
import os

import bpy
import bmesh
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.environ.get('OUT', os.path.join(ROOT, 'public', 'models', 'rover-crew.glb'))
PREVIEW_DIR = os.environ.get('PREVIEW_DIR', '/tmp')

# 車輪（右側。左は x を反転）。CrewRover.tsx の WHEELS / WHEEL_R と同じ数字
WHEEL_R = 0.62
WHEEL_W = 0.48
WHEEL_X = 1.95
WHEEL_Y = {'F': 2.05, 'M': 0.0, 'R': -2.05}

PALETTE = {  # 色, ラフネス, メタリック
    'Hull': ('#d9d7d1', 0.5, 0.0),
    'Hull2': ('#c9ccd1', 0.35, 0.3),
    'Dark': ('#2a2d33', 0.55, 0.2),
    'Mech': ('#565b63', 0.4, 0.75),
    'Metal': ('#a9aeb5', 0.25, 1.0),
    'Tyre': ('#77797c', 0.45, 0.85),
    'Lug': ('#3b3d40', 0.6, 0.6),
    'Solar': ('#142454', 0.16, 0.4),
    'Glass': ('#0b1320', 0.04, 0.2),
    'Lamp': ('#fff3da', 0.3, 0.0),
    'Gold': ('#c9952f', 0.3, 1.0),
    'Accent': ('#2f7fd0', 0.4, 0.1),
}


def lin(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def material(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    col, rough, metal = PALETTE[name]
    b.inputs['Base Color'].default_value = (*lin(col), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if name == 'Lamp':
        b.inputs['Emission Color'].default_value = (*lin(col), 1)
        b.inputs['Emission Strength'].default_value = 6
    return m


PARTS = {}  # 名前 → オブジェクトの一覧（あとで 1 つにまとめる）


def keep(obj, group='Body', mat=None, smooth=True):
    if mat:
        obj.data.materials.clear()
        obj.data.materials.append(material(mat))
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    PARTS.setdefault(group, []).append(obj)
    return obj


def apply_mods(obj):
    bpy.context.view_layer.objects.active = obj
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def rbox(center, size, mat, bevel=0.03, seg=2, group='Body', rot=(0, 0, 0)):
    """角を丸めた箱"""
    bpy.ops.mesh.primitive_cube_add(size=1, location=center, rotation=rot)
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        b = o.modifiers.new('b', 'BEVEL')
        b.width = bevel
        b.segments = seg
        b.limit_method = 'ANGLE'
        apply_mods(o)
    return keep(o, group, mat)


def cyl(a, b, r, mat, n=24, group='Body', bevel=0.0, r2=None):
    """a から b への円柱（r2 があれば円すい台）"""
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=n, radius1=r, radius2=r if r2 is None else r2, depth=d.length, location=(a + b) / 2)
    o = bpy.context.object
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    if bevel > 0:
        m = o.modifiers.new('b', 'BEVEL')
        m.width = bevel
        m.segments = 2
        m.limit_method = 'ANGLE'
        apply_mods(o)
    return keep(o, group, mat)


def bar(a, b, r, mat='Metal', group='Body'):
    return cyl(a, b, r, mat, n=8, group=group)


# ---- 与圧キャビン ---------------------------------------------------------------------------------
# 側面の輪郭（y, z）。前が斜めに切れ、後ろはほぼ垂直。これを左右に押し出して、角を大きく丸める
CAB_X = 1.42
CAB_SIDE = [(-2.55, 1.02), (2.35, 1.02), (2.75, 1.55), (2.55, 2.25), (1.55, 3.28), (-2.25, 3.28), (-2.6, 3.0)]


def cabin():
    bm = bmesh.new()
    vs_r = [bm.verts.new((CAB_X, y, z)) for y, z in CAB_SIDE]
    vs_l = [bm.verts.new((-CAB_X, y, z)) for y, z in CAB_SIDE]
    n = len(CAB_SIDE)
    bm.faces.new(list(reversed(vs_r)))
    bm.faces.new(vs_l)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([vs_r[i], vs_r[j], vs_l[j], vs_l[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('cab')
    bm.to_mesh(me)
    o = bpy.data.objects.new('cab', me)
    bpy.context.collection.objects.link(o)
    b = o.modifiers.new('b', 'BEVEL')
    b.width = 0.34
    b.segments = 6
    b.limit_method = 'ANGLE'
    b.angle_limit = math.radians(20)
    apply_mods(o)
    keep(o, 'Body', 'Hull')


def windows():
    # 前の大きな窓 2 枚：斜めの面（(2.55, 2.25) → (1.55, 3.28)）にすこし浮かせて
    a = Vector((0, 2.55, 2.25))
    b = Vector((0, 1.55, 3.28))
    mid = (a + b) / 2
    d = (b - a).normalized()
    nrm = Vector((0, d.z, -d.y))  # 外向き（前・上）
    ang = math.atan2(-d.y, d.z)  # 面の傾き（x 軸まわり。箱の z が面に沿う）
    for sx in (-1, 1):
        c = mid + nrm * 0.035 + Vector((sx * 0.6, 0, 0)) + d * 0.02
        rbox(c, (1.0, 0.05, 1.08), 'Glass', bevel=0.14, seg=3, rot=(ang, 0, 0))
    # 窓のまわりの黒い縁（2 枚の窓のあいだは細い柱になる）
    rbox(mid + nrm * 0.012 + d * 0.02, (2.5, 0.04, 1.24), 'Dark', bevel=0.18, seg=3, rot=(ang, 0, 0))
    # 横の窓（左右 2 つずつ、丸い角）
    for sx in (-1, 1):
        for y in (1.45, 0.55):
            rbox((sx * (CAB_X + 0.005), y, 2.55), (0.04, 0.62, 0.5), 'Glass', bevel=0.12, seg=3)
            rbox((sx * (CAB_X - 0.005), y, 2.55), (0.03, 0.74, 0.62), 'Dark', bevel=0.15, seg=3)


def seams():
    # パネルの継ぎ目（細い溝）と、横の「満ち欠け」の紋（金の円に白い円を重ねた三日月）
    for sx in (-1, 1):
        x = sx * (CAB_X + 0.003)
        for y in (-1.7, 0.05, 2.0):
            rbox((x, y, 2.15), (0.012, 0.014, 1.95 if y < 2 else 1.0), 'Dark', bevel=0.0)
        rbox((x, -0.1, 2.05), (0.012, 4.6, 0.014), 'Dark', bevel=0.0)
        cyl((x, -0.95, 2.6), (x + sx * 0.012, -0.95, 2.6), 0.26, 'Gold', n=32)
        cyl((x + sx * 0.012, -0.85, 2.64), (x + sx * 0.02, -0.85, 2.64), 0.22, 'Hull', n=32)
    # 屋根の継ぎ目
    rbox((0, -0.4, 3.283), (2.3, 0.014, 0.012), 'Dark', bevel=0.0)


def lights():
    # 窓の下の前照灯の帯と、左右の丸い灯
    rbox((0, 2.72, 1.72), (1.7, 0.08, 0.1), 'Lamp', bevel=0.04)
    rbox((0, 2.7, 1.72), (1.9, 0.08, 0.22), 'Dark', bevel=0.06)
    for sx in (-1, 1):
        cyl((sx * 1.12, 2.62, 1.38), (sx * 1.12, 2.78, 1.38), 0.13, 'Dark', n=24)
        cyl((sx * 1.12, 2.78, 1.38), (sx * 1.12, 2.8, 1.38), 0.1, 'Lamp', n=24)
        # 屋根の前の作業灯
        rbox((sx * 0.9, 1.45, 3.33), (0.34, 0.12, 0.08), 'Lamp', bevel=0.02)
    # 前のバンパー
    rbox((0, 2.6, 1.0), (2.6, 0.3, 0.18), 'Mech', bevel=0.06)


def underbody():
    # 車台（キャビンの下の黒い台）と、横の金色の断熱材の帯・青い線
    rbox((0, 0, 0.98), (2.9, 5.3, 0.3), 'Dark', bevel=0.08)
    for sx in (-1, 1):
        rbox((sx * (CAB_X + 0.01), -0.1, 1.24), (0.04, 4.9, 0.18), 'Gold', bevel=0.02)
        rbox((sx * (CAB_X + 0.012), -0.1, 1.39), (0.03, 4.9, 0.04), 'Accent', bevel=0.01)
        # 物入れ（後ろの車輪の前）
        rbox((sx * (CAB_X + 0.1), -1.0, 1.8), (0.2, 0.9, 0.6), 'Hull2', bevel=0.05)
        rbox((sx * (CAB_X + 0.205), -1.0, 1.8), (0.02, 0.78, 0.04), 'Dark', bevel=0.005)
        # 手すり
        for z in (2.95,):
            bar((sx * (CAB_X + 0.1), -2.0, z), (sx * (CAB_X + 0.1), 1.6, z), 0.025)
            for y in (-2.0, -0.2, 1.6):
                bar((sx * (CAB_X - 0.02), y, z), (sx * (CAB_X + 0.1), y, z), 0.02)


def arc(c, r, w, t, a0, a1, mat, n=14):
    """車輪の上の泥よけ：車軸（x 方向）まわりの円弧の板。角度は真上が 0、前が +"""
    bm = bmesh.new()
    rows = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        ring = []
        for rr in (r, r + t):
            for x in (-w / 2, w / 2):
                ring.append(bm.verts.new((c.x + x, c.y + math.sin(a) * rr, c.z + math.cos(a) * rr)))
        rows.append(ring)
    for i in range(n):
        a, b = rows[i], rows[i + 1]
        for q in ((0, 1), (1, 3), (3, 2), (2, 0)):
            bm.faces.new([a[q[0]], a[q[1]], b[q[1]], b[q[0]]])
    bm.faces.new([rows[0][k] for k in (0, 2, 3, 1)])
    bm.faces.new([rows[-1][k] for k in (0, 1, 3, 2)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('arc')
    bm.to_mesh(me)
    o = bpy.data.objects.new('arc', me)
    bpy.context.collection.objects.link(o)
    return keep(o, 'Body', mat)


def fenders():
    for sx in (-1, 1):
        for k, wy in WHEEL_Y.items():
            # 車輪の上の泥よけ（ゆるい山形）
            arc(Vector((sx * WHEEL_X, wy, WHEEL_R)), WHEEL_R + 0.13, WHEEL_W + 0.16, 0.05, -62, 62, 'Hull2')
            # サスペンション：車台から車軸へ 2 本の腕と、ダンパー
            hub = Vector((sx * (WHEEL_X - WHEEL_W / 2 - 0.08), wy, WHEEL_R))
            for dy in (-0.32, 0.32):
                cyl((sx * 1.3, wy + dy, 0.95), hub + Vector((0, dy * 0.3, 0.05)), 0.06, 'Mech', n=10)
            cyl((sx * 1.25, wy + 0.1, 1.25), hub + Vector((0, 0.1, 0.12)), 0.07, 'Metal', n=12)
            cyl(hub + Vector((sx * -0.05, 0, 0)), hub + Vector((sx * 0.12, 0, 0)), 0.16, 'Mech', n=20)


def roof():
    # 放熱板 2 枚（すこし浮かせて、縁は濃い色）
    for sx in (-1, 1):
        rbox((sx * 0.62, -0.55, 3.34), (1.0, 2.6, 0.05), 'Hull2', bevel=0.02)
        for i in range(9):
            rbox((sx * 0.62, -1.75 + i * 0.3, 3.375), (0.92, 0.03, 0.02), 'Metal', bevel=0.0)
    # 後ろの太陽電池：屋根の後ろの端に、斜めに立てた 1 枚
    rbox((0, -2.05, 3.32), (0.25, 0.2, 0.12), 'Mech', bevel=0.03)
    bar((0, -2.05, 3.35), (0, -2.05, 3.7), 0.05, 'Metal')
    rbox((0, -2.15, 3.95), (2.8, 0.05, 0.9), 'Solar', bevel=0.015, rot=(math.radians(-25), 0, 0))
    rbox((0, -2.12, 3.95), (2.86, 0.03, 0.96), 'Metal', bevel=0.0, rot=(math.radians(-25), 0, 0))
    for i in range(1, 6):
        rbox((-1.4 + i * 0.467, -2.18, 3.94), (0.012, 0.03, 0.88), 'Metal', bevel=0.0, rot=(math.radians(-25), 0, 0))
    # 通信アンテナ（皿）と柱
    bar((-1.0, 0.85, 3.3), (-1.0, 0.85, 3.85), 0.04, 'Metal')
    cyl((-1.0, 0.85, 3.84), (-1.0, 0.94, 4.0), 0.06, 'Mech', n=12, r2=0.32)
    cyl((-1.0, 0.94, 4.0), (-1.0, 0.95, 4.02), 0.32, 'Hull', n=28)
    bar((-1.0, 0.95, 4.0), (-1.0, 1.15, 4.12), 0.012, 'Metal')
    # 細いアンテナ
    bar((1.1, 0.7, 3.3), (1.1, 0.7, 4.3), 0.015, 'Metal')
    # 前のカメラ台（ステレオカメラ）
    rbox((0, 1.62, 3.38), (0.7, 0.24, 0.14), 'Mech', bevel=0.04)
    for sx in (-1, 1):
        cyl((sx * 0.22, 1.7, 3.38), (sx * 0.22, 1.79, 3.38), 0.055, 'Glass', n=16)


def rear():
    # エアロックのハッチ（後ろの面、角の丸い四角の扉と枠、窓）
    y = -2.6
    rbox((0, y - 0.02, 2.05), (1.2, 0.08, 1.55), 'Hull2', bevel=0.22, seg=4)
    rbox((0, y - 0.06, 2.05), (1.0, 0.04, 1.35), 'Hull', bevel=0.2, seg=4)
    cyl((0, y - 0.08, 2.4), (0, y - 0.1, 2.4), 0.16, 'Glass', n=24)
    rbox((0.36, y - 0.11, 1.95), (0.06, 0.05, 0.3), 'Mech', bevel=0.02)
    # 足場とはしご
    rbox((0, y - 0.38, 1.1), (1.3, 0.6, 0.06), 'Mech', bevel=0.02)
    for sx in (-1, 1):
        bar((sx * 0.45, y - 0.65, 1.1), (sx * 0.45, y - 0.8, 0.25), 0.025)
    for i in range(4):
        t = i / 3
        bar((-0.45, y - 0.65 - 0.15 * t, 1.1 - 0.85 * t), (0.45, y - 0.65 - 0.15 * t, 1.1 - 0.85 * t), 0.02)
    # 後ろの灯（赤ではなく、白い作業灯）
    for sx in (-1, 1):
        rbox((sx * 1.15, y - 0.03, 2.95), (0.3, 0.06, 0.08), 'Lamp', bevel=0.02)


def wheel(name, sx, wy):
    """金網のタイヤ：円筒と、山形のラグ。中心にハブ。オブジェクトの原点が車軸"""
    grp = f'Wheel_{name}'
    c = Vector((sx * WHEEL_X, wy, WHEEL_R))
    hw = WHEEL_W / 2
    cyl(c + Vector((-hw, 0, 0)), c + Vector((hw, 0, 0)), WHEEL_R - 0.05, 'Tyre', n=40, group=grp, bevel=0.03)
    # ラグ（山形 = 2 本の斜めの棒）
    for i in range(20):
        a = i / 20 * math.pi * 2
        for side in (-1, 1):
            p = c + Vector((side * hw * 0.5, math.sin(a) * (WHEEL_R - 0.03), math.cos(a) * (WHEEL_R - 0.03)))
            rbox(p, (hw * 0.95, 0.06, 0.06), 'Lug', bevel=0.0, group=grp, rot=(-a, 0, side * 0.5))
    # ハブ・スポーク（外側の面）
    face = c + Vector((sx * (hw + 0.01), 0, 0))
    cyl(face - Vector((sx * 0.02, 0, 0)), face + Vector((sx * 0.06, 0, 0)), 0.2, 'Mech', n=20, group=grp)
    cyl(face + Vector((sx * 0.06, 0, 0)), face + Vector((sx * 0.1, 0, 0)), 0.09, 'Metal', n=16, group=grp)
    for i in range(6):
        a = i / 6 * math.pi * 2
        p = face + Vector((0, math.sin(a) * 0.36, math.cos(a) * 0.36))
        rbox(p, (0.04, 0.07, 0.36), 'Mech', bevel=0.0, group=grp, rot=(-a, 0, 0))
    # 縁の金属の輪
    for side in (-1, 1):
        cyl(c + Vector((side * hw - 0.02, 0, 0)), c + Vector((side * hw + 0.02, 0, 0)), WHEEL_R - 0.02, 'Metal', n=40, group=grp)


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cabin()
    windows()
    seams()
    lights()
    underbody()
    fenders()
    roof()
    rear()
    for k, wy in WHEEL_Y.items():
        wheel(k + 'R', 1, wy)
        wheel(k + 'L', -1, wy)
    objs = {}
    for name, parts in PARTS.items():
        bpy.ops.object.select_all(action='DESELECT')
        for p in parts:
            p.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        bpy.ops.object.join()
        o = bpy.context.object
        o.name = name
        o.data.name = name
        # 車輪は原点を車軸へ
        if name.startswith('Wheel_'):
            k = name[6:]
            sx = 1 if k[1] == 'R' else -1
            axle = Vector((sx * WHEEL_X, WHEEL_Y[k[0]], WHEEL_R))
            bpy.context.scene.cursor.location = axle
            bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        # 平らな面はかくっと、丸い面はなめらかに
        bpy.ops.object.shade_auto_smooth(angle=math.radians(35)) if hasattr(bpy.ops.object, 'shade_auto_smooth') else None
        objs[name] = o
    allv = [o.matrix_world @ v.co for o in objs.values() for v in o.data.vertices]
    lo = Vector((min(v.x for v in allv), min(v.y for v in allv), min(v.z for v in allv)))
    hi = Vector((max(v.x for v in allv), max(v.y for v in allv), max(v.z for v in allv)))
    tris = sum(len(p.vertices) - 2 for o in objs.values() for p in o.data.polygons)
    print(f'size {hi.x - lo.x:.2f} x {hi.y - lo.y:.2f} x {hi.z - lo.z:.2f} (z {lo.z:.2f}..{hi.z:.2f})  tris {tris}', flush=True)
    return objs


def preview(objs):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = int(os.environ.get('PREVIEW_SAMPLES', '24'))
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    scene.view_settings.view_transform = 'AgX'
    scene.world = bpy.data.worlds.new('w')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.02, 0.022, 0.026, 1)
    # 月の地面
    bpy.ops.mesh.primitive_plane_add(size=80)
    g = bpy.context.object
    gm = bpy.data.materials.new('ground')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.16, 0.155, 0.15, 1)
    gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.95
    g.data.materials.append(gm)
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 4.5
    sun.data.angle = math.radians(0.6)
    sun.rotation_euler = (math.radians(55), 0, math.radians(-40))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.lens = 40
    scene.collection.objects.link(cam)
    scene.camera = cam
    views = {
        'hero': ((9.5, 9.0, 3.6), (0, 0.2, 1.7)),
        'rear': ((-7.0, -9.5, 3.2), (0, -0.5, 1.7)),
        'side': ((13.0, 0, 2.0), (0, 0, 1.8)),
        'front': ((0, 13.0, 2.0), (0, 0, 1.8)),
        'top': ((6.0, 5.0, 11.0), (0, 0, 1.5)),
    }
    for v in os.environ.get('VIEWS', 'hero,rear,side,front').split(','):
        pos, look = views[v]
        cam.location = pos
        d = Vector(look) - Vector(pos)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(PREVIEW_DIR, f'crew-{v}.png')
        bpy.ops.render.render(write_still=True)
        print('wrote', scene.render.filepath, flush=True)


def export(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs.values():
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=OUT, export_format='GLB', use_selection=True, export_vertex_color='NONE',
        export_normals=True, export_texcoords=False, export_tangents=False, export_materials='EXPORT', export_yup=True,
    )
    print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB', flush=True)


if __name__ == '__main__':
    objs = build()
    if os.environ.get('EXPORT'):
        export(objs)
    if os.environ.get('PREVIEW'):
        preview(objs)
