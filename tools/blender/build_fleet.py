"""
自機のバリエーション（SV-01 以外の船）を Blender で組み立てて glb に書き出す。

船体は「断面をつないだ筒（ロフト）」が基本。断面は角の丸い四角（超楕円）で、
指数を上げると箱形に、2 にすると円になる。そこに板（翼・放熱板）、円柱、円すい、
窓の列、細かい部品を足していく。

そのあと Blender で
  - 角度で稜線をシャープにして、平らな面と丸い面を描き分け
  - 箱投影で UV を貼る（three.js 側で継ぎ目のない外板の模様を貼るため）
  - 環境遮蔽（AO）を頂点カラーに焼き込み
  - public/models/ship-<id>.glb に書き出し

材質は名前だけを付けておき、色や光り方は three.js 側（src/components/ship/VariantModel.tsx）で決める。
回る部品（光帆の羽根）は別のオブジェクト "Rotor" にして、three.js で回す。

座標は Blender のまま（Z が上、前方が +Y）。glTF に書き出すと three.js の座標（Y が上、前方が -Z）になる。
全長はおよそ 1。

実行（Blender の Python モジュール bpy が入った Python 3.13 で）:
  .venv/bin/python tools/blender/build_fleet.py            # 全部
  SHIPS=heron .venv/bin/python tools/blender/build_fleet.py # 1 隻だけ
"""

import math
import os
import random
import sys
import time

import bpy  # noqa: F401  （bmesh より先に読み込む）
import bmesh
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_DIR = os.path.join(ROOT, 'public', 'models')

MATERIALS = [
    'Hull', 'Hull2', 'Accent', 'Dark', 'Metal', 'Gold', 'Window', 'Glow', 'Blue', 'Bay', 'Sail', 'Radiator',
    'CargoA', 'CargoB', 'CargoC', 'CargoD',
]


class Part:
    """頂点・面・面ごとの材質をためておく入れ物。最後に 1 つのメッシュにする"""

    def __init__(self):
        self.verts = []
        self.faces = []
        self.mats = []

    def add(self, verts, faces, mat):
        base = len(self.verts)
        self.verts.extend([tuple(map(float, v)) for v in verts])
        mats = mat if isinstance(mat, list) else [mat] * len(faces)
        for f, m in zip(faces, mats):
            self.faces.append([base + i for i in f])
            self.mats.append(m)


# ---- 形の部品 -----------------------------------------------------------------


def superellipse(n, hw, hh, p):
    """角の丸い四角の断面（反時計回り）。p=2 で楕円、大きいほど箱形"""
    out = []
    for i in range(n):
        a = 2 * math.pi * i / n
        c, s = math.cos(a), math.sin(a)
        x = hw * math.copysign(abs(c) ** (2 / p), c)
        z = hh * math.copysign(abs(s) ** (2 / p), s)
        out.append((x, z))
    return out


class Loft:
    """
    Y 軸（前後）に沿って断面をつないだ筒。
    sections: (y, cx, cz, 半幅, 半高, 指数 p, その区間の材質) のリスト（後ろ → 前）。
    同じ y を続けると、段差（平らな輪）ができる。
    """

    def __init__(self, sections, n=48, cap_back='Hull', cap_front='Hull'):
        self.sections = sections
        self.n = n
        self.cap_back = cap_back
        self.cap_front = cap_front

    def build(self, part, mirror_x=False, transform=None):
        n = self.n
        verts = []
        for y, cx, cz, hw, hh, p, _ in self.sections:
            for x, z in superellipse(n, hw, hh, p):
                verts.append((cx + x, y, cz + z))
        faces, mats = [], []
        for k in range(len(self.sections) - 1):
            mat = self.sections[k][6]
            for i in range(n):
                a, b = k * n + i, k * n + (i + 1) % n
                faces.append([a, a + n, b + n, b])
                mats.append(mat)
        # 端のふた（扇形）
        last = len(self.sections) - 1
        if self.cap_back:
            c = len(verts)
            y, cx, cz = self.sections[0][:3]
            verts.append((cx, y, cz))
            for i in range(n):
                faces.append([c, i, (i + 1) % n])
                mats.append(self.cap_back)
        if self.cap_front:
            c = len(verts)
            y, cx, cz = self.sections[last][:3]
            verts.append((cx, y, cz))
            for i in range(n):
                faces.append([c, last * n + (i + 1) % n, last * n + i])
                mats.append(self.cap_front)
        if transform:
            verts = [transform(v) for v in verts]
        part.add(verts, faces, mats)
        if mirror_x:
            mv = [(-x, y, z) for x, y, z in verts]
            part.add(mv, [list(reversed(f)) for f in faces], mats)

    def at(self, y):
        """y での断面の (cx, cz, 半幅, 半高, p)（前後の断面の線形補間）"""
        s = self.sections
        for k in range(len(s) - 1):
            if s[k][0] <= y <= s[k + 1][0] and s[k + 1][0] > s[k][0]:
                t = (y - s[k][0]) / (s[k + 1][0] - s[k][0])
                return tuple(s[k][i] + (s[k + 1][i] - s[k][i]) * t for i in range(1, 6))
        return s[-1][1:6] if y > s[-1][0] else s[0][1:6]

    def surface(self, y, angle):
        """表面の点と、だいたいの外向き法線（断面内）"""
        cx, cz, hw, hh, p = self.at(y)
        c, s = math.cos(angle), math.sin(angle)
        x = hw * math.copysign(abs(c) ** (2 / p), c)
        z = hh * math.copysign(abs(s) ** (2 / p), s)
        # 超楕円の法線（陰関数の勾配）
        nx = math.copysign(abs(x / hw) ** (p - 1), x) / hw if hw else 0
        nz = math.copysign(abs(z / hh) ** (p - 1), z) / hh if hh else 0
        ln = math.hypot(nx, nz) or 1
        return (cx + x, y, cz + z), (nx / ln, 0, nz / ln)


ROUND = 7  # 角の丸めの分割数


class FacetLoft(Loft):
    """
    面取りした多角形（上面・肩・腰・底）の断面をつないだ筒。軍艦のような平らな面と稜線が出る。
    sections: (y, cx, cz, 上面の半幅, 胴の半幅, 底の半幅, 上の高さ, 下の高さ, 材質)。
    胴のいちばん広いところの高さは mid（上の高さに対する割合）。
    """

    def __init__(self, sections, chamfer=0.18, mid=0.15, seg=3, cap_back='Hull', cap_front='Hull'):
        self.sections = sections
        self.chamfer = chamfer
        self.mid = mid
        self.seg = seg
        self.cap_back = cap_back
        self.cap_front = cap_front
        self.n = len(self.ring(sections[0]))

    def ring(self, sec):
        _, _, _, wt, wm, wb, ht, hb = sec[:8]
        c = self.chamfer
        half = [(0, ht), (wt, ht), (wm, ht * self.mid), (wb, -hb), (0, -hb)]
        # 角は 2 次ベジェで丸め、まっすぐな辺は細かく割る（頂点ごとの AO と、なめらかな稜線のため）
        dense = [half[0]]
        prev_end = half[0]
        for i in (1, 2, 3):
            a, b, nxt = half[i - 1], half[i], half[i + 1]
            p_in = (b[0] + (a[0] - b[0]) * c, b[1] + (a[1] - b[1]) * c)
            p_out = (b[0] + (nxt[0] - b[0]) * c, b[1] + (nxt[1] - b[1]) * c)
            for k in range(1, self.seg + 1):
                t = k / self.seg
                dense.append((prev_end[0] + (p_in[0] - prev_end[0]) * t, prev_end[1] + (p_in[1] - prev_end[1]) * t))
            for k in range(1, ROUND + 1):
                t = k / ROUND
                u = 1 - t
                dense.append((u * u * p_in[0] + 2 * u * t * b[0] + t * t * p_out[0], u * u * p_in[1] + 2 * u * t * b[1] + t * t * p_out[1]))
            prev_end = p_out
        for k in range(1, self.seg + 1):
            t = k / self.seg
            dense.append((prev_end[0] + (half[4][0] - prev_end[0]) * t, prev_end[1] + (half[4][1] - prev_end[1]) * t))
        # 右半分（上 → 下）と左半分（下 → 上）。反時計回りにそろえる
        left = [(-x, z) for x, z in dense[1:-1]]
        return list(reversed(dense)) + left

    def build(self, part, mirror_x=False, transform=None):
        n = self.n
        verts = []
        for sec in self.sections:
            y, cx, cz = sec[:3]
            for x, z in self.ring(sec):
                verts.append((cx + x, y, cz + z))
        faces, mats = [], []
        for k in range(len(self.sections) - 1):
            mat = self.sections[k][8]
            for i in range(n):
                a, b = k * n + i, k * n + (i + 1) % n
                faces.append([a, a + n, b + n, b])
                mats.append(mat)
        last = len(self.sections) - 1
        for cap, k, flip in ((self.cap_back, 0, True), (self.cap_front, last, False)):
            if not cap:
                continue
            ci = len(verts)
            y, cx, cz = self.sections[k][:3]
            verts.append((cx, y, cz))
            for i in range(n):
                a, b = k * n + i, k * n + (i + 1) % n
                faces.append([ci, a, b] if flip else [ci, b, a])
                mats.append(cap)
        if transform:
            verts = [transform(v) for v in verts]
        part.add(verts, faces, mats)
        if mirror_x:
            part.add([(-x, y, z) for x, y, z in verts], [list(reversed(f)) for f in faces], mats)

    def at_sec(self, y):
        s = self.sections
        for k in range(len(s) - 1):
            if s[k][0] <= y <= s[k + 1][0] and s[k + 1][0] > s[k][0]:
                t = (y - s[k][0]) / (s[k + 1][0] - s[k][0])
                return (y, *[s[k][i] + (s[k + 1][i] - s[k][i]) * t for i in range(1, 8)])
        return s[-1][:8] if y > s[-1][0] else s[0][:8]

    def surface(self, y, angle):
        sec = self.at_sec(y)
        cx, cz = sec[1], sec[2]
        ring = self.ring(sec)
        d = (math.cos(angle), math.sin(angle))
        best = None
        for i in range(len(ring)):
            a, b = ring[i], ring[(i + 1) % len(ring)]
            ex, ez = b[0] - a[0], b[1] - a[1]
            den = d[0] * ez - d[1] * ex
            if abs(den) < 1e-12:
                continue
            t = (a[0] * ez - a[1] * ex) / den
            u = (a[0] * d[1] - a[1] * d[0]) / den
            if t > 0 and -1e-9 <= u <= 1 + 1e-9 and (best is None or t < best[0]):
                ln = math.hypot(ex, ez)
                best = (t, (ez / ln, -ex / ln))
        t, nrm = best
        # 反時計回りの辺の右手側が外。外向きにそろえる
        if nrm[0] * d[0] + nrm[1] * d[1] < 0:
            nrm = (-nrm[0], -nrm[1])
        return (cx + d[0] * t, y, cz + d[1] * t), (nrm[0], 0, nrm[1])


