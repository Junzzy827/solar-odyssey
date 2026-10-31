"""
地球軌道の宇宙船ドック「天の湊（アマノミナト）」（差し渡し約 5 km）を Blender で組み立てる。

junji さんの設定画（輪と十字の配置）をもとにした、このアプリ独自の構造物（設定画の名前は使わない）。
  - 外周の大きなドッキングリング（約 4.4 km。外壁に窓の帯、上にビーコンの塔、外へ整備アーム）
  - リングの内側の細い軌道リング
  - 十字の腕：前後の太い軸と、左右の細い腕。腕の先はリングの外へ突き出して、係留の塔
  - 前（+Y）の太い軸は、大型艦が入る屋根つきのメインドック（前が大きく開いている）
  - 後ろ（-Y）は屋根のない船台：2 本の長い桁と、渡したガントリー
  - 中央のハブ（段々の円盤と窓の帯の輪）と、その上の管制塔とアンテナ
  - 下へぶら下がる貨物ポッドと、ハブの下の長い柱

形は「メートル」で組み、最後に S 倍する（既定 1/5000：差し渡し 5 km が模型の 1）。
座標は Blender のまま（Z が上、メインドックの口が +Y）。glb では +Y が three.js の -Z になる。

実行:
  /home/user/.bpyvenv/bin/python tools/blender/build_spacedock.py
  STAGE=1..3      作り込みの段階（1 = 全体の形、2 = 細部、3 = 焼き込みと glb の書き出し。既定 3、約 7 分）
  PREVIEW=1       確認用の画像を PREVIEW_DIR に書き出す（VIEWS=hero,top,front,side,dock,under,tower）
  NOEXPORT=1      glb を書き出さない
"""

import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_fleet as bf  # noqa: E402  （bpy もここで読み込まれる）
from build_fleet import FacetLoft, Part  # noqa: E402
import build_arcadia as ar  # noqa: E402

import bpy  # noqa: E402
import numpy as np  # noqa: E402

STAGE = int(os.environ.get('STAGE', '3'))
OUT = os.environ.get('OUT', os.path.join(bf.OUT_DIR, 'spacedock.glb'))
PREVIEW_DIR = os.environ.get('PREVIEW_DIR', '/tmp')
S = float(os.environ.get('S_UNIT', '0.0002'))  # 1 m の長さ（模型の単位）。1 = 5 km（焼き込みの位置の絵が 0〜2 に収まるように）

MATS = ['Hull', 'Hull2', 'Red', 'Dark', 'Mech', 'Metal', 'Glass', 'Window', 'Bay', 'Glow', 'Blue', 'NavRed', 'NavGreen']
PARTS = ['Ring', 'Cross', 'Hub', 'Tower', 'Arms']

# 主な寸法（m）
RING_R0, RING_R1 = 1890, 2210  # ドッキングリングの内と外の半径
RING_TOP, RING_BOT = 90, -140
TRACK_R = 1640  # 内側の軌道リング
HUB_R = 760
DOCK_HALF = 440  # メインドックの外幅の半分
DOCK_IN = 330  # 中の幅の半分
DOCK_Y0, DOCK_Y1 = 560, 2420  # メインドックの奥と口
DOCK_GAP_RING = math.asin(385 / RING_R0)  # リングを切る角度（ドックの壁の中心まで）
SLIP_X = 300  # 船台の桁の中心
SLIP_Y1 = -2440
ARM_X1 = 2480  # 左右の腕の先


def box(part, c, size, mat, rz=0.0, rx=0.0, ry=0.0):
    bf.box(part, c, size, mat, rot_z=rz, rot_x=rx, rot_y=ry)


def cyl(part, a, b, r0, r1, mat, n=24, cap0='same', cap1='same'):
    bf.cylinder(part, a, b, r0, r1, mat, n=n, cap0=cap0, cap1=cap1)


def revolve(part, prof, a0=0.0, a1=2 * math.pi, n=96, caps=True):
    """(r, z, 材質) の閉じた断面（r-z 面で反時計回り）を Z 軸のまわりに回した輪。材質は各点から次の点への辺のもの"""
    full = abs(a1 - a0 - 2 * math.pi) < 1e-9
    steps = n if full else max(2, n)
    m = len(prof)
    rings = steps if full else steps + 1
    verts = []
    for i in range(rings):
        t = a0 + (a1 - a0) * i / steps
        c, s = math.cos(t), math.sin(t)
        verts.extend((r * c, r * s, z) for r, z, _ in prof)
    faces, mats = [], []
    for i in range(steps):
        i2 = (i + 1) % rings
        for j in range(m):
            j2 = (j + 1) % m
            faces.append([i * m + j, i2 * m + j, i2 * m + j2, i * m + j2])
            mats.append(prof[j][2])
    if not full and caps:
        faces.append(list(range(m)))
        mats.append(prof[0][2])
        last = (rings - 1) * m
        faces.append([last + j for j in reversed(range(m))])
        mats.append(prof[0][2])
    part.add(verts, faces, mats)


def lathe(part, pts, mat_of=None, n=64):
    """(r, z) を下から上へ並べた回転体（外側だけ。r=0 の点でふさぐ）"""
    prof = []
    for k, p in enumerate(pts):
        prof.append((max(p[0], 0.01), p[1], p[2] if len(p) > 2 else 'Hull'))
    # 内側の軸にそって閉じる
    closed = prof + [(0.01, prof[-1][1], prof[-1][2]), (0.01, prof[0][1], prof[0][2])]
    revolve(part, closed, n=n)


def rotated(fn, angle, dest):
    """fn(part) で作った形を Z 軸のまわりに angle 回して dest に足す"""
    tmp = Part()
    fn(tmp)
    c, s = math.cos(angle), math.sin(angle)
    dest.add([(x * c - y * s, x * s + y * c, z) for x, y, z in tmp.verts], [[i for i in f] for f in tmp.faces], tmp.mats)


def offset(dest, src_fn, dx=0.0, dy=0.0, dz=0.0):
    tmp = Part()
    src_fn(tmp)
    dest.add([(x + dx, y + dy, z + dz) for x, y, z in tmp.verts], tmp.faces, tmp.mats)


def along_x(v):
    """Y 軸に沿って作ったロフトを X 軸に沿わせる（+Y → +X）"""
    x, y, z = v
    return (y, -x, z)


def sec(y, cx, cz, wt, wm, wb, ht, hb, mat):
    return (y, cx, cz, wt, wm, wb, ht, hb, mat)


# ---- 外周のドッキングリング --------------------------------------------------------------

