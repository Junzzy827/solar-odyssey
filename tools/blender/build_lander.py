"""
惑星に降りる着陸船（全長 24 m、全幅 14 m、全高 6.5 m、乗員 12 名）を Blender で組み立てる。

junji さんの設定資料（上・横・前の三面図）から形を起こした。三面図どうしの縮尺が少しずつ
ずれているので、寸法は設定表の数字（24 × 14 × 6.5 m）に合わせ、形は図からとっている。

  - 船体：断面（半分の輪郭の点の列）を前後につないだ筒。上面の中央に窓の並んだ展望甲板
  - 翼：船体の肩から外へ下りていく暗色の装甲板。上から見ると先が細く後ろが広い三角形
  - 後部：暗色の装甲ブロックと、3 基のエンジン（左右は丸いポッド、中央は四角い排気口）
  - 腹：機器のふくらみと、4 本の着陸脚（膝のある脚、ダンパー、足の皿）

座標は Blender のまま（Z が上、前方が +Y）。メートルで組んで、書き出すときに S 倍（全長がおよそ 1）。
細い先端（+Y）を船首、エンジンのある広い側（-Y）を船尾として組んでいる。

実行:
  /home/user/.bpyvenv/bin/python tools/blender/build_lander.py
  STAGE=1..     改修の段階（1 は形のブロックアウト）
  PREVIEW=1     確認用の画像を PREVIEW_DIR に書き出す（VIEWS=hero,top,side,front,rear,under,low）
"""

import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_fleet as bf  # noqa: E402
from build_fleet import Part, box, cylinder  # noqa: E402

import bpy  # noqa: E402
import bmesh  # noqa: E402
import numpy as np  # noqa: E402

STAGE = int(os.environ.get('STAGE', '1'))
PREVIEW_DIR = os.environ.get('PREVIEW_DIR', '/tmp')
S = 1 / 24  # 1 m の長さ（模型の単位）
TOP = 6.45
BODY_SQUASH = float(os.environ.get('BODY_SQUASH', '0.88'))

MATS = ['Hull', 'Hull2', 'Dark', 'Mech', 'Metal', 'Glass', 'Window', 'Glow', 'Accent', 'NavRed', 'NavGreen']
PARTS = ['Hull', 'Wings', 'Engine', 'Legs']


# ---- 断面をつないだ筒 ---------------------------------------------------------


class PolyLoft:
    """
    前後（Y）に並べた断面をつないだ筒（左右対称）。
    sections: (y, [(x, z), ...], 材質)。点は右半分の輪郭で、上の中心（x=0）から下の中心（x=0）まで。
    どの断面も点の数をそろえる。材質はその断面から次の断面までの区間に使う。
    mats_by_seg: {点の番号: 材質} で、輪郭の区間ごとに材質を変える（区間の材質より優先）
    """

    def __init__(self, sections, mats_by_seg=None, cap_back='Hull', cap_front='Hull'):
        self.sections = sections
        self.mats_by_seg = mats_by_seg or {}
        self.cap_back = cap_back
        self.cap_front = cap_front

    def ring(self, pts):
        right = list(pts)
        left = [(-x, z) for x, z in reversed(pts[1:-1])]
        return right + left

    def build(self, part):
        rings = [self.ring(p) for _, p, _ in self.sections]
        n = len(rings[0])
        half = len(self.sections[0][1])
        verts = []
        for (y, _, _), r in zip(self.sections, rings):
            verts += [(x, y, z) for x, z in r]
        faces, mats = [], []
        for k in range(len(self.sections) - 1):
            for i in range(n):
                a, b = k * n + i, k * n + (i + 1) % n
                faces.append([a, b, b + n, a + n])
                seg = i if i < half - 1 else n - 1 - i  # 左側は右側の鏡
                mats.append(self.mats_by_seg.get((k, seg), self.mats_by_seg.get(seg, self.sections[k][2])))
        last = len(self.sections) - 1
        for cap, k, flip in ((self.cap_back, 0, False), (self.cap_front, last, True)):
            if not cap:
                continue
            ci = len(verts)
            y = self.sections[k][0]
            zc = sum(z for _, z in rings[k]) / n
            verts.append((0, y, zc))
            for i in range(n):
                a, b = k * n + i, k * n + (i + 1) % n
                faces.append([ci, b, a] if flip else [ci, a, b])
                mats.append(cap)
        part.add(verts, faces, mats)

    def point(self, y, i, t=0.0, side=1):
        """y の断面で、点 i と点 i+1 の間の t の位置（side=-1 で左側）"""
        s = self.sections
        k = 0  # 断面は後ろ → 前（y が増える順）
        while k < len(s) - 2 and y > s[k + 1][0]:
            k += 1
        y0, y1 = s[k][0], s[k + 1][0]
        u = 0 if y1 == y0 else min(1, max(0, (y - y0) / (y1 - y0)))

        def at(j):
            a, b = s[k][1][j], s[k + 1][1][j]
            return (a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u)

        p, q = at(i), at(min(i + 1, len(s[k][1]) - 1))
        x, z = p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t
        return np.array((x * side, y, z))


