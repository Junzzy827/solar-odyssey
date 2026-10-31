"""
機動母艦アルカディア（全長 1,200 m の大型母艦）を Blender で組み立てる。

junji さんの上面図・側面図をもとにした、このアプリ独自の船（名前や記号は元の絵のものを使わない）。
  - 前へ長く突き出た 2 本の舳先（白い上面装甲、紺の窓の帯、赤い船底）
  - 2 本の間から中央の船体が伸び、背中に矢じり形の大きな装甲板
  - 船の中ほど後ろに、細い羽根と前向きのアンテナを重ねた多段の艦橋塔
  - 左右の脇腹に格納庫のポッド（前に暗い円すい、後ろに赤い枠）
  - 後ろ半分は八角形の太い機関部と、暗い色の大きな噴射口の覆い
  - 左右に 4 組の翼（前の小さな刃、赤い前縁の刃、上へ反った大翼 2 組）と下向きの安定翼

形は「メートル」で組み、最後に 1/1000 にする（模型の 1 = 1 km、全長はおよそ 1.2）。
座標は Blender のまま（Z が上、前方が +Y）。

実行:
  /home/user/.bpyvenv/bin/python tools/blender/build_arcadia.py
  STAGE=1..       作り込みの段階（1 = 全体の形）
  PREVIEW=1       確認用の画像を PREVIEW_DIR に書き出す
  NOEXPORT=1      glb を書き出さない
"""

import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_fleet as bf  # noqa: E402  （bpy もここで読み込まれる）
from build_fleet import FacetLoft, Part  # noqa: E402

import bpy  # noqa: E402
import numpy as np  # noqa: E402

STAGE = int(os.environ.get('STAGE', '1'))
OUT = os.environ.get('OUT', os.path.join(bf.OUT_DIR, 'ship-arcadia.glb'))
PREVIEW_DIR = os.environ.get('PREVIEW_DIR', '/tmp')
S = 0.001  # 1 m の長さ（模型の単位）

MATS = ['Hull', 'Hull2', 'Red', 'Dark', 'Mech', 'Metal', 'Glass', 'Window', 'Glow', 'Blue', 'NavRed', 'NavGreen']
PARTS = ['Hull', 'Tower', 'Wings', 'Engine']


# ---- 形の道具（すべてメートル） ---------------------------------------------------------


def sec(y, cx, cz, wt, wm, wb, ht, hb, mat):
    return (y, cx, cz, wt, wm, wb, ht, hb, mat)


def slab(part, outline, z0, z1, mat, side=None, bottom=None):
    """上から見た多角形 outline（反時計回り、(x, y)）を、z0 から z1 まで押し出した板。
    z0, z1 は数か、(x, y) を受け取る関数（傾いた面になる）"""
    f0 = z0 if callable(z0) else (lambda x, y, v=z0: v)
    f1 = z1 if callable(z1) else (lambda x, y, v=z1: v)
    n = len(outline)
    verts = [(x, y, f0(x, y)) for x, y in outline] + [(x, y, f1(x, y)) for x, y in outline]
    faces = [list(range(n - 1, -1, -1)), list(range(n, 2 * n))]
    mats = [bottom or mat, mat]
    for i in range(n):
        j = (i + 1) % n
        faces.append([i, j, n + j, n + i])
        mats.append(side or mat)
    part.add(verts, faces, mats)


def ccw(outline):
    """多角形を反時計回りにそろえる"""
    a = sum(outline[i][0] * outline[(i + 1) % len(outline)][1] - outline[(i + 1) % len(outline)][0] * outline[i][1] for i in range(len(outline)))
    return outline if a > 0 else list(reversed(outline))


def mirror(outline):
    return ccw([(-x, y) for x, y in outline])


def both(fn):
    """右舷（+x）用に書いた形を、左舷にも作る"""
    for sx in (1, -1):
        fn(sx)


def cone(part, a, b, r0, r1, mat, n=24, cap0='same', cap1='same'):
    bf.cylinder(part, a, b, r0, r1, mat, n=n, cap0=cap0, cap1=cap1)