RING_PROF = [
    (RING_R0 + 10, RING_BOT + 40, 'Hull2'),  # 内壁の下 → 下面
    (RING_R0 + 50, RING_BOT, 'Hull2'),
    (RING_R1 - 50, RING_BOT, 'Hull2'),  # 下面 → 外の下の面取り
    (RING_R1, RING_BOT + 45, 'Hull2'),  # 外壁の下
    (RING_R1, -25, 'Dark'),  # 窓の帯
    (RING_R1, 25, 'Hull'),
    (RING_R1 - 35, RING_TOP, 'Hull'),  # 上面
    (RING_R0 + 35, RING_TOP, 'Hull'),
    (RING_R0, 30, 'Dark'),  # 内壁の窓の帯
    (RING_R0, -20, 'Hull2'),
]

SEGMENTS = 16  # リングの区画の数（区画のつなぎ目に太い輪をはめる）


def collar_prof(grow, mat='Hull2'):
    return [
        (RING_R0 - grow, RING_BOT - grow, mat),
        (RING_R1 + grow, RING_BOT - grow, mat),
        (RING_R1 + grow, RING_TOP + grow, mat),
        (RING_R0 - grow, RING_TOP + grow, mat),
    ]


def build_ring(P):
    ring = P['Ring']
    # メインドックの中を通らないよう、+Y のところだけ切る（端はドックの壁の中にかくれる）
    g = DOCK_GAP_RING
    revolve(ring, RING_PROF, math.pi / 2 + g, math.pi / 2 - g + 2 * math.pi, n=240, caps=True)
    for k in range(SEGMENTS):
        a = 2 * math.pi * k / SEGMENTS
        if k % 4 == 0:
            continue  # 十字の腕の付け根は別に作る
        w = 70 / RING_R1
        revolve(ring, collar_prof(14), a - w / 2, a + w / 2, n=3)
    # 内側の細い軌道リング（メインドックの中と、船台の船のところは切る）
    tp = [
        (TRACK_R - 40, -45, 'Mech'), (TRACK_R + 40, -45, 'Mech'), (TRACK_R + 40, 5, 'Dark'),
        (TRACK_R + 25, 25, 'Hull2'), (TRACK_R - 25, 25, 'Hull2'), (TRACK_R - 40, 5, 'Dark'),
    ]
    gf, gb = math.asin(385 / TRACK_R), math.asin(SLIP_X / TRACK_R)
    revolve(ring, tp, math.pi / 2 + gf, 3 * math.pi / 2 - gb, n=90)
    revolve(ring, tp, -math.pi / 2 + gb, math.pi / 2 - gf, n=90)


# ---- 十字の腕 -----------------------------------------------------------------------


def build_cross(P):
    cr = P['Cross']
    # メインドック（前 +Y）：床・左右の壁・屋根の 4 枚の太い板で、前の口が開いた箱
    y0, y1 = DOCK_Y0, DOCK_Y1
    for sx in (1, -1):
        cx = sx * (DOCK_IN + DOCK_HALF) / 2
        hw = (DOCK_HALF - DOCK_IN) / 2
        FacetLoft([
            sec(y0, cx, -20, hw * 0.55, hw, hw * 0.8, 160, 150, 'Hull'),
            sec(y1 - 120, cx, -20, hw * 0.55, hw, hw * 0.8, 160, 150, 'Hull'),
            sec(y1, cx, -20, hw * 0.5, hw * 0.9, hw * 0.7, 150, 140, 'Hull'),
        ], chamfer=0.2, mid=0.1, seg=1, cap_back='Hull2', cap_front='Hull2').build(cr)
    # 屋根と床（中の幅いっぱい）
    FacetLoft([
        sec(y0, 0, 125, DOCK_IN + 20, DOCK_IN + 30, DOCK_IN + 30, 30, 12, 'Hull'),
        sec(y1 - 60, 0, 125, DOCK_IN + 20, DOCK_IN + 30, DOCK_IN + 30, 30, 12, 'Hull'),
    ], chamfer=0.1, mid=0.2, seg=1, cap_back='Hull2', cap_front='Hull2').build(cr)
    FacetLoft([
        sec(y0, 0, -150, DOCK_IN + 30, DOCK_IN + 30, DOCK_IN, 20, 30, 'Hull2'),
        sec(y1 - 60, 0, -150, DOCK_IN + 30, DOCK_IN + 30, DOCK_IN, 20, 30, 'Hull2'),
    ], chamfer=0.1, mid=0.2, seg=1, cap_back='Hull2', cap_front='Hull2').build(cr)
    # 奥の壁と、口のまわりの枠
    box(cr, (0, y0 + 20, -10), (2 * DOCK_IN + 20, 40, 290), 'Bay')
    for sx in (1, -1):
        box(cr, (sx * (DOCK_IN + 20), y1 - 40, -10), (60, 80, 330), 'Hull2')
        box(cr, (sx * (DOCK_IN - 12), y1 - 2, -10), (8, 8, 300), 'Red')
    box(cr, (0, y1 - 40, 150), (2 * DOCK_IN + 100, 80, 50), 'Hull2')
    box(cr, (0, y1 - 40, -165), (2 * DOCK_IN + 100, 80, 40), 'Hull2')
    box(cr, (0, y1 - 2, 123), (2 * DOCK_IN - 20, 8, 8), 'Red')
    box(cr, (0, y1 - 2, -143), (2 * DOCK_IN - 20, 8, 8), 'Red')
    # 中：天井の光の帯と、床の船を支える台
    for k in range(9):
        y = y0 + 150 + k * (y1 - y0 - 250) / 8
        box(cr, (0, y, 108), (2 * DOCK_IN - 20, 14, 10), 'Glow')
        for sx in (1, -1):
            box(cr, (sx * (DOCK_IN - 8), y, -20), (16, 30, 220), 'Mech')
    for k in range(5):
        y = y0 + 300 + k * 320
        box(cr, (0, y, -120), (240, 60, 40), 'Mech')

    # 後ろ（-Y）の船台：2 本の長い桁、ガントリー、下の背骨
    for sx in (1, -1):
        FacetLoft([
            sec(SLIP_Y1, sx * SLIP_X, -10, 45, 70, 55, 90, 100, 'Hull'),
            sec(SLIP_Y1 + 120, sx * SLIP_X, -10, 55, 85, 65, 100, 110, 'Hull'),
            sec(-HUB_R + 100, sx * SLIP_X, -10, 55, 85, 65, 100, 110, 'Hull'),
        ], chamfer=0.2, mid=0.1, seg=1, cap_back='Hull2', cap_front='Hull2').build(cr)
    FacetLoft([
        sec(SLIP_Y1 + 200, 0, -150, 60, 80, 60, 30, 40, 'Mech'),
        sec(-HUB_R + 100, 0, -150, 60, 80, 60, 30, 40, 'Mech'),
    ], chamfer=0.2, mid=0.1, seg=1, cap_back='Mech', cap_front='Mech').build(cr)
    for k in range(6):
        y = SLIP_Y1 + 280 + k * 300
        box(cr, (0, y, 100), (2 * SLIP_X + 120, 40, 40), 'Mech')
        for sx in (1, -1):
            box(cr, (sx * (SLIP_X + 60), y, 60), (40, 40, 90), 'Mech')
        box(cr, (0, y, -150), (2 * SLIP_X, 30, 30), 'Mech')

    # 左右の腕（X 方向）。リングの外まで伸びて、先に係留の塔
    for sx in (1, -1):
        def arm(p):
            FacetLoft([
                sec(HUB_R - 120, 0, -20, 150, 220, 170, 110, 120, 'Hull'),
                sec(ARM_X1 - 160, 0, -20, 150, 220, 170, 110, 120, 'Hull'),
                sec(ARM_X1, 0, -20, 110, 160, 120, 80, 95, 'Hull'),
            ], chamfer=0.22, mid=0.1, seg=1, cap_back='Hull2', cap_front='Hull2').build(p, transform=along_x)
            # 背中の一段高い背骨
            FacetLoft([
                sec(HUB_R + 100, 0, 90, 60, 95, 100, 45, 5, 'Hull2'),
                sec(ARM_X1 - 420, 0, 90, 60, 95, 100, 45, 5, 'Hull2'),
            ], chamfer=0.3, mid=0.1, seg=1, cap_back='Hull2', cap_front='Hull2').build(p, transform=along_x)
        if sx > 0:
            arm(cr)
        else:
            rotated(arm, math.pi, cr)
    # 腕がリングと交わるところの、太い継ぎ手（4 か所）
    for k in range(4):
        a = k * math.pi / 2
        w = 640 / RING_R1
        if k == 1:
            continue  # メインドックの中
        rotated(lambda p: revolve(p, collar_prof(30, 'Hull'), -w / 2, w / 2, n=6), a, cr)