def surface_panel(part, loft, y0, y1, i, t0, t1, mat, lift=0.03, side=1, ny=4, nt=2):
    """筒の表面に沿った板（窓・装甲・パネル）。輪郭の区間 i の t0..t1、前後 y0..y1"""
    verts, faces = [], []
    cen = np.array((0.0, (y0 + y1) / 2, 3.5))
    ys = sorted(set([y0 + (y1 - y0) * a / ny for a in range(ny + 1)] + [s[0] for s in loft.sections if y0 < s[0] < y1]))
    for y in ys:
        a, b = loft.point(y, i, 0, side), loft.point(y, i, 1, side)
        d = b - a
        n = np.array((-d[2], 0, d[0])) * side
        n /= np.linalg.norm(n) or 1
        for k in range(nt + 1):
            t = t0 + (t1 - t0) * k / nt
            verts.append(loft.point(y, i, t, side) + n * lift)
    ny = len(ys) - 1
    w = nt + 1
    for a in range(ny):
        for b in range(nt):
            q = [a * w + b, (a + 1) * w + b, (a + 1) * w + b + 1, a * w + b + 1]
            faces.append(q)
    _orient(part, verts, faces, mat, cen)


def _orient(part, verts, faces, mat, center):
    """面を中心から外向きにそろえて足す"""
    c = np.array(center)
    out = []
    for f in faces:
        p = [np.array(verts[j]) for j in f]
        nrm = np.cross(p[1] - p[0], p[2] - p[0])
        if np.dot(nrm, sum(p) / len(p) - c) < 0:
            f = list(reversed(f))
        out.append(f)
    part.add(verts, out, mat)


def slab(part, top, thick, mat, edge=None, down=(0, 0, -1)):
    """3D の輪郭（ほぼ平ら）を厚みのある板にする。下面は down の向きに thick だけずらす"""
    n = len(top)
    d = np.array(down, float) * thick
    verts = [tuple(p) for p in top] + [tuple(np.array(p) + d) for p in top]
    c = len(verts)
    ct = np.mean(np.array(top), 0)
    verts += [tuple(ct), tuple(ct + d)]
    faces, mats = [], []
    for i in range(n):
        j = (i + 1) % n
        faces.append([c, i, j])
        faces.append([c + 1, n + j, n + i])
        faces.append([i, n + i, n + j, j])
        mats += [mat, mat, edge or mat]
    part.add(verts, faces, mats)


def mirror_add(part, fn):
    """右側を組む関数 fn(part, sx) を左右とも呼ぶ"""
    fn(part, 1)
    fn(part, -1)


# ---- 形 ------------------------------------------------------------------------

