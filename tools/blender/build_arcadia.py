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
    ], chamfer=0.05, mid=0.0, seg=2, cap_back='Mech', cap_front='Dark')


def build_hull(P):
    hull = P['Hull']
    for sx in (1, -1):
        prong_core(sx).build(hull)
        prong_upper(sx).build(hull)
        prong_lower(sx).build(hull)
        hangar_pod(sx).build(hull)
        # ポッドの前の暗い円すい（射出口の覆い）と、後ろの赤い枠
        cone(hull, (sx * 98, -62, -4), (sx * 98, 30, -4), 20, 3, 'Mech', n=6)
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
    # 中央の脇腹に、前がとがった装甲を外側ほど低く重ねる（間は暗いすき間）
    feathers = [
        ([(46, 250), (64, 170), (78, 10), (62, -20), (50, 100)], 18, lambda x, y: 40 - (abs(x) - 46) * 0.45),
        ([(66, 170), (86, 90), (100, -80), (80, -90), (70, 40)], 2, lambda x, y: 28 - (abs(x) - 66) * 0.5),
        ([(84, 70), (104, 10), (112, -150), (96, -150), (88, -20)], -12, lambda x, y: 18 - (abs(x) - 84) * 0.5),
    ]
    for o, zb, zt in feathers:
        for sx in (1, -1):
            slab(hull, ccw([(sx * x, y) for x, y in o]), zb, zt, 'Hull', side='Hull2')
    # その下の暗い構造（すき間から見える）
    for sx in (1, -1):
        slab(hull, ccw([(sx * x, y) for x, y in [(50, 200), (66, 120), (66, -250), (50, -250)]]), -30, 8, 'Dark')
    # 船底の赤い装甲（中央の船体の下から、ポッドの下まで）
    slab(hull, chevron(-62, 62, -200, 160, 120), -70, -54, 'Red')
    for sx in (1, -1):
        o = [(64, 120), (100, 20), (118, -230), (80, -230), (66, -40)]
        slab(hull, ccw([(sx * x, y) for x, y in o]), -48, lambda x, y: -30 - (abs(x) - 64) * 0.15, 'Red', side='Red')
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
        slab(w, ccw([(sx * x, y) for x, y in o]), lambda x, y: -56 + (abs(x) - 48) * 0.3, lambda x, y: -28 + (abs(x) - 48) * 0.1, 'Red', side='Red')
        # 3. 上へ反った大翼（後ろの縁が赤）
        wing(w, [(0, -100), (0, -270), (50, -300), (110, -405), (100, -385)], 5, (88, 0, 26), 26, 'Hull', edge=red_edge({1, 2}), sx=sx)
        # 4. 後ろの翼（先が赤）
        wing(w, [(0, -320), (0, -450), (112, -555), (98, -520)], 4.5, (90, 0, 22), 22, 'Hull', edge=red_edge({2}), sx=sx)
        # 5. 下向きの安定翼
        wing(w, [(0, -310), (0, -440), (96, -520), (84, -480)], 4, (70, 0, -44), -34, 'Hull', edge=red_edge({2}), sx=sx)
        # センサーの筒と、それを支える短い腕
        wing(w, [(0, -60), (0, -130), (42, -135), (42, -95)], 3, (100, 0, 16), 4, 'Mech', sx=sx)
        pod(w, -230, -40, (sx * 146, 19), 6, 'Hull', nose=0.3, tail=0.25, tip_mat='Metal')



# ---- ステージ 2：装甲の重なり・機関・艦橋・翼の作り込み ----------------------------------------


def prong_top(sx, y):
    sc = prong_upper(sx).at_sec(y)
    return sc[1], sc[2] + sc[6], sc[3]  # 中心の x、上面の高さ、上面の半幅


def chevron(x0, x1, y0, y1, tip):
    """前がとがった山形の板の輪郭（x0..x1 の幅、y0 が後ろ、y1 が前の付け根、tip だけ前へ出る）"""
    xm = (x0 + x1) / 2
    return ccw([(x0, y0), (x1, y0), (x1, y1), (xm, y1 + tip), (x0, y1)])