def strip(part, loft, angle, y0, y1, width, mat, lift=0.0008, mirror_x=False):
    """ロフトの表面に沿った細い帯（甲板の線・カタパルト・注意帯）"""
    steps = max(2, int((y1 - y0) / 0.01))
    verts, faces = [], []
    for i in range(steps + 1):
        y = y0 + (y1 - y0) * i / steps
        p, nrm = loft.surface(y, angle)
        tx, tz = -nrm[2], nrm[0]
        c = (p[0] + nrm[0] * lift, y, p[2] + nrm[2] * lift)
        verts.append((c[0] - tx * width / 2, y, c[2] - tz * width / 2))
        verts.append((c[0] + tx * width / 2, y, c[2] + tz * width / 2))
    for i in range(steps):
        a = 2 * i
        faces.append([a, a + 2, a + 3, a + 1])
    part.add(verts, faces, mat)
    if mirror_x:
        part.add([(-x, y, z) for x, y, z in verts], [list(reversed(f)) for f in faces], mat)


def box(part, center, size, mat, rot_z=0.0, rot_x=0.0, rot_y=0.0):
    cx, cy, cz = center
    sx, sy, sz = [s / 2 for s in size]
    corners = [(x, y, z) for x in (-sx, sx) for y in (-sy, sy) for z in (-sz, sz)]
    verts = [_rotate(v, rot_x, rot_y, rot_z) for v in corners]
    verts = [(cx + x, cy + y, cz + z) for x, y, z in verts]
    # 0:(-,-,-) 1:(-,-,+) 2:(-,+,-) 3:(-,+,+) 4:(+,-,-) 5:(+,-,+) 6:(+,+,-) 7:(+,+,+)
    faces = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]
    part.add(verts, faces, mat)


def _rotate(v, rx, ry, rz):
    x, y, z = v
    if rx:
        y, z = y * math.cos(rx) - z * math.sin(rx), y * math.sin(rx) + z * math.cos(rx)
    if ry:
        x, z = x * math.cos(ry) + z * math.sin(ry), -x * math.sin(ry) + z * math.cos(ry)
    if rz:
        x, y = x * math.cos(rz) - y * math.sin(rz), x * math.sin(rz) + y * math.cos(rz)
    return (x, y, z)


def plate(part, outline, thickness, mat, edge_mat=None, axis='z'):
    """多角形の板。outline は板の面内の点（axis='z' なら XY 平面、'x' なら YZ 平面）"""
    n = len(outline)
    h = thickness / 2

    def lift(pt, d):
        a, b, c = pt if len(pt) == 3 else (*pt, 0.0)
        if axis == 'z':
            return (a, b, c + d)
        return (c + d, a, b)  # axis == 'x'：outline は (y, z)

    verts = [lift(pt, -h) for pt in outline] + [lift(pt, h) for pt in outline]
    faces = [list(range(n - 1, -1, -1)), list(range(n, 2 * n))]
    mats = [mat, mat]
    for i in range(n):
        j = (i + 1) % n
        faces.append([i, j, n + j, n + i])
        mats.append(edge_mat or mat)
    part.add(verts, faces, mats)


def cylinder(part, a, b, r0, r1, mat, n=32, cap0='same', cap1='same', axis_up=None, inward=False):
    """a から b へ向かう円すい台（r0 → r1）。inward は内側から見る面（噴射口の内壁など）"""
    a, b = np.array(a, float), np.array(b, float)
    d = b - a
    d /= np.linalg.norm(d)
    up = np.array(axis_up or ((0, 0, 1) if abs(d[2]) < 0.9 else (1, 0, 0)), float)
    u = np.cross(d, up)
    u /= np.linalg.norm(u)
    w = np.cross(u, d)
    verts = []
    for c, r in ((a, r0), (b, r1)):
        for i in range(n):
            t = 2 * math.pi * i / n
            verts.append(c + r * (math.cos(t) * u + math.sin(t) * w))
    faces, mats = [], []
    for i in range(n):
        j = (i + 1) % n
        faces.append([n + i, n + j, j, i] if inward else [i, n + i, n + j, j])
        mats.append(mat)
    for cap, c, ring in ((cap0, a, 0), (cap1, b, n)):
        if cap is None:
            continue
        ci = len(verts)
        verts.append(c)
        for i in range(n):
            j = (i + 1) % n
            faces.append([ci, ring + i, ring + j] if ring == 0 else [ci, ring + j, ring + i])
            mats.append(mat if cap == 'same' else cap)
    part.add(verts, faces, mats)


def nozzle(part, back, front, r_throat, r_exit, mat='Metal', glow='Glow', n=32):
    """ロケットの噴射口：外側のベル、内側のベル（暗い）、奥の光る円板"""
    back, front = np.array(back, float), np.array(front, float)
    cylinder(part, front, back, r_throat, r_exit, mat, n=n, cap0=None, cap1=None)
    inner_back = back + (front - back) * 0.02
    cylinder(part, inner_back, front, r_exit * 0.93, r_throat * 0.85, 'Dark', n=n, cap0=None, cap1=None, inward=True)
    disc = back + (front - back) * 0.55
    cylinder(part, disc, disc + (front - back) * 0.01, r_throat * 1.25, r_throat * 1.25, glow, n=n)


def window_row(part, loft, angle, y0, y1, spacing, size=(0.006, 0.0035), skip=0.0, rng=None, mirror_x=False):
    """ロフトの表面に、少し浮かせて光る窓を並べる（angle は断面内の向き。0 が右舷）"""
    rng = rng or random.Random(1)
    y = y0
    w, h = size
    while y <= y1:
        if rng.random() >= skip:
            p, nrm = loft.surface(y, angle)
            nx, _, nz = nrm
            # 窓の面：法線 (nx, 0, nz)、横方向は Y、縦方向は法線と Y の外積
            tx, tz = -nz, nx
            c = (p[0] + nx * 0.0006, p[1], p[2] + nz * 0.0006)
            verts = []
            for du, dv in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)):
                verts.append((c[0] + tx * dv, c[1] + du, c[2] + tz * dv))
            part.add(verts, [[0, 1, 2, 3]], 'Window')
            if mirror_x:
                part.add([(-x, yy, z) for x, yy, z in verts], [[3, 2, 1, 0]], 'Window')
        y += spacing