# 船体の断面：右半分の輪郭（上の中心、展望甲板の端、肩、胴のいちばん広いところ、腰、底の端、底の中心）
HULL_SECTIONS = [
    (-11.9, [(0, 4.55), (0.9, 4.55), (1.7, 4.35), (1.9, 3.7), (1.7, 2.9), (1.3, 2.7), (0, 2.7)], 'Dark'),
    (-11.2, [(0, 4.85), (1.0, 4.85), (2.2, 4.6), (2.6, 3.8), (2.2, 2.7), (1.6, 2.5), (0, 2.5)], 'Dark'),
    (-10.0, [(0, 5.2), (1.1, 5.2), (3.1, 4.95), (3.7, 3.9), (3.0, 2.4), (2.0, 2.1), (0, 2.1)], 'Hull'),
    (-8.0, [(0, 5.75), (1.1, 5.75), (3.9, 5.15), (4.7, 3.9), (3.8, 2.1), (2.2, 1.8), (0, 1.8)], 'Hull'),
    (-5.0, [(0, 6.4), (1.1, 6.4), (4.2, 5.35), (5.0, 4.0), (3.9, 2.0), (2.3, 1.7), (0, 1.7)], 'Hull'),
    (-2.0, [(0, 6.45), (1.1, 6.45), (3.9, 5.3), (4.8, 4.0), (3.8, 2.0), (2.2, 1.7), (0, 1.7)], 'Hull'),
    (0.0, [(0, 6.25), (1.1, 6.25), (3.6, 5.1), (4.5, 3.9), (3.6, 2.0), (2.1, 1.7), (0, 1.7)], 'Hull'),
    (2.0, [(0, 5.7), (1.1, 5.7), (3.3, 4.85), (4.1, 3.8), (3.4, 2.0), (2.0, 1.66), (0, 1.66)], 'Hull'),
    (4.0, [(0, 5.15), (1.1, 5.15), (2.9, 4.6), (3.7, 3.7), (3.2, 2.0), (1.9, 1.66), (0, 1.66)], 'Hull'),
    (6.7, [(0, 4.85), (1.1, 4.85), (2.5, 4.4), (3.2, 3.6), (2.8, 2.05), (1.7, 1.7), (0, 1.7)], 'Hull'),
    (8.9, [(0, 4.5), (1.2, 4.5), (2.2, 4.2), (2.7, 3.5), (2.4, 2.45), (1.5, 2.1), (0, 2.1)], 'Hull'),
    (10.3, [(0, 4.2), (1.3, 4.2), (1.9, 4.05), (2.2, 3.5), (2.0, 2.95), (1.4, 2.85), (0, 2.85)], 'Hull'),
    (12.0, [(0, 3.75), (1.2, 3.75), (1.6, 3.7), (1.75, 3.45), (1.6, 3.2), (1.2, 3.12), (0, 3.12)], 'Hull'),
]


def hull_loft():
    # 後ろの 2 区間（暗色の装甲ブロック）以外は白。腹の底は少し濃い白
    segs = {4: 'Hull2', 5: 'Hull2'}
    segs.update({(0, j): 'Dark' for j in range(6)})
    segs.update({(1, j): 'Dark' for j in range(6)})
    return PolyLoft(HULL_SECTIONS, segs, cap_back='Dark', cap_front='Dark')