# ---- 中央のハブと管制塔 -------------------------------------------------------------------


def build_hub(P):
    hub = P['Hub']
    lathe(hub, [
        (0, -220, 'Hull2'), (HUB_R - 120, -220, 'Hull2'), (HUB_R, -160, 'Hull2'), (HUB_R, -40, 'Dark'),
        (HUB_R, 30, 'Hull'), (HUB_R - 70, 120, 'Hull'), (560, 150, 'Dark'), (560, 200, 'Hull'),
        (480, 260, 'Hull'), (450, 300, 'Dark'), (450, 340, 'Hull'), (330, 390, 'Hull'), (310, 420, 'Hull'), (0, 425, 'Hull'),
    ], n=128)
    # ハブのまわりの窓の帯の輪
    revolve(hub, [
        (HUB_R + 40, -120, 'Hull2'), (HUB_R + 260, -120, 'Hull2'), (HUB_R + 260, -30, 'Dark'),
        (HUB_R + 260, 30, 'Hull'), (HUB_R + 220, 80, 'Hull'), (HUB_R + 70, 80, 'Hull'), (HUB_R + 40, 40, 'Hull2'),
    ], n=160)
    # ハブの下：ぶら下がる柱と、先の観測球
    cyl(hub, (0, 0, -200), (0, 0, -560), 110, 70, 'Hull2', n=32)
    cyl(hub, (0, 0, -560), (0, 0, -700), 70, 40, 'Mech', n=24)
    cyl(hub, (0, 0, -700), (0, 0, -820), 30, 6, 'Metal', n=16)
    for k in range(6):
        a = k * math.pi / 3 + math.pi / 6
        x, y = 420 * math.cos(a), 420 * math.sin(a)
        cyl(hub, (x, y, -200), (x, y, -330), 50, 50, 'Mech', n=16)
        cyl(hub, (x, y, -330), (x, y, -470), 80, 80, 'Hull', n=20)
        cyl(hub, (x, y, -470), (x, y, -500), 80, 50, 'Hull2', n=20)


def build_tower(P):
    tw = P['Tower']
    lathe(tw, [(r * 1.3, z, m) for r, z, m in [
        (220, 420, 'Hull2'), (200, 480, 'Hull'), (150, 510, 'Hull'), (150, 580, 'Dark'),
        (210, 600, 'Hull'), (210, 650, 'Dark'), (190, 670, 'Hull'), (120, 690, 'Hull'),
        (120, 760, 'Hull2'), (170, 780, 'Hull'), (170, 820, 'Glass'), (150, 840, 'Hull'),
        (90, 860, 'Hull'), (90, 930, 'Hull2'), (120, 950, 'Hull'), (120, 980, 'Dark'),
        (70, 1010, 'Hull'), (0, 1020, 'Hull'),
    ]], n=64)
    # アンテナの塔
    cyl(tw, (0, 0, 1010), (0, 0, 1300), 14, 4, 'Metal', n=12)
    for k, (h, r) in enumerate([(1020, 70), (980, 60), (940, 80)]):
        a = k * 2 * math.pi / 3
        x, y = r * math.cos(a), r * math.sin(a)
        cyl(tw, (x, y, 930), (x, y, h + 150), 9, 3, 'Metal', n=10)
    # 塔の横の箱（通信・管制の部屋）
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        rotated(lambda p: box(p, (250, 0, 620), (90, 70, 100), 'Hull2'), a, tw)


# ---- リングの外の整備アーム・ビーコンの塔 -------------------------------------------------------


def maint_arm(p):
    """+X 方向（リングの外）へ伸びる整備アーム。付け根は外壁"""
    r = RING_R1
    box(p, (r + 25, 0, -20), (50, 90, 110), 'Mech')
    cyl(p, (r + 50, 0, -20), (r + 70, 0, -20), 35, 35, 'Metal', n=16)
    # 上腕：外へ、少し上へ
    cyl(p, (r + 60, 0, -20), (r + 260, 0, 90), 16, 14, 'Hull2', n=12)
    box(p, (r + 260, 0, 90), (46, 46, 46), 'Mech')
    # 前腕：さらに外へ、下向き
    cyl(p, (r + 260, 0, 90), (r + 420, 0, 10), 12, 10, 'Hull2', n=12)
    # つかむ手
    box(p, (r + 430, 0, 0), (30, 50, 30), 'Mech')
    for s in (1, -1):
        box(p, (r + 460, s * 18, -5), (50, 8, 10), 'Metal')
    box(p, (r + 260, 0, 120), (8, 8, 20), 'NavRed')


def beacon(p, r):
    box(p, (r, 0, RING_TOP + 40), (50, 50, 80), 'Hull2')
    cyl(p, (r, 0, RING_TOP + 80), (r, 0, RING_TOP + 190), 6, 3, 'Metal', n=8)
    box(p, (r, 0, RING_TOP + 195), (14, 14, 14), 'NavRed')


