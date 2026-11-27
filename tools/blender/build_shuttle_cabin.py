"""
スペースシャトル（1993 年のエンデバー）の乗員室を Blender で組み立て、色の絵（アトラス）と光（2 種類）を焼いて書き出す。
フライトデッキ（前の操縦席・後ろのアームの台）と、床の穴の下のミッドデッキ（ロッカー・台所・トイレ・横のハッチ・
エアロック・寝ぶくろ）。寸法は tools/shuttle/cabin.md（出典つき）。ブリッジ（build_bridge.py）と同じ作り方を、もっと細かく。

作り方:
  1. 殻：フライトデッキとミッドデッキの「空気の形」を断面の掃引（ロフト）と角の丸い箱で作り、合わせて裏返し、厚みを付け、
     窓・床の穴をブーリアンで抜く。
  2. パネル：shuttle_panels.py のデータから、表の絵（刻印の文字）を Pillow で描いてアトラスに並べ、
     レバー・回路遮断器・つまみを 3D の小さな部品として並べる（手で 1 つずつ置かない）。
  3. 色は UV0（アトラス：パネルの絵、色見本、模様を焼いた壁や床）、光は UV1（ライトマップ）。
     アプリでは 色 × 光（MeshBasic 相当、光の計算なし）。文字は UV0 なのでくっきり、光はやわらかい。
  4. 光は 2 回焼く：day（窓からの日光・地球の照り返し＋室内灯）と dark（打ち上げ・帰りの暗い操縦室：室内灯を落とし、画面の光だけ）。
     焼くときは色を白にそろえて「光の量」だけを焼く（金属が黒くならない）。
  5. 焼かない部品は名前の頭で分ける：screen_*（CRT・モニター：アプリで絵を描く）、glass_*（窓）、adi_*（姿勢球）、
     rhc_* / thc_* / rms_*（握り：原点が支点）、seat_*、hatch_*、float_*（浮いている物）、collider（当たり判定）、hs_*（見どころの印）。

座標は m。Blender：X 右（右舷）、Y 前（機首）、Z 上。原点はミッドデッキの床・後ろの壁。書き出すと three.js では (x, z, −y)。

環境変数:
  STAGE=1          形だけ（ブロックアウト）。パネルは灰色の板、細かい部品なし
  PREVIEW=1        Cycles で確認の絵を描く（VIEWS=a,b,…  PREVIEW_DIR=…  PREVIEW_SAMPLES=…  MODE=pt|baked）
  BAKE=1           アトラスと光を焼いて public/models/shuttle/ に書き出す（ATLAS=4096 BAKE_SIZE=2048 SAMPLES=…）
実行:
  .venv/bin/python -I tools/blender/build_shuttle_cabin.py
"""

import json
import math
import os
import random
import sys
import time

import bpy  # bpy を先に読む
import bmesh
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import shuttle_panels as SP  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT_DIR = os.environ.get('OUT_DIR', os.path.join(ROOT, 'public', 'models'))
WORK = os.environ.get('WORK', '/tmp/shuttle-work/build')
STAGE = int(os.environ.get('STAGE', '2'))
PREVIEW = os.environ.get('PREVIEW')
BAKE = os.environ.get('BAKE')
ATLAS = int(os.environ.get('ATLAS', '4096'))
BAKE_SIZE = int(os.environ.get('BAKE_SIZE', '2048'))
SAMPLES = int(os.environ.get('SAMPLES', '96'))
PI = math.pi

# ==== 寸法表（tools/shuttle/cabin.md） ===================================================
MD_HW = 1.80  # ミッドデッキの半分の幅
MD_H = 2.10  # ミッドデッキの天井
MD_LOCK = 3.40  # 前のロッカーの面
FD_Z = 2.22  # フライトデッキの床
FD_HW = 1.75  # 後ろのフライトデッキの半分の幅
FD_TOP = 4.35  # 後ろのフライトデッキの天井
HOLE_X = (0.89, 1.55)  # 上下の穴（左右対称、|X|）0.66 m
HOLE_Y = (1.00, 1.71)  # 0.71 m
AIRLOCK_R = 0.80  # 内径 1.6 m
AIRLOCK_WALL = 0.06
AIRLOCK_C = (0.0, AIRLOCK_R + AIRLOCK_WALL)
SIDE_HATCH = Vector((-MD_HW, 2.20, 1.05))  # 横のハッチの中心
SIDE_HATCH_R = 0.51
SEAT_X = 0.58  # 船長（−）・操縦士（＋）
SEAT_Y = 2.55  # 背もたれの面
SEAT_Z = FD_Z + 0.40  # 座面
EYE = Vector((-SEAT_X, 2.78, 3.40))  # 船長の目
# フライトデッキの断面（Y, 半幅, 床, 天井, 上の角の丸み, 下の角の丸み）
FD_SECTIONS = [
    (0.00, FD_HW, FD_Z, FD_TOP, 0.55, 0.10),
    (2.30, FD_HW, FD_Z, FD_TOP, 0.55, 0.10),
    (2.80, 1.62, FD_Z, 4.30, 0.60, 0.10),
    (3.30, 1.45, FD_Z, 4.16, 0.62, 0.14),
    (3.70, 1.22, 2.36, 3.98, 0.60, 0.20),
    (4.00, 0.92, 2.60, 3.62, 0.45, 0.20),
    (4.18, 0.50, 2.85, 3.30, 0.20, 0.12),
]
WIN_C = Vector((0.0, 2.95, 3.50))  # 前の窓を並べる中心
WIN_PHI = [-82, -50, -17, 17, 50, 82]  # 前の窓 W1〜W6（左から、度）
WIN_SIZE = [(0.50, 0.48), (0.62, 0.52), (0.60, 0.50), (0.60, 0.50), (0.62, 0.52), (0.50, 0.48)]
TOP_WIN = [(-0.45, 1.25), (0.45, 1.25)]  # 天井の窓の中心（X, Y）0.51 角
AFT_WIN = [(-0.36, 3.72), (0.36, 3.72)]  # 後ろの窓の中心（X, Z）0.37 × 0.28
AFT_WIN_SIZE = (0.37, 0.28)
SUN_DIR = Vector((0.25, -0.45, -0.86)).normalized()  # 日光の進む向き（上・前から差しこむ）


def lin(c):
    """16 進の sRGB を線形に"""
    if isinstance(c, str):
        c = tuple(int(c[i:i + 2], 16) / 255 for i in (1, 3, 5))
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


# ==== 下準備 ==============================================================================
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.view_settings.view_transform = 'AgX'
    w = bpy.data.worlds.new('space')
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0, 0, 0, 1)
    sc.world = w
    return sc


# ---- 色見本（細かい部品の色。アトラスの小さな四角） -------------------------------------------
SWATCH = {
    'black': '#141516', 'dark': '#2c2f33', 'gray': '#5f6670', 'panel': '#60686f', 'lgray': '#9aa0a6', 'white': '#e4e3dc',
    'cream': '#dcd8cc', 'metal': '#a8acae', 'lever': '#c9ccce', 'yellow': '#d9b62e', 'red': '#b8322a', 'cbk': '#232425',
    'blue': '#2f4f8c', 'velcro': '#4d6fa8', 'velcro_w': '#d8d6cc', 'velcro_k': '#26282b', 'bag_g': '#4d5a3e', 'bag_b': '#33508a',
    'tan': '#b8a98a', 'strap': '#1d1e20', 'belt': '#c7742d', 'cable': '#cfcfc8', 'cable_k': '#303234', 'orange': '#d87a2c',
    'silver': '#b9bdc0', 'lamp': '#fbf7ea', 'screen': '#0b120e', 'glass': '#203040', 'green': '#5d7b52', 'foil': '#c4b27a',
    'duct': '#c8c6bd', 'paper': '#ece9df', 'pen': '#2a3c8a', 'pouch': '#d9d4c4',
}
SW_CELL = 32  # 1 色の四角（px、4096 のとき）
SW_ORIGIN = (ATLAS - 16 * SW_CELL, 0)  # アトラスの中の色見本の場所（右上）
SW_INDEX = {k: i for i, k in enumerate(SWATCH)}