def prong_armor(part, sx):
    """舳先の上面に、前がとがった装甲板を前後に重ねる。外側の縁には細い段差の帯"""
    rows = [(-140, 40, 30), (30, 170, 26), (160, 290, 22), (280, 390, 18), (380, 470, 12)]
    for k, (y0, y1, tip) in enumerate(rows):
        cx, z0, wt = prong_top(sx, (y0 + y1) / 2)
        _, za, wa = prong_top(sx, y0)
        _, zb, wb_ = prong_top(sx, y1)
        w = min(wa, wb_) * 0.92
        th = 5.5 - k * 0.7
        ztop = lambda x, y, za=za, zb=zb, y0=y0, y1=y1, th=th: za + (zb - za) * (y - y0) / (y1 - y0) + th  # noqa: E731
        zbot = lambda x, y, za=za, zb=zb, y0=y0, y1=y1: za + (zb - za) * (y - y0) / (y1 - y0) - 1  # noqa: E731
        slab(part, chevron(cx - w, cx + w, y0, y1, tip), zbot, ztop, 'Hull2' if k % 2 else 'Hull')
        # 板の中央の細い背骨（点検通路のふた）
        slab(part, ccw([(cx - 2.2, y0 + 8), (cx + 2.2, y0 + 8), (cx + 2.2, y1 - 6), (cx - 2.2, y1 - 6)]),
             zbot, lambda x, y, f=ztop: f(x, y) + 1.6, 'Mech')
    # 舳先の外側面のストレーキ（細長い段）
    for y0, y1, dz in ((-150, 250, 10), (-150, 120, -2)):
        pts = []
        for y in np.linspace(y0, y1, 9):
            sc = prong_upper(sx).at_sec(y)
            pts.append((y, sc[1] + sx * (sc[4] + 0.8), sc[2] + dz))
        verts, faces = [], []
        for y, x, z in pts:
            verts += [(x, y, z - 2.5), (x + sx * 3, y, z - 1.5), (x + sx * 3, y, z + 1.5), (x, y, z + 2.5)]
        for i in range(len(pts) - 1):
            a = 4 * i
            for j in range(3):
                f = [a + j, a + 4 + j, a + 5 + j, a + 1 + j]
                faces.append(f if sx > 0 else list(reversed(f)))
        part.add(verts, faces, 'Hull2')


def launch_deck(part):
    """2 本の舳先の間の発進路：暗い床、青い誘導灯の列、カタパルトのレール"""
    slab(part, ccw([(-9, 150), (9, 150), (9, 520), (-9, 520)]), -22, -14, 'Dark')
    for x in (-4.5, 4.5):
        slab(part, ccw([(x - 0.8, 160), (x + 0.8, 160), (x + 0.8, 515), (x - 0.8, 515)]), -14, -13, 'Metal')
    for y in np.arange(170, 510, 14):
        for x in (-7.2, 7.2):
            bf.box(part, (x, y, -13.6), (1.2, 3.0, 0.8), 'Blue')
    # 発進口（奥の光る枠）
    bf.box(part, (0, 150, -2), (20, 3, 34), 'Mech')
    bf.box(part, (0, 151.6, -4), (14, 1, 24), 'Window')