# ---- 1. 白い探査母艦（WHITE HERON） ----------------------------------------------------
# 中央の船体の左右から、前へ長く伸びた 2 本の「脚」（小型艇の格納庫と発進甲板）が出ている、
# 白い母艦。艦橋は船体の背中に高く立ち、後ろには大きな主機が 2 基。武装はない。


def heron():
    hull, rotor = Part(), None
    rng = random.Random(7)
    H, H2, A, D, M = 'Hull', 'Hull2', 'Accent', 'Dark', 'Metal'

    # 中央の船体（後ろ → 前）。面取りした断面で、前はくさび形にすぼまって脚のあいだに突き出す
    main = FacetLoft([
        (-0.42, 0, 0.000, 0.060, 0.090, 0.070, 0.060, 0.045, H2),
        (-0.40, 0, 0.000, 0.072, 0.108, 0.085, 0.075, 0.055, H),
        (-0.20, 0, 0.004, 0.080, 0.118, 0.092, 0.086, 0.060, H),
        (0.02, 0, 0.004, 0.074, 0.110, 0.088, 0.082, 0.060, H),
        (0.18, 0, -0.006, 0.050, 0.078, 0.064, 0.060, 0.052, A),
        (0.195, 0, -0.007, 0.048, 0.075, 0.062, 0.058, 0.051, H),
        (0.30, 0, -0.020, 0.022, 0.040, 0.034, 0.032, 0.034, H),
        (0.345, 0, -0.026, 0.006, 0.012, 0.010, 0.010, 0.012, H),
    ], chamfer=0.4, seg=4)
    main.build(hull)

    # 胴の下を左右へ広げて脚とつなぐ竜骨甲板と、背中の肩のふくらみ
    keel = FacetLoft([
        (-0.33, 0, -0.050, 0.15, 0.17, 0.14, 0.020, 0.024, H2),
        (-0.30, 0, -0.050, 0.19, 0.21, 0.18, 0.024, 0.028, H2),
        (0.06, 0, -0.050, 0.19, 0.21, 0.18, 0.024, 0.028, H2),
        (0.16, 0, -0.052, 0.10, 0.12, 0.10, 0.018, 0.022, H2),
    ], chamfer=0.25, seg=3)
    keel.build(hull)
    shoulder = FacetLoft([
        (-0.33, 0, 0.012, 0.12, 0.17, 0.17, 0.020, 0.03, H),
        (-0.28, 0, 0.012, 0.16, 0.20, 0.20, 0.042, 0.03, H),
        (-0.10, 0, 0.012, 0.16, 0.20, 0.20, 0.042, 0.03, H),
        (0.02, 0, 0.008, 0.12, 0.17, 0.17, 0.026, 0.03, H),
    ], chamfer=0.3, seg=3)
    shoulder.build(hull)

    # 前へ伸びる 2 本の脚（格納庫と発進甲板）。先端は開いた発進口
    PX, PZ = 0.212, -0.034
    pod = FacetLoft([
        (-0.33, PX, PZ, 0.030, 0.042, 0.036, 0.040, 0.040, H2),
        (-0.30, PX, PZ, 0.044, 0.064, 0.054, 0.058, 0.056, H),
        (0.28, PX, PZ - 0.004, 0.046, 0.068, 0.056, 0.058, 0.054, H),
        (0.30, PX, PZ - 0.004, 0.046, 0.068, 0.056, 0.058, 0.054, A),
        (0.33, PX, PZ - 0.005, 0.046, 0.068, 0.056, 0.057, 0.053, H),
        (0.47, PX, PZ - 0.010, 0.044, 0.064, 0.052, 0.052, 0.046, H),
        # 発進口のふちから奥へ
        (0.47, PX, PZ - 0.010, 0.036, 0.052, 0.042, 0.038, 0.032, D),
        (0.40, PX, PZ - 0.010, 0.036, 0.052, 0.042, 0.038, 0.032, D),
    ], chamfer=0.42, seg=4, cap_front='Bay')
    pod.build(hull, mirror_x=True)
    # 発進口の上のひさし（赤）と、甲板のカタパルトの線
    for sx in (-1, 1):
        plate(hull, [(sx * (PX - 0.05), 0.44, 0.0), (sx * (PX + 0.05), 0.44, 0.0), (sx * (PX + 0.045), 0.505, 0.0), (sx * (PX - 0.045), 0.505, 0.0)][::sx], 0.0035, A, edge_mat=H)
    # ひさしを脚の上面の高さへ（直前に足した 8 頂点を持ち上げる）
    for k in range(1, 17):
        x, y, z = hull.verts[-k]
        hull.verts[-k] = (x, y, z + PZ + 0.052 - (y - 0.44) * 0.12)
    podR = FacetLoft([(sec[0], PX, *sec[2:]) for sec in pod.sections], chamfer=0.42, seg=4)
    strip(hull, podR, math.pi / 2, -0.06, 0.465, 0.012, D, mirror_x=True)
    strip(hull, podR, math.pi / 2, -0.06, 0.465, 0.0025, 'Blue', lift=0.0012, mirror_x=True)
    # 脚の外側の下に張り出した張り出し（燃料と資材の区画）
    sponson = FacetLoft([
        (-0.24, PX + 0.05, PZ - 0.022, 0.010, 0.016, 0.012, 0.012, 0.012, H2),
        (-0.20, PX + 0.058, PZ - 0.022, 0.016, 0.026, 0.020, 0.020, 0.020, H),
        (0.20, PX + 0.058, PZ - 0.024, 0.016, 0.026, 0.020, 0.020, 0.020, H),
        (0.27, PX + 0.05, PZ - 0.026, 0.010, 0.016, 0.012, 0.012, 0.012, H2),
    ], chamfer=0.3, seg=2)
    sponson.build(hull, mirror_x=True)

    # 発進口の奥：天井の照明の列と、床の誘導灯
    for sx in (-1, 1):
        for k in range(4):
            box(hull, (sx * PX, 0.408 + k * 0.017, PZ - 0.010 + 0.0372), (0.07, 0.003, 0.0012), 'Window')
        for k in range(7):
            for dx in (-0.016, 0.016):
                box(hull, (sx * PX + dx, 0.405 + k * 0.0095, PZ - 0.010 - 0.0315), (0.0025, 0.003, 0.001), 'Window')
        box(hull, (sx * PX, 0.435, PZ - 0.010 - 0.0318), (0.004, 0.07, 0.0008), 'Accent')
    # 艦橋の塔：背中から立ち上がる台座と、左右に張り出したブリッジ
    tower = FacetLoft([
        (-0.15, 0, 0.088, 0.030, 0.046, 0.052, 0.006, 0.01, H),
        (-0.12, 0, 0.100, 0.026, 0.036, 0.046, 0.034, 0.02, H),
        (0.0, 0, 0.104, 0.022, 0.032, 0.040, 0.036, 0.02, H),
        (0.05, 0, 0.100, 0.014, 0.022, 0.030, 0.012, 0.012, H),
    ], chamfer=0.25, seg=3)
    tower.build(hull)
    BZ = 0.150
    bridge = FacetLoft([
        (-0.075, 0, BZ, 0.030, 0.044, 0.034, 0.008, 0.012, H2),
        (-0.065, 0, BZ, 0.040, 0.054, 0.040, 0.012, 0.014, H),
        (0.01, 0, BZ, 0.040, 0.060, 0.044, 0.012, 0.014, H),
        (0.035, 0, BZ - 0.002, 0.026, 0.050, 0.036, 0.007, 0.012, H),
    ], chamfer=0.25, mid=0.0, seg=3)
    bridge.build(hull)
    # 左右に張り出したブリッジウイング（見張り台）
    for sx in (-1, 1):
        box(hull, (sx * 0.072, 0.0, BZ - 0.004), (0.03, 0.022, 0.012), H)
        box(hull, (sx * 0.085, 0.0105, BZ - 0.002), (0.004, 0.0012, 0.006), 'Window')
    # ブリッジの窓：前と斜め前を巡る帯
    strip(hull, bridge, 0.0, -0.06, 0.03, 0.0045, 'Window', lift=0.0006, mirror_x=True)
    box(hull, (0, 0.023, BZ + 0.002), (0.068, 0.0016, 0.006), 'Window', rot_x=0.75)
    # 塔の上：観測用のアンテナとセンサーの皿、標識灯の台
    cylinder(hull, (0, -0.02, BZ + 0.012), (0, -0.02, BZ + 0.07), 0.0022, 0.0012, M, n=12)
    cylinder(hull, (0, -0.04, BZ + 0.012), (0, -0.04, BZ + 0.035), 0.0015, 0.001, M, n=10)
    cylinder(hull, (0.024, -0.035, BZ + 0.012), (0.024, -0.035, BZ + 0.02), 0.003, 0.003, M, n=10)
    cylinder(hull, (0.024, -0.035, BZ + 0.024), (0.024, -0.033, BZ + 0.03), 0.013, 0.003, M, n=24)
    box(hull, (0, -0.02, BZ + 0.05), (0.034, 0.002, 0.002), M)
    box(hull, (0, -0.02, BZ + 0.037), (0.022, 0.002, 0.002), M)
    box(hull, (0, -0.02, BZ + 0.013), (0.05, 0.05, 0.004), H2)

    # 主機：船体の後ろの左右に大きな機関ブロック（面取りした箱）と、真ん中の補助エンジン
    EX = 0.118
    eng = FacetLoft([
        (-0.52, EX, 0.004, 0.040, 0.060, 0.052, 0.054, 0.054, M),
        (-0.505, EX, 0.004, 0.046, 0.066, 0.058, 0.060, 0.060, H2),
        (-0.48, EX, 0.004, 0.048, 0.068, 0.060, 0.064, 0.064, H),
        (-0.36, EX, 0.004, 0.048, 0.068, 0.060, 0.064, 0.064, A),
        (-0.345, EX, 0.004, 0.048, 0.068, 0.060, 0.064, 0.064, H),
        (-0.22, EX, 0.004, 0.048, 0.068, 0.060, 0.064, 0.064, H),
        (-0.15, EX, 0.004, 0.020, 0.030, 0.026, 0.030, 0.030, H),
    ], chamfer=0.3, seg=3, cap_back=D)
    eng.build(hull, mirror_x=True)
    for sx in (-1, 1):
        for dz in (-0.026, 0.028):
            nozzle(hull, (sx * EX, -0.555, 0.004 + dz), (sx * EX, -0.52, 0.004 + dz), 0.018, 0.027)
    for sz in (-0.022, 0.028):
        nozzle(hull, (0, -0.445, sz), (0, -0.418, sz), 0.014, 0.022, n=24)
    for sx in (-1, 1):
        nozzle(hull, (sx * PX, -0.355, PZ), (sx * PX, -0.332, PZ), 0.016, 0.024, n=24)

    # 船首の下のセンサードーム（青く光る）と、機関ブロックの前の吸気口の光
    cylinder(hull, (0, 0.20, -0.058), (0, 0.20, -0.064), 0.022, 0.016, 'Dark', n=32, cap0=None)
    cylinder(hull, (0, 0.20, -0.0625), (0, 0.20, -0.0645), 0.016, 0.016, 'Blue', n=32)
    for sx in (-1, 1):
        for dz in (-0.03, 0.0, 0.03):
            box(hull, (sx * (EX + 0.0695), -0.30, 0.004 + dz), (0.002, 0.08, 0.006), 'Blue')
    # 横の後退翼（機関ブロックから外へ）と、背中の 2 枚の尾翼（外へ傾ける）
    for sx in (-1, 1):
        wing = [(0.0, -0.24), (0.0, -0.42), (0.26, -0.50), (0.27, -0.47), (0.08, -0.29)]
        verts = [(sx * (EX + 0.06 + x), y, 0.0 - x * 0.12) for x, y in wing]
        w = Part()
        plate(w, verts if sx > 0 else verts[::-1], 0.007, H, edge_mat=A)
        hull.add(w.verts, w.faces, w.mats)
        fin = [(-0.30, 0.0), (-0.44, 0.0), (-0.50, 0.12), (-0.47, 0.125), (-0.38, 0.03)]
        f = Part()
        plate(f, fin, 0.006, H, edge_mat=A, axis='x')
        lean = 0.35 * sx
        f.verts = [(sx * 0.07 + x * math.cos(lean) + z * math.sin(lean), y, 0.07 - x * math.sin(lean) + z * math.cos(lean)) for x, y, z in f.verts]
        if sx < 0:
            f.faces = [list(reversed(fc)) for fc in f.faces]
        hull.add(f.verts, f.faces, f.mats)

    # 船体の線：甲板の継ぎ目、赤い帯、注意線
    strip(hull, main, math.pi / 2, -0.38, 0.29, 0.004, H2)
    strip(hull, main, 0.18, -0.38, 0.17, 0.003, A, mirror_x=False)
    strip(hull, main, math.pi - 0.18, -0.38, 0.17, 0.003, A)

    # 窓の列：中央の船体の左右、脚の外側と内側
    for ang, skip in ((0.12, 0.2), (-0.05, 0.3), (-0.22, 0.45)):
        window_row(hull, main, ang, -0.36, 0.16, 0.0085, skip=skip, rng=rng, mirror_x=True)
    for ang, skip in ((0.25, 0.25), (0.1, 0.3)):
        window_row(hull, podR, ang, -0.26, 0.44, 0.0085, skip=skip, rng=rng, mirror_x=True)

    # 外板の部品：背中の点検口と排熱口を列に並べる（でたらめに散らさない）
    for y in np.arange(-0.36, 0.0, 0.035):
        for x in (-0.05, 0.05):
            box(hull, (x, y, 0.091 + 0.004 * (y > -0.2)), (0.026, 0.016, 0.003), H2)
            for k in range(4):
                box(hull, (x, y - 0.006 + k * 0.004, 0.0935 + 0.004 * (y > -0.2)), (0.02, 0.0014, 0.0012), D)
    for y in np.arange(-0.24, 0.42, 0.06):
        for sx in (-1, 1):
            box(hull, (sx * (PX + 0.022), y, PZ + 0.0585), (0.014, 0.03, 0.002), H2)
            box(hull, (sx * (PX - 0.022), y + 0.02, PZ + 0.0585), (0.01, 0.012, 0.002), M)
    return hull, rotor


