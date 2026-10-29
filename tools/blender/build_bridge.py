"""
艦橋（ブリッジ）の部屋を Blender で組み立て、照明を焼き込んで（ベイク）書き出す。

  - 部屋の殻（床・後ろの高い床とスロープ・壁・窓まわり・天井と天窓）
  - 手すりと防御・センサー席、艦長席と左右の席、操舵・運用の前の 2 席
  - 後ろと横の壁のステーション、昇降機の扉、銘板、天井の照明
を、断面を道筋に沿って掃引する（sweep）関数と、角を丸めた箱で作る。

画面（screen_*）と銘板（plaque）は焼き込まずに別の部品として残し、アプリ側で絵を貼る。
それ以外はひとつにまとめ、Cycles で照明（直接光＋間接光）を 1 枚の絵に焼き込む。
アプリではその絵を貼るだけ（光の計算なし）なので、スマホでも軽い。

座標は m。Blender では X が右・Y が前・Z が上（glTF に書き出すと three.js の -Z が前・Y が上になる）。
寸法は src/data/bridge.ts の ROOM と合わせてある。

書き出すもの:
  public/models/bridge.glb        形（UV は焼き込みの絵の座標）
  public/models/bridge-light.jpg  焼き込んだ照明

実行（Blender の Python モジュール bpy が入った Python 3.13 で）:
  python -m venv .venv && .venv/bin/pip install bpy
  .venv/bin/python tools/blender/build_bridge.py
  （PREVIEW=1 で焼き込みの代わりに確認用の絵を描く。BAKE_SIZE・SAMPLES で品質を変えられる）
"""

import math
import os
import sys
import time

import bpy  # bpy を先に読み込むと bmesh・mathutils が使えるようになる
import bmesh
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_GLB = os.path.join(ROOT, 'public', 'models', 'bridge.glb')
OUT_LIGHT = os.path.join(ROOT, 'public', 'models', 'bridge-light.jpg')
BAKE_SIZE = int(os.environ.get('BAKE_SIZE', '2048'))
SAMPLES = int(os.environ.get('SAMPLES', '160'))
PREVIEW = os.environ.get('PREVIEW')

# ---- src/data/bridge.ts の ROOM と同じ寸法 -------------------------------------
RX, RY = 8.0, 6.5  # 楕円の半径（左右・前後）
HEIGHT = 4.2
DECK = 0.4
RAIL_R = 3.7
WIN_HALF = 0.95
WIN_BOTTOM = 0.45
WIN_TOP = 3.5
SKYLIGHT = 1.6

PI = math.pi
FRONT = PI / 2  # 正面（+Y）
# 後ろの高い床（a は楕円の角度。three.js の θ の符号を反転したもの）
RAIL_A0, RAIL_A1 = -PI + 0.42, -0.42  # 手すりのある範囲
RAMP = 0.42  # 左右のスロープの角度の幅
CEIL_LOW = 3.9  # 外まわりの天井
CEIL_HIGH = 4.15  # 中央の一段高い天井
CEIL_INNER = 0.62  # 一段高い天井が始まる楕円の大きさ（部屋に対する割合）
CENTER = Vector((0, 0, 1.7))  # 殻の面は、ここから見て表になる向きにそろえる


# ---- 下準備 --------------------------------------------------------------------
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    world = bpy.data.worlds.new('space')
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.010, 0.013, 0.022, 1)
    bg.inputs['Strength'].default_value = 1.0
    scene.world = world
    return scene


MATS = {}


def material(name, color, rough=0.6, metal=0.0, emit=None, strength=0.0, noise=0.0, wood=False):
    """Principled の素材。noise で色むら（じゅうたんの毛並み）、wood で木目を足す"""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if emit:
        p.inputs['Emission Color'].default_value = (*emit, 1)
        p.inputs['Emission Strength'].default_value = strength
    if noise or wood:
        tc = nt.nodes.new('ShaderNodeTexCoord')
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        lo = [c * (1 - noise if noise else 0.7) for c in color]
        hi = [min(1, c * (1 + noise if noise else 1.25)) for c in color]
        ramp.color_ramp.elements[0].color = (*lo, 1)
        ramp.color_ramp.elements[1].color = (*hi, 1)
        if wood:
            tex = nt.nodes.new('ShaderNodeTexWave')
            tex.inputs['Scale'].default_value = 7.0
            tex.inputs['Distortion'].default_value = 6.0
            tex.inputs['Detail'].default_value = 3.0
            nt.links.new(tc.outputs['Object'], tex.inputs['Vector'])
            nt.links.new(tex.outputs['Fac'], ramp.inputs['Fac'])
        else:
            tex = nt.nodes.new('ShaderNodeTexNoise')
            tex.inputs['Scale'].default_value = 60.0
            tex.inputs['Detail'].default_value = 6.0
            nt.links.new(tc.outputs['Object'], tex.inputs['Vector'])
            nt.links.new(tex.outputs['Fac'], ramp.inputs['Fac'])
        nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
    MATS[name] = m
    return m