def mooring_tower(p, x):
    """腕の先の係留の塔（+X 向き）"""
    cyl(p, (x - 60, 0, -150), (x - 60, 0, 170), 45, 45, 'Hull2', n=20)
    cyl(p, (x - 60, 0, 170), (x - 60, 0, 230), 45, 20, 'Hull', n=20)
    cyl(p, (x - 60, 0, 230), (x - 60, 0, 330), 6, 3, 'Metal', n=8)
    box(p, (x - 60, 0, 335), (16, 16, 16), 'NavRed')
    box(p, (x + 70, 0, -20), (140, 40, 30), 'Mech')
    box(p, (x + 145, 0, -20), (12, 60, 50), 'Red')


def build_arms(P):
    arms = P['Arms']
    for k in range(8):
        rotated(maint_arm, math.pi / 8 + k * math.pi / 4, arms)
    for k in range(SEGMENTS):
        if k % 4 == 0:
            continue
        a = 2 * math.pi * k / SEGMENTS
        rotated(lambda p: beacon(p, (RING_R0 + RING_R1) / 2), a, arms)
    for sx in (1, -1):
        rotated(lambda p: mooring_tower(p, ARM_X1), 0 if sx > 0 else math.pi, arms)
    # 船台の先の塔
    for sx in (1, -1):
        x = sx * SLIP_X
        cyl(arms, (x, SLIP_Y1 + 60, -110), (x, SLIP_Y1 + 60, 180), 40, 40, 'Hull2', n=16)
        cyl(arms, (x, SLIP_Y1 + 60, 180), (x, SLIP_Y1 + 60, 300), 6, 3, 'Metal', n=8)
        box(arms, (x, SLIP_Y1 + 60, 305), (16, 16, 16), 'NavRed')
    # ドックの屋根の上のビーコン
    for sx in (1, -1):
        for y in (DOCK_Y1 - 60, (DOCK_Y0 + DOCK_Y1) / 2):
            x = sx * (DOCK_HALF - 40)
            box(arms, (x, y, 150), (40, 40, 40), 'Hull2')
            cyl(arms, (x, y, 170), (x, y, 260), 5, 3, 'Metal', n=8)
            box(arms, (x, y, 263), (14, 14, 14), 'NavRed' if sx > 0 else 'NavGreen')


# ---- ステージ 2：細部 ------------------------------------------------------------------------


def hoop(part, y, rx, rz, cz, thick, depth, mat, n=20, a0=0.0, a1=2 * math.pi):
    """Y 軸のまわりの楕円の輪（建造中の船の肋骨など）。a0..a1 の範囲だけ作る"""
    full = abs(a1 - a0 - 2 * math.pi) < 1e-9
    rings = n if full else n + 1
    verts = []
    for i in range(rings):
        t = a0 + (a1 - a0) * i / n
        c, s_ = math.cos(t), math.sin(t)
        for dr, dy in ((0, -depth / 2), (thick, -depth / 2), (thick, depth / 2), (0, depth / 2)):
            verts.append(((rx + dr) * c, y + dy, cz + (rz + dr) * s_))
    faces = []
    for i in range(n):
        i2 = (i + 1) % rings
        for j in range(4):
            j2 = (j + 1) % 4
            faces.append([i * 4 + j, i * 4 + j2, i2 * 4 + j2, i2 * 4 + j])
    if not full:
        faces.append([0, 1, 2, 3])
        last = (rings - 1) * 4
        faces.append([last + 3, last + 2, last + 1, last])
    part.add(verts, faces, mat)


def ring_details(ring):
    rng = __import__('random').Random(7)
    seg = 2 * math.pi / SEGMENTS
    for k in range(SEGMENTS):
        a0 = k * seg
        cross = lambda a: min(abs(((a + math.pi / 4) % (math.pi / 2)) - math.pi / 4), 9)  # noqa: E731
        lo, hi = a0 + 0.012, a0 + seg - 0.012
        # 十字の継ぎ手のそばは空ける
        if cross(lo) < 0.23:
            lo = a0 + 0.23
        if cross(hi) < 0.23:
            hi = a0 + seg - 0.23
        # 上の甲板の家（段々）
        revolve(ring, [
            (RING_R0 + 70, RING_TOP - 5, 'Hull2'), (RING_R1 - 70, RING_TOP - 5, 'Dark'), (RING_R1 - 70, RING_TOP + 25, 'Hull'),
            (RING_R1 - 95, RING_TOP + 40, 'Hull'), (RING_R0 + 95, RING_TOP + 40, 'Dark'), (RING_R0 + 70, RING_TOP + 25, 'Hull2'),
        ], lo + 0.02, hi - 0.02, n=10)
        revolve(ring, [
            (RING_R0 + 120, RING_TOP + 35, 'Hull2'), (RING_R0 + 210, RING_TOP + 35, 'Hull2'), (RING_R0 + 210, RING_TOP + 60, 'Hull'),
            (RING_R0 + 120, RING_TOP + 60, 'Hull'),
        ], lo + 0.05, (lo + hi) / 2 - 0.01, n=6)
        # 外壁の出入り口（赤い枠の四角）と、内壁の配管
        for t in (0.3, 0.7):
            a = lo + (hi - lo) * t
            rotated(lambda p: (box(p, (RING_R1 + 6, 0, -5), (14, 70, 50), 'Red'), box(p, (RING_R1 + 9, 0, -5), (12, 50, 34), 'Bay')), a, ring)
        # 甲板の上の小さな機械
        for _ in range(6):
            a = lo + (hi - lo) * rng.random()
            r = rng.uniform(RING_R0 + 40, RING_R1 - 40)
            on_house = RING_R0 + 95 < r < RING_R1 - 95
            z = RING_TOP + (40 if on_house else 0)
            w, d, h = rng.uniform(15, 45), rng.uniform(15, 60), rng.uniform(8, 22)
            rotated(lambda p: box(p, (r, 0, z + h / 2), (w, d, h), rng.choice(['Hull2', 'Mech', 'Hull'])), a, ring)
        # 下面のラジエーター
        a = (lo + hi) / 2
        rotated(lambda p: box(p, ((RING_R0 + RING_R1) / 2, 0, RING_BOT - 25), (200, 6, 50), 'Metal'), a, ring)
    for z in (-70, -40):
        revolve(ring, [(RING_R0 - 14, z - 6, 'Metal'), (RING_R0 - 2, z - 6, 'Metal'), (RING_R0 - 2, z + 6, 'Metal'), (RING_R0 - 14, z + 6, 'Metal')], n=192)
    # 軌道リングの上を走る作業台車
    for k in range(10):
        a = 2 * math.pi * (k + 0.3) / 10
        rotated(lambda p: (box(p, (TRACK_R, 0, 45), (110, 70, 40), 'Hull2'), box(p, (TRACK_R, 0, 70), (60, 40, 14), 'Glow')), a, ring)