def wing(part, outline, thick, root, dihedral, mat, edge=None, sx=1):
    """翼：outline は翼の面内の (外向きの長さ s, 前後 y)。root を付け根に、外へ dihedral 度だけ反らせる"""
    d = math.radians(dihedral)
    rx, ry, rz = root
    outline = ccw(outline)
    n = len(outline)
    verts = []
    for h in (-thick / 2, thick / 2):
        for s, y in outline:
            # 翼の面内の点を、付け根から外へ傾けて置く。厚みは面の法線方向
            x = s * math.cos(d) - h * math.sin(d)
            z = s * math.sin(d) + h * math.cos(d)
            verts.append((rx + x, ry + y, rz + z))
    faces = [list(range(n - 1, -1, -1)), list(range(n, 2 * n))]
    mats = [mat, mat]
    for i in range(n):
        j = (i + 1) % n
        faces.append([i, j, n + j, n + i])
        mats.append(edge(i) if callable(edge) else (edge or mat))
    if sx < 0:
        verts = [(-x, y, z) for x, y, z in verts]
        faces = [list(reversed(f)) for f in faces]
    part.add(verts, faces, mats)


def pod(part, y0, y1, c, r, mat, nose=0.35, tail=0.2, n=20, tip_mat=None):
    """両端のとがった細長い入れ物（センサーの筒など）。c = (x, z)"""
    x, z = c
    L = y1 - y0
    pts = [(y0, 0.0), (y0 + L * tail * 0.4, r * 0.7), (y0 + L * tail, r), (y1 - L * nose, r), (y1 - L * nose * 0.45, r * 0.65), (y1, 0.0)]
    for i in range(len(pts) - 1):
        (ya, ra), (yb, rb) = pts[i], pts[i + 1]
        m = tip_mat if (tip_mat and i == len(pts) - 2) else mat
        cone(part, (x, ya, z), (x, yb, z), max(ra, 0.01), max(rb, 0.01), m, n=n, cap0=None, cap1=None)


# ---- 船体 -------------------------------------------------------------------------


def prong_core(sx):
    """舳先の芯（暗い色）。紺の帯として、上と下の装甲のすき間から見える"""
    cx = sx * 38
    return FacetLoft([
        sec(-160, cx, -6, 21, 29, 20, 46, 56, 'Dark'),
        sec(60, cx, -6, 21, 29, 20, 46, 56, 'Dark'),
        sec(240, cx, -7, 17, 25, 16, 36, 43, 'Dark'),
        sec(400, cx, -8, 12, 18, 11, 24, 27, 'Dark'),
        sec(520, cx, -9, 6, 10, 5, 11, 11, 'Dark'),
        sec(585, cx, -10, 1.5, 2.5, 1.2, 2, 2, 'Dark'),
    ], chamfer=0.15, mid=0.05, seg=2, cap_back='Dark', cap_front='Dark')


def prong_upper(sx):
    """舳先の上の白い装甲。先端は赤"""
    cx = sx * 38
    return FacetLoft([
        sec(-150, cx, 2, 22, 30.5, 29, 40, 4, 'Hull'),
        sec(60, cx, 2, 22, 30.5, 29, 40, 4, 'Hull'),
        sec(240, cx, 1, 18, 26.5, 25, 30.5, 4, 'Hull'),
        sec(400, cx, -1, 13, 19.5, 18.5, 18, 3.5, 'Hull'),
        sec(500, cx, -2, 8, 13, 12, 9.5, 3, 'Red'),
        sec(560, cx, -3.5, 3.5, 6, 5.5, 4.5, 2.5, 'Red'),
        sec(612, cx, -8, 0.3, 0.5, 0.5, 0.5, 0.5, 'Red'),
    ], chamfer=0.18, mid=0.15, seg=2)