def make_materials():
    material('wall', (0.60, 0.53, 0.43), rough=0.75)
    material('wall_dark', (0.33, 0.29, 0.25), rough=0.7)
    material('trim', (0.70, 0.63, 0.50), rough=0.45, metal=0.2)
    material('carpet', (0.060, 0.068, 0.085), rough=1.0, noise=0.35)
    material('carpet_inlay', (0.13, 0.11, 0.09), rough=0.9, noise=0.2)
    material('wood', (0.30, 0.13, 0.055), rough=0.35, wood=True)
    material('leather', (0.30, 0.18, 0.12), rough=0.55, noise=0.08)
    material('leather_dark', (0.12, 0.08, 0.06), rough=0.6)
    material('console', (0.47, 0.42, 0.35), rough=0.5)
    material('metal', (0.10, 0.10, 0.11), rough=0.35, metal=0.7)
    material('bezel', (0.02, 0.02, 0.025), rough=0.25)
    material('door', (0.38, 0.36, 0.33), rough=0.4, metal=0.35)
    material('light_warm', (1, 1, 1), emit=(1.0, 0.80, 0.56), strength=3.0)
    material('light_soft', (1, 1, 1), emit=(1.0, 0.86, 0.68), strength=2.0)
    material('light_cool', (1, 1, 1), emit=(0.62, 0.86, 1.0), strength=0.9)
    material('screen', (0, 0, 0), emit=(0.35, 0.75, 0.85), strength=1.2)
    material('plaque', (0.62, 0.48, 0.24), rough=0.3, metal=0.8)


# ---- 形を作る道具 ----------------------------------------------------------------
PARTS = []  # 焼き込む部品
SCREENS = []  # 焼き込まない部品（画面と銘板）


def obj_from_bmesh(bm, name, mat, shell=False, screen=False):
    if shell:
        # 開いた面（壁・天井・床）は、部屋の中から見て表になるよう向きをそろえる
        bm.normal_update()
        for f in bm.faces:
            c = f.calc_center_median()
            if f.normal.dot(CENTER - c) < 0:
                f.normal_flip()
    else:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(MATS[mat] if isinstance(mat, str) else mat)
    (SCREENS if screen else PARTS).append(ob)
    return ob


def ellipse(a, inset=0.0, sx=1.0):
    """楕円の壁の上の点と、外向きの法線（inset だけ内側へ）"""
    rx, ry = RX * sx, RY * sx
    p = Vector((rx * math.cos(a), ry * math.sin(a), 0))
    n = Vector((math.cos(a) / rx, math.sin(a) / ry, 0)).normalized()
    return p - n * inset, n


def circle(r):
    def path(a, inset=0.0):
        n = Vector((math.cos(a), math.sin(a), 0))
        return n * (r - inset), n

    return path


def floor_z(a):
    """壁ぎわの床の高さ：後ろ半分は高い床、その両わきはスロープ"""
    a = (a + PI) % (2 * PI) - PI
    if 0 <= a <= PI:
        return 0.0
    if a > -RAMP:  # 右のスロープ
        return DECK * (-a / RAMP)
    if a < -PI + RAMP:  # 左のスロープ
        return DECK * ((a + PI) / RAMP)
    return DECK


def sweep(name, mat, path, a0, a1, profile, steps=None, closed=False, caps=False, shell=False, lift=None, screen=False):
    """
    断面 profile [(u, z), ...] を、道筋 path(a, inset) に沿って a0 → a1 へ掃引する。
    u は道筋から内側（部屋の中心の側）へのずれ、z は高さ。lift(a) で高さを足せる（スロープ）
    """
    if steps is None:
        steps = max(2, int(abs(a1 - a0) / (2 * PI) * 160))
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new()
    rings = []
    for i in range(steps + 1):
        a = a0 + (a1 - a0) * i / steps
        ring = []
        for u, z, *rest in profile:
            p, _ = path(a, u)
            dz = lift(a) if lift and (not rest or rest[0]) else 0.0
            ring.append(bm.verts.new((p.x, p.y, z + dz)))
        rings.append(ring)
    n = len(profile)
    segs = n if closed else n - 1
    for i in range(steps):
        for j in range(segs):
            k = (j + 1) % n
            f = bm.faces.new((rings[i][j], rings[i + 1][j], rings[i + 1][k], rings[i][k]))
            for loop, (s, t) in zip(f.loops, ((i / steps, j / segs), ((i + 1) / steps, j / segs), ((i + 1) / steps, (j + 1) / segs), (i / steps, (j + 1) / segs))):
                loop[uv].uv = (s, t)
    if caps:
        bm.faces.new(rings[0])
        bm.faces.new(list(reversed(rings[-1])))
    return obj_from_bmesh(bm, name, mat, shell=shell, screen=screen)