def sw_uv(name):
    i = SW_INDEX[name]
    cols = 16
    cx = SW_ORIGIN[0] + (i % cols + 0.5) * SW_CELL
    cy = SW_ORIGIN[1] + (i // cols + 0.5) * SW_CELL
    return (cx / ATLAS, 1 - cy / ATLAS)


# ---- 形をためる箱 ----------------------------------------------------------------------------
class Acc:
    """形をためる bmesh。kind：'surf'（模様を焼く。UV0 は後で展開）・'fixed'（UV0 を決めて作る）"""

    def __init__(self, name, kind, mat=None):
        self.name, self.kind, self.mat = name, kind, mat
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new('UVMap')
        self.anchors = []  # 細かい部品：(面の数の範囲, 付け根の点)

    def nfaces(self):
        return len(self.bm.faces)


ACCS = {}


def acc(group, kind='fixed', mat=None):
    key = (group, kind, mat)
    if key not in ACCS:
        ACCS[key] = Acc(f'{group}__{kind}__{mat or ""}', kind, mat)
        ACCS[key].group = group
    return ACCS[key]


def _faces_of(verts):
    return list({f for v in verts for f in v.link_faces})


def set_uv(a, faces, uv):
    if uv is None:
        return
    if isinstance(uv, str):
        u = sw_uv(uv)
        for f in faces:
            for l in f.loops:
                l[a.uv].uv = u
    else:
        uv(a, faces)


def box(a, size, M, bevel=0.0, seg=1, uv=None):
    bm = a.bm
    r = bmesh.ops.create_cube(bm, size=1.0)
    vs = r['verts']
    bmesh.ops.scale(bm, vec=Vector(size), verts=vs)
    if bevel > 0:
        es = list({e for v in vs for e in v.link_edges})
        rr = bmesh.ops.bevel(bm, geom=es + vs, offset=min(bevel, min(size) * 0.45), segments=seg, affect='EDGES', profile=0.5, clamp_overlap=True)
        vs = list(set(vs) | set(rr.get('verts', [])))
        vs = [v for v in vs if v.is_valid]
        vs = list({v for f in _faces_of(vs) for v in f.verts})
    bmesh.ops.transform(bm, matrix=M, verts=vs)
    fs = _faces_of(vs)
    set_uv(a, fs, uv)
    return fs


def cyl(a, r1, r2, h, M, seg=12, uv=None, cap=True):
    bm = a.bm
    res = bmesh.ops.create_cone(bm, cap_ends=cap, segments=seg, radius1=r1, radius2=r2, depth=h)
    vs = res['verts']
    bmesh.ops.transform(bm, matrix=M @ Matrix.Translation((0, 0, h / 2)), verts=vs)
    fs = _faces_of(vs)
    set_uv(a, fs, uv)
    return fs


def tube(a, pts, r, seg=6, uv=None):
    """点の列に沿った細い管（ケーブル・手すり・ダクト）"""
    bm = a.bm
    rings = []
    n = len(pts)
    for i, p in enumerate(pts):
        p = Vector(p)
        t = (Vector(pts[min(n - 1, i + 1)]) - Vector(pts[max(0, i - 1)])).normalized()
        u = t.cross(Vector((0, 0, 1)))
        if u.length < 0.1:
            u = t.cross(Vector((1, 0, 0)))
        u.normalize()
        w = t.cross(u)
        rings.append([bm.verts.new(p + (u * math.cos(2 * PI * k / seg) + w * math.sin(2 * PI * k / seg)) * r) for k in range(seg)])
    fs = []
    for i in range(n - 1):
        for k in range(seg):
            k2 = (k + 1) % seg
            fs.append(bm.faces.new((rings[i][k], rings[i + 1][k], rings[i + 1][k2], rings[i][k2])))
    set_uv(a, fs, uv)
    return fs


def ring(a, r0, r1, depth, M, seg=24, uv=None):
    """穴のあいた円板（ローカル z に depth の厚み）：ハッチ・窓の縁"""
    bm = a.bm
    vs = []
    rings = []
    for z in (0.0, depth):
        rings.append([bm.verts.new(M @ Vector((r * math.cos(2 * PI * k / seg), r * math.sin(2 * PI * k / seg), z))) for r in (r0, r1) for k in range(seg)])
    fs = []
    for k in range(seg):
        k2 = (k + 1) % seg
        b0, b1 = rings[0], rings[1]
        i_in, i_out, j_in, j_out = k, seg + k, k2, seg + k2
        fs.append(bm.faces.new((b0[i_in], b0[j_in], b0[j_out], b0[i_out])))
        fs.append(bm.faces.new((b1[i_in], b1[i_out], b1[j_out], b1[j_in])))
        fs.append(bm.faces.new((b0[i_out], b0[j_out], b1[j_out], b1[i_out])))
        fs.append(bm.faces.new((b0[i_in], b1[i_in], b1[j_in], b0[j_in])))
    set_uv(a, fs, uv)
    return fs


def quad(a, w, h, M, uv=None):
    """板 1 枚（ローカルの −Y が表、中心が原点）"""
    bm = a.bm
    vs = [bm.verts.new(M @ Vector(p)) for p in ((-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2))]
    f = bm.faces.new(vs)
    front = (M.to_3x3() @ Vector((0, -1, 0))).normalized()
    f.normal_update()
    if f.normal.dot(front) < 0:
        f.normal_flip()
    set_uv(a, [f], uv)
    return [f]


def rect_uv(rect, w, h, M):
    """板の表の頂点を、アトラスの四角（px：x0, y0, x1, y1）へ。ローカルの x が右、z が上"""
    inv = M.inverted()
    x0, y0, x1, y1 = rect

    def fn(a, faces):
        for f in faces:
            for l in f.loops:
                p = inv @ l.vert.co
                s = min(1, max(0, p.x / w + 0.5)) if w else 0.5
                t = min(1, max(0, p.z / h + 0.5)) if h else 0.5
                l[a.uv].uv = ((x0 + s * (x1 - x0)) / ATLAS, 1 - (y1 - t * (y1 - y0)) / ATLAS)
    return fn


def frame(origin, right, up):
    """置き場所の行列：ローカル x = right、z = up、表（−y）は手前"""
    r = Vector(right).normalized()
    u = Vector(up).normalized()
    y = u.cross(r)
    u = r.cross(y)
    m = Matrix((r, y, u)).transposed().to_4x4()
    m.translation = Vector(origin)
    return m


def rot_x(a):
    return Matrix.Rotation(a, 4, 'X')


def rot_z(a):
    return Matrix.Rotation(a, 4, 'Z')


def T(x, y=0.0, z=0.0):
    return Matrix.Translation((x, y, z))


# ==== アトラス（色の絵）の並べ方 ============================================================
class Atlas:
    """パネル・ロッカーの扉・カードの絵を棚に並べる（上から）。ppm は 1 m あたりの画素"""

    def __init__(self):
        self.reqs = []  # (key, w_m, h_m, painter, ppm_scale)

    def request(self, key, w, h, painter, scale=1.0):
        self.reqs.append([key, w, h, painter, scale, None])
        return self.reqs[-1]

    def pack(self, top_frac=0.62):
        # 色見本の場所（右上）はよける
        cols = 16
        rows = math.ceil(len(SWATCH) / cols)
        sw_h = rows * SW_CELL
        lo, hi = 200.0, 6000.0
        best = None
        for _ in range(22):
            ppm = (lo + hi) / 2
            placed = self._try(ppm, ATLAS - cols * SW_CELL - 4, sw_h, int(ATLAS * top_frac))
            if placed:
                best = (ppm, placed)
                lo = ppm
            else:
                hi = ppm
        ppm, placed = best
        for r, rect in zip(self.reqs, placed):
            r[5] = rect
        self.ppm = ppm
        self.bottom = max(rc[3] for rc in placed) + 6
        print(f'atlas: {len(self.reqs)} pictures at {ppm:.0f} px/m, used to y={self.bottom}')

    def _try(self, ppm, sw_x, sw_h, limit):
        order = sorted(range(len(self.reqs)), key=lambda i: -self.reqs[i][2] * self.reqs[i][4])
        out = [None] * len(self.reqs)
        x, y, rowh = 0, 0, 0
        for i in order:
            _, w, h, _, sc, _ = self.reqs[i]
            pw, ph = max(4, int(w * ppm * sc)) + 4, max(4, int(h * ppm * sc)) + 4
            right = sw_x if y < sw_h else ATLAS
            if x + pw > right:
                x, y, rowh = 0, y + rowh, 0
                right = sw_x if y < sw_h else ATLAS
            if x + pw > right or y + ph > limit:
                return None
            out[i] = (x + 2, y + 2, x + pw - 2, y + ph - 2)
            x += pw
            rowh = max(rowh, ph)
        return out

    def draw(self):
        rgb = Image.new('RGB', (ATLAS, ATLAS), (96, 104, 114))
        glow = Image.new('L', (ATLAS, ATLAS), 0)
        for key, w, h, painter, sc, rect in self.reqs:
            x0, y0, x1, y1 = rect
            ppm_draw = max(self.ppm * sc, 900) * 1.6  # 大きく描いて縮める（文字の縁をなめらかに）
            im, gl = painter(ppm_draw)
            im = im.resize((x1 - x0, y1 - y0), Image.LANCZOS)
            gl = gl.resize((x1 - x0, y1 - y0), Image.LANCZOS)
            # にじみ止めに 2 px 外まで同じ色を
            rgb.paste(im.resize((x1 - x0 + 4, y1 - y0 + 4)), (x0 - 2, y0 - 2))
            rgb.paste(im, (x0, y0))
            glow.paste(gl, (x0, y0))
        # 色見本
        d = SW_ORIGIN
        rnd = random.Random(3)
        for k, i in SW_INDEX.items():
            c = SWATCH[k]
            c = tuple(int(c[j:j + 2], 16) for j in (1, 3, 5))
            x0 = d[0] + (i % 16) * SW_CELL
            y0 = d[1] + (i // 16) * SW_CELL
            tile = Image.new('RGB', (SW_CELL, SW_CELL), c)
            rgb.paste(tile, (x0, y0))
            if k in ('lamp', 'screen'):
                glow.paste(255 if k == 'lamp' else 60, (x0, y0, x0 + SW_CELL, y0 + SW_CELL))
        return rgb, glow


ATL = Atlas()
PANEL_DEFS = SP.panels()
PANELS = []  # (pid, 行列, 部品の一覧)
SCREENS = []  # (名前, 幅, 高さ, 行列)


def place_panel(pid, M, group='room', back=0.03):
    """パネル 1 枚：板（裏に厚み）と表の絵、部品。M のローカル：x 右、z 上、表は −y。M の原点はパネルの左下"""
    p = PANEL_DEFS[pid]
    w, h = p['w'], p['h']
    Mc = M @ T(w / 2, 0, h / 2)
    a = acc(group)
    box(a, (w + 0.006, back, h + 0.006), Mc @ T(0, back / 2 + 0.001, 0), uv='panel')
    if STAGE < 2:
        quad(a, w, h, Mc @ T(0, -0.0005, 0), uv='panel')
        return

    def painter(ppm, p=p):
        im, gl, _ = SP.paint(p, ppm)
        return im, gl
    req = ATL.request(pid, w, h, painter)
    items = SP.layout(p)[0]
    PANELS.append((pid, M, items, req, group))


def build_panel_faces():
    """アトラスの場所が決まったあと：パネルの表の板と、部品"""
    for pid, M, items, req, group in PANELS:
        p = PANEL_DEFS[pid]
        w, h = p['w'], p['h']
        Mc = M @ T(w / 2, -0.0005, h / 2)
        quad(acc(group), w, h, Mc, uv=rect_uv(req[5], w, h, Mc))
        for it in items:
            build_item(it, M, pid, group)


def build_item(it, M, pid, group):
    """パネルの部品 1 つ。M はパネルの左下。部品は −y 向きに出っぱる"""
    k = it['kind']
    d = acc(group + '_detail')
    P = M @ T(it['x'], 0, it['z'])
    out = Matrix.Rotation(PI / 2, 4, 'X')  # ローカル z（円柱の軸）を −y（手前）へ
    start = d.nfaces()
    anchor = P.translation.copy()
    if k in ('tog', 'togg'):
        cyl(d, 0.0055, 0.0045, 0.008, P @ out, seg=6, uv='metal')
        tilt = 0.45 if it['up'] else -0.45
        L = P @ T(0, -0.008, 0) @ rot_x(tilt)
        box(d, (0.0032, 0.018, 0.0032), L @ T(0, -0.009, 0), uv='lever')
        if k == 'togg':
            # ふた（コの字の針金）
            for sx in (-0.009, 0.009):
                box(d, (0.0018, 0.022, 0.0018), P @ T(sx, -0.011, -0.004), uv='lever')
            box(d, (0.02, 0.0018, 0.0018), P @ T(0, -0.022, -0.004), uv='lever')
    elif k.startswith('cb'):
        col = {'cby': 'yellow', 'cbr': 'red', 'cbk': 'cbk'}.get(it.get('color', k), 'cbk')
        cyl(d, 0.0085, 0.0085, 0.004, P @ out, seg=8, uv=col)
        cyl(d, 0.0058, 0.0055, 0.012, P @ out, seg=8, uv='black')
    elif k == 'knob':
        cyl(d, 0.016, 0.014, 0.014, P @ out, seg=12, uv='black')
        box(d, (0.004, 0.006, 0.02), P @ T(0, -0.016, 0.006), uv='lgray')
    elif k == 'pb':
        box(d, (0.02, 0.008, 0.02), P @ T(0, -0.004, 0), uv='dark' if not it['lit'] else 'lamp')
    elif k == 'tb':
        pass  # 表示窓は絵だけ
    elif k in ('adi',):
        r = it['w'] / 2
        # 姿勢球は焼かない別の部品（アプリで回す）。ここは縁の枠だけ
        box(d, (it['w'] * 1.1, 0.02, it['w'] * 1.1), P @ T(0, -0.01, 0), uv='dark')
        SCREENS.append(('adi_' + ('cdr' if M.translation.x < 0 else 'plt'), r * 0.92, 0, P @ T(0, -0.02, 0), 'adi'))
    elif k in ('crt', 'mon'):
        w, h = it['w'], it['h']
        # 画面の枠（厚い縁）と、焼かない画面の板
        for sx, sz, ww, hh in ((0, h / 2 + 0.012, w + 0.04, 0.024), (0, -h / 2 - 0.012, w + 0.04, 0.024), (w / 2 + 0.012, 0, 0.024, h), (-w / 2 - 0.012, 0, 0.024, h)):
            box(d, (ww, 0.03, hh), P @ T(sx, -0.015, sz), uv='dark')
        n = it['label'].replace(' ', '').lower().replace('cctvmon', 'mon').replace('crt', 'crt')
        SCREENS.append(('screen_' + n, w, h, P @ T(0, -0.004, 0), 'screen'))
    elif k == 'key':
        box(d, (it['w'], 0.008, it['h']), P @ T(0, -0.004, 0), uv='lgray')
    elif k == 'dial' or k == 'hsi':
        cyl(d, it['w'] / 2 * 1.02, it['w'] / 2 * 1.02, 0.006, P @ out, seg=20, uv='dark', cap=False)
    elif k == 'card':
        # クリップでとめたカード（少し浮かせ、角を少し反らせる）
        clip = P @ T(0, -0.006, it['h'] / 2 - 0.004)
        box(d, (0.03, 0.006, 0.012), clip, uv='metal')
    end = d.nfaces()
    if end > start:
        d.anchors.append((start, end, anchor))


# ==== 殻 ==================================================================================
def section_ring(hw, zb, zt, rt, rb, n_corner=6):
    """断面（X, Z）の輪：下の角は rb、上の角は rt で丸める。左下から反時計回り"""
    pts = []

    def arc(cx, cz, r, a0, a1):
        for i in range(n_corner + 1):
            a = a0 + (a1 - a0) * i / n_corner
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    arc(-hw + rb, zb + rb, rb, PI, 1.5 * PI)
    arc(hw - rb, zb + rb, rb, 1.5 * PI, 2 * PI)
    arc(hw - rt, zt - rt, rt, 0, 0.5 * PI)
    arc(-hw + rt, zt - rt, rt, 0.5 * PI, PI)
    return pts


def loft_object(name, sections):
    bm = bmesh.new()
    rings = []
    for y, hw, zb, zt, rt, rb in sections:
        rings.append([bm.verts.new((x, y, z)) for x, z in section_ring(hw, zb, zt, rt, rb)])
    n = len(rings[0])
    for i in range(len(rings) - 1):
        for k in range(n):
            k2 = (k + 1) % n
            bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm)


def mesh_obj(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def solid_box(name, x0, x1, y0, y1, z0, z1, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(x1 - x0, y1 - y0, z1 - z0), verts=bm.verts)
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=3, affect='EDGES', profile=0.5, clamp_overlap=True)
    bmesh.ops.translate(bm, vec=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), verts=bm.verts)
    return mesh_obj(name, bm)


def apply_bool(target, cutter, op):
    m = target.modifiers.new('b', 'BOOLEAN')
    m.operation = op
    m.solver = 'EXACT'
    m.object = cutter
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.select_all(action='DESELECT')
    target.select_set(True)
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


WINDOWS = []  # (名前, 中心, 法線, 幅, 高さ, 上の向き)