# ---- 2. 光帆の連絡船（SORAKAZE） ----------------------------------------------------
# 太陽の光の圧力で進む船。細い竜骨の前に小さな居住区、まんなかの軸から 6 枚の細長い帆（羽根）が
# 放射状に伸び、ゆっくり回って遠心力で帆を張る（NASA が研究した「ヘリオジャイロ」という形）。


def sorakaze():
    hull, rotor = Part(), Part()
    rng = random.Random(3)
    H, H2, A = 'Hull', 'Hull2', 'Accent'

    capsule = Loft([
        (0.16, 0, 0, 0.030, 0.030, 2, H2),
        (0.18, 0, 0, 0.042, 0.042, 2, H),
        (0.30, 0, 0, 0.046, 0.046, 2, A),
        (0.31, 0, 0, 0.046, 0.046, 2, H),
        (0.40, 0, 0, 0.040, 0.040, 2, H),
        (0.46, 0, 0, 0.024, 0.024, 2, H),
        (0.49, 0, 0, 0.006, 0.006, 2, H),
    ], n=48)
    capsule.build(hull)
    window_row(hull, capsule, 0.0, 0.33, 0.43, 0.012, size=(0.007, 0.004), mirror_x=True)
    window_row(hull, capsule, 0.5 * math.pi, 0.34, 0.42, 0.014, size=(0.007, 0.004))
    window_row(hull, capsule, 0.25 * math.pi, 0.2, 0.29, 0.011, size=(0.005, 0.003), mirror_x=True)
    # 前の窓（操縦席）
    for sx in (-1, 1):
        box(hull, (sx * 0.012, 0.455, 0.013), (0.012, 0.004, 0.006), 'Window', rot_x=-0.9)

    # 竜骨：細い三角トラス（3 本の縦材と斜めの部材）
    for k in range(3):
        a = math.pi / 2 + k * 2 * math.pi / 3
        x, z = 0.018 * math.cos(a), 0.018 * math.sin(a)
        cylinder(hull, (x, -0.44, z), (x, 0.17, z), 0.0025, 0.0025, 'Metal', n=10)
    y = -0.44
    while y < 0.16:
        for k in range(3):
            a0 = math.pi / 2 + k * 2 * math.pi / 3
            a1 = a0 + 2 * math.pi / 3
            p0 = (0.018 * math.cos(a0), y, 0.018 * math.sin(a0))
            p1 = (0.018 * math.cos(a1), y + 0.04, 0.018 * math.sin(a1))
            cylinder(hull, p0, p1, 0.0012, 0.0012, 'Metal', n=6, cap0=None, cap1=None)
        y += 0.04

    # 帆の軸のハブ（まわりに巻き取り装置）
    cylinder(hull, (0, -0.10, 0), (0, 0.0, 0), 0.05, 0.05, H2, n=48)
    cylinder(hull, (0, -0.105, 0), (0, -0.10, 0), 0.044, 0.05, 'Gold', n=48)
    cylinder(hull, (0, 0.0, 0), (0, 0.005, 0), 0.05, 0.044, 'Gold', n=48)
    for k in range(6):
        a = k * math.pi / 3
        box(hull, (0.052 * math.cos(a), -0.05, 0.052 * math.sin(a)), (0.012, 0.07, 0.012), 'Metal', rot_y=-a)

    # 電源と放熱板（後ろ寄り）
    for sx in (-1, 1):
        plate(hull, [(sx * 0.03, -0.22, 0), (sx * 0.16, -0.22, 0), (sx * 0.16, -0.32, 0), (sx * 0.03, -0.32, 0)], 0.003, 'Radiator', edge_mat='Metal')
    cylinder(hull, (0, -0.34, 0), (0, -0.40, 0), 0.026, 0.026, H, n=32)
    # 姿勢制御と微調整用のイオンエンジン（青く光る）
    for sx, sz in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        nozzle(hull, (sx * 0.014, -0.425, sz * 0.014), (sx * 0.014, -0.405, sz * 0.014), 0.007, 0.011, n=16)

    # 帆の羽根 6 枚（回転する部品）。根元から先へ、少しずつねじれて、先端に重り
    BLADE_IN, BLADE_OUT, WIDTH = 0.06, 0.66, 0.062
    for k in range(6):
        a = k * math.pi / 3
        ca, sa = math.cos(a), math.sin(a)
        steps = 24
        verts, faces = [], []
        for i in range(steps + 1):
            t = i / steps
            r = BLADE_IN + (BLADE_OUT - BLADE_IN) * t
            twist = 0.05 * t
            half = WIDTH / 2
            for s in (-1, 1):
                along = s * half * math.cos(twist)
                tilt = s * half * math.sin(twist)
                # 羽根の幅は船の前後方向（Y）に取る
                verts.append((r * ca - tilt * sa, -0.05 + along, r * sa + tilt * ca))
        for i in range(steps):
            a0 = 2 * i
            faces.append([a0, a0 + 1, a0 + 3, a0 + 2])
        rotor.add(verts, faces, 'Sail')
        # 先端の重り（遠心力で帆を張る）
        cylinder(rotor, (BLADE_OUT * ca, -0.08, BLADE_OUT * sa), (BLADE_OUT * ca, -0.02, BLADE_OUT * sa), 0.005, 0.005, A, n=12)
        # 帆の縁の補強ワイヤー
        for s in (-1, 1):
            p0 = (BLADE_IN * ca, -0.05 + s * WIDTH / 2, BLADE_IN * sa)
            p1 = (BLADE_OUT * ca, -0.05 + s * WIDTH / 2, BLADE_OUT * sa)
            cylinder(rotor, p0, p1, 0.0008, 0.0008, 'Metal', n=6, cap0=None, cap1=None)
    for _ in range(0):
        y = rng.uniform(0.19, 0.4)
        p, nrm = capsule.surface(y, rng.uniform(0, 2 * math.pi))
        box(hull, (p[0] + nrm[0] * 0.001, p[1], p[2] + nrm[2] * 0.001), (0.006, rng.uniform(0.005, 0.015), 0.006), rng.choice([H2, 'Metal']))
    return hull, rotor