def prong_lower(sx):
    """舳先の下の赤い装甲（船底）"""
    cx = sx * 38
    return FacetLoft([
        sec(-150, cx, -16, 29, 30.5, 21, 2, 48, 'Red'),
        sec(60, cx, -16, 29, 30.5, 21, 2, 48, 'Red'),
        sec(240, cx, -16, 25, 26.5, 17, 2, 36, 'Red'),
        sec(400, cx, -15, 18, 19.5, 12, 2, 22, 'Red'),
        sec(500, cx, -14, 12, 13, 7, 1.5, 9, 'Red'),
        sec(560, cx, -12, 5, 6, 3, 1.2, 4, 'Red'),
        sec(600, cx, -10, 0.4, 0.5, 0.4, 0.4, 0.5, 'Red'),
    ], chamfer=0.2, mid=0.5, seg=2)


def center_body():
    """2 本の舳先の間から後ろへ太くなる中央の船体"""
    return FacetLoft([
        sec(-260, 0, 0, 70, 92, 66, 56, 60, 'Hull'),
        sec(-120, 0, 0, 66, 88, 62, 56, 60, 'Hull'),
        sec(20, 0, 0, 44, 62, 44, 52, 58, 'Hull'),
        sec(160, 0, -2, 12, 16, 12, 30, 32, 'Dark'),
        sec(320, 0, -4, 6, 8, 6, 14, 16, 'Dark'),
        sec(380, 0, -5, 2, 3, 2, 4, 5, 'Dark'),
    ], chamfer=0.2, mid=0.1, seg=2)


def aft_body():
    """後ろの八角形の機関部。帯の段差を付け、最後尾は暗い噴射口の覆い"""
    S_ = []
    def ring(y, k, mat):
        S_.append(sec(y, 0, 0, 56 * k, 90 * k, 60 * k, 58 * k, 54 * k, mat))
    ring(-215, 0.94, 'Hull')
    ring(-250, 0.94, 'Hull')
    ring(-250, 1.0, 'Hull')
    for y in (-320, -385, -440):
        ring(y, 1.0, 'Hull')
        ring(y, 0.985, 'Hull')
        ring(y - 4, 0.985, 'Hull')
        ring(y - 4, 1.0, 'Hull')
    ring(-500, 1.0, 'Hull')
    ring(-500, 0.94, 'Dark')
    ring(-506, 0.94, 'Dark')
    ring(-506, 0.97, 'Dark')
    ring(-560, 0.97, 'Dark')
    ring(-560, 0.93, 'Dark')
    ring(-566, 0.93, 'Dark')
    ring(-566, 0.95, 'Dark')
    ring(-598, 0.92, 'Dark')
    return FacetLoft(S_, chamfer=0.32, mid=0.08, seg=2, cap_back='Dark', cap_front='Hull')


def hangar_pod(sx):
    """脇腹の格納庫ポッド（六角の筒）"""
    cx = sx * 98
    return FacetLoft([
        sec(-262, cx, -4, 18, 32, 18, 34, 34, 'Hull'),
        sec(-90, cx, -4, 18, 32, 18, 34, 34, 'Hull'),
        sec(-60, cx, -4, 13, 24, 13, 26, 26, 'Hull'),
    ], chamfer=0.05, mid=0.0, seg=2, cap_back='Dark', cap_front='Dark')


