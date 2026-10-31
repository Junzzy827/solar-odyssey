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


def glass(h, loft, y0, y1, i, t0, t1, side, ny=2):
    """窓。段階 2 からは、暗い窓枠の上に少し小さいガラスを重ねる"""
    if STAGE < 2:
        surface_panel(h, loft, y0, y1, i, t0, t1, 'Glass', side=side, ny=ny, nt=1)
        return
    a, b = loft.point((y0 + y1) / 2, i, 0), loft.point((y0 + y1) / 2, i, 1)
    seg = max(np.linalg.norm(b - a), 0.3)
    m = 0.09
    surface_panel(h, loft, y0 - m, y1 + m, i, max(0, t0 - m / seg), min(1, t1 + m / seg), 'Dark', lift=0.035, side=side, ny=ny, nt=1)
    surface_panel(h, loft, y0, y1, i, t0, t1, 'Glass', lift=0.06, side=side, ny=ny, nt=1)


def build_hull(P, loft):
    h = P['Hull']
    loft.build(h)
    # 展望甲板の窓（上面の中央と肩の斜面）。設定資料の、前にすぼまる窓の群れ
    rows = [(2.6, 1.2), (0.9, -0.6), (-1.2, -2.8), (-3.4, -5.0), (-5.6, -6.6)]
    for r, (ya, yb) in enumerate(rows):
        # 上面（区間 0）：中央の大窓を前後に並べる
        if r < 4:
            for sx in (1, -1):
                glass(h, loft, yb, ya, 0, 0.12, 0.88, sx)
        # 肩の斜面（区間 1）：2 列
        for c, (t0, t1) in enumerate(((0.04, 0.3), (0.36, 0.62), (0.68, 0.92))):
            if c > r + 1 or (r == 4 and c == 0):  # 前ほど列が少ない（前へすぼまる窓の群れ）
                continue
            for sx in (1, -1):
                glass(h, loft, yb + 0.1, ya - 0.1, 1, t0, t1, sx)
    # 操縦席の前窓（上面の前端、斜めに傾いた 3 枚）
    for sx in (1, -1):
        glass(h, loft, 2.9, 3.9, 0, 0.1, 0.9, sx)
        glass(h, loft, 3.0, 3.9, 1, 0.05, 0.35, sx)
    # 船首の扉（上から見て先端の格子の四角）
    for sx in (1, -1):
        surface_panel(h, loft, 9.6, 11.9, 0, 0.0, 0.95, 'Dark', side=sx, ny=3, nt=1, lift=0.02)
    # 後ろの暗色の装甲（上面の後ろ寄り）
    for sx in (1, -1):
        surface_panel(h, loft, -11.2, -8.6, 0, 0.0, 1.0, 'Dark', side=sx, ny=3, nt=1, lift=0.05)
        surface_panel(h, loft, -11.2, -8.6, 1, 0.0, 1.0, 'Dark', side=sx, ny=3, nt=2, lift=0.05)
        # 広い端へ向いた展望窓（設定資料の正面図の、ドームの窓）
        glass(h, loft, -8.3, -7.0, 0, 0.1, 0.9, sx)
        glass(h, loft, -8.2, -7.0, 1, 0.05, 0.3, sx)
        glass(h, loft, -8.0, -7.0, 1, 0.36, 0.6, sx)
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
        cylinder(e, (x, -11.7, z), (x, -11.68, z), 0.56, 0.56, 'Glow', n=24)
    # 中央の四角い主エンジン：上の広い排気口と、下の小さい排気口
    box(e, (0, -11.6, 3.65), (3.6, 1.0, 2.1), 'Dark')
    box(e, (0, -12.1, 4.05), (2.7, 0.06, 0.9), 'Glow')
    box(e, (0, -12.1, 2.95), (1.7, 0.06, 0.75), 'Glow')
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


# ---- 段階 2：細部 -----------------------------------------------------------------