def fd_window_frames():
    """前の窓 6 枚：中心から放った光線が殻に当たる所と、その面の向き"""
    air = loft_object('fd_air_probe', FD_SECTIONS)
    dg = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(air, dg)
    out = []
    for i, (phi, (w, h)) in enumerate(zip(WIN_PHI, WIN_SIZE)):
        a = math.radians(phi)
        d = Vector((math.sin(a), math.cos(a), 0.18)).normalized()
        hit, nrm, _, _ = bvh.ray_cast(WIN_C, d)
        if hit is None:
            continue
        # 面の向き：内側から見て表（法線は外向き）
        n = nrm.normalized()
        if n.dot(d) < 0:
            n = -n
        up = (Vector((0, 0, 1)) - n * n.z).normalized()
        out.append((f'W{i + 1}', hit, n, w, h, up))
    bpy.data.objects.remove(air, do_unlink=True)
    return out


def build_shell():
    """殻：空気の形を合わせて裏返し、外へ厚みを付け、窓と床の穴を抜く"""
    global WINDOWS
    WINDOWS = fd_window_frames()
    for x, y in TOP_WIN:
        WINDOWS.append((f'W{7 if x < 0 else 8}', Vector((x, y, FD_TOP)), Vector((0, 0, 1)), 0.51, 0.51, Vector((0, 1, 0))))
    for x, z in AFT_WIN:
        WINDOWS.append((f'W{9 if x < 0 else 10}', Vector((x, 0.0, z)), Vector((0, -1, 0)), AFT_WIN_SIZE[0], AFT_WIN_SIZE[1], Vector((0, 0, 1))))
    fd = loft_object('fd_air', FD_SECTIONS)
    md = solid_box('md_air', -MD_HW, MD_HW, 0.0, MD_LOCK, 0.0, MD_H, bevel=0.0)
    # ミッドデッキの長い辺を面取り（床と天井の角）
    for s in (-1, 1):
        for zc in (0.0, MD_H):
            # 角の辺に 45° 回した箱を当てて削る（面取り 約 0.2 m）
            cut = solid_box('c', -0.15, 0.15, -1, MD_LOCK + 1, -0.15, 0.15)
            cut.data.transform(Matrix.Translation((s * MD_HW, 0, zc)) @ Matrix.Rotation(math.radians(45), 4, 'Y'))
            apply_bool(md, cut, 'DIFFERENCE')
    apply_bool(fd, md, 'UNION')
    for sx in (-1, 1):
        hole = solid_box('hole', sx * HOLE_X[0] if sx > 0 else -HOLE_X[1], sx * HOLE_X[1] if sx > 0 else -HOLE_X[0], HOLE_Y[0], HOLE_Y[1], MD_H - 0.05, FD_Z + 0.05)
        apply_bool(fd, hole, 'UNION')
    air = fd
    air.name = 'shell'
    # 裏返して、外へ厚み
    me = air.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    sol = air.modifiers.new('s', 'SOLIDIFY')
    sol.thickness = 0.14
    sol.offset = -1.0  # 法線（内向き）の反対＝外へ
    sol.use_even_offset = True
    bpy.context.view_layer.objects.active = air
    bpy.ops.object.select_all(action='DESELECT')
    air.select_set(True)
    bpy.ops.object.modifier_apply(modifier=sol.name)
    # 窓を抜く
    for name, c, n, w, h, up in WINDOWS:
        cut = solid_box('win', -w / 2, w / 2, -0.6, 0.6, -h / 2, h / 2)
        M = frame(c, up.cross(n) * -1, up)
        # frame の −y が手前（中）なので、y 方向を法線へ
        cut.matrix_world = M
        bpy.context.view_layer.update()
        bpy.ops.object.select_all(action='DESELECT')
        cut.select_set(True)
        bpy.context.view_layer.objects.active = cut
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        apply_bool(air, cut, 'DIFFERENCE')
    # 横のハッチの窓
    cut = bpy.data.objects.new('c', bpy.data.meshes.new('c'))
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.125, radius2=0.125, depth=0.8)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(SIDE_HATCH) @ Matrix.Rotation(PI / 2, 4, 'Y'), verts=bm.verts)
    bm.to_mesh(cut.data)
    bm.free()
    bpy.context.collection.objects.link(cut)
    apply_bool(air, cut, 'DIFFERENCE')
    return air


def shell_materials(shell):
    """殻の面に素材を割り当てる（場所と向きから）"""
    names = ['floor', 'fd_wall', 'headliner', 'md_wall', 'md_ceiling', 'black', 'md_floor']
    shell.data.materials.clear()
    for n in names:
        shell.data.materials.append(MATS[n])
    for f in shell.data.polygons:
        c, n = f.center, f.normal
        if c.z < FD_Z - 0.06:  # ミッドデッキ
            if n.z > 0.7 and c.z < 0.1:
                m = 'md_floor'
            elif n.z < -0.7:
                m = 'md_ceiling'
            else:
                m = 'md_wall'
        else:
            if n.z > 0.7 and c.z < FD_Z + 0.05:
                m = 'floor'
            elif c.z > 3.95 and c.y < 2.6:
                m = 'headliner'
            else:
                m = 'fd_wall'
        f.material_index = names.index(m)


# ==== 素材（模様を焼く面） ==================================================================
MATS = {}


def proc_material(name, color, noise=0.06, scale=8.0, seams=None, quilt=False, scuff=0.0):
    """色＋色むら＋継ぎ目（seams=(間隔 m, 色の暗さ)）＋キルト（白い内張り）。焼くときは Emission"""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    base = nt.nodes.new('ShaderNodeRGB')
    base.outputs[0].default_value = (*lin(color), 1)
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = scale
    nz.inputs['Detail'].default_value = 8
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['To Min'].default_value = 1 - noise
    mr.inputs['To Max'].default_value = 1 + noise
    nt.links.new(nz.outputs['Fac'], mr.inputs['Value'])
    mul = nt.nodes.new('ShaderNodeVectorMath')
    mul.operation = 'SCALE'
    nt.links.new(base.outputs[0], mul.inputs[0])
    nt.links.new(mr.outputs['Result'], mul.inputs['Scale'])
    col = mul.outputs['Vector']
    if seams:
        br = nt.nodes.new('ShaderNodeTexBrick')
        br.inputs['Scale'].default_value = 1.0 / seams[0]
        br.inputs['Mortar Size'].default_value = 0.012
        br.inputs['Color1'].default_value = (1, 1, 1, 1)
        br.inputs['Color2'].default_value = (1, 1, 1, 1)
        br.inputs['Mortar'].default_value = (seams[1],) * 3 + (1,)
        br.offset = 0.0
        br.squash = 1.0
        nt.links.new(tc.outputs['Object'], br.inputs['Vector'])
        m2 = nt.nodes.new('ShaderNodeVectorMath')
        m2.operation = 'MULTIPLY'
        nt.links.new(col, m2.inputs[0])
        nt.links.new(br.outputs['Color'], m2.inputs[1])
        col = m2.outputs['Vector']
    if quilt:
        wv = nt.nodes.new('ShaderNodeTexWave')
        wv.wave_type = 'RINGS'
        wv.inputs['Scale'].default_value = 3.0
        nt.links.new(tc.outputs['Object'], wv.inputs['Vector'])
        r2 = nt.nodes.new('ShaderNodeMapRange')
        r2.inputs['To Min'].default_value = 0.93
        r2.inputs['To Max'].default_value = 1.0
        nt.links.new(wv.outputs['Fac'], r2.inputs['Value'])
        m3 = nt.nodes.new('ShaderNodeVectorMath')
        m3.operation = 'SCALE'
        nt.links.new(col, m3.inputs[0])
        nt.links.new(r2.outputs['Result'], m3.inputs['Scale'])
        col = m3.outputs['Vector']
    if scuff:
        # こすれた汚れ：大きなむらで、ところどころ少し暗く
        nz2 = nt.nodes.new('ShaderNodeTexNoise')
        nz2.inputs['Scale'].default_value = 1.6
        nz2.inputs['Detail'].default_value = 12
        nz2.inputs['Roughness'].default_value = 0.7
        nt.links.new(tc.outputs['Object'], nz2.inputs['Vector'])
        r3 = nt.nodes.new('ShaderNodeMapRange')
        r3.inputs['From Min'].default_value = 0.45
        r3.inputs['From Max'].default_value = 0.75
        r3.inputs['To Min'].default_value = 1.0
        r3.inputs['To Max'].default_value = 1 - scuff
        nt.links.new(nz2.outputs['Fac'], r3.inputs['Value'])
        m4 = nt.nodes.new('ShaderNodeVectorMath')
        m4.operation = 'SCALE'
        nt.links.new(col, m4.inputs[0])
        nt.links.new(r3.outputs['Result'], m4.inputs['Scale'])
        col = m4.outputs['Vector']
    nt.links.new(col, em.inputs['Color'])
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    MATS[name] = m
    m['color'] = color
    return m


def make_materials():
    proc_material('floor', '#5c6066', noise=0.05, seams=(0.6, 0.55), scuff=0.25)
    proc_material('md_floor', '#6a6d70', noise=0.05, seams=(0.6, 0.6), scuff=0.25)
    proc_material('fd_wall', '#5d656e', noise=0.05, seams=(0.45, 0.7), scuff=0.12)
    proc_material('headliner', '#dedbd1', noise=0.03, quilt=True, scuff=0.08)
    proc_material('md_wall', '#d9d6cb', noise=0.03, seams=(0.5, 0.8), scuff=0.1)
    proc_material('md_ceiling', '#d6d3c8', noise=0.03, seams=(0.6, 0.8), scuff=0.06)
    proc_material('black', '#18191b', noise=0.03)
    proc_material('console', '#525a63', noise=0.04, scuff=0.12)
    proc_material('structure', '#42474e', noise=0.05, scuff=0.15)
    proc_material('cushion', '#34508c', noise=0.08, scale=30, quilt=True)
    proc_material('seat_frame', '#2d3034', noise=0.05)
    proc_material('cloth', '#b9ab8c', noise=0.08, scale=25, scuff=0.15)
    proc_material('cloth_w', '#d8d5ca', noise=0.06, scale=25, scuff=0.12)
    proc_material('bag_g', '#4e5a3f', noise=0.08, scale=25, quilt=True)
    proc_material('bag_b', '#30508c', noise=0.08, scale=25, quilt=True)
    proc_material('airlock', '#d6d4cb', noise=0.03, scuff=0.1)
    proc_material('metal', '#9ea3a7', noise=0.05, scale=20)
    proc_material('galley', '#b3b6b8', noise=0.04, seams=(0.25, 0.75))
    proc_material('wcs', '#c5c6c2', noise=0.04, scuff=0.1)


# ==== 部屋の中身 ==========================================================================
def surf(group, mat):
    return acc(group, 'surf', mat)