def aft_details(part, eng):
    """機関部：背と脇の追加装甲、噴射口の覆いの縦リブ、赤い枠の点検ハッチ"""
    # 背中の装甲（帯ごとに少しずつ形を変える）
    bands = [(-255, -318), (-324, -383), (-389, -438), (-444, -498)]
    for k, (y1, y0) in enumerate(bands):
        w = 46 - k * 2
        slab(part, ccw([(-w, y0 + 3), (w, y0 + 3), (w, y1 - 3), (w - 12, y1 - 3 + (k % 2) * 4), (-w + 12, y1 - 3 + (k % 2) * 4), (-w, y1 - 3)]), 55, 60.5, 'Hull2' if k % 2 else 'Hull')
        # 脇腹の張り出し（四角い装甲箱）
        for sx in (1, -1):
            bf.box(part, (sx * 88, (y0 + y1) / 2, 10), (8, (y1 - y0) - 10, 28), 'Hull2')
            bf.box(part, (sx * 92.5, (y0 + y1) / 2, 10), (1.5, (y1 - y0) - 26, 18), 'Mech')
    # 背骨の通路と放熱板
    slab(part, ccw([(-8, -500), (8, -500), (8, -250), (-8, -250)]), 58, 64, 'Mech')
    for y in np.arange(-490, -260, 20):
        bf.box(part, (0, y, 65), (22, 5, 2.5), 'Metal')
    # 噴射口の覆いの縦リブ（八角の面ごと）
    for a in np.linspace(0, 2 * math.pi, 16, endpoint=False):
        r = 84
        x, z = math.cos(a) * r * 1.02, math.sin(a) * r * 0.62
        bf.box(part, (x, -532, z), (6, 50, 6), 'Mech', rot_y=-a)
    # 噴射口のふちの重い輪
    cone(eng, (0, -596, 0), (0, -604, 0), 70, 70, 'Mech', n=8, cap0=None, cap1=None)
    cone(eng, (0, -604, 0), (0, -596, 0), 64, 64, 'Dark', n=8, cap0=None, cap1=None)
    slab(eng, ccw([(-64, -604), (64, -604), (64, -598), (-64, -598)]), -40, 40, 'Dark')
    # 脇の赤い枠（ポッドの後ろ、機関部の前の点検ハッチ）
    for sx in (1, -1):
        x = sx * 91
        for (dy, dz, ly, lz) in ((0, 30, 34, 4), (0, -30, 34, 4), (-15, 0, 4, 60), (15, 0, 4, 60)):
            bf.box(part, (x, -230 + dy, dz - 2), (5, ly, lz), 'Red')
        bf.box(part, (x - sx * 0.5, -230, -2), (4, 26, 56), 'Dark')
        for z in (-18, -2, 14):
            bf.box(part, (x + sx * 0.5, -230, z), (4, 22, 1.2), 'Window')


def engine_details(eng):
    """主噴射口：外側のベルに補強の輪、中心の光る芯（プラグ）"""
    for sx in (1, -1):
        for sz in (1, -1):
            c = (sx * 36, sz * 25)
            for yy in (-600, -606, -611):
                t = (-590 - yy) / 24
                r = 16 + (23 - 16) * t + 0.8
                cone(eng, (c[0], yy - 1, c[1]), (c[0], yy + 1, c[1]), r, r, 'Metal', n=32, cap0=None, cap1=None)
            cone(eng, (c[0], -598, c[1]), (c[0], -606, c[1]), 7, 3, 'Metal', n=24)
    for sx in (1, -1):
        for yy in (-470, -520, -570):
            cone(eng, (sx * 70, yy - 2, -48), (sx * 70, yy + 2, -48), 16, 16, 'Mech', n=24, cap0=None, cap1=None)
        bf.box(eng, (sx * 70, -500, -33), (6, 120, 6), 'Mech')


def pod_details(part, sx):
    """格納庫ポッド：区切りの輪、脇の装甲、上のセンサー、射出口の青い光"""
    cx = sx * 98
    for y in (-210, -160, -110):
        slab(part, ccw([(cx - 33, y - 3), (cx + 33, y - 3), (cx + 33, y + 3), (cx - 33, y + 3)]), -40, 32, 'Mech')
    bf.box(part, (cx + sx * 33, -175, -4), (3, 150, 26), 'Hull2')
    bf.box(part, (cx + sx * 35, -175, -4), (1.5, 120, 4), 'Red')
    cone(part, (cx, -150, 30), (cx, -150, 36), 6, 4, 'Hull', n=16)
    bf.box(part, (cx, -150, 37), (3, 3, 2), 'Blue')
    # 円すいの先の射出口
    cone(part, (cx, 30, -4), (cx, 31, -4), 4, 4, 'Glow', n=12)