def build_hull(P):
    hull = P['Hull']
    for sx in (1, -1):
        prong_core(sx).build(hull)
        prong_upper(sx).build(hull)
        prong_lower(sx).build(hull)
        hangar_pod(sx).build(hull)
        # ポッドの前の暗い円すい（射出口の覆い）と、後ろの赤い枠
        cone(hull, (sx * 98, -62, -4), (sx * 98, 30, -4), 20, 3, 'Mech', n=6)
        bf.box(hull, (sx * 98, -268, -4), (66, 10, 70), 'Red')
        bf.box(hull, (sx * 98, -268, -4), (52, 12, 56), 'Dark')
    center_body().build(hull)
    aft_body().build(hull)
    # 中央の背骨の前にある暗い円すい（センサーの突起）
    cone(hull, (0, 120, 24), (0, 300, 18), 11, 1.5, 'Mech', n=6)
    # 背中の矢じり形の大きな装甲板（2 段重ね）
    top = lambda x, y: 62 - abs(x) * 0.12 - max(0, y + 60) * 0.1  # noqa: E731
    slab(hull, ccw([(0, 90), (34, 20), (60, -60), (64, -250), (-64, -250), (-60, -60), (-34, 20)]), 30, top, 'Hull')
    top2 = lambda x, y: 67 - abs(x) * 0.15 - max(0, y + 120) * 0.08  # noqa: E731
    slab(hull, ccw([(0, -10), (22, -60), (36, -130), (36, -240), (-36, -240), (-36, -130), (-22, -60)]), 40, top2, 'Hull2')
    # 舳先の付け根の上の、斜めに重なる装甲板
    for sx in (1, -1):
        o = [(20, 220), (50, 150), (66, 40), (66, -60), (40, -60), (22, 80)]
        slab(hull, ccw([(sx * x, y) for x, y in o]), 10, lambda x, y: 33 + (240 - y) * 0.06 - abs(x) * 0.05, 'Hull')
        o2 = [(60, 60), (96, -40), (100, -230), (70, -230), (66, -40)]
        slab(hull, ccw([(sx * x, y) for x, y in o2]), 6, lambda x, y: 36 - (abs(x) - 60) * 0.2, 'Hull2')
    # 機関部の下の補助エンジン
    for sx in (1, -1):
        pod(P['Engine'], -610, -430, (sx * 70, -48), 15, 'Mech', nose=0.3, tail=0.02)
        bf.nozzle(P['Engine'], (sx * 70, -625, -48), (sx * 70, -598, -48), 9, 13, 'Metal', 'Glow', n=24)
    # 主噴射口 4 つ（暗い覆いの後ろ）
    for sx in (1, -1):
        for sz in (1, -1):
            bf.nozzle(P['Engine'], (sx * 36, -614, sz * 25), (sx * 36, -590, sz * 25), 16, 23, 'Metal', 'Glow', n=32)


# ---- 艦橋塔 -----------------------------------------------------------------------


def build_tower(P):
    t = P['Tower']
    # 1 段目：前へ長く傾いた台
    FacetLoft([
        sec(-270, 0, 50, 26, 34, 36, 30, 2, 'Hull'),
        sec(-150, 0, 50, 26, 34, 36, 30, 2, 'Hull'),
        sec(-60, 0, 50, 8, 16, 22, 6, 2, 'Hull'),
    ], chamfer=0.25, mid=0.3, seg=2).build(t)
    # 2〜4 段目：段ごとに細く、高く。前の面は艦橋の窓
    tiers = [  # (後ろ, 前, 床の高さ, 高さ, 幅, 横の筒の x, 筒の前端)
        (-240, -120, 78, 22, 22, 34, -10),
        (-225, -150, 98, 22, 15, 24, -80),
        (-215, -170, 118, 18, 9, 15, -140),
    ]
    for y0, y1, z, h, w, px, py1 in tiers:
        FacetLoft([
            sec(y0, 0, z, w * 0.75, w, w * 1.05, h, 2, 'Hull'),
            sec(y1 - 12, 0, z, w * 0.75, w, w * 1.05, h, 2, 'Hull'),
            sec(y1, 0, z, w * 0.45, w * 0.7, w * 0.8, h * 0.45, 2, 'Glass'),
        ], chamfer=0.3, mid=0.4, seg=2).build(t)
        # 横へ張り出す薄い羽根と、その先の前後に長い筒（センサーの腕）
        both(lambda sx: wing(t, [(0, y0 + 10), (0, y1 - 20), (px, y1 - 30), (px, y0 + 25)], 2.5, (w * 0.8, 0, z + h * 0.45), 0, 'Hull', sx=sx))
        both(lambda sx: pod(t, y0 + 10, py1, (sx * px, z + h * 0.45), 3.6, 'Hull', nose=0.25, tail=0.1, tip_mat='Metal'))
    # 頂上のセンサーの玉と、前へ傾いたマスト
    cone(t, (0, -195, 135), (0, -195, 142), 8, 6, 'Hull', n=20)
    cone(t, (0, -195, 142), (0, -150, 175), 2.5, 0.3, 'Metal', n=8)
    both(lambda sx: cone(t, (0, -185, 150), (sx * 16, -172, 153), 0.8, 0.4, 'Metal', n=6))
    cone(t, (0, -120, 101), (0, -40, 101), 3, 0.4, 'Metal', n=8)


