"""
スペースシャトルの発射台（39B、1990 年代）を Blender で組み立てる。

資料（FACTS.md の「発射台」）：NASA Facts「Launch Complex 39 Pads A and B」（2007）、Countdown 101 の説明
  - 移動発射台（MLP）：49 × 41 × 7.6 m、6 本の台座（6.7 m）の上。炎の穴が 3 つ（固体ロケット 2 つ、メインエンジン 1 つ）。
    甲板に尾部の配管塔（TSM）2 本（高さ 9.4 m）、固体ロケットの押さえの柱 8 本、水をまくノズル（レインバード）
  - 固定の塔（FSS）：12.2 m 四方、地面から 75 m。6.1 m ごとの階。てっぺんにハンマーヘッドクレーン、
    24 m のガラス繊維の避雷針（先は地面から 105.8 m）
  - 乗組員の通路（OAA）：地面から 44.8 m、長さ 19.8 m、先に白い部屋（ホワイトルーム）。T−7 分 24 秒に退く
  - 酸素の排気の腕（GOX ベントアーム）：地面から 63〜69 m、外部タンクの先に「ビーニー帽」（直径 4 m）。
    T−2 分 30 秒に帽子を上げ、T−1 分 45 秒に退く
  - 回る建屋（RSS）：31 × 15 × 40 m、塔の角の軸のまわりに 120 度回る（半径 48.8 m）。打ち上げの前に退いている
  - 水の塔：北東、高さ 88 m、1,136 m³（30 万ガロン）
  - 液体酸素（北西）と液体水素（北東）の球のタンク（build_launchpad.py と同じ）
  発射台の盛り土・炎の溝はアプリ側（launchSite.ts）。

座標：Blender（Z が上、+X が東、+Y が北）。原点は外部タンクの中心線と移動発射台の甲板（build_shuttle_stack.py と同じ）。
アプリの launchSite.ts の地面（GROUND_Y = −13.8）にそろえる。

動く部品（原点 = 回る軸）：OAA（乗組員の通路）、GOX（排気の腕とビーニー帽）

実行:
  OUT=/tmp/sp/shuttle-pad.glb /home/user/.bpyvenv/bin/python -I tools/blender/build_shuttle_pad.py
  MODELS=shuttlepad SRC=/tmp/sp .bpyvenv/bin/python -I tools/blender/bake_mission.py    # public/models/shuttle-pad.glb
  PREVIEW=1 STACK=<shuttle-stack.glb> VIEWS=night,base,arm EXPORT=0 ...   確かめの絵
"""

import math
import os
import sys
import time

import bpy

sys.path.insert(0, os.path.dirname(__file__))
import build_saturn as S  # noqa: E402
import build_launchpad as LP  # noqa: E402
from build_saturn import Part, box, tube  # noqa: E402
from build_launchpad import beam, sphere  # noqa: E402

OUT = os.environ.get('OUT', '/tmp/sp/shuttle-pad.glb')
PREVIEW_DIR = os.environ.get('PREVIEW_DIR', '/tmp/sp/prev')

S.COLORS.update({
    'Red': ((0.42, 0.11, 0.05), 0.6, 0.0),  # 固定の塔（さびた赤だいだい）
    'Grey': ((0.5, 0.51, 0.5), 0.65, 0.0),
    'Deck': ((0.34, 0.34, 0.33), 0.8, 0.0),
    'Concrete': ((0.55, 0.54, 0.5), 0.9, 0.0),
    'Tank': ((0.8, 0.8, 0.78), 0.5, 0.0),
    'Pipe': ((0.6, 0.6, 0.6), 0.4, 0.6),
    'Panel': ((0.72, 0.73, 0.72), 0.6, 0.0),  # 回る建屋の外板
    'White': ((0.86, 0.86, 0.84), 0.55, 0.0),
})

PAD_Z = -13.8  # 発射台の地面（launchSite.ts の GROUND_Y）
DECK = 0.0  # 移動発射台の甲板
MLP_L, MLP_W, MLP_H = 49.0, 41.0, 7.6
MLP_X = -4.0  # 台の中心（タンクの中心線より少し西、オービターの側）
SRB_Y = 6.36
# 炎の穴（x0, x1, y0, y1）
HOLES = [(-3.5, 3.5, 2.9, 9.9), (-3.5, 3.5, -9.9, -2.9), (-13.0, -4.0, -4.6, 4.6)]
TSM = [(-9.6, 6.8), (-9.6, -6.8)]  # 尾部の配管塔の中心
TSM_H = 9.4
FT = 0.3048