def build_hull(P, loft):
    h = P['Hull']
    loft.build(h)
    # 展望甲板の窓（上面の中央と肩の斜面）。設定資料の、前にすぼまる窓の群れ
    rows = [(2.6, 1.2), (0.9, -0.6), (-1.2, -2.8), (-3.4, -5.0), (-5.6, -6.6)]
    for r, (ya, yb) in enumerate(rows):
        # 上面（区間 0）：中央の大窓を前後に並べる
        if r < 4:
            for sx in (1, -1):
                surface_panel(h, loft, yb, ya, 0, 0.12, 0.88, 'Glass', side=sx, ny=2, nt=1)
        # 肩の斜面（区間 1）：2 列
        for c, (t0, t1) in enumerate(((0.04, 0.3), (0.36, 0.62), (0.68, 0.92))):
            if c > r + 1 or (r == 4 and c == 0):  # 前ほど列が少ない（前へすぼまる窓の群れ）
                continue
            for sx in (1, -1):
                surface_panel(h, loft, yb + 0.1, ya - 0.1, 1, t0, t1, 'Glass', side=sx, ny=2, nt=1)
    # 操縦席の前窓（上面の前端、斜めに傾いた 3 枚）
    for sx in (1, -1):
        surface_panel(h, loft, 2.9, 3.9, 0, 0.1, 0.9, 'Glass', side=sx, ny=2, nt=1)
        surface_panel(h, loft, 3.0, 3.9, 1, 0.05, 0.35, 'Glass', side=sx, ny=2, nt=1)
    # 船首の扉（上から見て先端の格子の四角）
    for sx in (1, -1):
        surface_panel(h, loft, 9.6, 11.9, 0, 0.0, 0.95, 'Dark', side=sx, ny=3, nt=1, lift=0.02)
    # 後ろの暗色の装甲（上面の後ろ寄り）
    for sx in (1, -1):
        surface_panel(h, loft, -11.2, -8.6, 0, 0.0, 1.0, 'Dark', side=sx, ny=3, nt=1, lift=0.05)
        surface_panel(h, loft, -11.2, -8.6, 1, 0.0, 1.0, 'Dark', side=sx, ny=3, nt=2, lift=0.05)
        # 広い端へ向いた展望窓（設定資料の正面図の、ドームの窓）
        surface_panel(h, loft, -8.3, -7.0, 0, 0.1, 0.9, 'Glass', side=sx, ny=2, nt=1)
        surface_panel(h, loft, -8.2, -7.0, 1, 0.05, 0.3, 'Glass', side=sx, ny=2, nt=1)
        surface_panel(h, loft, -8.0, -7.0, 1, 0.36, 0.6, 'Glass', side=sx, ny=2, nt=1)
    # 横腹の黒い格子（スラスターの吸気口）
    for sx in (1, -1):
        surface_panel(h, loft, -10.6, -9.2, 2, 0.15, 0.85, 'Mech', side=sx, ny=2, nt=2, lift=0.06)
    # 腹の機器のふくらみ
    box(h, (0, 1.6, 1.42), (3.0, 3.6, 0.6), 'Mech')
    box(h, (0, -3.6, 1.5), (2.6, 1.8, 0.5), 'Mech')
    box(h, (0, 7.2, 1.7), (2.2, 2.6, 0.4), 'Mech')
    for sx in (1, -1):
        box(h, (sx * 1.9, -1.0, 1.55), (0.7, 4.2, 0.35), 'Mech')


WING_TOP = [  # 右翼の上面の輪郭（細い端の外 → 外の縁 → 広い端 → 根元を戻る）
    (1.85, 11.9, 3.5),
    (3.4, 6.5, 3.75),
    (7.0, -5.4, 3.3),
    (7.0, -9.6, 3.2),
    (5.9, -10.6, 4.2),
    (4.5, -10.0, 5.9),
    (4.4, -5.0, 5.75),
    (3.4, 2.0, 5.0),
    (2.6, 6.0, 4.3),
    (1.7, 11.0, 3.75),
]


def build_wings(P):
    w = P['Wings']

    def wing(part, sx):
        top = [(x * sx, y, z) for x, y, z in WING_TOP]
        if sx < 0:
            top = list(reversed(top))
        slab(part, top, 0.28, 'Dark')
        # 根元の縁から船体へ下りる壁（翼の内側の段）
        root = [(x * sx, y, z) for x, y, z in WING_TOP[5:]]
        verts = [p for x, y, z in root for p in ((x, y, z - 0.2), (x, y, z - 1.1))]
        faces = [[2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2] for i in range(len(root) - 1)]
        _orient(part, verts, faces, 'Dark', (0, -2, 7.5))

    mirror_add(w, wing)