def oct_pad(part, c, rx, ry, h, mat):
    """角を落とした八角形の平たい台（足の皿・機器の台）"""
    k = 0.32
    pts = [(rx, ry * (1 - k)), (rx * (1 - k), ry), (-rx * (1 - k), ry), (-rx, ry * (1 - k)),
           (-rx, -ry * (1 - k)), (-rx * (1 - k), -ry), (rx * (1 - k), -ry), (rx, -ry * (1 - k))]
    top = [(c[0] + x * 0.82, c[1] + y * 0.82, c[2] + h) for x, y in pts]
    bot = [(c[0] + x, c[1] + y, c[2]) for x, y in pts]
    n = len(pts)
    verts = top + bot + [(c[0], c[1], c[2] + h), (c[0], c[1], c[2])]
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces += [[2 * n, i, j], [2 * n + 1, n + j, n + i], [i, n + i, n + j, j]]
    _orient(part, verts, faces, mat, (c[0], c[1], c[2] + h / 2))


def build_details(P, loft):
    h, w, e, g = P['Hull'], P['Wings'], P['Engine'], P['Legs']
    # 横腹の装甲板（少し浮かせた板。焼き込みで段の影が出る）
    for sx in (1, -1):
        for y0, y1 in ((5.6, 8.6), (1.1, 5.2), (-3.5, 0.6), (-8.3, -4.0)):
            surface_panel(h, loft, y0, y1, 3, 0.08, 0.86, 'Hull', lift=0.07, side=sx, ny=4, nt=2)
        # 腹の斜面の板
        for y0, y1 in ((2.4, 6.4), (-4.2, 1.8)):
            surface_panel(h, loft, y0, y1, 4, 0.1, 0.8, 'Hull2', lift=0.05, side=sx, ny=4, nt=2)
        # 肩の後ろの装甲（窓の群れのうしろ）
        surface_panel(h, loft, -8.6, -6.9, 1, 0.65, 1.0, 'Dark', lift=0.05, side=sx, ny=2, nt=1)
    # 船首の扉の格子
    for k in range(5):
        y = 9.9 + k * 0.45
        p = loft.point(y, 0, 0)
        box(h, (0, y, p[2] + 0.05), (2.0 * (0.92 - k * 0.04), 0.07, 0.07), 'Mech')
    # 上面のアンテナとセンサー
    for sx in (1, -1):
        cylinder(h, (sx * 0.5, -9.6, 5.05), (sx * 0.5, -9.6, 5.85), 0.035, 0.02, 'Metal', n=8)
        box(h, (sx * 0.5, -9.6, 5.1), (0.22, 0.3, 0.12), 'Mech')
    cylinder(h, (0, -10.4, 4.95), (0, -10.4, 5.15), 0.28, 0.24, 'Mech', n=20)
    cylinder(h, (0, -10.4, 5.15), (0, -10.4, 5.2), 0.24, 0.12, 'Metal', n=20)
    # 腹の機器：箱の上に小さい箱、着陸灯、船首下のセンサー
    for c, sz in (((0, 1.6, 1.09), (2.2, 2.8, 0.12)), ((0, -3.6, 1.22), (1.8, 1.2, 0.08)), ((0, 7.2, 1.47), (1.4, 1.6, 0.08))):
        box(h, c, sz, 'Dark')
    for sx in (1, -1):
        for y in (4.0, 2.6, 0.9, -0.5):
            box(h, (sx * 1.9, y - 1.0, 1.35), (0.5, 0.9, 0.08), 'Dark')
        cylinder(h, (sx * 1.2, 9.2, 2.25), (sx * 1.2, 9.2, 2.12), 0.16, 0.14, 'Window', n=14)  # 着陸灯
        cylinder(h, (sx * 1.6, -8.8, 1.85), (sx * 1.6, -8.8, 1.72), 0.14, 0.12, 'Window', n=14)
    cylinder(h, (0, 9.8, 2.6), (0, 9.8, 2.45), 0.32, 0.22, 'Glass', n=20)  # 地形を読むレーダー
    # 姿勢制御の噴射口（四隅に 4 方向の小さな噴射口の箱）
    for sx in (1, -1):
        for y, z in ((10.6, 3.45), (-10.3, 3.9)):
            p = loft.point(y, 3, 0.0, sx)
            c = (p[0] + sx * 0.12, y, z)
            box(h, c, (0.36, 0.6, 0.42), 'Mech')
            for d in ((sx, 0, 0), (0, 0, 1), (0, 0, -1)):
                a = np.array(c) + np.array(d) * np.array((0.18, 0, 0.21))
                cylinder(h, tuple(a), tuple(a + np.array(d) * 0.08), 0.06, 0.09, 'Metal', n=10, cap1=None)
    # 翼：外の縁の金属の帯、後ろの通気口、航行灯
    def wing_details(part, sx):
        for a, b, n in ((WING_TOP[0], WING_TOP[1], 3), (WING_TOP[1], WING_TOP[2], 7)):
            a, b = np.array(a), np.array(b)
            for k in range(n):
                p0 = a + (b - a) * k / n
                p1 = a + (b - a) * (k + 1) / n
                cylinder(part, (p0[0] * sx, p0[1], p0[2] - 0.14), (p1[0] * sx, p1[1], p1[2] - 0.14), 0.09, 0.09, 'Metal', n=8)
        for k in range(4):
            y = -6.2 - k * 0.6
            box(part, (sx * 5.8, y, 4.05 - k * 0.12 + 0.02), (1.0, 0.32, 0.12), 'Mech', rot_y=sx * 0.42)
        tip = np.array(WING_TOP[3])
        box(part, (sx * (tip[0] - 0.05), tip[1] + 0.25, tip[2] - 0.05), (0.18, 0.4, 0.2), 'NavGreen' if sx > 0 else 'NavRed')
        box(part, (sx * 3.2, 7.0, 3.72), (0.12, 0.3, 0.12), 'NavGreen' if sx > 0 else 'NavRed')
    mirror_add(w, wing_details)
    # エンジン：ナセルの後ろの輪、熱よけの板
    for sx in (1, -1):
        x, z = sx * 4.0, 3.75
        cylinder(e, (x, -9.9, z), (x, -10.1, z), 0.82, 0.78, 'Metal', n=24)
        box(e, (x, -8.6, z + 0.95), (1.5, 2.6, 0.1), 'Mech')
        for k in range(3):
            box(e, (x + sx * 0.97, -7.8 - k * 0.7, z + 0.15), (0.1, 0.4, 1.0), 'Mech')
    box(e, (0, -11.6, 4.75), (3.4, 0.8, 0.12), 'Mech')
    for sx in (1, -1):
        box(e, (sx * 1.85, -11.6, 3.65), (0.12, 0.85, 1.9), 'Mech')
    # 脚：油圧の筒（太い筒と光る棒）、ちょうつがい、八角形の足の皿
    for sy, y in ((1, 5.7), (-1, -5.9)):
        for sx in (1, -1):
            knee = np.array((sx * 4.1, y - sy * 0.3, 1.2))
            foot = np.array((sx * 4.5, y, 0.32))
            mid = knee + (foot - knee) * 0.45
            cylinder(g, tuple(knee + (foot - knee) * 0.08), tuple(mid), 0.21, 0.21, 'Dark', n=14)
            for k in (0.12, 0.38):
                q = knee + (foot - knee) * k
                cylinder(g, tuple(q), tuple(q + (foot - knee) * 0.03), 0.24, 0.24, 'Mech', n=14)
            hip = np.array((sx * 3.3, y, 2.45))
            for dy in (0.5, -0.5):
                hp = hip + np.array((0, dy, 0))
                cylinder(g, tuple(hp + np.array((0, -0.12, 0))), tuple(hp + np.array((0, 0.12, 0))), 0.16, 0.16, 'Metal', n=12)
            oct_pad(g, (foot[0], y, 0.0), 0.6, 0.95, 0.2, 'Dark')
            box(g, (foot[0], y, 0.25), (0.45, 0.6, 0.12), 'Metal')


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