# ---- 3. 大型貨物船（HAKOBUNE） ---------------------------------------------------
# 前に操縦区画、まんなかの長い骨組みにコンテナをびっしり抱え、後ろに放熱板と
# 核融合炉、いちばん後ろに磁場で噴射を絞るノズル。


def hakobune():
    hull, rotor = Part(), None
    rng = random.Random(11)
    H, H2, A, D = 'Hull', 'Hull2', 'Accent', 'Dark'

    cab = Loft([
        (0.30, 0, 0, 0.060, 0.050, 4, H2),
        (0.32, 0, 0, 0.074, 0.064, 4.5, H),
        (0.40, 0, 0, 0.076, 0.066, 4.5, A),
        (0.41, 0, 0, 0.076, 0.066, 4.5, H),
        (0.47, 0, 0.004, 0.070, 0.058, 4, H),
        (0.50, 0, 0.004, 0.056, 0.042, 3.4, H),
        (0.51, 0, 0.004, 0.040, 0.028, 3, H),
    ], n=56)
    cab.build(hull)
    for ang, skip in ((0.0, 0.1), (0.3, 0.3), (-0.3, 0.4)):
        window_row(hull, cab, ang, 0.33, 0.46, 0.008, skip=skip, rng=rng, mirror_x=True)
    # 操縦席の窓（前面の上）
    for i in range(5):
        x = (i - 2) * 0.013
        box(hull, (x, 0.503, 0.03), (0.01, 0.003, 0.012), 'Window', rot_x=-0.6)
    # 黄色と黒の注意帯（ドッキング口のまわり）
    for i in range(8):
        box(hull, (0.0, 0.51, -0.03 + i * 0.0075), (0.04, 0.003, 0.0075), A if i % 2 else D)

    # 骨組み（四角いトラス）
    S = 0.02
    corners = [(S, S), (-S, S), (-S, -S), (S, -S)]
    for x, z in corners:
        cylinder(hull, (x, -0.33, z), (x, 0.31, z), 0.0035, 0.0035, 'Metal', n=10)
    y = -0.33
    while y < 0.30:
        for k in range(4):
            x0, z0 = corners[k]
            x1, z1 = corners[(k + 1) % 4]
            cylinder(hull, (x0, y, z0), (x1, y + 0.03, z1), 0.0016, 0.0016, 'Metal', n=6, cap0=None, cap1=None)
        y += 0.03

    # コンテナ：骨組みの上下左右に、2×2 で積んだ箱を前後に 7 列
    cargo = ['CargoA', 'CargoB', 'CargoC', 'CargoD', 'CargoA', 'CargoB', H2]
    CW, CL = 0.034, 0.072
    for row in range(7):
        y = 0.25 - row * 0.078
        for face in range(4):
            a = face * math.pi / 2
            for i in (-1, 1):
                for layer in (0, 1):
                    if rng.random() < 0.06:
                        continue
                    r = 0.022 + CW / 2 + layer * (CW + 0.002) + 0.001
                    lateral = i * (CW / 2 + 0.001)
                    x = r * math.cos(a) - lateral * math.sin(a)
                    z = r * math.sin(a) + lateral * math.cos(a)
                    box(hull, (x, y, z), (CW, CL, CW), rng.choice(cargo), rot_y=-a)
        # 列の境目の留め具（骨組みに巻いた帯）
        cylinder(hull, (0, y - CL / 2 - 0.003, 0), (0, y - CL / 2 + 0.001, 0), 0.03, 0.03, A, n=4)

    # 放熱板：左右と上下へ、斜めに大きく張り出す
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        ca, sa = math.cos(a), math.sin(a)
        pts = []
        for r, y in ((0.03, -0.30), (0.30, -0.26), (0.30, -0.10), (0.03, -0.14)):
            pts.append((r * ca, y, r * sa))
        # 板を (ca, sa) 方向に寝かせる：厚みはその垂直方向
        nx, nz = -sa, ca
        h = 0.0015
        verts = [(x - nx * h, y, z - nz * h) for x, y, z in pts] + [(x + nx * h, y, z + nz * h) for x, y, z in pts]
        faces = [[3, 2, 1, 0], [4, 5, 6, 7]] + [[i, (i + 1) % 4, 4 + (i + 1) % 4, 4 + i] for i in range(4)]
        hull.add(verts, faces, ['Radiator', 'Radiator', 'Metal', 'Metal', 'Metal', 'Metal'])
        # 放熱板の付け根の配管
        cylinder(hull, (0.03 * ca, -0.29, 0.03 * sa), (0.3 * ca, -0.255, 0.3 * sa), 0.0025, 0.0025, 'Gold', n=8)

    # 核融合炉：太い胴と、前に置いた放射線の遮へい板
    reactor = Loft([
        (-0.43, 0, 0, 0.052, 0.052, 2, H2),
        (-0.41, 0, 0, 0.07, 0.07, 2, H),
        (-0.34, 0, 0, 0.075, 0.075, 2, A),
        (-0.335, 0, 0, 0.075, 0.075, 2, H),
        (-0.32, 0, 0, 0.06, 0.06, 2, H),
    ], n=48)
    reactor.build(hull)
    cylinder(hull, (0, -0.32, 0), (0, -0.31, 0), 0.10, 0.10, 'Gold', n=48)
    # 磁気ノズル：輪のコイルと、それを支える腕、奥で光るプラズマ
    for k, y in enumerate((-0.45, -0.49, -0.53)):
        r = 0.05 + k * 0.016
        cylinder(hull, (0, y, 0), (0, y - 0.008, 0), r + 0.008, r + 0.008, 'Metal', n=48, cap0=None, cap1=None)
        cylinder(hull, (0, y - 0.008, 0), (0, y, 0), r, r, D, n=48, cap0=None, cap1=None)
    for k in range(6):
        a = k * math.pi / 3
        cylinder(hull, (0.05 * math.cos(a), -0.43, 0.05 * math.sin(a)), (0.09 * math.cos(a), -0.54, 0.09 * math.sin(a)), 0.003, 0.003, 'Metal', n=8)
    cylinder(hull, (0, -0.44, 0), (0, -0.445, 0), 0.04, 0.04, 'Glow', n=32)
    # 操縦区画の上：手すりと点検口を列に並べる
    for y in np.arange(0.335, 0.46, 0.025):
        for x in (-0.04, 0.04):
            box(hull, (x, y, 0.067), (0.018, 0.012, 0.0025), H2)
    for x in (-0.055, 0.055):
        cylinder(hull, (x, 0.33, 0.068), (x, 0.46, 0.068), 0.0012, 0.0012, 'Metal', n=6)
    # 操縦区画の上のアンテナ
    cylinder(hull, (0.03, 0.36, 0.066), (0.03, 0.36, 0.1), 0.0015, 0.001, 'Metal', n=8)
    cylinder(hull, (-0.03, 0.38, 0.066), (-0.03, 0.38, 0.075), 0.014, 0.004, 'Metal', n=20)
    return hull, rotor