def build_forward():
    """前の操縦席：計器板・ひさし・センター台・頭上・左右の壁"""
    a = surf('room', 'console')
    # 計器板の裏の箱（窓の下を埋める）
    # 前の面はパネルの裏（倒したパネルの上の端 y≈3.67）より奥に置く（手前にあるとパネルの上半分を隠した）
    box(a, (2.5, 0.6, 1.02), T(0, 4.02, FD_Z + 0.51), bevel=0.02)
    # 計器板（少し後ろへ倒す）。左から F1・F6・F7・F8・F9。上の端はひさしの下にそろえ、座った目（Z 3.40）から
    # ひさしの下に計器がまっすぐ見えるように（窓との間の何もない斜面を作らない）
    tilt = math.radians(12)
    zb = FD_Z + 0.58
    layout = [('F1', -1.13, 0.44), ('F6', -0.76, 0.16), ('F7', 0.0, 0.0), ('F8', 0.76, -0.16), ('F9', 1.13, -0.44)]
    for pid, xc, yaw in layout:
        p = PANEL_DEFS[pid]
        y = 3.56 + abs(xc) * -0.12
        M = T(xc, y, zb) @ rot_z(yaw) @ rot_x(-tilt) @ T(-p['w'] / 2, 0, 0)
        place_panel(pid, M)
    # 計器板のふち（黒い枠、パネルの間の溝）
    s = surf('room', 'structure')
    for xc, yaw, w in ((-0.455, 0.08, 0.03), (0.455, -0.08, 0.03), (-1.0, 0.3, 0.03), (1.0, -0.3, 0.03)):
        box(s, (w, 0.05, 0.55), T(xc, 3.53 + abs(xc) * -0.12, zb + 0.26) @ rot_z(yaw) @ rot_x(-tilt), bevel=0.008)
    # ひざの前の段（F5・F10）
    for pid, xc in (('F5', -0.60), ('F10', 0.60)):
        p = PANEL_DEFS[pid]
        place_panel(pid, T(xc, 3.50, FD_Z + 0.36) @ rot_x(-0.5) @ T(-p['w'] / 2, 0, 0))
    # ひさし（グレアシールド）：計器板の上の黒い出っ張り（奥行き 約 0.22 m、cabin.md [PH]）。前の面に F2・F3・F4 の帯
    gz = zb + 0.52 * math.cos(tilt) + 0.07
    box(s, (2.40, 0.26, 0.14), T(0, 3.62, gz), bevel=0.02)
    box(s, (2.40, 0.06, 0.03), T(0, 3.50, gz - 0.07), bevel=0.01)
    for pid, xc, yaw in (('F2', -0.80, 0.12), ('F3', 0.0, 0.0), ('F4', 0.80, -0.12)):
        p = PANEL_DEFS[pid]
        place_panel(pid, T(xc, 3.488 - abs(xc) * 0.03, gz - 0.05) @ rot_z(yaw) @ T(-p['w'] / 2, 0, 0))
    # ひさしの下の明かり（細長い）
    d = acc('room_detail')
    for xc in (-0.76, 0.0, 0.76):
        box(d, (0.32, 0.03, 0.012), T(xc, 3.56, gz - 0.075), uv='lamp')
        d.anchors.append((d.nfaces() - 6, d.nfaces(), Vector((xc, 3.56, gz - 0.06))))
    # センター台
    c = surf('room', 'console')
    box(c, (0.52, 1.0, 0.62), T(0, 3.05, FD_Z + 0.31), bevel=0.02)
    place_panel('C3', T(-0.23, 2.58, FD_Z + 0.63) @ rot_x(-PI / 2 + 0.12))
    place_panel('C2', T(-0.23, 2.97, FD_Z + 0.68) @ rot_x(-PI / 2 + 0.22))
    # C1 は低めに（高いと F7 の警告灯の列を隠した）
    place_panel('C1', T(-0.23, 3.22, FD_Z + 0.645) @ rot_x(-PI / 2 + 0.30))
    # 頭上のパネル：3 列（前・真ん中・後ろ）、天井から手前へ少し傾ける
    rows = [(3.38, ['O1', 'O2', 'O3', 'O5', 'O6']), (2.96, ['O7', 'O8', 'O9', 'O13', 'O14']), (2.54, ['O15', 'O16', 'O17'])]
    for y0, ids in rows:
        widths = [PANEL_DEFS[i]['w'] for i in ids]
        total = sum(widths) + 0.01 * (len(ids) - 1)
        x = -total / 2
        z = 4.02 + (3.38 - y0) * 0.2
        for pid, wd in zip(ids, widths):
            # パネルの上＝後ろ（見上げた人の上）、表＝下で少し後ろ向き。原点は前の左の角
            M = frame((x, y0, z), (1, 0, 0), (0, -1, 0.2))
            place_panel(pid, M, back=0.12)
            x += wd + 0.01
    # 左右の壁のパネル（席の横）：壁ぎわの台。上は机のように傾けた L1/R1・L3/R3、下は立てた L2/R2・L4/R4
    for side in (-1, 1):
        pre = 'L' if side < 0 else 'R'
        box(surf('room', 'console'), (0.30, 1.05, 1.02), T(side * 1.45, 2.92, FD_Z + 0.51), bevel=0.02)
        xw = side * 1.30
        for pid, y0, z0, tilt in ((f'{pre}1', 2.42, FD_Z + 0.72, 0.85), (f'{pre}2', 2.42, FD_Z + 0.22, 0.05), (f'{pre}3', 2.97, FD_Z + 0.72, 0.85), (f'{pre}4', 2.97, FD_Z + 0.32, 0.05)):
            p = PANEL_DEFS[pid]
            up = Vector((side * math.sin(tilt), 0, math.cos(tilt)))
            if side < 0:
                M = frame((xw, y0, z0), (0, 1, 0), up)
            else:
                M = frame((xw, y0 + p['w'], z0), (0, -1, 0), up)
            place_panel(pid, M, back=0.06)


def build_seats():
    """船長・操縦士の席（別の部品）と、後ろの 2 席"""
    for name, x, y, big in (('seat_cdr', -SEAT_X, SEAT_Y, True), ('seat_plt', SEAT_X, SEAT_Y, True), ('seat_ms1', 0.74, 1.95, False), ('seat_ms2', -0.05, 2.0, False)):
        fr = surf(name, 'seat_frame')
        cu = surf(name, 'cushion')
        dd = acc(name)
        M = T(x, y, FD_Z)
        # 台とレール
        box(fr, (0.40, 0.55, 0.06), M @ T(0, 0.2, 0.03), bevel=0.01)
        box(fr, (0.30, 0.30, SEAT_Z - FD_Z - 0.1), M @ T(0, 0.25, (SEAT_Z - FD_Z) / 2), bevel=0.02)
        # 座面
        box(fr, (0.48, 0.50, 0.05), M @ T(0, 0.27, SEAT_Z - FD_Z), bevel=0.015)
        box(cu, (0.44, 0.46, 0.06), M @ T(0, 0.28, SEAT_Z - FD_Z + 0.055), bevel=0.025, seg=2)
        # 背もたれ（少し後ろへ）：細い枠（両わきの管と横の棒）に、2 つに分かれた背のクッションと、柱で浮かせた頭あて。
        # 写真（sts061-53-010）の席は、黒い枠の間から後ろが見えるくらい細い
        B = M @ T(0, 0.0, SEAT_Z - FD_Z + 0.05) @ rot_x(0.18)
        bh = 0.66 if big else 0.56
        for sx in (-1, 1):
            tube(fr, [B @ Vector((sx * 0.215, -0.04, -0.04)), B @ Vector((sx * 0.215, -0.04, bh * 0.5)), B @ Vector((sx * 0.20, -0.04, bh))], 0.018, seg=8)
        box(fr, (0.46, 0.03, 0.04), B @ T(0, -0.04, bh), bevel=0.01)
        box(fr, (0.46, 0.03, 0.05), B @ T(0, -0.04, 0.02), bevel=0.01)
        box(cu, (0.38, 0.06, bh * 0.42), B @ T(0, 0.0, bh * 0.25), bevel=0.025, seg=2)
        box(cu, (0.38, 0.06, bh * 0.44), B @ T(0, 0.0, bh * 0.73), bevel=0.025, seg=2)
        if big:
            for sx in (-1, 1):
                tube(fr, [B @ Vector((sx * 0.08, -0.035, bh - 0.01)), B @ Vector((sx * 0.08, -0.035, bh + 0.11))], 0.012, seg=6)
            box(cu, (0.24, 0.07, 0.15), B @ T(0, 0.0, bh + 0.17), bevel=0.03, seg=2)
            box(fr, (0.26, 0.02, 0.15), B @ T(0, -0.04, bh + 0.17), bevel=0.01)
        # ひじ掛け
        for s in (-1, 1):
            box(fr, (0.05, 0.36, 0.04), M @ T(s * 0.30, 0.30, SEAT_Z - FD_Z + 0.22), bevel=0.01)
            box(fr, (0.04, 0.04, 0.2), M @ T(s * 0.30, 0.14, SEAT_Z - FD_Z + 0.12))
        # 肩と腰のベルト（オレンジがかった帯）と金具
        if STAGE >= 2:
            for s in (-1, 1):
                tube(dd, [B @ Vector((s * 0.14, 0.08, bh - 0.08)), B @ Vector((s * 0.12, 0.14, bh * 0.55)), M @ Vector((s * 0.03, 0.48, SEAT_Z - FD_Z + 0.16)), M @ Vector((s * 0.02, 0.52, SEAT_Z - FD_Z + 0.1))], 0.016, seg=4, uv='belt')
                tube(dd, [M @ Vector((s * 0.27, 0.12, SEAT_Z - FD_Z + 0.1)), M @ Vector((s * 0.18, 0.42, SEAT_Z - FD_Z + 0.2)), M @ Vector((0, 0.5, SEAT_Z - FD_Z + 0.17))], 0.016, seg=4, uv='belt')
            box(dd, (0.08, 0.03, 0.08), M @ T(0, 0.52, SEAT_Z - FD_Z + 0.16), uv='metal')
        HOTS[name] = M @ Vector((0, 0.3, SEAT_Z - FD_Z))


def build_controls():
    """握り（焼かない部品。原点が支点）：船長・操縦士の回転の握り（RHC）、船長の並進（THC）、速度ブレーキのレバー、アームの 2 本"""
    for name, x, y, z in (('rhc_cdr', -SEAT_X, 3.18, FD_Z + 0.50), ('rhc_plt', SEAT_X, 3.18, FD_Z + 0.50)):
        a = surf(name, 'seat_frame')
        box(a, (0.10, 0.10, 0.06), T(x, y, z - 0.04), bevel=0.01)  # 付け根の箱（ひざの間の台の上）
        g = acc(name)
        cyl(g, 0.018, 0.016, 0.10, T(x, y, z), seg=10, uv='dark')
        box(g, (0.05, 0.06, 0.12), T(x, y + 0.01, z + 0.15) @ rot_x(0.25), bevel=0.015, uv='black')
        box(g, (0.012, 0.02, 0.025), T(x, y + 0.04, z + 0.22), uv='red')
        PIVOTS[name] = Vector((x, y, z))
    # 速度ブレーキ・推力のレバー（船長の左の壁）
    name = 'lever_sbtc'
    a = acc(name)
    x, y, z = -1.22, 3.05, FD_Z + 0.82
    box(a, (0.03, 0.04, 0.20), T(x, y, z + 0.10), uv='dark')
    box(a, (0.06, 0.05, 0.05), T(x, y, z + 0.22), bevel=0.01, uv='black')
    PIVOTS[name] = Vector((x, y, z))
    # 並進の握り（船長の左前、計器板の下）
    name = 'thc_cdr'
    a = acc(name)
    x, y, z = -1.10, 3.38, FD_Z + 0.78
    box(a, (0.05, 0.05, 0.07), T(x, y, z + 0.035), bevel=0.012, uv='black')
    PIVOTS[name] = Vector((x, y, z))
    # 後ろの台のアームの握り（左：並進、右：回転）
    for name, x in (('rms_thc', -0.14), ('rms_rhc', 0.86)):
        b = surf('room', 'structure')
        box(b, (0.14, 0.20, 0.05), T(x, 0.14, 3.04), bevel=0.01)
        g = acc(name)
        z = 3.08
        cyl(g, 0.016, 0.014, 0.07, T(x, 0.22, z), seg=10, uv='dark')
        if name == 'rms_rhc':
            box(g, (0.05, 0.06, 0.13), T(x, 0.23, z + 0.13) @ rot_x(0.2), bevel=0.015, uv='black')
        else:
            box(g, (0.07, 0.07, 0.06), T(x, 0.22, z + 0.10), bevel=0.02, uv='black')
        PIVOTS[name] = Vector((x, 0.22, z))


def build_aft():
    """後ろのフライトデッキ：アームの台（A 群）、左右の壁、天井の明かり"""
    y = 0.0
    face = lambda x0, z0: T(x0, y + 0.002, z0) @ rot_z(PI)  # 後ろの壁：表は +Y
    def aft(pid, xl, zb):
        # 後ろの壁のパネル：表（−y ローカル）を +Y へ向ける → 原点を左下に合わせる
        p = PANEL_DEFS[pid]
        M = T(xl + p['w'], 0.03, zb) @ rot_z(PI)
        place_panel(pid, M)
    # 窓の高さ：Z 3.58〜3.86。上の段・真ん中の段（アームの台）・下の段で壁いっぱい
    aft('A2', -1.55, 3.52)
    aft('A1', -1.18, 3.52)
    aft('A4', -0.15, 3.47)
    aft('A3', 0.66, 3.52)
    aft('A5', 1.20, 3.52)
    aft('A7', -1.55, 3.08)
    aft('A6', -1.00, 3.12)
    aft('A8', 0.06, 3.06)
    aft('A9', 1.02, 3.08)
    for pid, xl in (('A11', -1.55), ('A12', -1.10), ('A13', -0.65), ('A10', -0.20), ('A14', 0.25), ('A15', 0.70), ('A16', 1.15)):
        aft(pid, xl, 2.63)
    s = surf('room', 'console')
    # 台の下の物入れと足置き
    box(s, (3.3, 0.30, 0.40), T(0, 0.15, FD_Z + 0.20), bevel=0.02)
    box(surf('room', 'structure'), (1.2, 0.30, 0.04), T(0.2, 0.55, FD_Z + 0.05), bevel=0.01)
    # 窓のまわりの黒い枠
    for x, z in AFT_WIN:
        b = surf('room', 'black')
        w, h = AFT_WIN_SIZE
        for sx, sz, ww, hh in ((0, h / 2 + 0.03, w + 0.12, 0.06), (0, -h / 2 - 0.03, w + 0.12, 0.06), (w / 2 + 0.03, 0, 0.06, h), (-w / 2 - 0.03, 0, 0.06, h)):
            box(b, (ww, 0.06, hh), T(x + sx, 0.03, z + sz), bevel=0.01)
    # 左右の壁（L9〜L12・R10〜R14）
    for side, ids in ((-1, ['L9', 'L10', 'L11', 'L12']), (1, ['R10', 'R11', 'R12', 'R13'])):
        for i, pid in enumerate(ids):
            p = PANEL_DEFS[pid]
            col, row = i % 2, i // 2
            y0 = 0.22 + col * 0.50
            z0 = 2.62 + row * 0.46
            if side < 0:
                M = frame((-FD_HW + 0.05, y0, z0), (0, 1, 0), (0, 0, 1))
            else:
                M = frame((FD_HW - 0.05, y0 + p['w'], z0), (0, -1, 0), (0, 0, 1))
            place_panel(pid, M)
        box(surf('room', 'console'), (0.08, 1.05, 0.95), T(side * (FD_HW - 0.01), 0.72, 3.07))
    # 天井の窓の黒い枠と、天井の明かり（白い四角）
    for x, y0 in TOP_WIN:
        b = surf('room', 'black')
        for dx, dy, ww, hh in ((0, 0.29, 0.63, 0.07), (0, -0.29, 0.63, 0.07), (0.29, 0, 0.07, 0.51), (-0.29, 0, 0.07, 0.51)):
            box(b, (ww, hh, 0.08), T(x + dx, y0 + dy, FD_TOP - 0.02), bevel=0.01)
    d = acc('room_detail')
    for x, y0 in ((-1.0, 0.75), (1.0, 0.75), (0.0, 0.55), (-1.0, 1.85), (1.0, 1.85)):
        box(d, (0.42, 0.14, 0.02), T(x, y0, FD_TOP - 0.06), uv='lamp')
        d.anchors.append((d.nfaces() - 6, d.nfaces(), Vector((x, y0, FD_TOP - 0.08))))