# ---- 翼 ---------------------------------------------------------------------------


def red_edge(idx):
    return lambda i: 'Red' if i in idx else 'Hull'


def build_wings(P):
    w = P['Wings']
    for sx in (1, -1):
        # 1. 舳先の外側に沿って前へとがる、厚い羽根形の装甲（外側の後ろの縁が赤）
        o = [(60, 380), (88, 330), (124, 40), (100, 30), (58, 120)]
        slab(w, ccw([(sx * x, y) for x, y in o]), lambda x, y: -6 - (abs(x) - 60) * 0.05, lambda x, y: 6 + min(380 - y, 300) * 0.075 - (abs(x) - 60) * 0.1, 'Hull')
        o = [(96, 140), (126, 40), (128, 28), (108, 34)]
        slab(w, ccw([(sx * x, y) for x, y in o]), -4, 10, 'Red')
        # 2. 下側の重なる装甲板
        o = [(50, 300), (78, 220), (96, -60), (70, -40), (48, 100)]
        slab(w, ccw([(sx * x, y) for x, y in o]), lambda x, y: -52 + (abs(x) - 48) * 0.3, lambda x, y: -30 + (abs(x) - 48) * 0.1, 'Hull2')
        # 3. 上へ反った大翼（後ろの縁が赤）
        wing(w, [(0, -100), (0, -270), (50, -300), (110, -405), (100, -385)], 5, (88, 0, 26), 26, 'Hull', edge=red_edge({1, 2}), sx=sx)
        # 4. 後ろの翼（先が赤）
        wing(w, [(0, -320), (0, -450), (112, -555), (98, -520)], 4.5, (90, 0, 22), 22, 'Hull', edge=red_edge({2}), sx=sx)
        # 5. 下向きの安定翼
        wing(w, [(0, -310), (0, -440), (96, -520), (84, -480)], 4, (70, 0, -44), -34, 'Hull', edge=red_edge({2}), sx=sx)
        # センサーの筒と、それを支える短い腕
        wing(w, [(0, -60), (0, -130), (42, -135), (42, -95)], 3, (100, 0, 16), 4, 'Mech', sx=sx)
        pod(w, -230, -40, (sx * 146, 19), 6, 'Hull', nose=0.3, tail=0.25, tip_mat='Metal')


# ---- Blender -----------------------------------------------------------------------


PREVIEW_COLORS = {
    'Hull': '#c9cbd8', 'Hull2': '#b2b5c4', 'Red': '#9a1d2b', 'Dark': '#262a38', 'Mech': '#3e4456', 'Metal': '#7f8594',
    'Glass': '#14202e', 'Window': '#ffd9a0', 'Glow': '#bfe0ff', 'Blue': '#4a9cff', 'NavRed': '#ff2020', 'NavGreen': '#20ff50',
}
EMISSIVE = {'Window', 'Glow', 'Blue', 'NavRed', 'NavGreen'}