def ship_frame(cr):
    """船台で建造中の船：竜骨、肋骨の列、後ろの方だけ外板が張ってある"""
    y0, y1 = -1800, -HUB_R - 60
    L = y1 - y0
    box(cr, (0, (y0 + y1) / 2, -40), (30, L, 30), 'Mech')
    for k in range(17):
        y = y0 + L * k / 16
        t = k / 16
        sc = 0.55 + 0.45 * math.sin(math.pi * min(1, (t * 1.25)) / 2) if t < 0.8 else 1 - (t - 0.8) * 1.8
        hoop(cr, y, 180 * sc, 110 * sc, 10, 10, 16, 'Mech', n=18)
    FacetLoft([
        sec(y0, 0, 10, 60, 100, 70, 60, 60, 'Hull2'),
        sec(y0 + L * 0.3, 0, 10, 100, 175, 120, 105, 105, 'Hull'),
    ], chamfer=0.25, mid=0.1, seg=2, cap_back='Mech', cap_front='Mech').build(cr)
    for y in (y0 + 40, y0 + 120):
        cyl(cr, (0, y, 10), (0, y - 60, 10), 40, 50, 'Metal', n=16, cap1=None)


def cross_details(cr):
    rng = __import__('random').Random(11)
    # メインドックの外壁：窓の帯と装甲板、屋根の上の部屋
    for sx in (1, -1):
        box(cr, (sx * (DOCK_HALF - 2), (DOCK_Y0 + DOCK_Y1) / 2 - 60, 10), (6, DOCK_Y1 - DOCK_Y0 - 260, 40), 'Dark')
        for k in range(7):
            y = DOCK_Y0 + 160 + k * 250
            box(cr, (sx * (DOCK_HALF - 4), y, -70), (12, 170, 60), 'Hull2')
        # 中の壁の、明かりのついた詰め所の列
        box(cr, (sx * (DOCK_IN + 1), (DOCK_Y0 + DOCK_Y1) / 2, 40), (4, DOCK_Y1 - DOCK_Y0 - 200, 12), 'Window')
        box(cr, (sx * (DOCK_IN + 1), (DOCK_Y0 + DOCK_Y1) / 2, -80), (4, DOCK_Y1 - DOCK_Y0 - 200, 8), 'Window')
    for k in range(6):
        y = DOCK_Y0 + 200 + k * 300
        box(cr, (0, y, 160), (rng.uniform(200, 420), rng.uniform(80, 160), 22), 'Hull2')
        box(cr, (rng.uniform(-250, 250), y + 80, 170), (60, 40, 20), 'Mech')
    # 中のクレーン（天井の梁と、つり下げた台）
    for k in range(4):
        y = DOCK_Y0 + 350 + k * 420
        box(cr, (0, y, 95), (2 * DOCK_IN - 10, 30, 22), 'Mech')
        box(cr, (k * 60 - 90, y, 60), (40, 40, 50), 'Hull2')
        box(cr, (k * 60 - 90, y, 32), (30, 30, 6), 'Glow')
    # 床の誘導灯
    for sx in (1, -1):
        for k in range(14):
            box(cr, (sx * 140, DOCK_Y0 + 150 + k * 125, -129), (10, 40, 3), 'Glow')
    # 船台：ガントリーの作業灯、足場
    for k in range(6):
        y = SLIP_Y1 + 280 + k * 300
        for x in (-200, -60, 60, 200):
            box(cr, (x, y, 76), (20, 20, 6), 'Glow')
    ship_frame(cr)
    # 左右の腕：窓の帯、ぶら下がる貨物ポッド、上の箱
    for ang in (0, math.pi):
        def arm_detail(p):
            for sy in (1, -1):
                box(p, ((HUB_R + ARM_X1) / 2, sy * 219, 0), (ARM_X1 - HUB_R - 400, 6, 36), 'Dark')
            for k in range(5):
                x = HUB_R + 380 + k * 300
                if abs(x - (RING_R0 + RING_R1) / 2) < 260 or abs(x - TRACK_R) < 80:
                    continue
                cyl(p, (x, -60, -150), (x, 60, -150), 45, 45, 'Hull2', n=16)
                cyl(p, (x, -60, -150), (x, -90, -150), 45, 25, 'Mech', n=16)
                cyl(p, (x, 60, -150), (x, 90, -150), 45, 25, 'Mech', n=16)
                box(p, (x, 0, -125), (30, 30, 30), 'Mech')
            for k in range(8):
                x = HUB_R + 240 + k * 200
                box(p, (x, rng.choice([-1, 1]) * rng.uniform(110, 160), 95), (rng.uniform(40, 90), rng.uniform(30, 60), 18), rng.choice(['Hull2', 'Mech']))
        rotated(arm_detail, ang, cr)


def hub_details(hub):
    # ハブのすそのリブと、まわりの輪の出入り口
    for k in range(24):
        a = 2 * math.pi * k / 24
        rotated(lambda p: box(p, (HUB_R - 40, 0, 70), (90, 12, 50), 'Hull2', ry=-0.9), a, hub)
    for k in range(12):
        a = 2 * math.pi * (k + 0.5) / 12
        if k % 3 == 1:
            continue
        rotated(lambda p: (box(p, (HUB_R + 262, 0, -60), (10, 80, 60), 'Red'), box(p, (HUB_R + 266, 0, -60), (8, 60, 44), 'Bay')), a, hub)
    # 上のパラボラアンテナ
    for k, a in enumerate((0.5, 2.6, 4.4)):
        x, y = 520 * math.cos(a), 520 * math.sin(a)
        cyl(hub, (x, y, 150), (x, y, 210), 12, 12, 'Metal', n=10)
        cyl(hub, (x + 25, y, 250), (x, y, 205), 75, 8, 'Hull', n=24)


def tower_details(tw):
    # 管制室の張り出しと、横のアンテナ
    for k in range(3):
        a = k * 2 * math.pi / 3 + 0.4
        rotated(lambda p: (box(p, (250, 0, 900), (110, 40, 26), 'Hull2'), box(p, (300, 0, 912), (10, 30, 50), 'Metal'),
                           cyl(p, (330, 0, 990), (300, 0, 950), 48, 6, 'Hull', n=20)), a, tw)
    for z in (700, 760):
        box(tw, (0, 0, z), (340, 20, 8), 'Mech')
    box(tw, (0, 0, 1300), (16, 16, 16), 'NavRed')