def build_frames_fd():
    """前の窓の黒い枠（窓の穴のまわり）"""
    b = surf('room', 'black')
    for name, c, n, w, h, up in WINDOWS[:6]:
        r = up.cross(n)
        # 窓の面の少し内側に、4 本の枠
        for dx, dz, ww, hh in ((0, h / 2 + 0.035, w + 0.14, 0.07), (0, -h / 2 - 0.035, w + 0.14, 0.07), (w / 2 + 0.035, 0, 0.07, h), (-w / 2 - 0.035, 0, 0.07, h)):
            M = frame(c - n * 0.02 + r * dx + up * dz, r, up)
            box(b, (ww, 0.08, hh), M, bevel=0.01)


# ---- ミッドデッキ ------------------------------------------------------------------------
LOCKER_IDS = []


def locker_door(group, M, w, h, label):
    """ロッカーの扉 1 枚：表の絵（白い扉・番号・マジックテープ）と、取っ手の 2 つの留め金"""
    a = acc(group)
    box(a, (w, 0.04, h), M @ T(0, 0.02, 0), uv='white')
    if STAGE < 2:
        return
    rnd = random.Random(label)

    def painter(ppm, label=label, rnd_seed=rnd.random()):
        from PIL import ImageDraw
        r = random.Random(rnd_seed)
        W, H = max(8, int(w * ppm)), max(8, int(h * ppm))
        im = Image.new('RGB', (W, H), (222, 220, 212))
        d = ImageDraw.Draw(im)
        gl = Image.new('L', (W, H), 0)
        for _ in range(40):
            x, y = r.uniform(0, W), r.uniform(0, H)
            rr = r.uniform(0.01, 0.06) * ppm
            c = tuple(max(0, min(255, v + r.randint(-5, 2))) for v in (222, 220, 212))
            d.ellipse((x - rr, y - rr, x + rr, y + rr), fill=c)
        d.rectangle((0, 0, W - 1, H - 1), outline=(160, 158, 150), width=max(2, int(0.005 * ppm)))
        SP.text(im, d, label, W * 0.5, H * 0.18, 0.018 * ppm, fill=(40, 40, 44))
        # マジックテープの四角（青・白・黒）
        for _ in range(r.randint(1, 4)):
            x, y = r.uniform(0.15, 0.85) * W, r.uniform(0.35, 0.85) * H
            s = r.uniform(0.02, 0.035) * ppm
            col = r.choice(((77, 111, 168), (77, 111, 168), (214, 212, 204), (40, 42, 45)))
            d.rectangle((x - s, y - s, x + s, y + s), fill=col)
        return im, gl
    req = ATL.request('lk_' + label, w, h, painter, scale=0.5)
    LOCKER_IDS.append((group, M, w, h, req))
    d = acc(group + '_detail')
    for sx in (-w * 0.32, w * 0.32):
        st = d.nfaces()
        box(d, (0.05, 0.016, 0.03), M @ T(sx, -0.008, -h * 0.05), uv='metal')
        d.anchors.append((st, d.nfaces(), (M @ T(sx, 0, 0)).translation.copy()))


def build_locker_faces():
    for group, M, w, h, req in LOCKER_IDS:
        Mf = M @ T(0, -0.0005, 0)
        quad(acc(group), w, h, Mf, uv=rect_uv(req[5], w, h, Mf))


def build_middeck():
    # 前のロッカーの壁：6 列 × 6 段（42 個の箱のうち見える所）
    cols, rows = 6, 6
    lw, lh = 0.47, 0.29
    gap = 0.012
    x0 = -(cols * lw + (cols - 1) * gap) / 2
    for c in range(cols):
        for r in range(rows):
            x = x0 + c * (lw + gap) + lw / 2
            z = 0.22 + r * (lh + gap) + lh / 2
            label = f'MF{14 + c * 14 + (c > 2) * 6}{"ABCDEFGHJKLMNOP"[r * 2 + (c % 2)]}'
            locker_door('room', T(x, MD_LOCK - 0.042, z), lw, lh, label)
    # ロッカーの壁の枠
    box(surf('room', 'structure'), (3.6, 0.06, 0.08), T(0, MD_LOCK - 0.01, 0.17))
    box(surf('room', 'structure'), (3.6, 0.06, 0.08), T(0, MD_LOCK - 0.01, 0.22 + rows * (lh + gap) + 0.03))
    # エアロック（縦の円筒）と D 字のハッチ
    al = surf('room', 'airlock')
    cx, cy = AIRLOCK_C
    cyl(al, AIRLOCK_R + AIRLOCK_WALL, AIRLOCK_R + AIRLOCK_WALL, MD_H, T(cx, cy, 0), seg=40, cap=False)
    for z in (0.35, 1.05, 1.75):
        cyl(surf('room', 'structure'), AIRLOCK_R + AIRLOCK_WALL + 0.02, AIRLOCK_R + AIRLOCK_WALL + 0.02, 0.05, T(cx, cy, z), seg=40, cap=False)
    # ハッチ（別の部品）：D 字（下が平ら）を円＋箱で近似
    h = acc('hatch_airlock')
    hy = cy + AIRLOCK_R + AIRLOCK_WALL + 0.01
    HM = T(0, hy, 0.98)
    cyl(h, 0.51, 0.51, 0.06, HM @ rot_x(-PI / 2), seg=32, uv='cream')
    box(h, (0.91, 0.05, 0.40), HM @ T(0, 0.024, -0.28), uv='cream')
    box(h, (0.30, 0.05, 0.06), HM @ T(0, 0.07, 0.1), bevel=0.01, uv='metal')  # 取っ手
    cyl(h, 0.055, 0.055, 0.03, HM @ T(0, 0.07, 0.30) @ rot_x(-PI / 2), seg=16, uv='black')  # 小さな窓
    PIVOTS['hatch_airlock'] = Vector((0.45, hy, 0.98))
    # トイレ（左うしろ）
    w = surf('room', 'wcs')
    box(w, (0.86, 0.95, 2.04), T(-MD_HW + 0.45, 0.48, 1.03), bevel=0.03)
    cl = surf('room', 'cloth_w')
    box(cl, (0.86, 0.03, 1.7), T(-MD_HW + 0.45, 0.97, 1.05), bevel=0.01)  # カーテン
    # 電子機器の棚 3A（右うしろ）とその遮断器パネル
    box(surf('room', 'console'), (0.86, 1.05, 2.04), T(MD_HW - 0.45, 0.52, 1.03), bevel=0.02)
    for i, z in enumerate((0.25, 0.56, 0.87)):
        locker_door('room', T(MD_HW - 0.45, 1.052, z + 0.14) @ rot_z(PI), 0.47, 0.28, f'MA16{"FGH"[i]}')
    place_panel('MA73C', T(MD_HW - 0.45 + 0.23, 1.06, 1.32) @ rot_z(PI))
    # 台所（ギャレー）：左の壁、ハッチの前
    g = surf('room', 'galley')
    box(g, (0.50, 0.58, 1.52), T(-MD_HW + 0.25, 3.10, 1.05), bevel=0.02)
    if STAGE >= 2:
        d = acc('room_detail')
        st = d.nfaces()
        for i in range(4):  # 水の出口・オーブンの扉
            box(d, (0.03, 0.12, 0.10), T(-MD_HW + 0.51, 2.92 + i * 0.13, 1.35), uv='dark')
        box(d, (0.02, 0.40, 0.30), T(-MD_HW + 0.51, 3.10, 0.75), uv='lgray')
        box(d, (0.02, 0.40, 0.18), T(-MD_HW + 0.51, 3.10, 1.62), uv='dark')
        d.anchors.append((st, d.nfaces(), Vector((-MD_HW + 0.5, 3.10, 1.1))))
    # 横のハッチ（別の部品）：丸い扉と窓の縁
    h = acc('hatch_side')
    HM = T(*SIDE_HATCH) @ Matrix.Rotation(PI / 2, 4, 'Y')  # ローカル z ＝ +X（部屋の中へ）
    ring(h, 0.15, SIDE_HATCH_R, 0.07, HM, seg=40, uv='cream')
    ring(h, 0.125, 0.17, 0.10, HM, seg=24, uv='black')
    box(h, (0.08, 0.36, 0.05), T(SIDE_HATCH.x + 0.03, SIDE_HATCH.y, SIDE_HATCH.z - 0.32), bevel=0.01, uv='metal')
    # 窓の穴の部分だけ開ける：ハッチの円板の中の窓は、ガラスの部品（glass_w11）でふさぐ
    PIVOTS['hatch_side'] = SIDE_HATCH.copy()
    # はしご（左の穴の前のふち）
    lad = surf('room', 'metal')
    for sx in (-0.18, 0.18):
        box(lad, (0.035, 0.035, MD_H + 0.1), T(-1.22 + sx, 1.78, MD_H / 2 + 0.05))
    for i in range(6):
        box(lad, (0.36, 0.03, 0.025), T(-1.22, 1.78, 0.25 + i * 0.33))
    # 寝ぶくろ（右の壁に 3 つ・前のロッカーに 1 つ）
    for i, (y, mat) in enumerate(((1.55, 'bag_g'), (2.25, 'bag_b'), (2.95, 'bag_g'))):
        b = surf('room', mat)
        box(b, (0.16, 0.60, 1.75), T(MD_HW - 0.10, y, 1.02), bevel=0.07, seg=3)
        box(b, (0.13, 0.36, 0.22), T(MD_HW - 0.11, y, 1.75), bevel=0.06, seg=3)  # 頭の所
        if STAGE >= 2:
            d = acc('room_detail')
            st = d.nfaces()
            for z in (0.5, 1.1, 1.5):  # 体を押さえる帯
                box(d, (0.17, 0.62, 0.05), T(MD_HW - 0.10, y, z), uv='strap')
            d.anchors.append((st, d.nfaces(), Vector((MD_HW, y, 1.0))))
    HOTS['bag'] = Vector((MD_HW - 0.62, 2.25, 1.05))
    b = surf('room', 'bag_b')
    box(b, (0.58, 0.14, 1.45), T(1.18, MD_LOCK - 0.10, 1.12), bevel=0.06, seg=3)
    # 天井の明かり（3 つ）と遮断器パネル
    d = acc('room_detail')
    for x, y in ((-0.9, 2.55), (0.9, 2.55), (0.0, 2.15)):
        box(d, (0.60, 0.16, 0.03), T(x, y, MD_H - 0.02), uv='lamp')
        d.anchors.append((d.nfaces() - 6, d.nfaces(), Vector((x, y, MD_H))))
    for pid, x in (('MO13Q', -0.25), ('MO51F', 0.27)):
        p = PANEL_DEFS[pid]
        place_panel(pid, frame((x - p['w'] / 2, 3.30, MD_H - 0.035), (1, 0, 0), (0, -1, 0)))
    for pid, y0, z0 in (('ML31C', 1.08, 1.50), ('ML86B', 1.08, 1.02)):
        p = PANEL_DEFS[pid]
        if y0 + p['w'] > SIDE_HATCH.y - SIDE_HATCH_R - 0.02:
            pass
        place_panel(pid, frame((-MD_HW + 0.035, y0, z0), (0, 1, 0), (0, 0, 1)))
    # 床の足止め・壁の手すり
    hr = surf('room', 'metal')
    for pts in (((-0.6, 3.36, 2.0), (0.6, 3.36, 2.0)), ((MD_HW - 0.04, 1.2, 1.95), (MD_HW - 0.04, 3.2, 1.95)), ((-MD_HW + 0.04, 2.85, 1.0), (-MD_HW + 0.04, 2.85, 1.0))):
        if pts[0] == pts[1]:
            continue
        tube(hr, [Vector(p) for p in pts], 0.014, seg=6)
    HOTS['hole'] = Vector((-1.22, 1.35, FD_Z))