# ---- 4. 回転リングの探査船（MEGURI） ---------------------------------------------
# 長い旅のための船。輪に並べたモジュールがまわって、遠心力で床に重さ（人工重力）を作る。
# 真ん中の軸は回らず、前に操縦区画と 2 機の着陸艇、後ろに主機と放熱板。


def meguri():
    hull, rotor = Part(), Part()
    H, H2, A, D, M = 'Hull', 'Hull2', 'Accent', 'Dark', 'Metal'
    R, N = 0.42, 10

    def place(part_src, angle, dest):
        """Y 軸のまわりに angle だけ回して dest に足す（輪の上に並べる）"""
        c, s_ = math.cos(angle), math.sin(angle)
        verts = [(x * c - z * s_, y, x * s_ + z * c) for x, y, z in part_src.verts]
        dest.add(verts, part_src.faces, part_src.mats)

    # 輪のモジュール：居住区（白・窓）と機械区画（灰色・金の断熱材）を交互に。
    # いったん「+X 方向の輪の上、接線が Z」に作ってから回して並べる
    seg = 2 * math.pi / N
    for k in range(N):
        mod = Part()
        crew = k % 2 == 0
        half_arc = R * seg * 0.36
        loft = FacetLoft([
            (-half_arc, 0, 0, 0.036, 0.046, 0.040, 0.034, 0.034, H2),
            (-half_arc + 0.008, 0, 0, 0.040, 0.050, 0.044, 0.040, 0.040, H if crew else H2),
            (half_arc - 0.008, 0, 0, 0.040, 0.050, 0.044, 0.040, 0.040, H2),
            (half_arc, 0, 0, 0.036, 0.046, 0.040, 0.034, 0.034, H2),
        ], chamfer=0.3, seg=3)
        # ロフトは Y 方向に作られるので、Y→Z（接線）、X→Y（船の前後）、Z→X（外向き）へ並べ替え
        loft.build(mod, transform=lambda v: (R + v[2], v[0], v[1]))
        if crew:
            # 居住区：前後の面に窓の列、外周に赤い帯
            for side in (-1, 1):
                for j in range(9):
                    zz = -half_arc + 0.012 + j * (2 * half_arc - 0.024) / 8
                    for rr in (R - 0.012, R + 0.012):
                        box(mod, (rr, side * 0.0502, zz), (0.006, 0.0012, 0.0045), 'Window')
            box(mod, (R + 0.0402, 0, 0), (0.0012, 0.1, 0.012), A)
        else:
            # 機械区画：金色の断熱材の箱と、短い放熱フィン
            box(mod, (R + 0.044, 0, 0), (0.01, 0.06, 0.05), 'Gold')
            for side in (-1, 1):
                plate(mod, [(R - 0.02, side * 0.05, -0.02), (R + 0.02, side * 0.05, -0.02), (R + 0.02, side * 0.085, -0.02), (R - 0.02, side * 0.085, -0.02)][::side], 0.002, 'Radiator', edge_mat=M)
        place(mod, k * seg, rotor)
        # モジュールどうしをつなぐ短い通路
        a0 = k * seg + seg * 0.36
        a1 = (k + 1) * seg - seg * 0.36
        p0 = (R * math.cos(a0), 0, R * math.sin(a0))
        p1 = (R * math.cos(a1), 0, R * math.sin(a1))
        cylinder(rotor, p0, p1, 0.016, 0.016, M, n=16)

    # スポーク（輪と真ん中のハブをつなぐ 4 本の通路）
    for k in range(4):
        a = k * math.pi / 2 + seg / 2
        cylinder(rotor, (0.07 * math.cos(a), 0, 0.07 * math.sin(a)), ((R - 0.03) * math.cos(a), 0, (R - 0.03) * math.sin(a)), 0.011, 0.011, M, n=14)
        cylinder(rotor, ((R - 0.07) * math.cos(a), 0, (R - 0.07) * math.sin(a)), ((R - 0.035) * math.cos(a), 0, (R - 0.035) * math.sin(a)), 0.016, 0.016, H2, n=14)
    # ハブ（回る部分）：軸受けの太い輪
    cylinder(rotor, (0, -0.05, 0), (0, 0.05, 0), 0.075, 0.075, H, n=48)
    cylinder(rotor, (0, -0.055, 0), (0, -0.05, 0), 0.06, 0.075, A, n=48)
    cylinder(rotor, (0, 0.05, 0), (0, 0.055, 0), 0.075, 0.06, A, n=48)

    # 回らない軸：前の操縦区画から後ろの主機まで
    cylinder(hull, (0, -0.40, 0), (0, 0.30, 0), 0.03, 0.03, H2, n=32)
    for y in np.arange(-0.36, 0.28, 0.06):
        cylinder(hull, (0, y, 0), (0, y + 0.008, 0), 0.034, 0.034, M, n=32)
    cab = FacetLoft([
        (0.22, 0, 0, 0.034, 0.046, 0.040, 0.040, 0.040, H2),
        (0.24, 0, 0, 0.044, 0.056, 0.050, 0.050, 0.050, H),
        (0.36, 0, 0, 0.044, 0.056, 0.050, 0.050, 0.050, H),
        (0.40, 0, 0, 0.030, 0.040, 0.036, 0.036, 0.036, H),
        (0.42, 0, 0, 0.016, 0.022, 0.020, 0.020, 0.020, M),
    ], chamfer=0.35, seg=3)
    cab.build(hull)
    strip(hull, cab, 0.0, 0.25, 0.37, 0.004, 'Window', mirror_x=True)
    strip(hull, cab, math.pi / 2, 0.25, 0.37, 0.004, A)
    for i in range(4):
        box(hull, ((i - 1.5) * 0.016, 0.395, 0.022), (0.011, 0.003, 0.008), 'Window', rot_x=-0.7)
    # 前のドッキング口
    cylinder(hull, (0, 0.42, 0), (0, 0.432, 0), 0.02, 0.02, D, n=24)

    # 着陸艇 2 機：軸の上と下に、機首を前へ向けてドッキング。下面は黒い耐熱タイル
    for sz in (1, -1):
        lander = Part()
        body = FacetLoft([
            (-0.09, 0, 0.0, 0.020, 0.034, 0.036, 0.012, 0.010, H),
            (-0.08, 0, 0.0, 0.024, 0.040, 0.044, 0.016, 0.011, H),
            (0.02, 0, 0.0, 0.020, 0.034, 0.038, 0.016, 0.011, H),
            (0.07, 0, -0.002, 0.008, 0.016, 0.020, 0.010, 0.008, H),
            (0.09, 0, -0.004, 0.002, 0.004, 0.005, 0.003, 0.003, H),
        ], chamfer=0.3, mid=-0.3, seg=2, cap_back=D)
        body.build(lander)
        strip(lander, body, -math.pi / 2, -0.085, 0.085, 0.07, D, lift=0.0006)
        box(lander, (0, 0.05, 0.012), (0.018, 0.003, 0.004), 'Window', rot_x=-0.5)
        for sx in (-1, 1):
            plate(lander, [(sx * 0.03, -0.085, 0), (sx * 0.07, -0.095, 0.0), (sx * 0.07, -0.08, 0), (sx * 0.03, -0.04, 0)][::sx], 0.003, H, edge_mat=A)
            nozzle(lander, (sx * 0.012, -0.1, 0.0), (sx * 0.012, -0.09, 0.0), 0.005, 0.008, n=12)
        # 上下に置く（下の機は上下を返す）
        for i, (x, y, z) in enumerate(lander.verts):
            lander.verts[i] = (x, y + 0.13, sz * (0.048 + z))
        if sz < 0:
            lander.faces = [list(reversed(f)) for f in lander.faces]
        hull.add(lander.verts, lander.faces, lander.mats)
        cylinder(hull, (0, 0.13, sz * 0.03), (0, 0.13, sz * 0.04), 0.008, 0.008, M, n=12)

    # 後ろ：主機の台と 3 つの噴射口、左右の放熱板
    eng = FacetLoft([
        (-0.44, 0, 0, 0.040, 0.055, 0.050, 0.050, 0.050, H2),
        (-0.42, 0, 0, 0.046, 0.060, 0.056, 0.056, 0.056, H),
        (-0.34, 0, 0, 0.046, 0.060, 0.056, 0.056, 0.056, A),
        (-0.33, 0, 0, 0.040, 0.050, 0.046, 0.046, 0.046, H),
    ], chamfer=0.35, seg=3, cap_back=D)
    eng.build(hull)
    for k in range(3):
        a = math.pi / 2 + k * 2 * math.pi / 3
        nozzle(hull, (0.026 * math.cos(a), -0.475, 0.026 * math.sin(a)), (0.026 * math.cos(a), -0.44, 0.026 * math.sin(a)), 0.012, 0.02, n=24)
    for sx in (-1, 1):
        plate(hull, [(sx * 0.06, -0.30, 0), (sx * 0.22, -0.31, 0), (sx * 0.22, -0.20, 0), (sx * 0.06, -0.21, 0)][::sx], 0.003, 'Radiator', edge_mat=M)
        cylinder(hull, (sx * 0.03, -0.255, 0), (sx * 0.06, -0.255, 0), 0.004, 0.004, M, n=8)
    return hull, rotor