def build_stage2(P):
    ring_details(P['Ring'])
    cross_details(P['Cross'])
    hub_details(P['Hub'])
    tower_details(P['Tower'])


# ---- ステージ 3：テクスチャの焼き込み（アマツカゼ・アルカディアと同じ流れ） --------------------------

TEX = int(os.environ.get('TEX', '4096'))
LIVE = {'Glow', 'Blue', 'NavRed', 'NavGreen'}
PALETTE = {  # 色, ラフネス, メタリック（設定画の色見本：白っぽい灰色、濃い灰色、赤、薄い青、銀）
    'Hull': ('#c8cbd2', 0.5, 0.25), 'Hull2': ('#9da2ad', 0.55, 0.3), 'Red': ('#8e1d24', 0.5, 0.15),
    'Dark': ('#2b303b', 0.55, 0.45), 'Mech': ('#4a505c', 0.5, 0.6), 'Metal': ('#9298a4', 0.3, 0.9),
    'Glass': ('#0d1622', 0.1, 0.3), 'Window': ('#1a2029', 0.15, 0.3), 'Bay': ('#3b3c40', 0.7, 0.2),
}
LIVE_COLORS = {'Glow': (1.0, 0.9, 0.72), 'Blue': (0.35, 0.7, 1.0), 'NavRed': (1, 0.05, 0.03), 'NavGreen': (0.05, 1, 0.2)}


def amatsu():
    import build_amatsukaze as ba
    ba.MATS = MATS
    ba.TEX = TEX
    ba.PARTS = PARTS
    return ba


def node_edge_small(nt, m):
    out = amatsu().node_edge(nt, m)
    for n in nt.nodes:
        if n.bl_idname == 'ShaderNodeBevel':
            n.inputs['Radius'].default_value = 3.0 * S
    return out


def compose(P, N, ID, AO, EDGE):
    ba = amatsu()
    from scipy import ndimage
    valid = ID[..., 3] > 0.5
    mid = np.clip((ID[..., 0] * 32).astype(int), 0, 31)
    part = np.clip((ID[..., 1] * 32).astype(int), 0, 31)
    pos = P[..., :3] - 1
    nrm = N[..., :3] * 2 - 1
    x, y, z = pos[..., 0] / S, pos[..., 1] / S, pos[..., 2] / S  # メートル
    nx, ny, nz = nrm[..., 0], nrm[..., 1], nrm[..., 2]
    rho = np.hypot(x, y)
    ao = np.clip(ba.soft_blur(AO[..., 0], valid, 1.2), 0, 1)
    edge = np.clip(ba.soft_blur(EDGE[..., 0], valid, 0.8) * 6, 0, 1)
    is_m = lambda n: mid == MATS.index(n)  # noqa: E731
    is_p = lambda n: part == PARTS.index(n) + 1  # noqa: E731

    base = np.zeros((TEX, TEX, 3), dtype=np.float32)
    rough = np.zeros((TEX, TEX), dtype=np.float32)
    metal = np.zeros((TEX, TEX), dtype=np.float32)
    for m, (col, r, mt) in PALETTE.items():
        sel = is_m(m)
        base[sel] = ba.srgb(col)
        rough[sel] = r
        metal[sel] = mt
    emit = np.zeros((TEX, TEX, 3), dtype=np.float32)
    height = np.zeros((TEX, TEX), dtype=np.float32)

    # 1. 窓：暗い帯の縦の壁に、階ごとの列（窓 1 つ 6 m、点灯は半分ほど。設定画のとおり薄い青が多め）
    blue, warm = np.array([0.55, 0.8, 1.0]), np.array([1.0, 0.78, 0.5])
    wall = np.abs(nz) < 0.4
    u = x * (-ny) + y * nx  # 壁に沿った横の長さ
    u = np.where(is_p('Ring') | is_p('Hub'), np.arctan2(y, x) * rho, u)

    def windows(mask, pu, pv, ww, wh, lit_rate, seed, every=8):
        uu, vv = u / pu, z / pv
        cu, cv = np.floor(uu), np.floor(vv)
        fu, fv = uu - cu, vv - cv
        win = mask & (np.abs(fu - 0.5) < ww / pu / 2) & (np.abs(fv - 0.5) < wh / pv / 2) & (np.mod(cu, every) != every - 1)
        block = ba.hash2(np.floor(cu / 7), cv, seed + 9)
        lit = win & (ba.hash2(cu, cv + 3, seed) < lit_rate * (0.3 + 1.4 * block))
        colr = np.where((ba.hash2(cu + 0.37, cv * 1.7, seed + 5) < 0.62)[..., None], blue, warm)
        inten = (0.55 + 0.45 * ba.hash2(cu * 0.61, cv + 11, seed * 3))[..., None]
        base[win] = ba.srgb('#10161f')
        rough[win] = 0.12
        metal[win] = 0.3
        emit[lit] = (colr * inten)[lit]
        height[win] = -0.5
    dark_wall = valid & is_m('Dark') & wall
    windows(dark_wall, 15.0, 9.0, 10.0, 4.6, 0.55, 1, every=6)
    # 管制塔のガラスの帯は、ほぼ全部ついている
    gl = valid & is_m('Glass')
    uu = np.floor(np.arctan2(y, x) * rho / 12.0)
    base[gl] = ba.srgb('#0d1622')
    emit[gl] = (np.array([0.75, 0.9, 1.0]) * (0.55 + 0.35 * ba.hash2(uu, 1.0, 6.0))[..., None])[gl]
    wb = valid & is_m('Window')
    emit[wb] = np.array([1.0, 0.85, 0.62]) * (0.6 + 0.4 * ba.hash2(np.floor(y / 30), np.floor(z / 20), 1.0))[wb][..., None]
    base[wb] = ba.srgb('#151b24')
    # 出入り口の中（Bay）は、奥の小さな明かり
    bay = valid & is_m('Bay')
    bl = bay & (np.abs(np.mod(z / 12, 1) - 0.5) < 0.12) & (ba.hash2(np.floor(u / 18), np.floor(z / 12), 4.0) < 0.5)
    emit[bl] = np.array([1.0, 0.8, 0.55]) * 0.5

    # 2. パネル割り：リングとハブは円に沿って、腕と塔は長さに沿って
    km = pos / S / 1000 * 0.4  # 板の目安の大きさ（Panels の 0.04 ≈ 67 m）
    ax = np.argmax(np.abs(nrm), axis=-1)
    round_ = is_p('Ring') | is_p('Hub') | is_p('Tower')
    rk, tk = rho / 1000 * 0.4, np.arctan2(y, x) * rho / 1000 * 0.4
    a = np.where(round_, tk, np.where(ax == 1, km[..., 0], km[..., 1]))
    b = np.where(round_, np.where(ax == 2, rk, km[..., 2]), np.where(ax == 2, np.where(np.abs(x) > np.abs(y), km[..., 1], km[..., 0]), km[..., 2]))
    a = np.mod(a + 0.6, 1.2) - 0.6
    b = np.mod(b + ax * 0.0371 + 0.3, 0.6) - 0.3
    dist, pidx = ba.Panels(31).sample(a, b)
    dist2, pidx2 = ba.Panels(57).sample(np.mod(a * 2.0 + 0.9, 1.2) - 0.6, np.mod(b * 2.0 + 0.3, 0.6) - 0.3)
    dist2 = dist2 / 2.0
    paint = valid & (is_m('Hull') | is_m('Hull2') | is_m('Red'))
    gw = 3.0 / 1000 * 0.4  # 継ぎ目の幅（約 3 m。焼き込みの 1 画素が約 6 m なので、ぼんやりした線になる）
    g1 = np.clip(1 - dist / (gw * 2.2), 0, 1)
    g2 = np.clip(1 - dist2 / (gw * 1.6), 0, 1) * 0.5
    g = np.maximum(g1, g2) * paint
    height -= g * 0.6
    hp = ba.hash2(pidx, ax * 1.0, 2.0)
    hp2 = ba.hash2(pidx2, ax * 1.0, 5.0)
    bright = 1 + (hp - 0.5) * 0.08 + (hp2 - 0.5) * 0.04
    base[paint] *= bright[paint][..., None]
    rough[paint] += ((ba.hash2(pidx, 7.0, 1.0) - 0.5) * 0.14)[paint]
    base *= (1 - 0.35 * g)[..., None]
    # ところどころの濃い色の板（設定画の、白と灰色のまだら）
    dark_plate = paint & ~is_m('Red') & (ba.hash2(pidx, 13.0, 3.0) < 0.12)
    base[dark_plate] *= 0.78
    hatch = paint & (ba.hash2(pidx2, 3.0, 9.0) < 0.07) & (dist2 > gw * 2.0) & (dist2 < gw * 3.0)
    base[hatch] *= 0.75
    height[hatch] -= 0.4
    mech = valid & (is_m('Mech') | is_m('Dark')) & ~dark_wall
    stripes = mech & (np.mod(np.where(ax == 2, x + y, z) / 4.0, 1) < 0.2) & (ba.hash2(np.floor(u / 40), np.floor(z / 15), 4.0) < 0.5)
    base[stripes] *= 0.7
    height[stripes] -= 0.3
    # 上を向いた面の、薄い青の誘導灯（設定画の青い点）
    top = valid & (nz > 0.9) & paint & ~is_p('Tower')
    cell = 120.0
    cu, cv = np.floor(x / cell), np.floor(y / cell)
    fu, fv = x / cell - cu, y / cell - cv
    dot = top & (np.hypot(fu - 0.5, fv - 0.5) < 0.018) & (ba.hash2(cu, cv, 21.0) < 0.35)
    emit[dot] = np.array([0.45, 0.75, 1.0]) * 1.4
    base[dot] = ba.srgb('#203040')

    # 3. 汚れ：ゆるいむら、角の明るいすり減り、下を向いた面のくすみ
    noise = ba.value_noise(pos, 30.0, 3)
    base *= (1 + (noise - 0.5) * 0.08 * paint)[..., None]
    base *= (1 - 0.1 * np.clip(-nz, 0, 1) * paint)[..., None]
    base *= (1 + 0.12 * edge * paint)[..., None]
    base *= (0.45 + 0.55 * ao)[..., None]

    nrm_map = np.zeros((TEX, TEX, 3), dtype=np.float32)
    nrm_map[..., 2] = 1
    hs = ndimage.gaussian_filter(height, 0.6)
    texel = ba.estimate_texel(pos, valid)
    cont_x = valid & np.roll(valid, -1, 1) & (np.linalg.norm(np.roll(pos, -1, 1) - pos, axis=-1) < texel * 3)
    cont_y = valid & np.roll(valid, -1, 0) & (np.linalg.norm(np.roll(pos, -1, 0) - pos, axis=-1) < texel * 3)
    nrm_map[..., 0] = -np.where(cont_x, np.roll(hs, -1, 1) - hs, 0) * 0.9
    nrm_map[..., 1] = -np.where(cont_y, np.roll(hs, -1, 0) - hs, 0) * 0.9
    nrm_map /= np.linalg.norm(nrm_map, axis=-1, keepdims=True)
    return base, np.clip(rough, 0.05, 1), np.clip(metal, 0, 1), emit, nrm_map, valid