def tower_details(t):
    """艦橋：窓の帯、翼の先の見張り所、レーダーの皿、細いアンテナ"""
    tiers = [(-240, -120, 78, 22, 22), (-225, -150, 98, 22, 15), (-215, -170, 118, 18, 9)]
    for y0, y1, z, h, w in tiers:
        # 前面の窓の帯（横に細長い）と、脇の窓
        bf.box(t, (0, y1 - 13, z + h * 0.62), (w * 1.5, 1.2, h * 0.16), 'Window')
        for sx in (1, -1):
            for k in range(4):
                yy = y1 - 26 - k * (y1 - y0 - 30) / 4
                bf.box(t, (sx * (w * 0.92), yy, z + h * 0.7), (1, 10, 2.2), 'Window')
    # 一段目の脇の見張り所（ブリッジウイング）
    for sx in (1, -1):
        bf.box(t, (sx * 44, -142, 92), (14, 14, 8), 'Hull')
        bf.box(t, (sx * 44, -134.8, 93), (12, 0.8, 3), 'Window')
    # レーダーの皿（後ろ向きに少し傾く）
    for sx in (1, -1):
        cone(t, (sx * 12, -232, 120), (sx * 12, -236, 128), 1.2, 1.2, 'Metal', n=8)
        cone(t, (sx * 12, -238, 128), (sx * 12, -232, 133), 9, 1, 'Hull', n=24, cap0=None)
    # 細いアンテナの列
    for k, (x, y, h) in enumerate([(6, -205, 26), (-6, -205, 22), (0, -222, 30), (10, -180, 14), (-10, -180, 14)]):
        cone(t, (x, y, 136), (x, y, 136 + h), 0.6, 0.2, 'Metal', n=6)
    bf.box(t, (0, -195, 143), (2, 2, 1), 'NavRed')


def wing_details(w):
    """翼の赤い縁取りの帯、付け根の覆い、翼端の筒"""
    def tip_pod(root, dihedral, s, y0, y1, r, sx):
        d = math.radians(dihedral)
        x = root[0] + s * math.cos(d)
        z = root[2] + s * math.sin(d)
        pod(w, y0, y1, (sx * x, z), r, 'Hull', nose=0.3, tail=0.2, tip_mat='Red')
    for sx in (1, -1):
        # 3 の大翼の付け根の覆いと、翼の上の細いフェンス
        bf.box(w, (sx * 92, -190, 28), (14, 170, 12), 'Hull2')
        for s_ in (40, 75):
            d = math.radians(26)
            x = 88 + s_ * math.cos(d)
            z = 26 + s_ * math.sin(d)
            bf.box(w, (sx * x, -250 - s_ * 1.5, z + 3), (1.2, 70 - s_ * 0.4, 4), 'Hull2', rot_y=-sx * d)
        tip_pod((88, 0, 26), 26, 106, -420, -330, 3.5, sx)
        # 4 の翼の付け根
        bf.box(w, (sx * 92, -390, 23), (12, 130, 10), 'Hull2')
        # 5 の下の安定翼の付け根
        bf.box(w, (sx * 72, -380, -44), (12, 120, 10), 'Hull2')
        # 羽根形装甲の上の段差と、赤い細帯
        o = [(72, 330), (90, 300), (114, 60), (104, 56), (70, 200)]
        slab(w, ccw([(sx * x, y) for x, y in o]), lambda x, y: 2 + min(380 - y, 300) * 0.075 - (abs(x) - 60) * 0.1,
             lambda x, y: 4.5 + min(380 - y, 300) * 0.075 - (abs(x) - 60) * 0.1, 'Hull2')