# ---- 5. 海の船の形をした宇宙船（AMATSU） ----------------------------------------
# 海を行く大きな船の姿をそのまま宇宙へ持ち出した、昔ながらの「宇宙を走る船」。
# 船底は赤、舷側は明るい灰色、甲板は濃い灰色。甲板には大砲のかわりに天文台のドーム、
# 船首には大きな望遠鏡の口、船尾に大きな主噴射口。武装はない。


def amatsu():
    hull, rotor = Part(), None
    rng = random.Random(21)
    H, H2, A, D, M = 'Hull', 'Hull2', 'Accent', 'Dark', 'Metal'
    WATERLINE = -0.022

    # 船体：甲板は平ら、舷側は少し開き、船底は細くすぼまる。船首は甲板が反り上がる
    hull_loft = FacetLoft([
        (-0.47, 0, 0.0, 0.050, 0.052, 0.020, 0.024, 0.030, H),
        (-0.44, 0, 0.0, 0.074, 0.078, 0.026, 0.028, 0.058, H),
        (-0.36, 0, 0.0, 0.088, 0.092, 0.030, 0.030, 0.072, H),
        (-0.10, 0, 0.0, 0.096, 0.100, 0.034, 0.032, 0.084, H),
        (0.14, 0, 0.0, 0.088, 0.092, 0.030, 0.034, 0.080, H),
        (0.32, 0, 0.0, 0.060, 0.064, 0.020, 0.040, 0.070, H),
        (0.44, 0, 0.0, 0.030, 0.032, 0.010, 0.050, 0.058, H),
        (0.49, 0, 0.0, 0.012, 0.012, 0.004, 0.054, 0.040, H),
    ], chamfer=0.12, mid=0.0, seg=4)
    tmp = Part()
    hull_loft.build(tmp)
    # 水線より下を赤、甲板（上を向いた面）を濃い灰色に塗り分ける
    mats = []
    for f, m in zip(tmp.faces, tmp.mats):
        zs = [tmp.verts[i][2] for i in f]
        cz = sum(zs) / len(zs)
        ys = [tmp.verts[i][1] for i in f]
        if cz < WATERLINE:
            mats.append(A)
        elif cz > 0.024 and max(abs(tmp.verts[i][0]) for i in f) < 0.098 and min(zs) > 0.02 and max(zs) - min(zs) < 0.012:
            mats.append(H2)
        else:
            mats.append(m)
    hull.add(tmp.verts, tmp.faces, mats)
    # 水線の白い線
    for ang in (-0.08, math.pi + 0.08):
        strip(hull, hull_loft, ang, -0.44, 0.44, 0.003, H, lift=0.0008)

    # 船首の大きな望遠鏡の口（暗い筒の奥に青い光）
    cylinder(hull, (0, 0.47, 0.012), (0, 0.497, 0.012), 0.022, 0.022, M, n=40, cap0=None, cap1=None)
    cylinder(hull, (0, 0.497, 0.012), (0, 0.44, 0.012), 0.019, 0.019, D, n=40, cap0=None, cap1=None, inward=True)
    cylinder(hull, (0, 0.452, 0.012), (0, 0.454, 0.012), 0.019, 0.019, 'Blue', n=40)

    # 甲板の天文台のドーム（前に 2 基、後ろに 1 基）。細い観測窓のすき間つき
    def dome(y, z, r):
        cylinder(hull, (0, y, z), (0, y, z + r * 0.35), r * 1.05, r * 1.05, H2, n=40)
        steps = 6
        for k in range(1, steps + 1):
            t0 = (k - 1) / steps * math.pi / 2
            t1 = k / steps * math.pi / 2
            cylinder(hull, (0, y, z + r * 0.35 + r * math.sin(t0)), (0, y, z + r * 0.35 + r * math.sin(t1)), r * math.cos(t0), max(r * math.cos(t1), 0.0005), H, n=40, cap0=None, cap1='same' if k == steps else None)
        box(hull, (0, y + r * 0.62, z + r * 0.9), (r * 0.28, r * 0.7, r * 0.9), D, rot_x=-0.75)
    dome(0.27, 0.036, 0.034)
    dome(0.17, 0.05, 0.036)
    dome(-0.26, 0.032, 0.034)
    # 前のドームの台（一段高い）
    box(hull, (0, 0.17, 0.042), (0.09, 0.08, 0.02), H)

    # 艦橋：段々に積み上がった塔
    tiers = [
        (-0.09, 0.09, 0.030, 0.12, 0.030, H),
        (-0.06, 0.065, 0.060, 0.08, 0.032, H),
        (-0.04, 0.05, 0.092, 0.058, 0.034, H),
        (-0.03, 0.04, 0.126, 0.044, 0.030, H),
        (-0.035, 0.048, 0.156, 0.072, 0.020, H2),
        (-0.02, 0.02, 0.176, 0.03, 0.014, H),
    ]
    for y0, y1, z0, w, h, mat in tiers:
        box(hull, (0, (y0 + y1) / 2, z0 + h / 2), (w, y1 - y0, h), mat)
    # 艦橋の窓の帯（前と横）と、各段の前の小窓
    box(hull, (0, 0.0482, 0.166), (0.066, 0.002, 0.007), 'Window')
    for sx in (-1, 1):
        box(hull, (sx * 0.0362, 0.006, 0.166), (0.002, 0.07, 0.006), 'Window')
    for y1, z, w in ((0.065, 0.08, 0.06), (0.05, 0.112, 0.04), (0.04, 0.143, 0.03)):
        box(hull, (0, y1 + 0.0011, z), (w, 0.002, 0.004), 'Window')
    # アンテナの柱と、レーダーの皿
    cylinder(hull, (0, -0.005, 0.19), (0, -0.005, 0.24), 0.003, 0.0015, M, n=10)
    box(hull, (0, -0.005, 0.222), (0.05, 0.003, 0.003), M)
    cylinder(hull, (0, 0.008, 0.19), (0, 0.012, 0.198), 0.014, 0.005, M, n=24)

    # 後ろの塔：放熱の煙突（排熱のための斜めの筒）
    stack = FacetLoft([
        (-0.17, 0, 0.065, 0.020, 0.030, 0.032, 0.036, 0.034, H),
        (-0.10, 0, 0.065, 0.016, 0.026, 0.030, 0.030, 0.034, H),
    ], chamfer=0.4, seg=2)
    stack.build(hull, transform=lambda v: (v[0], v[1] - (v[2] - 0.03) * 0.5, v[2]))
    box(hull, (0, -0.152, 0.098), (0.04, 0.05, 0.004), D)
    for k in range(5):
        box(hull, (0, -0.172 + k * 0.01, 0.1005), (0.036, 0.0025, 0.001), 'Glow')

    # 船尾：大きな主噴射口と、左右の補助噴射口
    nozzle(hull, (0, -0.52, 0.0), (0, -0.465, 0.0), 0.034, 0.05, n=48)
    for sx in (-1, 1):
        nozzle(hull, (sx * 0.055, -0.49, -0.012), (sx * 0.055, -0.455, -0.012), 0.012, 0.018, n=24)
    # 船底の安定翼と、左右の短い翼（大気のある星に降りるとき開く）
    fin = [(-0.30, -0.06), (-0.44, -0.06), (-0.47, -0.13), (-0.40, -0.13)]
    plate(hull, fin, 0.006, A, edge_mat=A, axis='x')
    for sx in (-1, 1):
        w = Part()
        pts = [(sx * 0.095, -0.06, -0.01), (sx * 0.20, -0.12, -0.03), (sx * 0.20, -0.17, -0.03), (sx * 0.097, -0.20, -0.01)]
        plate(w, pts if sx > 0 else pts[::-1], 0.006, H, edge_mat=A)
        hull.add(w.verts, w.faces, w.mats)

    # 舷側の窓の列と、甲板の細かい部品
    for ang, skip in ((0.12, 0.3), (0.02, 0.4)):
        window_row(hull, hull_loft, ang, -0.40, 0.38, 0.0085, skip=skip, rng=rng, mirror_x=True)
    for y in np.arange(-0.40, 0.40, 0.04):
        if -0.30 < y < 0.10 or 0.13 < y < 0.31:
            continue
        for sx in (-1, 1):
            box(hull, (sx * 0.06, y, 0.0335), (0.012, 0.018, 0.003), M)
    # 甲板のふちの手すり
    for sx in (-1, 1):
        strip(hull, hull_loft, math.pi / 2 - sx * 0.83, -0.42, 0.44, 0.002, M, lift=0.0015)
    return hull, rotor