def build_engines(P):
    e = P['Engine']
    for sx in (1, -1):
        x, z = sx * 4.0, 3.75
        # ナセル（翼の後ろの下に抱えたエンジンの外板）
        box(e, (x, -8.6, z + 0.15), (1.9, 3.0, 1.5), 'Dark')
        # 節のある筒と、噴射口
        for k in range(4):
            y = -10.1 - k * 0.36
            cylinder(e, (x, y, z), (x, y - 0.26, z), 0.72, 0.72, 'Mech', n=24)
            cylinder(e, (x, y - 0.26, z), (x, y - 0.36, z), 0.62, 0.62, 'Metal', n=24)
        cylinder(e, (x, -11.5, z), (x, -12.0, z), 0.78, 0.85, 'Dark', n=24, cap1=None)
        cylinder(e, (x, -11.95, z), (x, -11.6, z), 0.7, 0.55, 'Dark', n=24, cap0=None, cap1=None, inward=True)
        cylinder(e, (x, -11.7, z), (x, -11.68, z), 0.56, 0.56, 'Metal', n=24)
    # 中央の四角い主エンジン：上の広い排気口と、下の小さい排気口
    box(e, (0, -11.6, 3.65), (3.6, 1.0, 2.1), 'Dark')
    box(e, (0, -12.1, 4.05), (2.7, 0.06, 0.9), 'Dark')
    box(e, (0, -12.1, 2.95), (1.7, 0.06, 0.75), 'Dark')
    for k in range(9):  # 排気口の羽根
        x = -1.2 + k * 0.3
        box(e, (x, -12.14, 4.05), (0.06, 0.12, 0.9), 'Mech')
    for k in range(5):
        x = -0.7 + k * 0.35
        box(e, (x, -12.14, 2.95), (0.06, 0.12, 0.75), 'Mech')
    box(e, (0, -12.15, 3.5), (2.9, 0.12, 0.12), 'Dark')


def strut(part, a, b, r, mat='Metal', n=10):
    cylinder(part, a, b, r, r, mat, n=n)


def build_legs(P):
    g = P['Legs']
    for sy, y in ((1, 5.7), (-1, -5.9)):
        for sx in (1, -1):
            hip = (sx * 3.3, y, 2.45)
            knee = (sx * 4.1, y - sy * 0.3, 1.2)
            foot = (sx * 4.5, y, 0.32)
            # 付け根の箱（脚をたたむ収納）
            box(g, (sx * 3.15, y, 2.5), (0.9, 1.6, 0.6), 'Mech')
            # 上の脚（前後 2 本で A 字）と、下の脚
            strut(g, (hip[0], y + 0.5, hip[2]), knee, 0.13)
            strut(g, (hip[0], y - 0.5, hip[2]), knee, 0.13)
            strut(g, knee, foot, 0.15, 'Mech')
            # ダンパー（胴から膝へ）
            strut(g, (sx * 2.6, y + sy * 0.9, 2.2), (knee[0], knee[1], knee[2] + 0.1), 0.08, 'Metal')
            cylinder(g, knee, (knee[0], knee[1], knee[2] + 0.01), 0.22, 0.22, 'Dark', n=12, axis_up=(0, 1, 0))
            box(g, knee, (0.4, 0.45, 0.4), 'Dark')
            # 足の皿（つま先が前後に伸びた平たい靴）
            box(g, (foot[0], y, 0.14), (0.9, 1.7, 0.22), 'Dark')
            box(g, (foot[0], y, 0.3), (0.5, 0.7, 0.18), 'Mech')


# ---- Blender での仕上げ ---------------------------------------------------------

PREVIEW_COLORS = {
    'Hull': '#d9dce2', 'Hull2': '#b9bdc6', 'Dark': '#2b2f38', 'Mech': '#454a55', 'Metal': '#8a909b',
    'Glass': '#101924', 'Window': '#ffd9a0', 'Glow': '#bfe0ff', 'Accent': '#e0a020', 'NavRed': '#ff2020', 'NavGreen': '#20ff50',
}
EMISSIVE = {'Window', 'Glow', 'NavRed', 'NavGreen'}


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
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bm.to_mesh(mesh)
    bm.free()
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
        b.inputs['Roughness'].default_value = 0.15 if name == 'Glass' else 0.5
        b.inputs['Metallic'].default_value = 0.6 if name == 'Metal' else 0.15
        if name in EMISSIVE:
            b.inputs['Emission Color'].default_value = (*c, 1)
            b.inputs['Emission Strength'].default_value = 4