def live_material(name):
    mat = bpy.data.materials.new(name + '_live')
    mat.name = name
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    col = LIVE_COLORS[name]
    bsdf.inputs['Base Color'].default_value = (*col, 1)
    bsdf.inputs['Emission Color'].default_value = (*col, 1)
    bsdf.inputs['Emission Strength'].default_value = 4
    return mat


def lod(objs, ratio):
    """遠くで使う、面を減らした写し（同じ絵を使う）。名前は Lite<部品>"""
    out = []
    for obj in objs:
        c = obj.copy()
        c.data = obj.data.copy()
        c.name = 'Lite' + obj.name
        bpy.context.scene.collection.objects.link(c)
        mod = c.modifiers.new('dec', 'DECIMATE')
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        for o in bpy.context.scene.objects:
            o.select_set(o == c)
        bpy.context.view_layer.objects.active = c
        bpy.ops.object.modifier_apply(modifier=mod.name)
        out.append(c)
    return out


def bake_and_export(objs):
    ba = amatsu()
    t0 = time.time()
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.world = bpy.data.worlds.new('bakeworld')
    scene.world.use_nodes = True
    scene.world.light_settings.distance = 150 * S
    for obj in objs:
        obj.pass_index = PARTS.index(obj.name) + 1
    ba.unwrap(objs)
    print(f'  unwrap {time.time() - t0:.0f}s', flush=True)
    Pp = ba.bake_pass(objs, 'P', 'EMIT', ba.node_position)
    Np = ba.bake_pass(objs, 'N', 'EMIT', ba.node_normal)
    IDp = ba.bake_pass(objs, 'ID', 'EMIT', ba.node_ids)
    Ep = ba.bake_pass(objs, 'EDGE', 'EMIT', node_edge_small, samples=8)
    AOp = ba.bake_pass(objs, 'AO', 'AO', None, samples=int(os.environ.get('AO_SAMPLES', '64')))
    texel = ba.estimate_texel(Pp[..., :3] - 1, IDp[..., 3] > 0.5)
    print(f'  texel ≈ {texel / S:.2f} m', flush=True)
    base, rough, metal, emit, nrm, valid = compose(Pp, Np, IDp, AOp, Ep)
    orm = np.stack([np.ones_like(rough), rough, metal], -1)
    base, orm, emit = ba.dilate(base, valid), ba.dilate(orm, valid), ba.dilate(emit, valid)
    nrm_rgb = ba.dilate(nrm * 0.5 + 0.5, valid)
    tex_dir = os.environ.get('TEX_DIR', '/tmp/claude-0/spacedock-tex')
    os.makedirs(tex_dir, exist_ok=True)
    images = {
        'base': ba.save_image('spacedock_base', ba.to_srgb(base), 'sRGB', os.path.join(tex_dir, 'base.png')),
        'orm': ba.save_image('spacedock_orm', orm, 'Non-Color', os.path.join(tex_dir, 'orm.png')),
        'normal': ba.save_image('spacedock_normal', nrm_rgb, 'Non-Color', os.path.join(tex_dir, 'normal.png')),
        'emit': ba.save_image('spacedock_emit', ba.to_srgb(emit), 'sRGB', os.path.join(tex_dir, 'emit.png')),
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
    print(f'  bake done {time.time() - t0:.0f}s', flush=True)
    lite = lod(objs, float(os.environ.get('LOD_RATIO', '0.12')))
    print(f'  lite {sum(len(o.data.polygons) for o in lite)} faces', flush=True)
    for o in lite:
        o.hide_render = True
    if not os.environ.get('NOEXPORT'):
        ba.select_only(objs + lite)
        bpy.ops.export_scene.gltf(
            filepath=OUT, export_format='GLB', use_selection=True, export_vertex_color='NONE', export_normals=True,
            export_texcoords=True, export_tangents=False, export_materials='EXPORT', export_image_format='JPEG',
            export_jpeg_quality=88, export_yup=True)
        print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB', flush=True)
    return lite


# ---- 確認用の描画 -------------------------------------------------------------------------

PREVIEW_COLORS = {
    'Hull': '#c4c7cf', 'Hull2': '#9ca1ac', 'Red': '#9a1d2b', 'Dark': '#2a2f3b', 'Mech': '#4a505d', 'Metal': '#868c98',
    'Glass': '#14202e', 'Window': '#ffd9a0', 'Bay': '#3a3a3c', 'Glow': '#ffe6c0', 'Blue': '#4a9cff', 'NavRed': '#ff2020',
    'NavGreen': '#20ff50',
}


def preview(tag):
    from mathutils import Vector
    ar.PREVIEW_COLORS = PREVIEW_COLORS
    ar.EMISSIVE = {'Window', 'Glow', 'Blue', 'NavRed', 'NavGreen'}
    if STAGE < 3:
        ar.preview_materials()
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = int(os.environ.get('PREVIEW_SAMPLES', '24'))
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = int(os.environ.get('RES_X', '1280')), int(os.environ.get('RES_Y', '720'))
    scene.view_settings.view_transform = 'AgX'
    scene.world = bpy.data.worlds.new('world')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.02, 0.025, 0.04, 1)
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.0
    sun.data.angle = 0.02
    sun.rotation_euler = (0.85, 0.0, 2.4)
    scene.collection.objects.link(sun)
    fill = bpy.data.objects.new('fill', bpy.data.lights.new('fill', 'SUN'))
    fill.data.energy = 0.5
    fill.rotation_euler = (2.0, 0.0, -0.8)
    scene.collection.objects.link(fill)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    k = 1000 * S
    shots = {
        # 設定画の大きな絵と同じく、メインドックの口を左手前に見る角度
        'hero': ((-4.2, 4.6, 2.6), (0.15, 0.2, -0.15), 'PERSP', 40),
        'top': ((0, 0, 8), (0, 0, 0), 'ORTHO', 5.6),
        'front': ((0, 8, 0.15), (0, 0, 0.15), 'ORTHO', 5.6),
        'side': ((8, 0, 0.15), (0, 0, 0.15), 'ORTHO', 5.6),
        'dock': ((-0.9, 3.9, 0.12), (0.05, 1.5, -0.02), 'PERSP', 32),
        'under': ((3.4, -3.6, -1.9), (0, 0, -0.2), 'PERSP', 40),
        'tower': ((1.2, 1.5, 1.15), (0, 0, 0.62), 'PERSP', 40),
        'far': ((5.5, 6.5, 4.5), (0, 0, 0), 'PERSP', 35),
    }
    for name in os.environ.get('VIEWS', 'hero,top,front,side').split(','):
        pos, target, kind, lens = shots[name]
        cam.location = Vector(pos) * k
        cam.rotation_euler = (Vector(target) * k - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sq = name == 'top'
        scene.render.resolution_y = scene.render.resolution_x if sq else int(os.environ.get('RES_Y', '720'))
        if sq:
            cam.rotation_euler = (0, 0, 0)
        cam.data.type = kind
        if kind == 'ORTHO':
            cam.data.ortho_scale = lens * k
        else:
            cam.data.lens = lens
        cam.data.clip_start = 0.002 * k
        cam.data.clip_end = 100 * k
        scene.render.filepath = os.path.join(PREVIEW_DIR, f'spacedock-{tag}-{name}.png')
        bpy.ops.render.render(write_still=True)
        print('  render', name, flush=True)


def main():
    t0 = time.time()
    ar.S = S
    ar.MATS = MATS
    bf.reset_scene()
    for m in MATS:
        bpy.data.materials.new(m)
    P = {name: Part() for name in PARTS}
    build_ring(P)
    build_cross(P)
    build_hub(P)
    build_tower(P)
    build_arms(P)
    if STAGE >= 2:
        build_stage2(P)
    objs = []
    for name in PARTS:
        if P[name].faces:
            obj = ar.make_object(name, P[name])
            if STAGE >= 2:
                ar.bevel(obj, 1.5 * S)
            bf.sharpen(obj, 35)
            objs.append(obj)
    nf = sum(len(o.data.polygons) for o in objs)
    print(f'  {nf} faces ({time.time() - t0:.1f}s)', flush=True)
    for obj in objs:
        co = np.array([v.co[:] for v in obj.data.vertices]) / S
        lo, hi = co.min(0), co.max(0)
        print(f'  {obj.name:6s} x {lo[0]:.0f}..{hi[0]:.0f} y {lo[1]:.0f}..{hi[1]:.0f} z {lo[2]:.0f}..{hi[2]:.0f}  ({len(obj.data.polygons)} faces)')
    if STAGE >= 3:
        bake_and_export(objs)
    if os.environ.get('PREVIEW'):
        preview(f's{STAGE}')


if __name__ == '__main__':
    main()