SHIPS = {'heron': heron, 'sorakaze': sorakaze, 'hakobune': hakobune, 'meguri': meguri, 'amatsu': amatsu}


# ---- Blender での仕上げ ---------------------------------------------------------


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_object(name, part):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(part.verts, [], part.faces)
    mesh.validate()
    for m in MATERIALS:
        mat = bpy.data.materials.get(m) or bpy.data.materials.new(m)
        mesh.materials.append(mat)
    idx = {m: i for i, m in enumerate(MATERIALS)}
    mesh.polygons.foreach_set('material_index', np.array([idx[m] for m in part.mats], dtype=np.int32))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def sharpen(obj, angle_deg=40):
    """角度の大きい稜線はシャープに、それ以外はなめらかに"""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    limit = math.radians(angle_deg)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) != 2 or e.calc_face_angle(0) > limit:
            e.smooth = False
    bm.to_mesh(obj.data)
    bm.free()


def box_uvs(obj, scale=6.0):
    """面の向きで 3 方向から投影する UV（外板の模様の大きさを船じゅうでそろえる）"""
    mesh = obj.data
    uv = mesh.uv_layers.new(name='UVMap')
    co = np.empty(len(mesh.vertices) * 3, dtype=np.float32)
    mesh.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    normals = np.empty(len(mesh.polygons) * 3, dtype=np.float32)
    mesh.polygons.foreach_get('normal', normals)
    normals = np.abs(normals.reshape(-1, 3))
    loop_vert = np.empty(len(mesh.loops), dtype=np.int32)
    mesh.loops.foreach_get('vertex_index', loop_vert)
    loop_poly = np.empty(len(mesh.loops), dtype=np.int32)
    for p in mesh.polygons:
        loop_poly[p.loop_start:p.loop_start + p.loop_total] = p.index
    axis = np.argmax(normals, axis=1)[loop_poly]
    c = co[loop_vert]
    uvs = np.where(axis[:, None] == 0, c[:, [1, 2]], np.where(axis[:, None] == 1, c[:, [0, 2]], c[:, [1, 0]]))
    uv.data.foreach_set('uv', (uvs * scale).astype(np.float32).ravel())


def bake_ao(objs, distance):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = int(os.environ.get('AO_SAMPLES', '64'))
    scene.world = bpy.data.worlds.new('world')
    scene.world.use_nodes = True
    scene.world.light_settings.distance = distance
    for obj in objs:
        attr = obj.data.color_attributes.new('AO', 'BYTE_COLOR', 'POINT')
        obj.data.color_attributes.active_color = attr
        for o in scene.objects:
            o.select_set(o == obj)
        bpy.context.view_layer.objects.active = obj
        t = time.time()
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
        col = np.empty(len(attr.data) * 4, dtype=np.float32)
        attr.data.foreach_get('color', col)
        col = col.reshape(-1, 4)
        soft = 0.4 + 0.6 * col[:, 0]
        col[:, 0] = col[:, 1] = col[:, 2] = soft
        col[:, 3] = 1
        attr.data.foreach_set('color', col.ravel())
        print(f'  AO {obj.name}: {time.time() - t:.1f}s, {len(obj.data.polygons)} faces', flush=True)


def subdivide_long_faces(obj, max_len=0.02):
    """頂点ごとの AO がにじまないよう、長い面を細かく割る"""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for _ in range(4):
        long_edges = [e for e in bm.edges if e.calc_length() > max_len]
        if not long_edges:
            break
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.to_mesh(obj.data)
    bm.free()


def build(ship_id):
    print(f'== {ship_id}', flush=True)
    reset_scene()
    hull_part, rotor_part = SHIPS[ship_id]()
    objs = [make_object('Hull', hull_part)]
    if rotor_part:
        objs.append(make_object('Rotor', rotor_part))
    for obj in objs:
        sharpen(obj)
        subdivide_long_faces(obj, float(os.environ.get('AO_EDGE', '0.03')))
        sharpen(obj)
        box_uvs(obj)
    bake_ao(objs, 0.08)
    for o in bpy.context.scene.objects:
        o.select_set(o in objs)
    out = os.path.join(OUT_DIR, f'ship-{ship_id}.glb')
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format='GLB',
        use_selection=True,
        export_vertex_color='ACTIVE',
        export_normals=True,
        export_texcoords=True,
        export_materials='EXPORT',
        export_yup=True,
    )
    print('wrote', out, os.path.getsize(out) // 1024, 'KB', flush=True)
    for obj in objs:
        co = np.array([v.co[:] for v in obj.data.vertices])
        lo, hi = co.min(0), co.max(0)
        # three.js の座標（x, z, -y）で表示する
        print(f'  {obj.name} bounds three x {lo[0]:.3f}..{hi[0]:.3f} y {lo[2]:.3f}..{hi[2]:.3f} z {-hi[1]:.3f}..{-lo[1]:.3f}')
    if os.environ.get('PREVIEW'):
        preview(ship_id)


PREVIEW_COLORS = {
    'Hull': (0.92, 0.92, 0.9), 'Hull2': (0.55, 0.58, 0.63), 'Accent': (0.75, 0.18, 0.08), 'Dark': (0.08, 0.08, 0.1),
    'Metal': (0.5, 0.5, 0.52), 'Gold': (0.8, 0.6, 0.2), 'Window': (1, 0.85, 0.5), 'Glow': (0.4, 0.6, 1), 'Blue': (0.3, 0.5, 1), 'Bay': (0.2, 0.3, 0.5),
    'Sail': (0.85, 0.85, 0.95), 'Radiator': (0.2, 0.2, 0.22), 'CargoA': (0.85, 0.45, 0.1), 'CargoB': (0.15, 0.45, 0.5),
    'CargoC': (0.75, 0.75, 0.72), 'CargoD': (0.3, 0.35, 0.45),
}


def preview(ship_id):
    """形の確認用に、Workbench で数枚の画像を書き出す（PREVIEW=1）"""
    scene = bpy.context.scene
    for name, col in PREVIEW_COLORS.items():
        m = bpy.data.materials.get(name)
        if not m:
            continue
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (*col, 1)
        bsdf.inputs['Roughness'].default_value = 0.5
        if name in ('Window', 'Glow', 'Blue', 'Bay'):
            bsdf.inputs['Emission Color'].default_value = (*col, 1)
            bsdf.inputs['Emission Strength'].default_value = 3
    scene.cycles.samples = 24
    scene.cycles.use_denoising = False
    scene.render.resolution_x, scene.render.resolution_y = 960, 600
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.05, 0.06, 0.08, 1)
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 4
    sun.rotation_euler = (0.7, 0.3, 2.4)
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.lens = 50
    views = {'hero': (1.3, 1.5, 0.6), 'side': (2.2, 0.0, 0.05), 'top': (0.001, 0.0, 2.4), 'rear': (-0.9, -1.5, 0.5), 'front': (0.5, 1.9, -0.25)}
    from mathutils import Vector
    for name, pos in views.items():
        cam.location = Vector(pos)
        direction = Vector((0, 0, 0)) - cam.location
        cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(os.environ.get('PREVIEW_DIR', '/tmp'), f'{ship_id}-{name}.png')
        bpy.ops.render.render(write_still=True)


def main():
    ids = os.environ.get('SHIPS', ','.join(SHIPS)).split(',')
    for ship_id in ids:
        build(ship_id)


if __name__ == '__main__':
    sys.exit(main())