def preview(tag):
    from mathutils import Vector
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = int(os.environ.get('PREVIEW_SAMPLES', '32'))
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    scene.view_settings.view_transform = 'AgX'
    scene.world = bpy.data.worlds.new('world')
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.05, 0.06, 0.08, 1)
    bg.inputs['Strength'].default_value = 1.0
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.2
    sun.data.angle = 0.03
    sun.rotation_euler = (0.75, 0.0, 2.3)
    scene.collection.objects.link(sun)
    fill = bpy.data.objects.new('fill', bpy.data.lights.new('fill', 'SUN'))
    fill.data.energy = 0.7
    fill.rotation_euler = (1.9, 0.0, -0.9)
    scene.collection.objects.link(fill)
    # 地面（影を見るため。上・横・前の図では外す）
    bpy.ops.mesh.primitive_plane_add(size=6)
    ground = bpy.context.active_object
    gm = bpy.data.materials.new('Ground')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*lin('#6b6258'), 1)
    gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.95
    ground.data.materials.append(gm)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    c = 3.25 * S  # 高さの中心
    shots = {
        'hero': ((0.95, 0.85, 0.55), (0, 0.02, c), 'PERSP', 50, True),
        'rear': ((0.95, -1.15, 0.5), (0, -0.02, c), 'PERSP', 50, True),
        'low': ((0.55, 0.65, 0.05), (0, 0.0, c * 1.1), 'PERSP', 40, True),
        'under': ((0.7, 0.5, -0.45), (0, 0.0, c), 'PERSP', 50, False),
        'top': ((0, 0, 3), None, 'ORTHO', 1.12, False),
        'side': ((-3, 0, c), None, 'ORTHO', 1.12, False),
        'bow': ((0, 3, c), None, 'ORTHO', 0.66, False),
        'stern': ((0, -3, c), None, 'ORTHO', 0.66, False),
    }
    for name in os.environ.get('VIEWS', 'hero,rear,low,under,top,side,bow,stern').split(','):
        pos, target, kind, lens, show_ground = shots[name]
        ground.hide_render = not show_ground
        cam.location = Vector(pos)
        if target:
            cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        elif name == 'top':
            cam.rotation_euler = (0, 0, -math.pi / 2)  # 細い端を左に（設定資料の向き）
        elif name == 'side':
            cam.rotation_euler = (math.pi / 2, 0, -math.pi / 2)  # 細い端が左（設定資料の向き）
        elif name == 'bow':
            cam.rotation_euler = (math.pi / 2, 0, math.pi)  # 船首の側から
        elif name == 'stern':
            cam.rotation_euler = (math.pi / 2, 0, 0)  # 船尾の側から
        cam.data.type = kind
        if kind == 'ORTHO':
            cam.data.ortho_scale = lens
        else:
            cam.data.lens = lens
        cam.data.clip_start = 0.001
        scene.render.filepath = os.path.join(PREVIEW_DIR, f'lander-{tag}-{name}.png')
        bpy.ops.render.render(write_still=True)
        print('  render', name, flush=True)


def main():
    t0 = time.time()
    bf.reset_scene()
    for m in MATS:
        bpy.data.materials.new(m)
    P = {name: Part() for name in PARTS}
    loft = hull_loft()
    build_hull(P, loft)
    build_wings(P)
    build_engines(P)
    build_legs(P)
    # 胴は設定資料の図の厚みに寄せて縦に詰め、全高 6.5 m は脚の長さでとる
    for name in ('Hull', 'Wings', 'Engine'):
        P[name].verts = [(x, y, TOP - (TOP - z) * BODY_SQUASH) for x, y, z in P[name].verts]
    objs = []
    for name in PARTS:
        if P[name].faces:
            obj = make_object(name, P[name])
            bf.sharpen(obj, 35)
            objs.append(obj)
    nf = sum(len(o.data.polygons) for o in objs)
    print(f'  {nf} faces ({time.time() - t0:.1f}s)', flush=True)
    allco = np.concatenate([np.array([v.co[:] for v in o.data.vertices]) for o in objs]) / S
    lo, hi = allco.min(0), allco.max(0)
    print(f'  size (m): width {hi[0] - lo[0]:.2f}  length {hi[1] - lo[1]:.2f}  height {hi[2] - lo[2]:.2f}')
    if os.environ.get('PREVIEW'):
        preview_materials()
        preview(f's{STAGE}')


if __name__ == '__main__':
    main()