def bevel(obj, width):
    mod = obj.modifiers.new('bevel', 'BEVEL')
    mod.width = width
    mod.segments = 2
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(35)
    mod.use_clamp_overlap = True
    mod.miter_outer = 'MITER_ARC'
    for o in bpy.context.scene.objects:
        o.select_set(o == obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)


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
        'door': ((0.5, 0.32, 0.1), (0.15, 0.08, 0.13), 'PERSP', 45, True),
        'gear': ((0.36, 0.42, 0.06), (0.18, 0.24, 0.04), 'PERSP', 45, True),
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


# ---- 段階 3：質感を絵に焼き込む（アマツカゼと同じ流れ） ------------------------------
#
# 位置・向き・材質の番号・AO・角の丸みを Cycles で焼き、numpy で
# ベースカラー / ラフネス＋メタリック / ノーマル / エミッシブ を組み立てる。
# 着陸船らしさ：白いセラミック外板のパネル割りと留め具、ハッチ、注意書きの帯、
# 腹と脚の砂ぼこり、降下噴射で焦げた腹、エンジンまわりの熱焼け、側面の雨だれのような筋、角の塗装のはげ。

TEX = int(os.environ.get('TEX', '2048'))
OUT = os.environ.get('OUT', os.path.join(bf.OUT_DIR, 'ship-lander.glb'))
LIVE = {'Glow', 'NavRed', 'NavGreen'}