def strip(name, mat, outer, inner, a0, a1, steps=None, shell=True):
    """二つの道筋のあいだを埋める帯（床・天井）。outer(a) と inner(a) は 3D の点を返す"""
    if steps is None:
        steps = max(2, int(abs(a1 - a0) / (2 * PI) * 160))
    bm = bmesh.new()
    prev = None
    for i in range(steps + 1):
        a = a0 + (a1 - a0) * i / steps
        cur = (bm.verts.new(outer(a)), bm.verts.new(inner(a)))
        if prev:
            bm.faces.new((prev[0], cur[0], cur[1], prev[1]))
        prev = cur
    return obj_from_bmesh(bm, name, mat, shell=shell)


def box(name, mat, size, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0, segments=2, parent=None, screen=False):
    """角を丸めた箱。parent（Matrix）で置き場所をまとめて動かせる"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bevel, min(size) * 0.45), segments=segments, affect='EDGES', profile=0.5)
    m = Matrix.Translation(loc) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X')
    if parent is not None:
        m = parent @ m
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    if screen:
        # 画面は表の面だけ、絵の座標（0〜1）付きで残す
        return panel(name, size[0], size[2] if size[1] < size[2] else size[1], m)
    return obj_from_bmesh(bm, name, mat)


def panel(name, w, h, matrix, mat='screen'):
    """画面や銘板の板（ローカルの -Y が表。UV は 0〜1）"""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new()
    vs = [bm.verts.new(matrix @ Vector(p)) for p in ((-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2))]
    f = bm.faces.new(vs)
    for loop, st in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = st
    # 表（-Y）を向かせる
    front = (matrix.to_3x3() @ Vector((0, -1, 0))).normalized()
    if f.normal.dot(front) < 0:
        f.normal_flip()
        for loop, st in zip(f.loops, ((0, 0), (0, 1), (1, 1), (1, 0))):
            loop[uv].uv = st
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(MATS[mat])
    SCREENS.append(ob)
    return ob


def cylinder(name, mat, r1, r2, h, loc, segments=24, parent=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=r1, radius2=r2, depth=h)
    m = Matrix.Translation(Vector(loc) + Vector((0, 0, h / 2)))
    if parent is not None:
        m = parent @ m
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return obj_from_bmesh(bm, name, mat)


def place(x, y, z=0.0, rot=0.0):
    """家具の置き場所（rot は Z 軸まわり。0 で +Y＝正面を向く）"""
    return Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, 'Z')


def facing_center(a, inset, z=0.0, path=ellipse):
    """壁ぎわに置いて、部屋の中心を向かせる（ローカルの -Y が中心向き）"""
    p, n = path(a, inset)
    rot = math.atan2(n.y, n.x) - PI / 2
    return Matrix.Translation((p.x, p.y, z)) @ Matrix.Rotation(rot, 4, 'Z')


def rounded(w, h, r, n=3):
    """角を丸めた長方形の断面（中心が原点、u が幅、z が高さ）"""
    pts = []
    for cx, cz, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, PI / 2), (-w / 2 + r, -h / 2 + r, PI), (w / 2 - r, -h / 2 + r, 1.5 * PI)):
        for i in range(n + 1):
            a = a0 + (PI / 2) * i / n
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts


# ---- 部屋の殻 --------------------------------------------------------------------
def in_window(a):
    return abs(a - FRONT) < WIN_HALF


def build_floor():
    # 中央の床：じゅうたんと、司令席のまわりの縁取りの帯
    def disk(r0, r1, z, mat, name, sx=1.0):
        strip(name, mat, lambda a: ellipse(a, 0, r1)[0] + Vector((0, 0, z)), lambda a: ellipse(a, 0, r0)[0] + Vector((0, 0, z)) if r0 > 0 else Vector((0, 0, z)), -PI, PI)

    disk(0.0, 0.30, 0.0, 'carpet', 'floor_center')
    disk(0.30, 0.32, 0.0, 'carpet_inlay', 'floor_inlay')
    disk(0.32, 1.0, 0.0, 'carpet', 'floor_outer')
    # 後ろの高い床（上面と、手すりのない所の段の側面）
    rail = circle(RAIL_R)
    strip('deck', 'carpet', lambda a: ellipse(a)[0] + Vector((0, 0, floor_z(a))), lambda a: rail(a)[0] + Vector((0, 0, floor_z(a))), -PI, 0, steps=120)
    for a0, a1 in ((-RAMP, 0), (-PI, -PI + RAMP)):
        strip('ramp_side', 'wall_dark', lambda a: rail(a)[0] + Vector((0, 0, floor_z(a))), lambda a: rail(a)[0], a0, a1, steps=16)
        # スロープの縁の足元灯
        sweep('ramp_light', 'light_soft', rail, a0, a1, [(-0.02, 0.012), (-0.02, 0.03)], steps=16, lift=floor_z)


WALL = [
    (0.00, 0.00), (0.00, 0.13),  # 足元の引っ込んだ帯
    (0.08, 0.13), (0.08, 2.72),  # 壁の板
    (0.13, 2.76), (0.13, 2.92), (0.08, 2.96),  # 腰より上の飾りの帯
    (0.08, 3.22), (0.42, 3.58), (0.62, 3.60), (0.62, 3.66, False),  # 斜めの軒と、間接照明の棚
]
WINDOW_LOW = [(0.00, 0.00), (0.00, 0.12), (0.10, 0.12), (0.10, 0.36), (0.36, 0.42), (0.03, 0.45)]
WINDOW_HIGH = [(0.03, WIN_TOP), (0.30, WIN_TOP + 0.06), (0.30, 3.22), (0.42, 3.58), (0.62, 3.60), (0.62, 3.66, False)]


def wall_lift(a):
    return floor_z(a)


def build_walls():
    w0, w1 = FRONT - WIN_HALF, FRONT + WIN_HALF
    # 壁（窓の外側）。下のほうの点だけ、後ろの高い床やスロープに合わせて持ち上げる
    lifted = [(u, z, z < 1.0) for u, z, *_ in WALL]
    sweep('wall', 'wall', ellipse, w1, w0 + 2 * PI, lifted, steps=260, shell=True, lift=wall_lift)
    sweep('wall_light', 'light_soft', ellipse, w1, w0 + 2 * PI, [(0.01, 0.035, True), (0.01, 0.07, True)], steps=260, shell=True, lift=wall_lift)
    # 飾りの帯は少し暗い色で重ねる
    sweep('wall_band', 'wall_dark', ellipse, w1, w0 + 2 * PI, [(0.135, 2.78), (0.135, 2.90)], steps=260, shell=True)
    # 窓の下と上
    sweep('window_sill', 'wall', ellipse, w0, w1, WINDOW_LOW, steps=80, shell=True)
    sweep('window_head', 'wall', ellipse, w0, w1, WINDOW_HIGH, steps=80, shell=True)
    # 窓の両はしの側面（壁の厚み）
    for a in (w0, w1):
        p0, n = ellipse(a, 0.0)
        p1, _ = ellipse(a, 0.36)
        bm = bmesh.new()
        vs = [bm.verts.new(v) for v in (p0 + Vector((0, 0, 0.42)), p1 + Vector((0, 0, 0.42)), p1 + Vector((0, 0, 3.22)), p0 + Vector((0, 0, 3.22)))]
        bm.faces.new(vs)
        obj_from_bmesh(bm, 'window_jamb', 'wall', shell=True)
    # 間接照明（軒の棚の上で上を向いて光り、天井を照らす）
    sweep('cove_light', 'light_warm', ellipse, -PI, PI, [(0.47, 3.605), (0.60, 3.605)], steps=200, shell=True)
    # 壁の板の継ぎ目（縦の溝）
    n = 40
    for i in range(n):
        a = -PI + 2 * PI * i / n
        # 窓と扉のところには付けない
        if in_window(a) or abs(abs(a + PI / 2) - (PI / 2 - 0.95)) < 0.16:
            continue
        h = 2.72 - floor_z(a) - 0.13
        m = facing_center(a, 0.085, floor_z(a) + 0.13)
        box('wall_seam', 'wall_dark', (0.035, 0.02, h), (0, 0, h / 2), parent=m)


def build_ceiling():
    inner = lambda a: ellipse(a, 0, CEIL_INNER)[0]
    # 外まわりの低い天井（軒の上の縁から内側へ）
    strip('ceiling_low', 'wall', lambda a: ellipse(a, 0.36)[0] + Vector((0, 0, CEIL_LOW)), lambda a: inner(a) + Vector((0, 0, CEIL_LOW)), -PI, PI)
    sweep('ceiling_lip', 'wall', ellipse, -PI, PI, [(0.36, 3.66), (0.36, CEIL_LOW)], steps=200, shell=True)
    # 一段上がる所：段の立ち上がりと、その裏の間接照明
    strip('ceiling_step', 'wall_dark', lambda a: inner(a) + Vector((0, 0, CEIL_LOW)), lambda a: inner(a) + Vector((0, 0, CEIL_HIGH)), -PI, PI)
    strip('ceiling_cove', 'light_soft', lambda a: ellipse(a, 0.01, CEIL_INNER)[0] + Vector((0, 0, 3.97)), lambda a: ellipse(a, 0.01, CEIL_INNER)[0] + Vector((0, 0, 4.04)), -PI, PI)
    # 中央の高い天井と、天窓の筒
    sky = circle(SKYLIGHT)
    strip('ceiling_high', 'wall', lambda a: inner(a) + Vector((0, 0, CEIL_HIGH)), lambda a: circle(2.25)(a)[0] + Vector((0, 0, CEIL_HIGH)), -PI, PI)
    strip('ceiling_cone', 'wall', lambda a: circle(2.25)(a)[0] + Vector((0, 0, CEIL_HIGH)), lambda a: sky(a)[0] + Vector((0, 0, HEIGHT)), -PI, PI, steps=96)
    strip('skylight_well', 'wall_dark', lambda a: sky(a)[0] + Vector((0, 0, HEIGHT)), lambda a: sky(a)[0] + Vector((0, 0, HEIGHT + 0.3)), -PI, PI, steps=96)
    # 天窓のふちの光の輪
    strip('skylight_ring', 'light_warm', lambda a: circle(SKYLIGHT + 0.22)(a)[0] + Vector((0, 0, HEIGHT - 0.02)), lambda a: circle(SKYLIGHT + 0.1)(a)[0] + Vector((0, 0, HEIGHT - 0.015)), -PI, PI, steps=96)
    # 放射状の梁
    for i in range(12):
        a = 2 * PI * i / 12 + PI / 12
        p0 = circle(SKYLIGHT + 0.6)(a)[0]
        p1 = ellipse(a, 0, CEIL_INNER)[0]
        mid = (p0 + p1) / 2
        length = (p1 - p0).length
        box('ceiling_rib', 'trim', (0.12, length, 0.07), (mid.x, mid.y, CEIL_HIGH - 0.035), rot=(0, 0, math.atan2(p1.y - p0.y, p1.x - p0.x) - PI / 2), bevel=0.02)
    # 外まわりの天井のダウンライト
    for i in range(18):
        a = 2 * PI * (i + 0.5) / 18
        p = ellipse(a, 0, 0.81)[0]
        bm = bmesh.new()
        bmesh.ops.create_circle(bm, cap_ends=True, radius=0.09, segments=16)
        bmesh.ops.translate(bm, vec=Vector((p.x, p.y, CEIL_LOW - 0.004)), verts=bm.verts)
        obj_from_bmesh(bm, 'downlight', 'light_warm', shell=True)
        cylinder('downlight_trim', 'trim', 0.13, 0.13, 0.012, (p.x, p.y, CEIL_LOW - 0.012), segments=20)


# ---- 手すりと防御・センサー席 ------------------------------------------------------
def build_rail():
    rail = circle(RAIL_R)
    # 手すりの下の仕切り（中央の床の側の面に板と足元灯）
    body = [(0.0, 0.0), (0.13, 0.0), (0.13, 1.28), (-0.13, 1.28), (-0.13, DECK)]
    sweep('rail_wall', 'wall', rail, RAIL_A0, RAIL_A1, body, steps=120, caps=True, closed=True)
    sweep('rail_kick', 'wall_dark', rail, RAIL_A0, RAIL_A1, [(0.135, 0.0), (0.135, 0.12)], steps=120, shell=True)
    sweep('rail_light', 'light_soft', rail, RAIL_A0, RAIL_A1, [(0.138, 0.04), (0.138, 0.07)], steps=120, shell=True)
    sweep('rail_band', 'wall_dark', rail, RAIL_A0, RAIL_A1, [(0.136, 0.95), (0.136, 1.02)], steps=120, shell=True)
    # 木の手すり（角を丸めた断面）
    cap = [(u, z + 1.33) for u, z in rounded(0.34, 0.1, 0.04)]
    sweep('rail_wood', 'wood', rail, RAIL_A0 - 0.01, RAIL_A1 + 0.01, cap, steps=160, closed=True, caps=True)
    # 手すりの継ぎ目の金具
    for a in (RAIL_A0 + 0.5, -PI / 2 - 0.5, -PI / 2 + 0.5, RAIL_A1 - 0.5):
        m = facing_center(a, 0.0, 1.27, path=rail)
        box('rail_joint', 'trim', (0.06, 0.36, 0.13), (0, 0, 0.065), parent=m, bevel=0.015)
    # 防御・センサー席：手すりの後ろに張り出した、後ろ向きに傾いた操作卓
    span = 0.5
    desk = [(-0.15, 1.30), (-0.62, 1.13), (-0.66, 1.08), (-0.6, 0.95), (-0.25, 0.85), (-0.2, DECK), (-0.12, DECK), (-0.12, 1.30)]
    sweep('tactical', 'console', rail, -PI / 2 - span, -PI / 2 + span, desk, steps=40, closed=True, caps=True)
    sweep('tactical_bezel', 'bezel', rail, -PI / 2 - span + 0.02, -PI / 2 + span - 0.02, [(-0.20, 1.29), (-0.6, 1.14)], steps=30, shell=True)
    for k in range(3):
        a0 = -PI / 2 - span + 0.06 + k * (2 * span - 0.12) / 3
        a1 = a0 + (2 * span - 0.12) / 3 - 0.04
        sweep('screen_tactical', 'screen', rail, a1, a0, [(-0.56, 1.162), (-0.26, 1.275)], steps=10, screen=True)


# ---- 席 ----------------------------------------------------------------------------
def chair(name, m, big=False, low=False):
    w = 0.74 if big else 0.62
    seat = 0.46 if low else 0.5
    back = 0.55 if low else (1.02 if big else 0.85)
    # 下の部品は座る人が -Y を向く向きで組んであるので、半回転させて正面（+Y）を向かせる
    m = m @ Matrix.Rotation(PI, 4, 'Z')
    cylinder(name + '_base', 'metal', 0.32, 0.30, 0.05, (0, 0, 0), segments=28, parent=m)
    cylinder(name + '_post', 'trim', 0.11, 0.08, seat - 0.12, (0, 0, 0.05), segments=20, parent=m)
    box(name + '_shell', 'leather_dark', (w + 0.04, 0.62, 0.08), (0, -0.02, seat - 0.07), parent=m, bevel=0.03)
    box(name + '_seat', 'leather', (w, 0.6, 0.13), (0, -0.02, seat), parent=m, bevel=0.05, segments=3)
    # 背もたれ：少し後ろに倒し、縦の縫い目で二つのふくらみに
    tilt = Matrix.Translation((0, 0.3, seat + 0.05)) @ Matrix.Rotation(-0.16, 4, 'X')
    box(name + '_backshell', 'leather_dark', (w + 0.02, 0.1, back), (0, 0.04, back / 2), parent=m @ tilt, bevel=0.04)
    for s in (-1, 1):
        box(name + '_back', 'leather', (w / 2 - 0.03, 0.08, back - 0.1), (s * w / 4, -0.03, back / 2 + 0.02), parent=m @ tilt, bevel=0.035, segments=3)
    if not low:
        for s in (-1, 1):
            arm = m @ Matrix.Translation((s * (w / 2 + 0.07), -0.02, seat + 0.2))
            box(name + '_arm', 'console', (0.13, 0.6, 0.07), (0, 0, 0), parent=arm, bevel=0.03)
            box(name + '_armpost', 'leather_dark', (0.08, 0.1, 0.2), (0, 0.18, -0.12), parent=arm, bevel=0.02)
            # ひじ掛けの小さな操作盤
            box('screen_arm', 'screen', (0.09, 0.01, 0.22), (0, -0.08, 0.036), rot=(-PI / 2, 0, 0), parent=arm, screen=True)
        if big:
            box(name + '_head', 'leather', (0.44, 0.1, 0.16), (0, -0.01, back + 0.04), parent=m @ tilt, bevel=0.05, segments=3)


def side_console(name, m):
    """艦長席と左右の席のあいだの、低い操作卓"""
    box(name, 'console', (0.5, 0.46, 0.5), (0, 0, 0.25), parent=m, bevel=0.04)
    box(name + '_top', 'console', (0.56, 0.52, 0.06), (0, 0, 0.53), rot=(0.18, 0, 0), parent=m, bevel=0.02)
    box(name + '_bezel', 'bezel', (0.46, 0.4, 0.01), (0, 0, 0.565), rot=(0.18, 0, 0), parent=m)
    box('screen_side', 'screen', (0.42, 0.01, 0.36), (0, 0, 0.572), rot=(0.18 - PI / 2, 0, 0), parent=m, screen=True)


def front_console(name, m):
    """前の 2 席の、床から立ち上がった操作卓（ローカルの +Y が窓側。操作する人は -Y 側に座る）"""
    profile = [(-0.12, 0.0), (0.14, 0.0), (0.16, 0.58), (0.36, 0.96), (0.33, 1.0), (-0.34, 0.8), (-0.36, 0.74), (-0.14, 0.55)]
    width = 1.3
    bm = bmesh.new()
    left = [bm.verts.new(m @ Vector((-width / 2, y, z))) for y, z in profile]
    right = [bm.verts.new(m @ Vector((width / 2, y, z))) for y, z in profile]
    n = len(profile)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((left[i], left[j], right[j], right[i]))
    bm.faces.new(left)
    bm.faces.new(list(reversed(right)))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.015, segments=2, affect='EDGES', profile=0.5)
    obj_from_bmesh(bm, name, 'console')
    slope = math.atan2(1.0 - 0.8, 0.33 + 0.34)
    mid = Vector((0, (0.33 - 0.34) / 2, 0.9 + 0.004))
    box(name + '_bezel', 'bezel', (width - 0.12, 0.62, 0.012), mid, rot=(slope, 0, 0), parent=m)
    box('screen_front', 'screen', (width - 0.2, 0.01, 0.54), mid + Vector((0, 0, 0.01)), rot=(slope - PI / 2, 0, 0), parent=m, screen=True)
    # 足元の光の線
    box(name + '_light', 'light_soft', (width - 0.1, 0.01, 0.03), (0, 0.155, 0.08), parent=m)


def build_seats():
    chair('captain', place(0, -0.62, 0, PI * 0), big=True)
    for s in (-1, 1):
        chair('first', place(s * 1.5, -0.75, 0, -s * 0.2))
        side_console('side_console', place(s * 0.78, -0.42, 0, -s * 0.1))
        front_console('front_console', place(s * 1.0, 2.6, 0, 0))
        chair('helm', place(s * 1.0, 1.75, 0, 0), low=True)


# ---- 壁ぎわのステーション、扉、銘板 -------------------------------------------------
def station(a, base, width=1.25, big=False):
    m = facing_center(a, 0.08, base)
    # 机（壁から張り出す）と、壁に埋め込んだ画面
    box('station_desk', 'console', (width + 0.1, 0.52, 0.07), (0, -0.28, 0.88), parent=m, bevel=0.02)
    box('station_skirt', 'wall_dark', (width, 0.06, 0.72), (0, -0.48, 0.48), parent=m, bevel=0.01)
    box('station_kick', 'light_soft', (width - 0.1, 0.01, 0.025), (0, -0.52, 0.14), parent=m)
    h = 0.9 if big else 0.62
    box('station_bezel', 'bezel', (width + 0.06, 0.05, h + 0.08), (0, -0.01, 1.55), parent=m, bevel=0.01)
    box('screen_station', 'screen', (width - 0.04, 0.01, h - 0.02), (0, -0.04, 1.55), parent=m, screen=True)
    box('station_desk_screen_bezel', 'bezel', (width - 0.2, 0.3, 0.01), (0, -0.3, 0.92), parent=m)
    box('screen_desk', 'screen', (width - 0.3, 0.01, 0.24), (0, -0.3, 0.926), rot=(-PI / 2, 0, 0), parent=m, screen=True)


def door(a, base, plaque=False):
    m = facing_center(a, 0.08, base)
    box('door_frame', 'trim', (1.75, 0.16, 2.72), (0, -0.04, 1.36), parent=m, bevel=0.03)
    box('door_glow', 'light_cool', (1.56, 0.17, 2.52), (0, -0.045, 1.26), parent=m)
    for s in (-1, 1):
        box('door_leaf', 'door', (0.72, 0.1, 2.44), (s * 0.37, -0.09, 1.22), parent=m, bevel=0.012)
        box('door_band', 'wall_dark', (0.72, 0.105, 0.1), (s * 0.37, -0.09, 1.3), parent=m)
    # 扉の横の番号の札
    box('door_sign', 'bezel', (0.24, 0.02, 0.12), (1.08, -0.02, 1.58), parent=m, bevel=0.005)
    box('screen_sign', 'screen', (0.2, 0.01, 0.08), (1.08, -0.032, 1.58), parent=m, screen=True)
    if plaque:
        box('plaque_frame', 'wood', (0.7, 0.03, 0.38), (-1.3, -0.01, 1.55), parent=m, bevel=0.01)
        panel('plaque', 0.62, 0.3, m @ Matrix.Translation((-1.3, -0.027, 1.55)), mat='plaque')


def build_stations():
    # 後ろの壁：5 つのステーション（真ん中は大きな画面）
    for i, a in enumerate((-PI / 2 - 0.62, -PI / 2 - 0.31, -PI / 2, -PI / 2 + 0.31, -PI / 2 + 0.62)):
        station(a, DECK, width=1.3 if i != 2 else 1.8, big=i == 2)
    # 窓の両わきの壁（中央の床の高さ）
    for a in (0.30, 0.55, PI - 0.30, PI - 0.55):
        station(a, 0.0, width=1.1)
    # 昇降機の扉（左右の後ろ寄り）。右の扉の横に銘板
    door(-0.62 - 0.33, DECK, plaque=False)
    door(-PI + 0.62 + 0.33, DECK, plaque=True)
    # 足元の通風口
    for a in (0.12, PI - 0.12, -0.2, -PI + 0.2):
        m = facing_center(a, 0.085, floor_z(a) + 0.13)
        box('vent', 'metal', (0.7, 0.02, 0.22), (0, 0, 0.18), parent=m, bevel=0.005)
        for k in range(6):
            box('vent_slat', 'wall_dark', (0.64, 0.03, 0.012), (0, -0.005, 0.1 + k * 0.032), parent=m)


# ---- 光（焼き込み用） -----------------------------------------------------------------
def light(name, kind, loc, energy, color=(1.0, 0.85, 0.68), size=0.3, rot=(0, 0, 0), spot=None):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    if kind == 'AREA':
        ld.size = size
    if kind == 'SPOT' and spot:
        ld.spot_size, ld.spot_blend = spot
    if kind in ('POINT', 'SPOT'):
        ld.shadow_soft_size = size
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    ob.rotation_euler = rot
    bpy.context.collection.objects.link(ob)
    return ob


def build_lights():
    # 間接照明：棚の上で上を向く面光源（天井を照らす）
    for i in range(24):
        a = 2 * PI * i / 24
        p, _ = ellipse(a, 0.54)
        light('cove', 'AREA', (p.x, p.y, 3.63), 7, size=1.4, rot=(PI, 0, 0))
    # 中央の一段高い天井の間接照明
    for i in range(16):
        a = 2 * PI * i / 16
        p = ellipse(a, 0, CEIL_INNER - 0.03)[0]
        light('cove_high', 'AREA', (p.x, p.y, 3.95), 5, size=0.8, rot=(PI, 0, 0))
    # ダウンライト
    for i in range(18):
        a = 2 * PI * (i + 0.5) / 18
        p = ellipse(a, 0, 0.81)[0]
        light('down', 'SPOT', (p.x, p.y, CEIL_LOW - 0.02), 32, size=0.08, rot=(0, 0, 0), spot=(math.radians(95), 0.7))
    # 司令席を照らす天井の光
    light('command', 'AREA', (0, -0.3, CEIL_HIGH - 0.05), 110, size=1.8)
    # 窓と天窓から入る、ほのかな宇宙の光
    light('window', 'AREA', (0, RY - 0.5, 2.0), 40, color=(0.7, 0.8, 1.0), size=6.0, rot=(math.radians(-90), 0, 0))
    light('sky', 'AREA', (0, 0, HEIGHT + 0.25), 25, color=(0.7, 0.8, 1.0), size=3.0)


# ---- 仕上げ：まとめて、焼き込んで、書き出す -------------------------------------------
def join(objects, name):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    return ob


def lightmap_uv(ob):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    me = ob.data
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    me.uv_layers.new(name='bake')
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0015, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=0.002, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')


def bake(ob, scene):
    img = bpy.data.images.new('bridge-light', BAKE_SIZE, BAKE_SIZE, float_buffer=True)
    for slot in ob.material_slots:
        nt = slot.material.node_tree
        node = nt.nodes.new('ShaderNodeTexImage')
        node.image = img
        nt.nodes.active = node
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 6
    scene.render.bake.use_pass_direct = True
    scene.render.bake.use_pass_indirect = True
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    t = time.time()
    bpy.ops.object.bake(type='COMBINED', pass_filter={'DIRECT', 'INDIRECT', 'DIFFUSE', 'EMIT'}, use_clear=True)
    print(f'baked {BAKE_SIZE}px x {SAMPLES} samples in {time.time() - t:.0f}s')
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.quality = 88
    img.save_render(OUT_LIGHT, scene=scene)
    print('wrote', OUT_LIGHT, os.path.getsize(OUT_LIGHT) // 1024, 'KB')


def preview(scene):
    """焼き込みと同じ明るさの見え方で、艦長席・後ろの手すりから描いて確かめる"""
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    cam.data.sensor_fit = 'VERTICAL'
    cam.data.angle = math.radians(62)
    scene.render.resolution_x, scene.render.resolution_y = 960, 540
    scene.cycles.samples = int(os.environ.get('PREVIEW_SAMPLES', '48'))
    scene.cycles.use_denoising = True
    out_dir = os.environ.get('PREVIEW_DIR', '/tmp')
    # (目の位置, 見る点) three.js の座標（x, y, z）を Blender の（x, -z, y）に
    views = {
        'captain': ((0, 1.25, 0.55), (0, 1.15, -10)),
        'rail': ((0, DECK + 1.65, 4.4), (0, 1.1, -4)),
        'tactical': ((1.2, DECK + 1.7, 5.4), (-0.5, 0.9, 2.5)),
        'overhead': ((4.2, 3.7, 4.2), (0, 0.4, -1.2)),
        'science': ((-5.6, DECK + 1.6, 2.6), (0, 1, -2)),
        'front': ((0.0, 1.6, -4.6), (0, 1.0, 3)),
    }
    only = os.environ.get('VIEWS')
    for name, (eye, look) in views.items():
        if only and name not in only.split(','):
            continue
        e = Vector((eye[0], -eye[2], eye[1]))
        l = Vector((look[0], -look[2], look[1]))
        cam.location = e
        cam.rotation_euler = (l - e).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(out_dir, f'bridge-{name}.png')
        bpy.ops.render.render(write_still=True)
        print('rendered', scene.render.filepath)


def main():
    scene = reset()
    make_materials()
    build_floor()
    build_walls()
    build_ceiling()
    build_rail()
    build_seats()
    build_stations()
    build_lights()
    print(f'{len(PARTS)} parts, {len(SCREENS)} screens')
    if PREVIEW:
        preview(scene)
        return
    room = join(PARTS, 'room')
    tris = sum(len(p.vertices) - 2 for p in room.data.polygons)
    print('room triangles', tris)
    lightmap_uv(room)
    bake(room, scene)
    # 書き出す形には素材の中身はいらない（アプリで焼き込みの絵と画面の絵を貼る）
    room.data.materials.clear()
    room.data.materials.append(bpy.data.materials.new('room'))
    bpy.ops.object.select_all(action='DESELECT')
    # 画面は一枚ずつ別の部品のまま（アプリでそれぞれ違う絵を貼る）
    for ob in (room, *SCREENS):
        ob.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB,
        export_format='GLB',
        use_selection=True,
        export_normals=False,
        export_texcoords=True,
        export_materials='EXPORT',
        export_lights=False,
        export_cameras=False,
        export_yup=True,
    )
    print('wrote', OUT_GLB, os.path.getsize(OUT_GLB) // 1024, 'KB')


if __name__ == '__main__':
    main()