# 固定の塔
FSS_X, FSS_Y, FSS_W = -2.0, 26.6, 12.2
FSS_TOP = PAD_Z + 75.3
LEVEL = 20 * FT
# 乗組員の通路：床の高さ（地面から 147 ft）、ハッチの位置（オービターの左の横腹）
OAA_Z = PAD_Z + 147 * FT
HATCH = (-6.9, 2.75)
# 排気の腕：軸の高さ（地面から 207 ft）、ビーニー帽（外部タンクの先）
GOX_Z = PAD_Z + 207 * FT
ET_TOP = 56.9
# 回る建屋：軸、退いた向き（北から西へ）
RSS_PIVOT = (FSS_X - FSS_W / 2 - 1.0, FSS_Y - FSS_W / 2)
RSS_PARK = math.radians(150)
# 水の塔
WT = (72.0, 78.0)
LAND_Z = PAD_Z - 12.0


# ---- 移動発射台 -------------------------------------------------------------------


def cells(x0, x1, y0, y1, holes):
    """長方形を、穴の縁の線で切った小さな長方形に分け、穴の中でないものを返す"""
    xs = sorted({x0, x1, *[h[0] for h in holes], *[h[1] for h in holes]})
    ys = sorted({y0, y1, *[h[2] for h in holes], *[h[3] for h in holes]})
    xs = [x for x in xs if x0 <= x <= x1]
    ys = [y for y in ys if y0 <= y <= y1]
    out = []
    for i in range(len(xs) - 1):
        for j in range(len(ys) - 1):
            cx, cy = (xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2
            if any(h[0] < cx < h[1] and h[2] < cy < h[3] for h in holes):
                continue
            out.append((xs[i], xs[i + 1], ys[j], ys[j + 1]))
    return out


def launcher(p):
    hx, hy = MLP_L / 2, MLP_W / 2
    x0, x1, y0, y1 = MLP_X - hx, MLP_X + hx, -hy, hy
    top, bot = DECK, DECK - MLP_H
    zc = (top + bot) / 2
    for (a, b, c, d) in cells(x0, x1, y0, y1, HOLES):
        box(p, ((a + b) / 2, (c + d) / 2, zc), (b - a, d - c, MLP_H), 'Grey')
        box(p, ((a + b) / 2, (c + d) / 2, top + 0.04), (b - a - 0.3, d - c - 0.3, 0.08), 'Deck')
    # 穴の内側の暗い壁
    for (a, b, c, d) in HOLES:
        for x in (a + 0.1, b - 0.1):
            box(p, (x, (c + d) / 2, zc), (0.2, d - c, MLP_H - 0.2), 'Dark')
        for y in (c + 0.1, d - 0.1):
            box(p, ((a + b) / 2, y, zc), (b - a, 0.2, MLP_H - 0.2), 'Dark')
    # 側面の枠と柱
    for z in (top - 0.45, zc, bot + 0.45):
        for sy in (-1, 1):
            box(p, (MLP_X, sy * (hy + 0.25), z), (MLP_L + 0.5, 0.5, 0.9), 'Grey')
        for sx in (-1, 1):
            box(p, (MLP_X + sx * (hx + 0.25), 0, z), (0.5, MLP_W + 0.5, 0.9), 'Grey')
    for i in range(13):
        x = x0 + i * MLP_L / 12
        for sy in (-1, 1):
            box(p, (x, sy * (hy + 0.2), zc), (0.5, 0.4, MLP_H), 'Grey')
    for i in range(11):
        y = y0 + i * MLP_W / 10
        for sx in (-1, 1):
            box(p, (MLP_X + sx * (hx + 0.2), y, zc), (0.4, 0.5, MLP_H), 'Grey')
    for x in (-21.0, -10.0, 6.0, 15.0):
        box(p, (x, -hy - 0.05, bot + 1.6), (2.2, 0.2, 2.6), 'Dark')
    for y in (-12.0, 4.0, 14.0):
        box(p, (x1 + 0.05, y, bot + 1.6), (0.2, 2.2, 2.6), 'Dark')
        box(p, (x0 - 0.05, y, zc + 1.2), (0.2, 3.0, 1.0), 'Dark')
    # 手すり
    for sy in (-1, 1):
        y = sy * (hy - 0.3)
        for z in (top + 0.55, top + 1.1):
            tube(p, (x0 + 0.3, y, z), (x1 - 0.3, y, z), 0.04, 'Grey', n=4)
        for i in range(25):
            x = x0 + 0.3 + i * (MLP_L - 0.6) / 24
            tube(p, (x, y, top), (x, y, top + 1.1), 0.04, 'Grey', n=4)
    for sx in (-1, 1):
        x = MLP_X + sx * (hx - 0.3)
        for z in (top + 0.55, top + 1.1):
            tube(p, (x, y0 + 0.3, z), (x, y1 - 0.3, z), 0.04, 'Grey', n=4)
    # 固体ロケットの押さえの柱（1 本のロケットに 4 本、スカートのふち）
    for sy in (-1, 1):
        for k in range(4):
            a = math.pi / 4 + k * math.pi / 2
            x, y = 2.45 * math.cos(a), sy * SRB_Y + 2.45 * math.sin(a)
            box(p, (x, y, top + 0.3), (1.0, 1.0, 0.6), 'Dark', rz=a)
            box(p, (x * 1.15, y + (y - sy * SRB_Y) * 0.15, top + 0.15), (1.8, 1.8, 0.3), 'Grey', rz=a)
    # 尾部の配管塔（TSM）2 本：箱の塔、上にフード
    for (x, y) in TSM:
        w, d = 4.6, 2.7
        for sx in (-1, 1):
            for sy in (-1, 1):
                beam(p, (x + sx * w / 2, y + sy * d / 2, top), (x + sx * w / 2, y + sy * d / 2, top + TSM_H), 0.3, 0.3, 'Grey')
        box(p, (x, y, top + TSM_H * 0.48), (w - 0.3, d - 0.3, TSM_H * 0.96), 'Panel')
        for k in range(1, 5):
            box(p, (x, y, top + k * TSM_H / 5), (w + 0.1, d + 0.1, 0.25), 'Grey')
        box(p, (x + 1.6, y - 0.9 * (1 if y > 0 else -1), top + TSM_H + 0.4), (1.4, 1.0, 0.8), 'Grey')
        box(p, (x - 0.6, y, top + 1.5), (1.0, d + 0.15, 2.4), 'Dark')  # 扉
    # 水をまくノズル（レインバード）6 本：甲板の縁から、穴の上へ曲がる太い管
    for (x, y, tx, ty) in ((-14.5, 6.5, -9.0, 2.0), (-14.5, -6.5, -9.0, -2.0), (5.5, 12.0, 1.5, 7.5),
                           (5.5, -12.0, 1.5, -7.5), (-5.5, 12.5, -1.5, 8.0), (-5.5, -12.5, -1.5, -8.0)):
        tube(p, (x, y, top), (x, y, top + 3.0), 0.35, 'Pipe', n=8)
        tube(p, (x, y, top + 3.0), (x + (tx - x) * 0.35, y + (ty - y) * 0.35, top + 3.4), 0.3, 'Pipe', n=8)
        box(p, (x, y, top + 0.3), (1.2, 1.2, 0.6), 'Grey')
    # 甲板の機械の箱
    for (x, y, sx, sy, h) in ((-22.0, -14.0, 5.0, 4.0, 2.2), (14.0, -15.0, 5.0, 3.0, 1.8), (-22.0, 12.0, 4.0, 6.0, 2.6),
                              (15.0, 12.0, 3.0, 5.0, 2.0), (10.0, 0.0, 3.0, 3.0, 1.4)):
        box(p, (x, y, top + h / 2), (sx, sy, h), 'Grey')
        box(p, (x, y - sy / 2 - 0.02, top + h * 0.4), (sx * 0.5, 0.06, h * 0.5), 'Dark')
    for x in (-26.0, -12.0, 4.0, 18.0):
        for y in (-19.5, 19.5):
            box(p, (x, y, top + 0.4), (0.5, 0.3, 0.3), 'Lamp')
    # 6 本の台座と 4 本の支柱
    for x in (MLP_X - 18.0, MLP_X, MLP_X + 18.0):
        for y in (-15.0, 15.0):
            h = bot - PAD_Z
            box(p, (x, y, PAD_Z + h * 0.35), (4.2, 4.2, h * 0.7), 'Concrete')
            box(p, (x, y, PAD_Z + h * 0.85), (2.6, 2.6, h * 0.3), 'Grey')
    for x in (MLP_X - 22.0, MLP_X + 22.0):
        for y in (-9.0, 9.0):
            box(p, (x, y, (PAD_Z + bot) / 2), (1.6, 1.6, bot - PAD_Z), 'Grey')
    for x in (MLP_X - 12.0, MLP_X + 12.0):
        for y in (-15.0, 15.0):
            box(p, (x, y, bot - 0.3), (0.8, 0.4, 0.3), 'Lamp')


# ---- 固定の塔 ---------------------------------------------------------------------


def fss(p):
    w = FSS_W / 2
    cx, cy = FSS_X, FSS_Y
    cs = [(cx - w, cy - w), (cx + w, cy - w), (cx + w, cy + w), (cx - w, cy + w)]
    for (x, y) in cs:
        beam(p, (x, y, PAD_Z), (x, y, FSS_TOP), 0.8, 0.8, 'Red')
    n = int((FSS_TOP - PAD_Z) / LEVEL)
    levels = [PAD_Z + LEVEL * i for i in range(n + 1)] + [FSS_TOP]
    for i, z in enumerate(levels):
        for k in range(4):
            a, b = cs[k], cs[(k + 1) % 4]
            beam(p, (*a, z), (*b, z), 0.35, 0.55, 'Red')
            if i + 1 < len(levels):
                z2 = levels[i + 1]
                m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
                beam(p, (*m, z), (*a, z2), 0.18, 0.18, 'Red')
                beam(p, (*m, z), (*b, z2), 0.18, 0.18, 'Red')
                beam(p, (*m, z), (*m, z2), 0.16, 0.16, 'Red')
        box(p, (cx, cy, z + 0.1), (FSS_W - 0.4, FSS_W - 0.4, 0.15), 'Dark' if i % 2 else 'Grey')
        if i % 2 == 1:
            for (x, y) in cs[:2]:
                box(p, (x + (0.5 if x > cx else -0.5), y - 0.4, z + 1.0), (0.4, 0.2, 0.25), 'Lamp')
            box(p, (cx, cy - w - 0.3, z + 2.4), (0.5, 0.2, 0.25), 'Lamp')
    # エレベーターと階段（北の半分、網の囲い）
    for x in (cx - 2.4, cx + 2.4):
        box(p, (x, cy + 2.2, (PAD_Z + FSS_TOP) / 2), (1.8, 1.8, FSS_TOP - PAD_Z), 'Dark')
    # 回る建屋の軸の柱（塔の南西の角の外）
    tube(p, (RSS_PIVOT[0], RSS_PIVOT[1], PAD_Z), (RSS_PIVOT[0], RSS_PIVOT[1], PAD_Z + 60), 0.9, 'Grey', n=10)
    # てっぺん：機械室、ハンマーヘッドクレーン、避雷針
    top = FSS_TOP
    box(p, (cx, cy, top + 1.4), (FSS_W + 0.6, FSS_W + 0.6, 2.8), 'Red')
    box(p, (cx, cy, top + 3.6), (4.0, 4.0, 1.6), 'Red')
    beam(p, (cx, cy + 9.0, top + 5.4), (cx, cy - 16.0, top + 5.4), 1.8, 1.6, 'Red')
    for k in range(6):
        y = cy + 8.0 - k * 4.2
        beam(p, (cx - 0.9, y, top + 4.6), (cx + 0.9, y - 2.1, top + 6.2), 0.12, 0.12, 'Red')
    box(p, (cx, cy + 9.6, top + 5.0), (2.6, 2.4, 2.4), 'Grey')
    box(p, (cx, cy - 15.6, top + 4.2), (0.6, 0.6, 1.4), 'Dark')
    mast0, mast1 = top + 6.2, PAD_Z + 347 * FT
    tube(p, (cx, cy, mast0), (cx, cy, mast0 + 4.0), 0.9, 'Grey', n=10)
    tube(p, (cx, cy, mast0 + 4.0), (cx, cy, mast1), 0.35, 'White', n=8)
    box(p, (cx, cy, mast1 + 0.25), (0.5, 0.5, 0.5), 'NavRed')
    box(p, (cx, cy - 16.0, top + 6.4), (0.4, 0.4, 0.4), 'NavRed')
    # 避雷の電線（北と南の地面へ）
    for ty in (cy + 330.0, cy - 330.0):
        for k in range(12):
            a, b = k / 12, (k + 1) / 12
            za = mast1 + (LAND_Z + 2 - mast1) * a - 22 * math.sin(math.pi * a)
            zb = mast1 + (LAND_Z + 2 - mast1) * b - 22 * math.sin(math.pi * b)
            tube(p, (cx, cy + (ty - cy) * a, za), (cx, cy + (ty - cy) * b, zb), 0.05, 'Dark', n=3)


def oaa(p):
    """乗組員の通路：塔の南西の角から、オービターの左のハッチへ。先に白い部屋"""
    hx, hy = FSS_X - FSS_W / 2 + 1.2, FSS_Y - FSS_W / 2
    z = OAA_Z
    wx, wy = HATCH[0], HATCH[1] + 1.6  # 白い部屋の中心
    for sx in (-1, 1):
        for sz in (0, 1):
            beam(p, (hx + sx * 0.9, hy, z + sz * 2.4), (wx + sx * 0.9, wy + 1.4, z + sz * 2.4), 0.2, 0.2, 'Grey')
    n = 8
    for k in range(n):
        a, b = k / n, (k + 1) / n
        ya, yb = hy + (wy + 1.4 - hy) * a, hy + (wy + 1.4 - hy) * b
        xa, xb = hx + (wx - hx) * a, hx + (wx - hx) * b
        for sx in (-1, 1):
            beam(p, (xa + sx * 0.9, ya, z), (xb + sx * 0.9, yb, z + 2.4), 0.1, 0.1, 'Grey')
    box(p, ((hx + wx) / 2, (hy + wy + 1.4) / 2, z + 1.2), (1.6, hy - wy - 1.4, 2.3), 'Panel')  # 通路の囲い
    box(p, (wx, wy, z + 1.5), (3.2, 2.8, 3.0), 'White')  # 白い部屋
    box(p, (wx, wy - 1.42, z + 1.4), (1.4, 0.06, 1.6), 'Lamp')


def gox(p):
    """酸素の排気の腕：塔の南東の角の軸から、外部タンクの先へ。先にビーニー帽"""
    hx, hy = FSS_X + FSS_W / 2 - 1.0, FSS_Y - FSS_W / 2
    tip = (0.0, 2.6, ET_TOP - 2.2)
    for sx in (-1, 1):
        for sz in (0, 1):
            beam(p, (hx + sx * 0.8, hy, GOX_Z + sz * 2.0), (tip[0] + sx * 0.6, tip[1] + 1.5, tip[2] + sz * 1.6), 0.2, 0.2, 'Grey')
    n = 7
    for k in range(n):
        a, b = k / n, (k + 1) / n
        pa = [hx + (tip[0] - hx) * a, hy + (tip[1] + 1.5 - hy) * a, GOX_Z + (tip[2] - GOX_Z) * a]
        pb = [hx + (tip[0] - hx) * b, hy + (tip[1] + 1.5 - hy) * b, GOX_Z + (tip[2] - GOX_Z) * b + 2.0]
        beam(p, tuple(pa), tuple(pb), 0.1, 0.1, 'Grey')
    # ビーニー帽：外部タンクの先にかぶさる、白い丸いフード
    cz = ET_TOP - 1.2
    S.lathe(p, [(cz - 1.4, 2.05), (cz - 0.2, 2.1), (cz + 0.8, 1.7), (cz + 1.3, 0.9), (cz + 1.45, 0.01)],
            S.solid('White'), n=20, cap_bottom=False)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        beam(p, (2.0 * math.cos(a), 2.0 * math.sin(a), cz - 0.4), (0.6 * math.cos(a), 2.6 + 0.6 * math.sin(a), cz + 1.6), 0.12, 0.12, 'Grey')


# ---- 回る建屋（退いた位置）--------------------------------------------------------


def rss(p):
    px, py = RSS_PIVOT
    u = (math.cos(RSS_PARK), math.sin(RSS_PARK))
    v = (-u[1], u[0])
    r0, r1 = 17.7, 48.8
    z0, z1 = PAD_Z + 18.0, PAD_Z + 57.6
    hw = 7.6

    def at(r, s, z=0.0):
        return (px + u[0] * r + v[0] * s, py + u[1] * r + v[1] * s, z)

    c = at((r0 + r1) / 2, 0)
    ang = RSS_PARK
    box(p, (c[0], c[1], (z0 + z1) / 2), (r1 - r0, 2 * hw, z1 - z0), 'Panel', rz=ang)
    # 外板の継ぎ目（横の帯と縦の柱）
    for k in range(7):
        z = z0 + (z1 - z0) * k / 6
        box(p, (c[0], c[1], z), (r1 - r0 + 0.3, 2 * hw + 0.3, 0.35), 'Grey', rz=ang)
    for k in range(9):
        r = r0 + (r1 - r0) * k / 8
        for s in (-hw - 0.1, hw + 0.1):
            q = at(r, s)
            box(p, (q[0], q[1], (z0 + z1) / 2), (0.4, 0.4, z1 - z0), 'Grey', rz=ang)
    # 開いている階（暗い帯）と、外の階段の塔
    for z in (z0 + 8.0, z0 + 21.0):
        q = at((r0 + r1) / 2, hw + 0.15)
        box(p, (q[0], q[1], z), (r1 - r0 - 2, 0.2, 2.2), 'Dark', rz=ang)
    # 軸へつなぐ梁（上と下）と、外の端の脚（地面の上の台車）
    for z in (z0 + 1.0, z1 - 1.0):
        for s in (-hw + 1, hw - 1):
            beam(p, at(0.8, s * 0.3, z), at(r0, s, z), 0.9, 1.2, 'Grey')
    for s in (-hw + 1.5, hw - 1.5):
        a, b = at(r1 - 1.5, s, PAD_Z), at(r1 - 1.5, s, z0)
        beam(p, a, b, 1.4, 1.4, 'Grey')
        q = at(r1 - 1.5, s)
        box(p, (q[0], q[1], PAD_Z + 0.8), (3.0, 2.2, 1.6), 'Dark', rz=ang)
    for k in range(5):
        q = at(r0 + 3 + k * 6.5, -hw - 0.3)
        box(p, (q[0], q[1], z0 + 4 + (k % 2) * 12), (0.5, 0.2, 0.3), 'Lamp', rz=ang)


# ---- まわりの設備 -------------------------------------------------------------------


def water_tower(p):
    x, y = WT
    base = LAND_Z
    top = base + 290 * FT
    r = 7.2
    tz = top - r * 0.9
    for k in range(6):
        a = 2 * math.pi * k / 6
        beam(p, (x + 7.5 * math.cos(a), y + 7.5 * math.sin(a), base), (x + 4.8 * math.cos(a), y + 4.8 * math.sin(a), tz - r * 0.6), 0.6, 0.6, 'Grey')
    for j in range(1, 6):
        z = base + (tz - r * 0.6 - base) * j / 6
        rr = 7.5 + (4.8 - 7.5) * j / 6
        for k in range(6):
            a, b = 2 * math.pi * k / 6, 2 * math.pi * (k + 1) / 6
            beam(p, (x + rr * math.cos(a), y + rr * math.sin(a), z), (x + rr * math.cos(b), y + rr * math.sin(b), z), 0.25, 0.25, 'Grey')
    tube(p, (x, y, base), (x, y, tz), 0.9, 'Grey', n=10)
    # 回転体は原点のまわりにできるので、別の組で作ってから塔の位置へ動かす（そのままだと外部タンクの先にかぶさっていた）
    q = Part()
    S.lathe(q, [(tz - r * 0.8, 0.01), (tz - r * 0.6, r * 0.75), (tz, r), (tz + r * 0.35, r * 0.92), (tz + r * 0.75, r * 0.45), (tz + r * 0.9, 0.01)],
            S.solid('Tank'), n=28)
    p.add([(vx + x, vy + y, vz) for vx, vy, vz in q.verts], q.faces, lambda f, m=q.mats: m[f])
    box(p, (x, y, top + 0.4), (0.5, 0.5, 0.5), 'NavRed')
    # 発射台へ向かう太い管
    tube(p, (x, y, base + 1.5), (MLP_X + 30, 22.0, base + 1.5), 1.1, 'Pipe', n=10)
    tube(p, (MLP_X + 30, 22.0, base + 1.5), (MLP_X + 22, 15.0, PAD_Z + 1.2), 1.1, 'Pipe', n=10)


# ---- 確認の画像 ---------------------------------------------------------------------


def preview():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = int(os.environ.get('SAMPLES', '24'))
    scene.cycles.device = 'CPU'
    world = bpy.data.worlds.new('W')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.004, 0.006, 0.014, 1)
    if os.environ.get('STACK'):
        bpy.ops.import_scene.gltf(filepath=os.environ['STACK'])
    bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, PAD_Z))
    g = bpy.context.object
    gm = bpy.data.materials.new('Ground')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.3, 0.29, 0.27, 1)
    g.data.materials.append(gm)
    if os.environ.get('DAY'):
        bg.inputs['Color'].default_value = (0.35, 0.45, 0.6, 1)
        sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
        sun.data.energy = 4.0
        sun.rotation_euler = (math.radians(50), 0, math.radians(-35))
        scene.collection.objects.link(sun)
    for k, (x, y) in enumerate(((-150, -170), (150, -200), (-200, 130)) if not os.environ.get('DAY') else ()):
        L = bpy.data.objects.new(f'Xe{k}', bpy.data.lights.new(f'Xe{k}', 'SPOT'))
        L.data.energy = 3.0e6
        L.data.spot_size = math.radians(26)
        L.data.color = (0.85, 0.9, 1.0)
        L.location = (x, y, PAD_Z - 8)
        d = (-x, -y, 35 - L.location[2])
        L.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]), 0, math.atan2(d[1], d[0]) - math.pi / 2)
        scene.collection.objects.link(L)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    shots = {
        'night': ((-170, -300, 10), (-5, 10, 40), 38),
        'wide': ((-260, -60, 30), (-5, 15, 35), 30),
        'base': ((-34, -48, 4), (-6, 2, 3), 28),
        'arm': ((-34, 14, 38), (-7, 6, 32), 30),
        'top': ((22, -30, 66), (0, 14, 54), 30),
    }
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    for v in os.environ.get('VIEWS', 'night,base').split(','):
        loc, tgt, lens = shots[v]
        cam.location = loc
        d = [tgt[i] - loc[i] for i in range(3)]
        cam.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]), 0, math.atan2(d[1], d[0]) - math.pi / 2)
        cam.data.lens = lens
        scene.render.resolution_x, scene.render.resolution_y = (700, 1000) if v == 'night' else (1000, 700)
        scene.render.filepath = os.path.join(PREVIEW_DIR, f'pad-{v}.png')
        bpy.ops.render.render(write_still=True)
        print('rendered', scene.render.filepath, flush=True)