PALETTE = {  # 色, ラフネス, メタリック
    'Hull': ('#dcdee1', 0.46, 0.05), 'Hull2': ('#c3c7cd', 0.52, 0.05), 'Dark': ('#2a2e35', 0.6, 0.2),
    'Mech': ('#3b4049', 0.5, 0.55), 'Metal': ('#9ea4ac', 0.28, 0.92), 'Glass': ('#0a1017', 0.06, 0.2),
    'Window': ('#fff1d8', 0.3, 0.0), 'Accent': ('#d9a21b', 0.45, 0.05),
}


def srgb(h):
    h = h.lstrip('#')
    c = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


class Panels:
    """メートルでのパネル割り。行の高さと板の長さに大小をまぜる"""

    def __init__(self, seed, lo=-8.0, hi=8.0, along=13.0):
        import random
        rng = random.Random(seed)
        self.rows = []
        b = lo
        while b < hi:
            h = rng.choice([0.45, 0.6, 0.6, 0.8, 0.8, 1.1, 1.4])
            cuts = []
            a = -along - rng.random()
            while a < along:
                cuts.append(a)
                a += rng.choice([0.5, 0.8, 1.1, 1.1, 1.5, 1.9, 2.6])
            cuts.append(a)
            self.rows.append((b, b + h, np.array(cuts)))
            b += h
        self.edges = np.array([r[0] for r in self.rows] + [self.rows[-1][1]])

    def sample(self, a, b):
        """(a 方向の継ぎ目までの距離, b 方向の継ぎ目までの距離, 板の番号)"""
        ri = np.clip(np.searchsorted(self.edges, b) - 1, 0, len(self.rows) - 1)
        da = np.full(a.shape, 9.0, dtype=np.float32)
        db = np.full(a.shape, 9.0, dtype=np.float32)
        pid = np.zeros(a.shape, dtype=np.float32)
        for i, (b0, b1, cuts) in enumerate(self.rows):
            sel = ri == i
            if not sel.any():
                continue
            aa, bb = a[sel], b[sel]
            ci = np.clip(np.searchsorted(cuts, aa) - 1, 0, len(cuts) - 2)
            da[sel] = np.minimum(aa - cuts[ci], cuts[ci + 1] - aa)
            db[sel] = np.minimum(bb - b0, b1 - bb)
            pid[sel] = ci * 131.0 + i * 17.0
        return da, db, pid


def rect_mask(u, v, u0, u1, v0, v1):
    """u, v の四角の内側と、ふちまでの距離"""
    d = np.minimum(np.minimum(u - u0, u1 - u), np.minimum(v - v0, v1 - v))
    return d > 0, d