def build_clutter():
    """散らかり：マジックテープ、荷物の袋、ネット、ケーブル、空気のダクト（作るのは関数、置き場所は乱数で決める）"""
    if STAGE < 2:
        return
    rnd = random.Random(61)
    d = acc('room_detail')
    # マジックテープ：壁と天井のあちこち（殻の面に貼る）
    spots = []
    for _ in range(70):
        side = rnd.random()
        if side < 0.35:  # ミッドデッキの壁
            s = rnd.choice((-1, 1))
            p = Vector((s * (MD_HW - 0.001), rnd.uniform(1.2, 3.3), rnd.uniform(0.3, 1.9)))
            n = Vector((-s, 0, 0))
        elif side < 0.55:  # ミッドデッキの天井
            p = Vector((rnd.uniform(-1.4, 1.4), rnd.uniform(1.9, 3.3), MD_H - 0.001))
            n = Vector((0, 0, -1))
        elif side < 0.8:  # フライトデッキの白い天井
            p = Vector((rnd.uniform(-1.2, 1.2), rnd.uniform(0.2, 2.2), FD_TOP - 0.001))
            n = Vector((0, 0, -1))
        else:  # 後ろの壁の上
            p = Vector((rnd.uniform(-1.6, 1.6), 0.001, rnd.uniform(3.95, 4.2)))
            n = Vector((0, 1, 0))
        if abs(p.x) < 0.75 and abs(p.y - 1.25) < 0.4 and p.z > 4:
            continue
        s = rnd.uniform(0.03, 0.06)
        col = rnd.choice(('velcro', 'velcro', 'velcro', 'velcro_w'))
        up = Vector((0, 0, 1)) if abs(n.z) < 0.5 else Vector((0, 1, 0))
        M = frame(p + n * 0.003, up.cross(n) * -1 if False else n.cross(up), up)
        st = d.nfaces()
        box(d, (s, 0.006, s * rnd.uniform(0.6, 1.4)), M, uv=col)
        d.anchors.append((st, d.nfaces(), p.copy()))
    # 荷物の袋（布の袋がロッカーや壁に）
    for p, sz, mat in (((-0.9, 3.18, 0.55), (0.42, 0.30, 0.34), 'cloth'), ((1.1, 3.22, 1.95), (0.5, 0.25, 0.22), 'cloth'), ((-1.55, 1.5, 0.35), (0.35, 0.5, 0.4), 'cloth_w'),
                       ((1.45, 0.25, 3.95), (0.35, 0.25, 0.30), 'cloth'), ((-1.45, 0.3, 4.05), (0.3, 0.22, 0.25), 'cloth_w')):
        box(surf('room', mat), sz, T(*p), bevel=0.08, seg=3)
    # ケーブル（垂れた線）
    for a, b in (((-1.70, 0.30, 3.95), (-1.30, 0.06, 3.50)), ((1.60, 0.50, 3.80), (1.20, 0.07, 3.30)), ((0.35, 0.07, 3.45), (0.75, 0.40, 2.95)),
                 ((-0.75, 3.38, 1.95), (-0.20, 3.38, 1.20)), ((1.75, 1.30, 0.30), (1.75, 2.80, 0.25))):
        a, b = Vector(a), Vector(b)
        mid = (a + b) / 2 + Vector((0, 0.08, -0.12))
        pts = [a, a.lerp(mid, 0.5) , mid, mid.lerp(b, 0.5), b]
        st = d.nfaces()
        tube(d, pts, 0.006, seg=5, uv=rnd.choice(('cable', 'cable_k')))
        d.anchors.append((st, d.nfaces(), a.copy()))
    # 空気のダクト（ミッドデッキの天井ぎわの白い管）
    duct = surf('room', 'cloth_w')
    tube(duct, [Vector((-1.55, 0.95, 1.96)), Vector((-1.55, 1.6, 1.98)), Vector((-1.2, 2.4, 2.0)), Vector((-0.8, 3.0, 1.98))], 0.06, seg=10)
    tube(duct, [Vector((1.55, 1.2, 0.12)), Vector((1.2, 2.0, 0.10)), Vector((0.6, 3.1, 0.1))], 0.05, seg=10)
    # ネット（ロッカーの前の荷物押さえ）：細い格子
    net = acc('room_detail')
    st = net.nfaces()
    x0, x1, z0, z1, y = -1.55, -0.65, 1.30, 1.92, MD_LOCK - 0.12
    for i in range(7):
        x = x0 + (x1 - x0) * i / 6
        box(net, (0.004, 0.004, z1 - z0), T(x, y, (z0 + z1) / 2), uv='strap')
    for i in range(5):
        z = z0 + (z1 - z0) * i / 4
        box(net, (x1 - x0, 0.004, 0.004), T((x0 + x1) / 2, y, z), uv='strap')
    net.anchors.append((st, net.nfaces(), Vector(((x0 + x1) / 2, MD_LOCK, (z0 + z1) / 2))))


def build_glass_and_floats():
    """窓のガラス（焼かない）と、浮いている物"""
    g = acc('glass')
    for name, c, n, w, h, up in WINDOWS:
        r = up.cross(n)
        M = frame(c + n * 0.06, r, up)
        quad(g, w, h, M, uv='glass')
    quad(g, 0.25, 0.25, frame(SIDE_HATCH + Vector((-0.06, 0, 0)), (0, 1, 0), (0, 0, 1)), uv='glass')
    # 浮いている物：ペン・手順カード・食べ物の袋
    f = acc('float_pen')
    cyl(f, 0.0045, 0.0045, 0.14, rot_x(PI / 2) @ T(0, 0, -0.07), seg=8, uv='pen')
    FLOATS['float_pen'] = Vector((0.3, 1.55, 3.25))
    f = acc('float_card')
    box(f, (0.15, 0.003, 0.21), Matrix(), uv='paper')
    FLOATS['float_card'] = Vector((-0.4, 2.6, 1.25))
    f = acc('float_pouch')
    box(f, (0.11, 0.035, 0.15), Matrix(), bevel=0.012, seg=2, uv='pouch')
    box(f, (0.02, 0.02, 0.03), T(0, 0, 0.09), uv='orange')
    FLOATS['float_pouch'] = Vector((0.6, 2.0, 1.05))


HOTS = {}
PIVOTS = {}
FLOATS = {}


# ==== 仕上げ ==============================================================================
def make_objects():
    """ためた形を Blender の物に。surf は素材 1 つずつ、fixed はグループごと"""
    objs = []
    for key, a in ACCS.items():
        if not a.bm.faces:
            continue
        ob = mesh_obj(a.name, a.bm)
        ob['group'] = a.group
        ob['kind'] = a.kind
        if a.kind == 'surf':
            ob.data.materials.append(MATS[a.mat])
        else:
            ob.data.materials.append(MATS.setdefault('fixed', bpy.data.materials.new('fixed')))
        ob['anchors'] = json.dumps([(s, e, list(p)) for s, e, p in a.anchors])
        objs.append(ob)
    return objs