def lin(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def make_object(name, part):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(x * S, y * S, z * S) for x, y, z in part.verts], [], part.faces)
    mesh.validate()
    used = [m for m in MATS if m in set(part.mats)]
    for m in used:
        mesh.materials.append(bpy.data.materials.get(m) or bpy.data.materials.new(m))
    idx = {m: i for i, m in enumerate(used)}
    mesh.polygons.foreach_set('material_index', np.array([idx[m] for m in part.mats], dtype=np.int32))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def preview_materials():
    for name, h in PREVIEW_COLORS.items():
        m = bpy.data.materials.get(name)
        if not m:
            continue
        m.use_nodes = True
        b = m.node_tree.nodes.get('Principled BSDF')
        c = lin(h)
        b.inputs['Base Color'].default_value = (*c, 1)
        b.inputs['Roughness'].default_value = 0.5
        b.inputs['Metallic'].default_value = 0.6 if name == 'Metal' else 0.15
        if name in EMISSIVE:
            b.inputs['Emission Color'].default_value = (*c, 1)
            b.inputs['Emission Strength'].default_value = 4


def preview(tag):
    from mathutils import Vector
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = int(os.environ.get('PREVIEW_SAMPLES', '24'))
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    scene.view_settings.view_transform = 'AgX'
    scene.world = bpy.data.worlds.new('world')
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.02, 0.025, 0.04, 1)
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.4
    sun.data.angle = 0.02
    sun.rotation_euler = (0.75, 0.25, 2.3)
    scene.collection.objects.link(sun)
    fill = bpy.data.objects.new('fill', bpy.data.lights.new('fill', 'SUN'))
    fill.data.energy = 0.5
    fill.rotation_euler = (2.0, 0.0, -0.9)
    scene.collection.objects.link(fill)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    shots = {
        'hero': ((1.3, 1.0, 1.0), (0.0, 0.0, -0.02), 'PERSP', 50),
        'top': ((0, -0.01, 3), (0, -0.01, 0), 'ORTHO', 1.30),
        'side': ((3, -0.01, 0.0), (0, -0.01, 0.0), 'ORTHO', 1.30),
        'front': ((-0.75, 1.45, 0.3), (0, 0.02, 0.0), 'PERSP', 45),
        'rear': ((1.0, -1.35, 0.45), (0, -0.12, 0.0), 'PERSP', 45),
        'tower': ((0.38, 0.1, 0.28), (0, -0.19, 0.09), 'PERSP', 40),
        'under': ((1.15, 0.85, -0.7), (0, -0.04, 0.0), 'PERSP', 50),
    }
    for name in os.environ.get('VIEWS', 'hero,top,side,front,rear,tower').split(','):
        pos, target, kind, lens = shots[name]
        cam.location = Vector(pos)
        up = 'Y'
        cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', up).to_euler()
        if name == 'top':
            cam.rotation_euler = (0, 0, -math.pi / 2)
        if name == 'side':
            cam.rotation_euler = (math.pi / 2, 0, math.pi / 2)
        cam.data.type = kind
        if kind == 'ORTHO':
            cam.data.ortho_scale = lens
        else:
            cam.data.lens = lens
        cam.data.clip_start = 0.001
        scene.render.filepath = os.path.join(PREVIEW_DIR, f'arcadia-{tag}-{name}.png')
        bpy.ops.render.render(write_still=True)
        print('  render', name, flush=True)


def main():
    t0 = time.time()
    bf.reset_scene()
    for m in MATS:
        bpy.data.materials.new(m)
    P = {name: Part() for name in PARTS}
    build_hull(P)
    build_tower(P)
    build_wings(P)
    objs = []
    for name in PARTS:
        if P[name].faces:
            obj = make_object(name, P[name])
            bf.sharpen(obj, 35)
            objs.append(obj)
    nf = sum(len(o.data.polygons) for o in objs)
    print(f'  {nf} faces ({time.time() - t0:.1f}s)', flush=True)
    for obj in objs:
        co = np.array([v.co[:] for v in obj.data.vertices])
        lo, hi = co.min(0), co.max(0)
        print(f'  {obj.name:7s} x {lo[0]:.3f}..{hi[0]:.3f} y {lo[1]:.3f}..{hi[1]:.3f} z {lo[2]:.3f}..{hi[2]:.3f}')
    if os.environ.get('PREVIEW'):
        preview_materials()
        preview(f's{STAGE}')


if __name__ == '__main__':
    main()