def compose(P, N, ID, AO, EDGE):
    import build_amatsukaze as ba
    valid = ID[..., 3] > 0.5
    mid = np.clip((ID[..., 0] * 32).astype(int), 0, 31)
    part = np.clip((ID[..., 1] * 32).astype(int), 0, 31)
    pos = (P[..., :3] - 1) / S  # メートル
    nrm = N[..., :3] * 2 - 1
    x, y, z = pos[..., 0], pos[..., 1], pos[..., 2]
    ax_, nx, ny, nz = np.abs(x), nrm[..., 0], nrm[..., 1], nrm[..., 2]
    ao = np.clip(ba.soft_blur(AO[..., 0], valid, 1.2), 0, 1)
    edge = np.clip(ba.soft_blur(EDGE[..., 0], valid, 0.8) * 6, 0, 1)
    is_m = lambda name: mid == MATS.index(name)  # noqa: E731
    is_p = lambda name: part == PARTS.index(name) + 1  # noqa: E731

    base = np.zeros(pos.shape, dtype=np.float32)
    rough = np.zeros(x.shape, dtype=np.float32)
    metal = np.zeros(x.shape, dtype=np.float32)
    emit = np.zeros(pos.shape, dtype=np.float32)
    height = np.zeros(x.shape, dtype=np.float32)
    for m, (col, r, mt) in PALETTE.items():
        sel = is_m(m)
        base[sel] = srgb(col)
        rough[sel] = r
        metal[sel] = mt
    white = valid & (is_m('Hull') | is_m('Hull2'))
    dark = valid & is_m('Dark')
    painted = white | dark | (valid & is_m('Mech'))

    # 1. 大きなむら（塗りと素材の色の揺らぎ）
    n_big = ba.value_noise(pos * S, 6.0, 11)
    n_mid = ba.value_noise(pos * S, 30.0, 12)
    n_fine = ba.value_noise(pos * S, 160.0, 13)
    base *= (1 + (n_big - 0.5) * 0.06 + (n_mid - 0.5) * 0.04)[..., None]
    rough += (n_mid - 0.5) * 0.1 + (n_fine - 0.5) * 0.06

    # 2. パネル割り：面の向きで投影を変える（横腹は y-z、上と腹は y-x、前後の面は x-z）
    axis = np.argmax(np.abs(nrm), axis=-1)
    a = np.where(axis == 1, x, y)
    b = np.where(axis == 0, z, np.where(axis == 1, z, x))
    pan = Panels(41)
    da, db, pid = pan.sample(a, b + axis * 0.37)
    dist = np.minimum(da, db)
    GROOVE = 0.02
    groove_soft = np.clip(1 - dist / (GROOVE * 2.2), 0, 1) * painted
    height -= groove_soft * 0.7
    hp = ba.hash2(pid, axis * 1.0, 2.0)
    base[white] *= (1 + (hp[white] - 0.5) * 0.07)[..., None]
    base[dark] *= (1 + (hp[dark] - 0.5) * 0.12)[..., None]
    rough[painted] += ((ba.hash2(pid, 7.0, 1.0) - 0.5) * 0.1)[painted]
    base *= (1 - 0.45 * groove_soft * white - 0.25 * groove_soft * dark)[..., None]
    # 留め具：板のふちから 4 cm 内側に 15 cm おき
    PITCH = 0.15
    fa = np.abs(np.mod(a, PITCH) / PITCH - 0.5)
    fb = np.abs(np.mod(b, PITCH) / PITCH - 0.5)
    rivet = painted & (((np.abs(db - 0.045) < 0.009) & (fa < 0.06)) | ((np.abs(da - 0.045) < 0.009) & (fb < 0.06)))
    rivet &= ba.hash2(pid, 3.0, 9.0) < 0.7  # 留め具のない板もまぜる
    height[rivet] += 0.5
    base[rivet] *= 0.86

    # 3. ハッチ：左右の乗降扉、点検口、脚の収納扉
    side = white & (np.abs(nx) > 0.55)
    door, ddist = rect_mask(y, z, 2.0, 3.4, 2.7, 3.95)
    door &= side
    rim = door & (ddist < 0.035)
    base[door] *= 0.97
    base[rim] *= 0.45
    height[rim] -= 1.0
    # 扉のまわりの黄黒の注意帯と取っ手
    band, bd = rect_mask(y, z, 1.87, 3.53, 2.58, 4.06)
    band &= side & ~door
    stripe = np.mod((y + z) / 0.12, 1.0) < 0.5
    base[band & stripe] = srgb('#d9a21b')
    base[band & ~stripe] = srgb('#1d1f22')
    rough[band] = 0.5
    handle, _ = rect_mask(y, z, 3.12, 3.28, 3.15, 3.45)
    base[handle & side] = srgb('#d9a21b')
    height[handle & side] += 0.6
    import random
    hr = random.Random(9)
    hatches = []
    for _ in range(26):
        hy = hr.uniform(-9.5, 9.0)
        w_, h_ = hr.choice([(0.4, 0.4), (0.6, 0.4), (0.3, 0.5), (0.8, 0.5)])
        hz = hr.uniform(2.4, 4.3)
        if 1.5 < hy < 3.9:
            continue
        hatches.append((hy, hz, w_, h_))
    for hy, hz, w_, h_ in hatches:
        inside, dd = rect_mask(y, z, hy - w_ / 2, hy + w_ / 2, hz - h_ / 2, hz + h_ / 2)
        inside &= side
        r_ = inside & (dd < 0.02)
        base[inside] *= 0.96
        base[r_] *= 0.55
        height[r_] -= 0.8
    belly = painted & (nz < -0.6)
    for ly in (5.7, -5.9):
        inside, dd = rect_mask(ax_, y, 2.4, 3.9, ly - 0.95, ly + 0.95)
        inside &= belly
        r_ = inside & (dd < 0.03)
        base[r_] *= 0.5
        height[r_] -= 1.0
        chev = inside & (dd > 0.05) & (dd < 0.18) & (np.mod((y + ax_) / 0.16, 1) < 0.5)
        base[chev] = srgb('#d9a21b')

    # 4. 文字のような印（読めない短い棒の列。どの国の文字でもない）
    def stencil(y0, z0, n, seed, h=0.07, sel=None):
        rr = random.Random(seed)
        yy = y0
        for _ in range(n):
            w_ = rr.choice([0.03, 0.05, 0.06, 0.09])
            m_, _ = rect_mask(y, z, yy, yy + w_, z0, z0 + h)
            base[m_ & sel] *= 0.35
            yy += w_ + rr.choice([0.02, 0.02, 0.05])
    for k, (sy, sz) in enumerate(((3.65, 3.85), (3.65, 3.73), (-6.5, 3.1), (6.2, 3.35), (-2.8, 2.6))):
        stencil(sy, sz, 9, 20 + k, sel=side)
    # 船名の帯：横腹の前寄りに細い黄色の線 2 本
    for zz in (3.02, 3.1):
        line = side & (np.abs(z - zz) < 0.018) & (y > 3.2) & (y < 9.0)
        base[line] = srgb('#d9a21b')
    # 翼の上の歩いてよい場所の枠（細い明るい灰色）
    wtop = valid & is_p('Wings') & is_m('Dark') & (nz > 0.6)
    wk = wtop & ((np.abs(ax_ - 5.4) < 0.02) | (np.abs(ax_ - 4.9) < 0.02)) & (y < -1.0) & (y > -5.5)
    base[wk] = srgb('#7d828a')

    # 5. 窓：黒いガラス、ところどころ室内の明かり、操縦席は青白い計器の明かり
    gl = valid & is_m('Glass')
    cell = np.floor(y / 1.6) * 7 + np.floor(x / 1.2)
    lit = gl & (ba.hash2(cell, 3.0) < 0.25)
    emit[lit] = np.array([1.0, 0.72, 0.45]) * 0.03
    cockpit = gl & (y > 2.7)
    emit[cockpit] = np.array([0.55, 0.75, 1.0]) * 0.03
    lamp = valid & is_m('Window')
    emit[lamp] = np.array([1.0, 0.92, 0.78]) * 1.5

    # 6. 汚れ
    # 砂ぼこり：低いところほど、脚と足の皿は特に。上を向いた面にも薄く積もる
    regolith = srgb('#8c7d6a')
    low = np.clip((2.9 - z) / 1.8, 0, 1) ** 1.3
    feet = np.clip((0.9 - z) / 0.7, 0, 1)
    dust = np.clip(low * (0.25 + 0.75 * n_mid) * 0.8 + feet * 0.6, 0, 1)
    dust += np.clip(nz, 0, 1) * 0.12 * n_mid * (z > 3.0)
    dust *= valid & ~gl & ~lamp
    dust = np.clip(dust, 0, 0.85)
    base = base * (1 - dust[..., None] * 0.55) + regolith * dust[..., None] * 0.55
    rough += dust * 0.25
    metal *= 1 - dust * 0.7
    # 降下噴射の焦げ：腹の中央ほど濃い、むらのある黒
    scorch = np.clip(-nz, 0, 1) * np.exp(-(x / 2.6) ** 2) * (0.35 + 0.65 * n_big) * (z < 2.4)
    scorch *= valid & ~lamp
    base *= (1 - 0.5 * scorch)[..., None]
    rough += scorch * 0.15
    # エンジンまわりの熱焼け：金属は青と金茶に、塗装はすすで暗く
    heat = np.clip((-10.2 - y) / 1.6, 0, 1) * valid
    hm = heat * (valid & (is_m('Metal') | is_m('Mech')))
    tint = np.where((np.mod(np.sqrt((ax_ - 4.0) ** 2 + (z - 3.6) ** 2) * 3, 1) < 0.5)[..., None], srgb('#5d6fa0'), srgb('#a07848'))
    base = base * (1 - hm[..., None] * 0.5) + tint * hm[..., None] * 0.5
    soot = heat * (0.4 + 0.6 * n_mid) * painted
    base *= (1 - 0.5 * soot)[..., None]
    rough += soot * 0.1
    # 側面の筋：上から下へ流れた細い汚れ（継ぎ目と通気口の下ほど）
    streak_n = ba.value_noise(np.stack([x * S * 0.2, y * S * 18, z * S * 1.2], -1), 40.0, 14)
    streak = np.clip((streak_n - 0.55) * 4, 0, 1) * (np.abs(nx) > 0.5) * painted * np.clip((4.6 - z) / 2.0, 0, 1)
    base *= (1 - 0.12 * streak)[..., None]
    rough += streak * 0.08
    # 角の塗装のはげ：白は下地の灰色、暗色は明るくすれる
    wear = edge * np.clip((n_fine - 0.35) * 2.2, 0, 1)
    wl = wear * white
    base = base * (1 - wl[..., None] * 0.6) + srgb('#8d939b') * wl[..., None] * 0.6
    metal += wl * 0.5
    base *= (1 + 0.35 * wear * dark)[..., None]
    rough -= wear * 0.12 * painted
    base *= (1 + 0.06 * edge * white)[..., None]
    # AO を墨入れのように
    base *= (0.42 + 0.58 * ao)[..., None]

    # 7. ノーマル（溝・留め具・ハッチの高さから）
    nrm_map = np.zeros(pos.shape, dtype=np.float32)
    nrm_map[..., 2] = 1
    hs = ndimage_gauss(height, 0.6)
    pm = pos * S
    texel = ba.estimate_texel(pm, valid)
    cont_x = valid & np.roll(valid, -1, 1) & (np.linalg.norm(np.roll(pm, -1, 1) - pm, axis=-1) < texel * 3)
    cont_y = valid & np.roll(valid, -1, 0) & (np.linalg.norm(np.roll(pm, -1, 0) - pm, axis=-1) < texel * 3)
    gx = np.where(cont_x, np.roll(hs, -1, 1) - hs, 0)
    gy = np.where(cont_y, np.roll(hs, -1, 0) - hs, 0)
    nrm_map[..., 0] = -gx * 0.9
    nrm_map[..., 1] = -gy * 0.9
    nrm_map /= np.linalg.norm(nrm_map, axis=-1, keepdims=True)
    print(f'  texel ≈ {texel / S * 100:.1f} cm', flush=True)
    return base, np.clip(rough, 0.04, 1), np.clip(metal, 0, 1), emit, nrm_map, valid