def select(objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


def unwrap(objs, layer, angle=66, margin=0.002, region=None):
    """objs の layer を smart project → 1 枚に並べる。region=(u0, v0, u1, v1) へ縮めて入れる"""
    for o in objs:
        me = o.data
        if layer not in me.uv_layers:
            me.uv_layers.new(name=layer)
        me.uv_layers.active = me.uv_layers[layer]
    select(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')
    if region:
        u0, v0, u1, v1 = region
        for o in objs:
            uv = o.data.uv_layers[layer].data
            arr = np.empty(len(uv) * 2, dtype=np.float32)
            uv.foreach_get('uv', arr)
            arr = arr.reshape(-1, 2)
            arr[:, 0] = u0 + arr[:, 0] * (u1 - u0)
            arr[:, 1] = v0 + arr[:, 1] * (v1 - v0)
            uv.foreach_set('uv', arr.ravel())


def join(objs, name):
    select(objs)
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob


def bake_image(name, size, alpha=False):
    img = bpy.data.images.new(name, size, size, alpha=alpha, float_buffer=True)
    return img


def set_bake_target(objs, img, layer):
    for o in objs:
        o.data.uv_layers.active = o.data.uv_layers[layer]
        for slot in o.material_slots:
            if slot.material is None:
                continue
            nt = slot.material.node_tree
            node = nt.nodes.get('bake_target') or nt.nodes.new('ShaderNodeTexImage')
            node.name = 'bake_target'
            node.image = img
            nt.nodes.active = node


def bake_colors(surf_objs, region):
    """模様の面（surf）の色を、アトラスの下の段へ焼く（Emission をそのまま写す）"""
    sc = bpy.context.scene
    img = bake_image('surf_color', ATLAS, alpha=True)
    img.pixels.foreach_set(np.zeros(ATLAS * ATLAS * 4, dtype=np.float32))
    set_bake_target(surf_objs, img, 'UVMap')
    sc.cycles.samples = 1
    sc.render.bake.margin = 3
    sc.render.bake.margin_type = 'EXTEND'
    sc.render.bake.use_clear = False
    select(surf_objs)
    t = time.time()
    bpy.ops.object.bake(type='EMIT', use_clear=False, margin=3)
    print(f'color bake {time.time() - t:.0f}s')
    px = np.empty(ATLAS * ATLAS * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(ATLAS, ATLAS, 4)[::-1]  # 上が 0 の行に


def to_srgb8(x):
    x = np.clip(x, 0, 1)
    return (np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055) * 255 + 0.5).astype(np.uint8)


# ---- 光 ----------------------------------------------------------------------------------
def add_light(name, kind, loc, energy, color=(1, 1, 1), size=0.3, rot=(0, 0, 0), size_y=None, angle=None):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    if kind == 'AREA':
        if size_y:
            ld.shape = 'RECTANGLE'
            ld.size, ld.size_y = size, size_y
        else:
            ld.size = size
    if kind == 'SUN' and angle is not None:
        ld.angle = angle
    if kind in ('POINT', 'SPOT'):
        ld.shadow_soft_size = size
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    ob.rotation_euler = rot
    bpy.context.collection.objects.link(ob)
    ob['light_set'] = 1
    return ob


def lights(mode):
    """mode：'day'（軌道の昼：日光・地球の光＋室内灯）、'dark'（暗い操縦室：室内灯を落とし、画面の光）"""
    for o in [o for o in bpy.data.objects if o.get('light_set')]:
        bpy.data.objects.remove(o, do_unlink=True)
    warm = (1.0, 0.92, 0.80)
    k = 1.0 if mode == 'day' else 0.07
    # フライトデッキの室内灯：ひさしの下（計器板を照らす）、天井（後ろ）、後ろの台の上
    for x in (-0.66, 0.0, 0.66):
        add_light('glare', 'AREA', (x, 3.46, FD_Z + 0.94), 7 * k, warm, size=0.3, size_y=0.04, rot=(math.radians(20), 0, 0))
    for x, y in ((-1.0, 0.75), (1.0, 0.75), (0.0, 0.55), (-1.0, 1.85), (1.0, 1.85)):
        add_light('fd_flood', 'AREA', (x, y, FD_TOP - 0.09), 26 * k, warm, size=0.42, size_y=0.14)
    add_light('fd_fwd', 'AREA', (0, 2.6, 4.0), 14 * k, warm, size=1.0, size_y=0.3)
    # ミッドデッキ：天井の蛍光灯 3 つ
    for x, y in ((-0.9, 2.55), (0.9, 2.55), (0.0, 2.15)):
        add_light('md_flood', 'AREA', (x, y, MD_H - 0.05), 40 * k, (1.0, 0.97, 0.9), size=0.6, size_y=0.16)
    add_light('md_low', 'AREA', (0, 2.0, 1.0), 6 * k, (1.0, 0.97, 0.9), size=1.5, rot=(PI, 0, 0))
    if mode == 'day':
        # 日光（前と天井の窓から差しこむ）と、地球の照り返し（荷物室側＝上から、青白く）、荷物室の白い照り返し
        add_light('sun', 'SUN', (0, 0, 10), 5.0, (1.0, 0.97, 0.92), rot=(-SUN_DIR).to_track_quat('Z', 'Y').to_euler(), angle=math.radians(0.6))
        add_light('earth', 'AREA', (0, 2.0, 9.0), 9000, (0.55, 0.72, 1.0), size=14.0)
        add_light('earth_fwd', 'AREA', (0, 9.0, 6.0), 5000, (0.55, 0.72, 1.0), size=10.0, rot=(math.radians(-70), 0, 0))
        add_light('bay', 'AREA', (0, -3.0, 4.2), 900, (0.95, 0.95, 1.0), size=4.0, rot=(math.radians(90), 0, 0))
        add_light('side', 'AREA', (-4.0, 2.2, 1.05), 300, (0.6, 0.75, 1.0), size=2.0, rot=(0, math.radians(-90), 0))
    else:
        # 夜：窓の外はかすかな地球の夜の光だけ。横のハッチの窓から少し
        add_light('earth_night', 'AREA', (0, 2.0, 9.0), 160, (0.35, 0.45, 0.8), size=14.0)
        add_light('side', 'AREA', (-4.0, 2.2, 1.05), 40, (0.4, 0.55, 0.9), size=2.0, rot=(0, math.radians(-90), 0))


def screen_material(kind, mode):
    name = f'emit_{kind}_{mode}'
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (0.01, 0.01, 0.01, 1)
    if kind == 'screen':
        p.inputs['Emission Color'].default_value = (0.25, 0.9, 0.45, 1)
        p.inputs['Emission Strength'].default_value = 1.2 if mode == 'dark' else 0.6
    elif kind == 'lamp':
        p.inputs['Emission Color'].default_value = (1, 0.95, 0.85, 1)
        p.inputs['Emission Strength'].default_value = 0.0
    return m


def preview_screen_material(kind):
    """確かめの絵だけで使う画面：CRT は緑の線と数字（アプリの screens.ts に近い絵）、姿勢球は上が白・下が黒"""
    name = 'prev_' + kind
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    if kind == 'crt':
        from PIL import ImageDraw as _D
        im = Image.new('RGB', (256, 192), (3, 10, 4))
        g = _D.Draw(im)
        g.line((8, 22, 248, 22), fill=(77, 255, 122), width=1)
        for r in range(9):
            g.text((14, 30 + r * 17), f'{r + 1:02d}   {123.4 + r * 37.7:7.1f}   {0.37 * r:5.2f}', fill=(77, 255, 122))
        g.text((14, 6), '0001/   /003/05:12:40', fill=(77, 255, 122))
        path = os.path.join(WORK, 'prev_crt.png')
        im.save(path)
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(path)
        nt.links.new(tex.outputs['Color'], em.inputs['Color'])
        em.inputs['Strength'].default_value = 1.0
    else:
        tc = nt.nodes.new('ShaderNodeTexCoord')
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(tc.outputs['Object'], sep.inputs[0])
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['From Min'].default_value = -0.002
        mr.inputs['From Max'].default_value = 0.002
        mr.inputs['To Min'].default_value = 0.02
        mr.inputs['To Max'].default_value = 0.75
        nt.links.new(sep.outputs['Z'], mr.inputs['Value'])
        nt.links.new(mr.outputs['Result'], em.inputs['Strength'])
        em.inputs['Color'].default_value = (1, 1, 1, 1)
    return m


def white_material():
    if 'lm_white' in bpy.data.materials:
        return bpy.data.materials['lm_white']
    m = bpy.data.materials.new('lm_white')
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (0.8, 0.8, 0.8, 1)
    p.inputs['Roughness'].default_value = 1.0
    p.inputs['Metallic'].default_value = 0.0
    return m


def bake_light(baked, mode):
    sc = bpy.context.scene
    lights(mode)
    img = bake_image(f'lm_{mode}', BAKE_SIZE)
    set_bake_target(baked, img, 'LM')
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = False
    sc.render.bake.use_pass_direct = True
    sc.render.bake.use_pass_indirect = True
    sc.render.bake.use_pass_color = False
    sc.render.bake.margin = 8
    sc.render.bake.margin_type = 'EXTEND'
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.name.startswith('screen_'):
            o.data.materials.clear()
            o.data.materials.append(screen_material('screen', mode))
    select(baked)
    t = time.time()
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, use_clear=True, margin=8)
    print(f'light bake {mode} {BAKE_SIZE}px x {SAMPLES} in {time.time() - t:.0f}s')
    px = np.empty(BAKE_SIZE * BAKE_SIZE * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(BAKE_SIZE, BAKE_SIZE, 4)[::-1, :, :3] / 0.8  # 白 0.8 で焼いたので、光の量へ


def soften(lm, mask):
    """焼いた光のざらつきを、島の中だけでならす（島の外の色が混ざらないよう、重みで割る）"""
    from scipy.ndimage import gaussian_filter
    m = mask.astype(np.float32)
    out = np.empty_like(lm)
    for c in range(3):
        num = gaussian_filter(lm[:, :, c] * m, 1.1)
        den = gaussian_filter(m, 1.1)
        out[:, :, c] = np.where(den > 1e-3, num / np.maximum(den, 1e-3), lm[:, :, c])
    return out


def uv_mask(objs, layer, size):
    """UV の島の画素（ならすときに使う）"""
    from PIL import ImageDraw
    im = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(im)
    for o in objs:
        me = o.data
        uv = me.uv_layers[layer].data
        for p in me.polygons:
            pts = [(uv[i].uv[0] * size, (1 - uv[i].uv[1]) * size) for i in p.loop_indices]
            d.polygon(pts, fill=255)
    return np.array(im) > 0


def anchor_details(room, details):
    """細かい部品の UV1：付け根に一番近い部屋の面の、光の地図の座標をそのまま延ばして使う"""
    dg = bpy.context.evaluated_depsgraph_get()
    me = room.data
    bvh = BVHTree.FromPolygons([v.co for v in me.vertices], [p.vertices for p in me.polygons])
    lm = me.uv_layers['LM'].data
    cache = {}

    def affine(fi):
        if fi in cache:
            return cache[fi]
        p = me.polygons[fi]
        li = list(p.loop_indices)
        best = None
        # 面の 3 頂点（いちばん面積の大きい組）
        for a_ in range(len(li)):
            i0, i1, i2 = li[0], li[a_ - 1], li[a_]
            P0, P1, P2 = (me.vertices[me.loops[i].vertex_index].co for i in (i0, i1, i2))
            area = (P1 - P0).cross(P2 - P0).length
            if best is None or area > best[0]:
                best = (area, i0, i1, i2)
        _, i0, i1, i2 = best
        P0, P1, P2 = (me.vertices[me.loops[i].vertex_index].co.copy() for i in (i0, i1, i2))
        Q0, Q1, Q2 = (Vector(lm[i].uv) for i in (i0, i1, i2))
        e1, e2 = P1 - P0, P2 - P0
        G = np.array([[e1.dot(e1), e1.dot(e2)], [e1.dot(e2), e2.dot(e2)]])
        try:
            Gi = np.linalg.inv(G)
        except np.linalg.LinAlgError:
            Gi = None
        cache[fi] = (P0, e1, e2, Gi, Q0, Q1 - Q0, Q2 - Q0)
        return cache[fi]

    for ob in details:
        dme = ob.data
        if 'LM' not in dme.uv_layers:
            dme.uv_layers.new(name='LM')
        dlm = dme.uv_layers['LM'].data
        anchors = json.loads(ob.get('anchors', '[]'))
        face_anchor = {}
        for s, e, p in anchors:
            for fi in range(s, e):
                face_anchor[fi] = p
        for poly in dme.polygons:
            p = face_anchor.get(poly.index)
            if p is None:
                p = poly.center
            hit = bvh.find_nearest(Vector(p))
            if hit[2] is None:
                continue
            P0, e1, e2, Gi, Q0, dq1, dq2 = affine(hit[2])
            if Gi is None:
                continue
            for li in poly.loop_indices:
                v = dme.vertices[dme.loops[li].vertex_index].co
                # 部品の頂点を、付け根の点の近くへ寄せる（小さな部品なので、付け根の光をそのまま）
                q = Vector(p) + (v - Vector(p)) * 0.3
                d = q - P0
                ab = Gi @ np.array([d.dot(e1), d.dot(e2)])
                uv = Q0 + dq1 * float(ab[0]) + dq2 * float(ab[1])
                dlm[li].uv = uv


def preview(sc, mode='pt'):
    """確認の絵：pt＝その場で光を計算（ブロックアウト）、baked＝焼いた色×光（アプリと同じ見え方）"""
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    bpy.context.collection.objects.link(cam)
    sc.camera = cam
    cam.data.sensor_fit = 'HORIZONTAL'
    cam.data.clip_start = 0.02
    sc.render.resolution_x, sc.render.resolution_y = int(os.environ.get('RES_X', '1280')), int(os.environ.get('RES_Y', '720'))
    sc.cycles.samples = int(os.environ.get('PREVIEW_SAMPLES', '48'))
    sc.cycles.use_denoising = True
    sc.view_settings.view_transform = 'AgX' if mode == 'pt' else 'Standard'
    out_dir = os.environ.get('PREVIEW_DIR', WORK)
    prefix = os.environ.get('PREFIX', 's0-cabin')
    views = {
        # 名前: (目, 見る所, 横の画角 度)
        'cdr': ((-0.58, 2.70, 3.42), (-0.25, 4.4, 3.35), 80),
        'fwd': ((0.0, 1.30, 3.45), (0.0, 4.0, 3.30), 84),
        'overhead': ((0.0, 2.2, 3.15), (0.0, 3.2, 4.4), 84),
        'aft': ((0.15, 2.05, 3.45), (0.10, 0.0, 3.30), 84),
        'aftwide': ((1.2, 2.3, 3.9), (-0.6, 0.0, 2.9), 92),
        'hole': ((-0.7, 2.3, 3.35), (-1.2, 1.35, 1.6), 84),
        'md_fwd': ((0.3, 1.95, 1.35), (0.0, 3.4, 1.0), 92),
        'md_aft': ((-0.2, 3.1, 1.30), (0.0, 0.0, 1.1), 88),
        'md_port': ((0.9, 2.4, 1.25), (-1.8, 2.2, 1.0), 88),
        'md_up': ((-1.0, 2.4, 0.6), (-1.2, 1.35, 2.6), 90),
        'pnl_fwd': ((0.0, 2.85, 3.38), (0.0, 3.62, 3.02), 72),
        'pnl_aft': ((0.2, 0.85, 3.4), (0.2, 0.0, 3.3), 66),
    }
    only = os.environ.get('VIEWS')
    for name, (eye, look, fov) in views.items():
        if only and name not in only.split(','):
            continue
        e, l = Vector(eye), Vector(look)
        cam.location = e
        cam.rotation_euler = (l - e).to_track_quat('-Z', 'Y').to_euler()
        cam.data.angle = math.radians(fov)
        sc.render.filepath = os.path.join(out_dir, f'{prefix}-{name}.png')
        t = time.time()
        bpy.ops.render.render(write_still=True)
        print('rendered', sc.render.filepath, f'{time.time() - t:.0f}s')


def blockout_materials(objs):
    """確認用：Emission の素材を、光を受ける Principled に置きかえる（pt の絵）"""
    for o in objs:
        for i, slot in enumerate(o.material_slots):
            m = slot.material
            if m is None:
                continue
            col = m.get('color')
            nm = m.name + '_pt'
            if nm in bpy.data.materials:
                slot.material = bpy.data.materials[nm]
                continue
            pm = bpy.data.materials.new(nm)
            pm.use_nodes = True
            pr = pm.node_tree.nodes['Principled BSDF']
            pr.inputs['Base Color'].default_value = (*lin(col), 1) if col else (0.5, 0.5, 0.5, 1)
            pr.inputs['Roughness'].default_value = 0.7
            slot.material = pm


def main():
    sc = reset()
    os.makedirs(WORK, exist_ok=True)
    make_materials()
    t0 = time.time()
    shell = build_shell()
    shell['group'] = 'room'
    shell['kind'] = 'surf'
    shell_materials(shell)
    print(f'shell {len(shell.data.polygons)} faces {time.time() - t0:.0f}s')
    build_frames_fd()
    build_forward()
    build_aft()
    build_seats()
    build_controls()
    build_middeck()
    build_clutter()
    if STAGE >= 2:
        ATL.pack()
        build_panel_faces()
        build_locker_faces()
    build_glass_and_floats()
    objs = make_objects()
    objs.append(shell)
    # 画面・姿勢球
    for name, w, h, M, kind in SCREENS:
        a = Acc(name, 'unbaked')
        if kind == 'adi':
            bm = a.bm
            bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=w)
            bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
        else:
            quad(a, w, h, M, uv=None)
            for f in a.bm.faces:
                for l, st in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
                    l[a.uv].uv = st
        ob = mesh_obj(name, a.bm)
        ob['kind'] = 'unbaked'
        ob.data.materials.append(screen_material('screen', 'day'))
    tri = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == 'MESH' for p in o.data.polygons)
    print(f'objects {len(bpy.data.objects)}, triangles ~{tri}')
    if PREVIEW and not BAKE:
        lights('day')
        blockout_materials([o for o in bpy.data.objects if o.type == 'MESH'])
        for o in bpy.data.objects:
            if o.name.startswith('glass'):
                o.hide_render = True
        preview(sc, 'pt')
        return
    if not BAKE:
        return
    bake_all(sc, objs, shell)