def greebles(part):
    """姿勢制御の噴射口の箱、センサーの玉、小さな点検口、航行灯"""
    rcs = [(60, 360, 0), (66, 250, 10), (100, -500, 40), (100, -500, -30), (60, -120, 50)]
    for x, y, z in rcs:
        for sx in (1, -1):
            bf.box(part, (sx * x, y, z), (6, 8, 6), 'Mech')
            for dz in (-1.5, 1.5):
                cone(part, (sx * (x + 3), y + dz, z), (sx * (x + 4.5), y + dz, z), 0.8, 1.1, 'Dark', n=8)
    # 背骨のセンサーの玉
    for y in (-20, 30, 80):
        cone(part, (0, y, 52 - max(0, y + 60) * 0.1), (0, y, 55 - max(0, y + 60) * 0.1), 3.5, 3.0, 'Mech', n=16)
        bf.box(part, (0, y, 55.5 - max(0, y + 60) * 0.1), (2, 2, 1), 'Blue')
    # 航行灯（左舷 赤、右舷 緑）
    for sx, lamp in ((-1, 'NavRed'), (1, 'NavGreen')):
        bf.box(part, (sx * 69, 230, 12), (2, 4, 2), lamp)
        bf.box(part, (sx * 131, -400, 36), (2, 4, 2), lamp)
    # 船底の発艦口の扉（少し浮いた板と、ふちの誘導灯）
    for sx in (1, -1):
        cx = sx * 38
        for k, y in enumerate(np.arange(-120, 300, 70)):
            sc = prong_lower(sx).at_sec(y)
            zb = sc[2] - sc[7]
            bf.box(part, (cx, y, zb - 0.6), (sc[5] * 1.4, 50, 1.5), 'Hull2')
            for dx in (-1, 1):
                bf.box(part, (cx + dx * sc[5] * 0.75, y, zb - 1), (1, 46, 0.8), 'Window')


def build_stage2(P):
    hull, eng = P['Hull'], P['Engine']
    for sx in (1, -1):
        prong_armor(hull, sx)
        pod_details(hull, sx)
    launch_deck(hull)
    aft_details(hull, eng)
    engine_details(eng)
    tower_details(P['Tower'])
    wing_details(P['Wings'])
    greebles(hull)


# ---- Blender -----------------------------------------------------------------------


PREVIEW_COLORS = {
    'Hull': '#b8bbc9', 'Hull2': '#a3a7b7', 'Red': '#9a1d2b', 'Dark': '#262a38', 'Mech': '#3e4456', 'Metal': '#7f8594',
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


def bevel(obj, width):
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bm.to_mesh(obj.data)
    bm.free()
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
    sun.data.energy = 3.0
    sun.data.angle = 0.02
    sun.rotation_euler = (0.95, 0.0, 0.9)
    scene.collection.objects.link(sun)
    fill = bpy.data.objects.new('fill', bpy.data.lights.new('fill', 'SUN'))
    fill.data.energy = 0.6
    fill.rotation_euler = (1.9, 0.0, -2.4)
    scene.collection.objects.link(fill)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    shots = {
        'hero': ((1.15, 1.25, 1.25), (0.0, -0.03, -0.03), 'PERSP', 50),
        'top': ((0, -0.01, 3), (0, -0.01, 0), 'ORTHO', 1.30),
        'side': ((3, -0.01, 0.0), (0, -0.01, 0.0), 'ORTHO', 1.30),
        'front': ((-0.75, 1.45, 0.3), (0, 0.02, 0.0), 'PERSP', 45),
        'rear': ((1.0, -1.35, 0.45), (0, -0.12, 0.0), 'PERSP', 45),
        'tower': ((0.38, 0.1, 0.28), (0, -0.19, 0.09), 'PERSP', 40),
        'stern': ((0, -3, 0.0), (0, 0, 0.0), 'ORTHO', 0.7),
        'under': ((1.15, 0.85, -0.7), (0, -0.04, 0.0), 'PERSP', 50),
    }
    for name in os.environ.get('VIEWS', 'hero,top,side,front,rear,tower').split(','):
        pos, target, kind, lens = shots[name]
        cam.location = Vector(pos)
        up = 'Y'
        cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', up).to_euler()
        if name == 'top':
            cam.rotation_euler = (0, 0, -math.pi / 2)
        if name == 'stern':
            cam.rotation_euler = (math.pi / 2, 0, 0)
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
    if STAGE >= 2:
        build_stage2(P)
    objs = []
    for name in PARTS:
        if P[name].faces:
            obj = make_object(name, P[name])
            if STAGE >= 2:
                bevel(obj, 0.6 * S)
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