def ndimage_gauss(a, s):
    from scipy import ndimage
    return ndimage.gaussian_filter(a, s)


def bake_and_export(objs):
    import build_amatsukaze as ba
    ba.TEX = TEX
    ba.MATS = MATS
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.world = bpy.data.worlds.new('world')
    scene.world.use_nodes = True
    scene.world.light_settings.distance = 0.8 * S
    for i, obj in enumerate(objs):
        obj.pass_index = PARTS.index(obj.name) + 1
    ba.unwrap(objs)
    t = time.time()
    Pm = ba.bake_pass(objs, 'P', 'EMIT', ba.node_position)
    Nm = ba.bake_pass(objs, 'N', 'EMIT', ba.node_normal)
    IDm = ba.bake_pass(objs, 'ID', 'EMIT', ba.node_ids)
    Em = ba.bake_pass(objs, 'EDGE', 'EMIT', ba.node_edge, samples=8)
    AOm = ba.bake_pass(objs, 'AO', 'AO', None, samples=int(os.environ.get('AO_SAMPLES', '64')))
    print(f'  bakes {time.time() - t:.0f}s', flush=True)
    base, rough, metal, emit, nrm, valid = compose(Pm, Nm, IDm, AOm, Em)
    orm = np.stack([np.ones_like(rough), rough, metal], -1)
    base, orm, emit = ba.dilate(base, valid), ba.dilate(orm, valid), ba.dilate(emit, valid)
    nrm_rgb = ba.dilate(nrm * 0.5 + 0.5, valid)
    tex_dir = os.environ.get('TEX_DIR', '/tmp/claude-0/lander-tex')
    os.makedirs(tex_dir, exist_ok=True)
    images = {
        'base': ba.save_image('lander_base', ba.to_srgb(base), 'sRGB', os.path.join(tex_dir, 'base.png')),
        'orm': ba.save_image('lander_orm', orm, 'Non-Color', os.path.join(tex_dir, 'orm.png')),
        'normal': ba.save_image('lander_normal', nrm_rgb, 'Non-Color', os.path.join(tex_dir, 'normal.png')),
        'emit': ba.save_image('lander_emit', ba.to_srgb(emit), 'sRGB', os.path.join(tex_dir, 'emit.png')),
    }
    baked = ba.final_material(images)
    lives = {}
    for obj in objs:
        mesh = obj.data
        old = [m.name for m in mesh.materials]
        new_slots = ['Baked'] + sorted({n for n in old if n in LIVE})
        remap = np.array([new_slots.index(n) if n in LIVE else 0 for n in old], dtype=np.int32)
        idx = np.empty(len(mesh.polygons), dtype=np.int32)
        mesh.polygons.foreach_get('material_index', idx)
        mesh.materials.clear()
        for n in new_slots:
            if n == 'Baked':
                mesh.materials.append(baked)
            else:
                if n not in lives:
                    bpy.data.materials[n].name = n + '_bake'
                    lives[n] = live_material(n)
                mesh.materials.append(lives[n])
        mesh.polygons.foreach_set('material_index', remap[idx])
    ba.select_only(objs)
    bpy.ops.export_scene.gltf(
        filepath=OUT, export_format='GLB', use_selection=True, export_vertex_color='NONE',
        export_normals=True, export_texcoords=True, export_tangents=False, export_materials='EXPORT',
        export_image_format='JPEG', export_jpeg_quality=90, export_yup=True,
    )
    print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB', flush=True)