def main():
    t0 = time.time()
    S.reset_scene()
    P = {n: Part() for n in ('MLP', 'FSS', 'RSS', 'Site', 'OAA', 'GOX')}
    launcher(P['MLP'])
    fss(P['FSS'])
    rss(P['RSS'])
    oaa(P['OAA'])
    gox(P['GOX'])
    water_tower(P['Site'])
    LP.poles(P['Site'])
    LP.tanks(P['Site'])
    objs = []
    hinges = {
        'OAA': (FSS_X - FSS_W / 2 + 1.2, FSS_Y - FSS_W / 2, OAA_Z),
        'GOX': (FSS_X + FSS_W / 2 - 1.0, FSS_Y - FSS_W / 2, GOX_Z),
    }
    for n, part in P.items():
        o = S.make_object(n, part)
        if n in hinges:
            h = hinges[n]
            for v in o.data.vertices:
                v.co.x -= h[0]
                v.co.y -= h[1]
                v.co.z -= h[2]
            o.location = h
        objs.append(o)
    nf = sum(len(o.data.polygons) for o in objs)
    print(f'{nf} faces ({time.time() - t0:.1f}s)', flush=True)
    if os.environ.get('EXPORT', '1') == '1':
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        for o in bpy.data.objects:
            o.select_set(o in objs)
        bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format='GLB', use_selection=True,
                                  export_yup=True, export_materials='EXPORT')
        print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB', flush=True)
    if os.environ.get('PREVIEW'):
        preview()


if __name__ == '__main__':
    main()