def bake_all(sc, objs, shell):
    os.makedirs(OUT_DIR, exist_ok=True)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    surf_objs = [o for o in meshes if o.get('kind') == 'surf']
    # 1) 色：パネルの絵を並べ、模様の面を下の段へ焼く
    rgb, glow = ATL.draw()
    v_top = 1 - (ATL.bottom + 8) / ATLAS
    unwrap(surf_objs, 'UVMap', region=(0.002, 0.002, 0.998, v_top - 0.004))
    col = bake_colors(surf_objs, None)
    a = col[:, :, 3] > 0.5
    rgb_np = np.array(rgb)
    rgb_np[a] = to_srgb8(col[:, :, :3])[a]
    glow_np = np.array(glow)
    # 光る所（グロー）は A に入れる：0.5〜1（ブラウザの「乗算済みアルファ」で色がこわれないよう、下限 0.5）
    rgba = np.dstack([rgb_np, (128 + glow_np.astype(np.int32) * 127 // 255).astype(np.uint8)])
    Image.fromarray(rgba, 'RGBA').save(os.path.join(WORK, 'atlas.png'))
    # 2) 部屋をまとめる（焼く物：グループごと）
    groups = {}
    for o in meshes:
        g = o.get('group')
        if g is None or o.get('kind') == 'unbaked' or g == 'glass' or g.startswith('float_'):
            continue
        groups.setdefault(g, []).append(o)
    baked = []
    details = []
    for g, os_ in sorted(groups.items()):
        if g.endswith('_detail'):
            continue
        for o in os_:
            o.data.materials.clear()
            o.data.materials.append(white_material())
        ob = join(os_, g) if len(os_) > 1 else os_[0]
        ob.name = g
        baked.append(ob)
    room = bpy.data.objects['room']
    for g, os_ in groups.items():
        if g.endswith('_detail'):
            for o in os_:
                o.data.materials.clear()
                o.data.materials.append(white_material())
                details.append(o)
    # 3) 光の地図の UV（焼く物みんなで 1 枚）
    t = time.time()
    unwrap(baked, 'LM', angle=60, margin=0.0015)
    print(f'lightmap uv {time.time() - t:.0f}s')
    anchor_details(room, details)
    mask = uv_mask(baked, 'LM', BAKE_SIZE)
    # 4) 光を焼く（ガラスと浮いている物は外す）
    for o in bpy.data.objects:
        if o.type == 'MESH' and (o.name.startswith('glass') or o.name.startswith('float_')):
            o.hide_render = True
    meta = {}
    for mode in ('day', 'dark'):
        lm = bake_light(baked, mode)
        lm = soften(lm, mask)
        if mode == 'day':
            # 明るさの目安：昼の光の 75% の所が、色をほぼそのまま見せる明るさ
            meta['exposure'] = 0.9 / max(1e-4, float(np.percentile(lm[mask].mean(axis=1), 75)))
        hi = float(np.percentile(lm[mask], 99.7))
        scale = max(hi, 1e-4) * 1.15
        enc = np.power(np.clip(lm / scale, 0, 1), 1 / 2.2)
        Image.fromarray((enc * 255 + 0.5).astype(np.uint8), 'RGB').save(os.path.join(WORK, f'lm_{mode}.png'))
        meta[mode] = scale
        print(mode, 'scale', scale)
    # 5) 細かい部品を部屋へまとめる
    if details:
        room = join([room] + details, 'room')
    for o in bpy.data.objects:
        if o.type == 'MESH':
            o.hide_render = False
    export(meta)
    if PREVIEW:
        baked_preview(sc, meta, os.environ.get('LIGHT', 'day'))


def baked_preview(sc, meta, mode):
    """焼いた色×光だけで描く（アプリと同じ見え方の確認）"""
    atlas = bpy.data.images.load(os.path.join(WORK, 'atlas.png'))
    lmimg = bpy.data.images.load(os.path.join(WORK, f'lm_{mode}.png'))
    lmimg.colorspace_settings.name = 'Non-Color'
    m = bpy.data.materials.new('baked_view')
    m.use_nodes = True
    nt = m.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    uv0 = nt.nodes.new('ShaderNodeUVMap')
    uv0.uv_map = 'UVMap'
    uv1 = nt.nodes.new('ShaderNodeUVMap')
    uv1.uv_map = 'LM'
    ta = nt.nodes.new('ShaderNodeTexImage')
    ta.image = atlas
    ta.interpolation = 'Linear'
    tl = nt.nodes.new('ShaderNodeTexImage')
    tl.image = lmimg
    nt.links.new(uv0.outputs[0], ta.inputs[0])
    nt.links.new(uv1.outputs[0], tl.inputs[0])
    g = nt.nodes.new('ShaderNodeGamma')
    g.inputs['Gamma'].default_value = 2.2
    nt.links.new(tl.outputs['Color'], g.inputs['Color'])
    k = meta[mode] * meta['exposure'] * (2.5 if mode == 'dark' else 1.0)
    mul = nt.nodes.new('ShaderNodeVectorMath')
    mul.operation = 'MULTIPLY'
    nt.links.new(ta.outputs['Color'], mul.inputs[0])
    nt.links.new(g.outputs['Color'], mul.inputs[1])
    sc_ = nt.nodes.new('ShaderNodeVectorMath')
    sc_.operation = 'SCALE'
    sc_.inputs['Scale'].default_value = k
    nt.links.new(mul.outputs[0], sc_.inputs[0])
    col = sc_.outputs[0]
    if mode == 'dark':
        # 刻印の光（アトラスの A：0.5〜1）
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['From Min'].default_value = 0.5
        mr.inputs['From Max'].default_value = 1.0
        mr.inputs['To Max'].default_value = 0.35
        nt.links.new(ta.outputs['Alpha'], mr.inputs['Value'])
        add = nt.nodes.new('ShaderNodeVectorMath')
        add.operation = 'MULTIPLY_ADD'
        add.inputs[1].default_value = (1.0, 0.85, 0.6)
        nt.links.new(mr.outputs['Result'], add.inputs[0])
        nt.links.new(col, add.inputs[2])
        col = add.outputs[0]
    nt.links.new(col, em.inputs['Color'])
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        if o.name == 'collider' or o.name.startswith('glass'):
            o.hide_render = True
            continue
        if o.name.startswith(('screen_', 'adi_')):
            o.data.materials.clear()
            o.data.materials.append(preview_screen_material('adi' if o.name.startswith('adi_') else 'crt'))
            if o.name.startswith('adi_'):
                # 球の中心を原点にして、上下で白黒に塗れるように
                c = sum((v.co for v in o.data.vertices), Vector()) / len(o.data.vertices)
                o.data.transform(Matrix.Translation(-c))
                o.location += c
            continue
        if 'LM' not in o.data.uv_layers:
            o.data.uv_layers.new(name='LM')
        o.data.materials.clear()
        o.data.materials.append(m)
    for o in [o for o in bpy.data.objects if o.get('light_set')]:
        bpy.data.objects.remove(o, do_unlink=True)
    sc.cycles.samples = 4
    preview(sc, 'baked')


def export(meta):
    """glb（形だけ。絵はアプリが別に読む）と、アトラス・光の絵（PC とスマホの大きさ）"""
    sc = bpy.context.scene
    keep = []
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        n = o.name
        if n.startswith('fd_air') or n.startswith('md_air'):
            continue
        # 1 つしかない組は「名前__fixed__」のまま残るので、アプリが探す名前にそろえる
        if '__' in n:
            n = n.split('__')[0]
            o.name = n
            o.data.name = n
        # 素材は名前だけ（アプリで置きかえる）
        kind = 'screen' if n.startswith('screen_') else 'adi' if n.startswith('adi_') else 'glass' if n.startswith('glass') else 'float' if n.startswith('float_') else 'cabin'
        o.data.materials.clear()
        m = bpy.data.materials.get('x_' + kind) or bpy.data.materials.new('x_' + kind)
        o.data.materials.append(m)
        # 支点のある部品は原点を支点へ
        piv = PIVOTS.get(n) or FLOATS.get(n)
        if piv is not None:
            if n in FLOATS:
                o.location = piv
            else:
                o.data.transform(Matrix.Translation(-piv))
                o.location = piv
        keep.append(o)
    # 見どころの印
    for name, p in list(HOTS.items()) + [('eye_cdr', EYE), ('spawn', Vector((0.0, 1.8, 3.3)))]:
        e = bpy.data.objects.new('hs_' + name if not name.startswith(('eye', 'spawn')) else name, None)
        e.location = p
        bpy.context.collection.objects.link(e)
        keep.append(e)
    build_collider(keep)
    select(keep)
    glb = os.path.join(OUT_DIR, 'shuttle-cabin.glb')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_normals=False, export_texcoords=True,
                              export_materials='PLACEHOLDER', export_yup=True, export_apply=True, export_extras=False, export_cameras=False, export_lights=False)
    print('wrote', glb, os.path.getsize(glb) // 1024, 'KB')
    # 絵：PC（アトラス 4096・光 2048）、スマホ（2048・1024）
    atlas = Image.open(os.path.join(WORK, 'atlas.png'))
    for suffix, size in (('', ATLAS), ('.phone', ATLAS // 2)):
        im = atlas if size == ATLAS else atlas.resize((size, size), Image.LANCZOS)
        im.save(os.path.join(OUT_DIR, f'shuttle-cabin.atlas{suffix}.webp'), 'WEBP', quality=88, method=6)
    for mode in ('day', 'dark'):
        lm = Image.open(os.path.join(WORK, f'lm_{mode}.png'))
        # 夜の光はやわらかいので半分の大きさで足りる（テクスチャのメモリを減らす）
        base = BAKE_SIZE if mode == 'day' else BAKE_SIZE // 2
        for suffix, size in (('', base), ('.phone', base // 2)):
            im = lm if size == lm.width else lm.resize((size, size), Image.LANCZOS)
            im.save(os.path.join(OUT_DIR, f'shuttle-cabin.light-{mode}{suffix}.webp'), 'WEBP', quality=86, method=6)
    meta_out = {'lightScale': {k: v for k, v in meta.items() if k != 'exposure'}, 'exposure': meta['exposure'], 'atlas': ATLAS, 'lightmap': BAKE_SIZE, 'hot': {k: list(v) for k, v in HOTS.items()}}
    with open(os.path.join(OUT_DIR, 'shuttle-cabin.json'), 'w') as f:
        json.dump(meta_out, f, indent=1)


def build_collider(keep):
    """当たり判定：殻と、大きな家具の箱（細かい部品は入れない）"""
    shell_src = bpy.data.objects.get('room')
    bm = bmesh.new()
    # 殻は焼いた部屋から、床・壁・天井の大きな面だけ（細かい部品は面積で落とす）
    me = shell_src.data
    vmap = {}
    for p in me.polygons:
        if p.area < 0.0025:
            continue
        vs = []
        for vi in p.vertices:
            if vi not in vmap:
                vmap[vi] = bm.verts.new(me.vertices[vi].co)
            vs.append(vmap[vi])
        try:
            bm.faces.new(vs)
        except ValueError:
            pass
    for name in ('seat_cdr', 'seat_plt', 'seat_ms1', 'seat_ms2', 'hatch_airlock', 'hatch_side'):
        o = bpy.data.objects.get(name)
        if not o:
            continue
        mw = o.matrix_world
        mn = Vector((min((mw @ Vector(c)).x for c in o.bound_box), min((mw @ Vector(c)).y for c in o.bound_box), min((mw @ Vector(c)).z for c in o.bound_box)))
        mx = Vector((max((mw @ Vector(c)).x for c in o.bound_box), max((mw @ Vector(c)).y for c in o.bound_box), max((mw @ Vector(c)).z for c in o.bound_box)))
        r = bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=mx - mn, verts=r['verts'])
        bmesh.ops.translate(bm, vec=(mn + mx) / 2, verts=r['verts'])
    ob = mesh_obj('collider', bm)
    ob.data.materials.append(bpy.data.materials.get('x_cabin'))
    keep.append(ob)


if __name__ == '__main__':
    main()