def live_material(name):
    mat = bpy.data.materials.new(name + '_live')
    mat.name = name
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    col = {'Glow': (0.55, 0.75, 1.0), 'NavRed': (1, 0.05, 0.03), 'NavGreen': (0.05, 1, 0.2)}[name]
    bsdf.inputs['Base Color'].default_value = (*col, 1)
    bsdf.inputs['Emission Color'].default_value = (*col, 1)
    bsdf.inputs['Emission Strength'].default_value = 4
    return mat


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
    if STAGE >= 2:
        build_details(P, loft)
    # 胴は設定資料の図の厚みに寄せて縦に詰め、全高 6.5 m は脚の長さでとる
    for name in ('Hull', 'Wings', 'Engine'):
        P[name].verts = [(x, y, TOP - (TOP - z) * BODY_SQUASH) for x, y, z in P[name].verts]
    objs = []
    for name in PARTS:
        if P[name].faces:
            obj = make_object(name, P[name])
            if STAGE >= 2:
                bevel(obj, 0.035 * S)
            bf.sharpen(obj, 35)
            objs.append(obj)
    nf = sum(len(o.data.polygons) for o in objs)
    print(f'  {nf} faces ({time.time() - t0:.1f}s)', flush=True)
    allco = np.concatenate([np.array([v.co[:] for v in o.data.vertices]) for o in objs]) / S
    lo, hi = allco.min(0), allco.max(0)
    print(f'  size (m): width {hi[0] - lo[0]:.2f}  length {hi[1] - lo[1]:.2f}  height {hi[2] - lo[2]:.2f}')
    if STAGE >= 3:
        bake_and_export(objs)
    if os.environ.get('PREVIEW'):
        if STAGE < 3:
            preview_materials()
        preview(f's{STAGE}')


if __name__ == '__main__':
    main()
