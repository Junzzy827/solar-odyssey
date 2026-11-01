"""
無人の惑星探査ローバー ORV-7（全長 1.8 m、全幅 1.2 m、全高 1.35 m）を Blender で組み立てる。

junji さんの設定資料（「惑星探査陸上ドローン」、正面・側面・上面の三面図）から形を起こした。
三面図どうしの縮尺が少しずつずれているので、寸法は設定表の数字（1800 × 1200 × 1350 mm）に合わせ、
形は図からとっている。側面図の「450」の寸法線は図の車輪の間隔（約 710 mm）と合わないので、
上面図と側面図の両方に合う車輪の間隔 720 mm をとった。

  - 車体：断面をつないだ箱形の筒。前が低く面取りされ、前面にライト 2 灯とグリル
  - 足まわり：6 輪のロッカー・ボギー。車体の横の 2 つの関節から、前輪・後輪へ腕、中輪へ 2 本のリンク
  - 車輪：ブロックパターンのタイヤ、6 本スポークのホイール
  - マスト：車体の前寄りの柱の上に、レンズ 3 つの観測カメラ
  - ロボットアーム：車体の右前の角から。肩・ひじ・手首の 3 関節と 3 本指のつかみ手
  - 太陽電池：左右に開いた 2 枚ずつと、後ろの 1 枚。アンテナ 2 本

座標は Blender のまま（Z が上、前方が +Y、右が +X）。単位はメートル。地面が z=0。
動く部品は別のオブジェクトで、関節の位置が原点（親子関係は「関節と展開」の節）。
たたんだ姿（脚を振り上げて 3 輪を車体の横に並べ、腹を地面すれすれに下げ、マストとアンテナは前へ倒し、
太陽電池は天板の上へ折り返し、アームは前にたたむ）から、展開した姿まで、deploy_pose(t) で動かす。

実行:
  /home/user/.bpyvenv/bin/python tools/blender/build_rover.py
  STAGE=1..     改修の段階（1 は形のブロックアウト）
  PREVIEW=1     確認用の画像を PREVIEW_DIR に書き出す（VIEWS=hero,rear,low,top,side,front）
  DEPLOY=0..1   PREVIEW の展開の度合い（0 = たたんだ姿、1 = 展開した姿）
  ANIM=1        着陸船から落とされて着地し、展開するまでの連番画像を PREVIEW_DIR/anim に書き出す
  ARM=work|stow 展開したあとのアームの姿勢（work：設定資料の絵のように前へ伸ばして地面へ）
"""

import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_fleet as bf  # noqa: E402
import build_lander as bl  # noqa: E402
from build_fleet import Part, box, cylinder  # noqa: E402
from build_lander import PolyLoft  # noqa: E402

import bpy  # noqa: E402
import bmesh  # noqa: E402
import numpy as np  # noqa: E402

STAGE = int(os.environ.get('STAGE', '1'))
PREVIEW_DIR = os.environ.get('PREVIEW_DIR', '/tmp')
ARM = os.environ.get('ARM', 'work')

MATS = ['Hull', 'Hull2', 'Dark', 'Mech', 'Metal', 'Tyre', 'Solar', 'Glass', 'Lamp', 'Accent']

# 車輪：車軸の位置（右側。左は x を反転）
WHEEL_R = 0.20
WHEEL_W = 0.18
WHEEL_X = 0.50
WHEEL_Y = {'F': 0.72, 'M': 0.0, 'R': -0.72}

# 車体の断面：右半分の輪郭（上の中心、天板の端、肩、いちばん広いところ、腰、底の端、底の中心）
BODY_SECTIONS = [
    (-0.63, [(0, 0.79), (0.23, 0.79), (0.29, 0.75), (0.30, 0.60), (0.27, 0.52), (0.19, 0.49), (0, 0.49)], 'Dark'),
    (-0.59, [(0, 0.83), (0.26, 0.83), (0.33, 0.79), (0.34, 0.60), (0.31, 0.50), (0.22, 0.47), (0, 0.47)], 'Dark'),
    (-0.46, [(0, 0.83), (0.26, 0.83), (0.33, 0.79), (0.34, 0.60), (0.31, 0.50), (0.22, 0.47), (0, 0.47)], 'Hull'),
    (0.40, [(0, 0.83), (0.26, 0.83), (0.33, 0.79), (0.34, 0.60), (0.31, 0.50), (0.22, 0.47), (0, 0.47)], 'Hull'),
    (0.50, [(0, 0.81), (0.25, 0.81), (0.32, 0.77), (0.33, 0.60), (0.30, 0.50), (0.22, 0.47), (0, 0.47)], 'Hull'),
    (0.58, [(0, 0.745), (0.24, 0.745), (0.30, 0.71), (0.31, 0.58), (0.28, 0.50), (0.20, 0.48), (0, 0.48)], 'Hull'),
    (0.65, [(0, 0.715), (0.21, 0.715), (0.27, 0.68), (0.28, 0.57), (0.25, 0.51), (0.18, 0.49), (0, 0.49)], 'Hull'),
]


# ---- 小さな道具 ------------------------------------------------------------------


def beam(part, a, b, w, h, mat, up=(0, 0, 1)):
    """a から b への角材（幅 w、高さ h）。up はおおよその上向き"""
    a, b = np.array(a, float), np.array(b, float)
    d = b - a
    d /= np.linalg.norm(d)
    s = np.cross(d, up)
    if np.linalg.norm(s) < 1e-6:
        s = np.cross(d, (1, 0, 0))
    s /= np.linalg.norm(s)
    u = np.cross(s, d)
    verts = []
    for c in (a, b):
        for i, j in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            verts.append(c + s * i * w / 2 + u * j * h / 2)
    faces = [[0, 1, 2, 3][::-1], [4, 5, 6, 7]]
    for i in range(4):
        j = (i + 1) % 4
        faces.append([i, j, 4 + j, 4 + i])
    part.add(verts, faces, mat)


def joint(part, c, r, length, mat='Dark', axis=(1, 0, 0), n=16):
    """関節の円盤（axis 向きの短い円柱）"""
    c, ax = np.array(c, float), np.array(axis, float)
    cylinder(part, c - ax * length / 2, c + ax * length / 2, r, r, mat, n=n)


# ---- 関節と展開 -------------------------------------------------------------------
#
# 動く部品は別のオブジェクトにして、関節の位置を原点にしてある（親子関係つき）。
#   Body ─┬ Leg_F{R,L}（前の関節で回る）─ Wheel_F{R,L}
#         ├ Leg_M{R,L}（前の関節で回る：中輪へのリンク）─ Wheel_M{R,L}
#         ├ Leg_R{R,L}（後ろの関節で回る）─ Wheel_R{R,L}
#         ├ Mast（根元で前へ倒れる）─ Head（首振り）
#         ├ Antenna1, Antenna2（根元で前へ倒れる）
#         ├ Panel_{R,L}{1,2}（車体の肩のヒンジで、天板の上へ折り返す）
#         └ ArmYaw ─ ArmUpper ─ ArmFore ─ ArmHand（肩・ひじ・手首）
# 展開の度合い t（0 = たたんだ姿、1 = 展開した姿）で、それぞれの角度と車体の高さを決める。

KNUCKLE_F = (0.42, 0.52)  # 車体横の関節（y, z）
KNUCKLE_R = (-0.36, 0.52)
ARM_X = 0.37  # 脚の通る面

# たたんだときの脚の角度（X 軸まわり、度）。前輪は前へ振り上げ、中輪と後輪は後ろへ振り上げて
# 車体の横に 3 輪を並べる。車体は腹が地面すれすれ（BELLY_DROP だけ下がる）まで沈む。
LEG_FOLD = {'F': 122.0, 'M': -69.0, 'R': -117.0}
BELLY_DROP = 0.32
PANEL_HINGE = {1: (0.29, 0.99), -1: (0.29, 1.012)}  # 側面の太陽電池のヒンジ（x の大きさ、z）。左を上に重ねる
MAST_BASE = (0.0, 0.34, 0.93)
HEAD_PIVOT = (0.0, 0.34, 1.18)
ANTENNAS = [(0.10, -0.12, 1.30), (-0.17, -0.20, 1.18)]
ARM_BASE = (0.22, 0.60, 0.50)
ARM_SHOULDER = (0.22, 0.68, 0.50)
ARM_POSES = {  # 付け根の向き（外へ、度）、肩・ひじ・手首の角度（水平から、上が正）
    'work': (28, 38, -42, -78),
    'stow': (0, 86, -86, 0),
}
ARM_L = (0.36, 0.38, 0.10)


def hub(wn):
    return (WHEEL_Y[wn], WHEEL_R)


def leg_pivot(wn):
    return KNUCKLE_R if wn == 'R' else KNUCKLE_F


# ---- 車体 ------------------------------------------------------------------------


def build_body(g):
    segs = {(0, j): 'Dark' for j in range(6)}
    segs.update({(1, j): 'Dark' for j in range(6)})
    loft = PolyLoft(BODY_SECTIONS, segs, cap_back='Dark', cap_front='Hull2')
    loft.build(g)
    # 腹の暗い箱（電池・機器）
    box(g, (0, -0.02, 0.43), (0.42, 0.95, 0.10), 'Mech')
    # 前面：ライト 2 灯とグリル、角のオレンジ
    for sx in (1, -1):
        box(g, (sx * 0.155, 0.655, 0.60), (0.11, 0.03, 0.075), 'Dark')
        box(g, (sx * 0.155, 0.668, 0.60), (0.075, 0.01, 0.05), 'Lamp')
        box(g, (sx * 0.275, 0.60, 0.635), (0.02, 0.10, 0.07), 'Accent')
        # 側面の暗い窓のような装甲板（ORV-7 の文字の前）
        box(g, (sx * 0.338, 0.22, 0.66), (0.012, 0.30, 0.15), 'Dark')
        # 後ろの暗い箱の縦のオレンジ
        box(g, (sx * 0.336, -0.50, 0.66), (0.012, 0.025, 0.24), 'Accent')
        # 脚の関節の内側の台と、左右をつなぐ差動バーの端
        for ky, kz in (KNUCKLE_F, KNUCKLE_R):
            joint(g, (sx * 0.345, ky, kz), 0.045, 0.05, 'Dark')
        cylinder(g, (sx * 0.30, 0.03, 0.56), (sx * 0.345, 0.03, 0.56), 0.03, 0.03, 'Metal', n=12)
        # 太陽電池のヒンジと支え
        hx, hz = PANEL_HINGE[sx]
        box(g, (sx * hx, 0.02, hz - 0.02), (0.03, 0.66, 0.025), 'Mech')
        for y in (0.25, -0.22):
            beam(g, (sx * hx, y, 0.80), (sx * hx, y, hz - 0.03), 0.03, 0.03, 'Mech')
    for k in range(4):
        box(g, (0, 0.662, 0.545 - k * 0.018), (0.16, 0.012, 0.008), 'Dark')
    box(g, (0, 0.655, 0.66), (0.16, 0.012, 0.012), 'Accent')
    # 天板の機器：真ん中の計器箱と、後ろ寄りの低い箱
    box(g, (0, -0.02, 0.855), (0.24, 0.16, 0.05), 'Hull2')
    box(g, (0, -0.02, 0.882), (0.20, 0.12, 0.006), 'Dark')
    box(g, (0.0, -0.40, 0.85), (0.34, 0.20, 0.04), 'Mech')
    # マストの台（倒れるヒンジ）
    x, y, z = MAST_BASE
    box(g, (x, y, 0.88), (0.16, 0.16, 0.10), 'Mech')
    for sx in (1, -1):
        box(g, (sx * 0.06, y, z), (0.025, 0.06, 0.05), 'Dark')
    # アンテナの根元
    for ax, ay, _ in ANTENNAS:
        cylinder(g, (ax, ay, 0.83), (ax, ay, 0.89), 0.02, 0.02, 'Mech', n=10)
    # 後ろの太陽電池（動かない。車体の後ろへ張り出す）
    solar(g, -0.20, 0.20, -0.30, -0.78, 0.905, (3, 4))
    for x in (0.12, -0.12):
        beam(g, (x, -0.40, 0.87), (x, -0.40, 0.895), 0.03, 0.03, 'Mech')
        beam(g, (x, -0.60, 0.79), (x, -0.62, 0.895), 0.025, 0.025, 'Mech')
    # アームの付け根の台
    bx, by, bz = ARM_BASE
    box(g, (bx, by - 0.03, bz), (0.10, 0.10, 0.09), 'Mech')
    cylinder(g, (bx, by + 0.02, bz), (bx, by + 0.06, bz), 0.045, 0.045, 'Dark', n=16)


def build_antenna(g, x, y, top):
    cylinder(g, (x, y, 0.88), (x, y, 0.92), 0.012, 0.012, 'Dark', n=8)
    joint(g, (x, y, 0.90), 0.016, 0.04, 'Dark')
    cylinder(g, (x, y, 0.90), (x, y, top), 0.006, 0.003, 'Metal', n=6)
    cylinder(g, (x, y, 0.94), (x, y, 1.0), 0.010, 0.010, 'Dark', n=8)


# ---- マストとカメラ ----------------------------------------------------------------


def build_mast(g):
    x, y, z = MAST_BASE
    joint(g, (x, y, z), 0.035, 0.10, 'Dark')
    cylinder(g, (x, y, z), (x, y, 1.14), 0.034, 0.030, 'Metal', n=16)
    cylinder(g, (x, y, z), (x, y, z + 0.08), 0.05, 0.045, 'Hull2', n=16)
    box(g, (x, y, 1.15), (0.10, 0.08, 0.05), 'Mech')  # 首振りの台


def build_head(g):
    x, y, _ = HEAD_PIVOT
    joint(g, HEAD_PIVOT, 0.035, 0.12, 'Dark')
    # 頭：横に広い箱、前にレンズ 3 つ、横にオレンジの線
    hz = 1.275
    box(g, (x, y, hz), (0.34, 0.20, 0.13), 'Hull')
    box(g, (x, y + 0.104, hz), (0.33, 0.012, 0.11), 'Dark')
    for lx, r in ((-0.10, 0.033), (0.0, 0.040), (0.10, 0.033)):
        cylinder(g, (lx, y + 0.10, hz), (lx, y + 0.125, hz), r, r * 0.92, 'Mech', n=20)
        cylinder(g, (lx, y + 0.125, hz), (lx, y + 0.128, hz), r * 0.7, r * 0.7, 'Glass', n=20)
    for sx in (1, -1):
        box(g, (sx * 0.171, y + 0.02, hz + 0.01), (0.004, 0.09, 0.012), 'Accent')
    box(g, (x, y - 0.02, hz + 0.07), (0.20, 0.10, 0.012), 'Hull2')


# ---- 足まわり（ロッカー・ボギー） -----------------------------------------------------


def build_leg(g, wn, sx):
    """1 本の脚（関節から車輪の車軸まで）。座標は展開した姿の車体座標"""
    X = sx * ARM_X
    wy, hz = hub(wn)
    ky, kz = leg_pivot(wn)
    if wn in ('F', 'R'):
        joint(g, (X, ky, kz), 0.055, 0.05, 'Hull2')
        elbow = (X, wy - math.copysign(0.10, wy), 0.42)
        beam(g, (X, ky, kz), elbow, 0.06, 0.07, 'Hull')
        joint(g, elbow, 0.04, 0.07, 'Dark')
        beam(g, elbow, (X, wy, 0.42), 0.055, 0.06, 'Hull')
        # 立て軸（ステアリング）
        cylinder(g, (X, wy, 0.45), (X, wy, hz + 0.02), 0.026, 0.026, 'Metal', n=12)
        box(g, (X, wy, 0.43), (0.08, 0.09, 0.06), 'Mech')
        box(g, (X, wy, hz), (0.05, 0.08, 0.09), 'Mech')
    else:
        bog = (X, 0.06, 0.34)
        beam(g, (X, ky, kz), bog, 0.045, 0.05, 'Mech')
        joint(g, bog, 0.045, 0.07, 'Dark')
        beam(g, bog, (X, 0.0, hz + 0.06), 0.05, 0.06, 'Hull')
        box(g, (X, 0.0, hz), (0.05, 0.09, 0.12), 'Mech')
    cylinder(g, (X, wy, hz), (sx * (WHEEL_X - WHEEL_W / 2), wy, hz), 0.03, 0.03, 'Metal', n=12)


LINK_END = (-0.06, 0.40)
LINK_FOLD = 52.0  # たたむとき前上へ振り上げる角度（度）


def build_link(g, sx):
    """後ろの関節から中輪のほうへ伸びる短いリンク（たたむと前上へ逃げる）"""
    X = sx * (ARM_X + 0.055)
    ky, kz = KNUCKLE_R
    beam(g, (X, ky, kz), (X, *LINK_END), 0.05, 0.06, 'Hull')
    joint(g, (X, *LINK_END), 0.035, 0.07, 'Dark')


def build_wheel(sx):
    """車軸を原点にした 1 輪。sx は外側の向き（右 +1、左 -1）"""
    g = Part()
    r, hw = WHEEL_R, WHEEL_W / 2
    core = r - 0.028
    cylinder(g, (-hw, 0, 0), (hw, 0, 0), core, core, 'Tyre', n=32, cap0=None, cap1=None)
    # トレッド：周方向に 18 列。左右の半分ずつ互い違いの塊
    n = 18
    for k in range(n):
        t = 2 * math.pi * k / n
        for half, off in ((-1, 0.0), (1, math.pi / n)):
            a = t + off
            c = (half * hw * 0.5, (core + 0.014) * math.cos(a), (core + 0.014) * math.sin(a))
            box(g, c, (hw * 0.92, 0.042, 0.03), 'Tyre', rot_x=a - math.pi / 2)
    for s in (1, -1):
        x = s * hw
        cylinder(g, (x - s * 0.004, 0, 0), (x, 0, 0), core, core * 0.98, 'Tyre', n=32, cap0=None, cap1=None)
    # ホイール：外側にくぼんだ皿、6 本スポーク、ハブ
    xo = sx * (hw - 0.012)
    xi = sx * (hw - 0.05)
    cylinder(g, (-sx * hw * 0.98, 0, 0), (xi, 0, 0), 0.125, 0.125, 'Dark', n=24, cap1='Dark')
    cylinder(g, (xi, 0, 0), (xo, 0, 0), 0.135, 0.14, 'Hull2', n=24, cap0=None, cap1=None, inward=True)
    for k in range(6):
        a = 2 * math.pi * k / 6 + 0.3
        mid = 0.075
        box(g, ((xi + xo) / 2, mid * math.cos(a), mid * math.sin(a)), (abs(xo - xi), 0.11, 0.022), 'Hull2',
            rot_x=a)
    cylinder(g, (xi, 0, 0), (xo + sx * 0.008, 0, 0), 0.045, 0.04, 'Metal', n=16)
    cylinder(g, (xo + sx * 0.008, 0, 0), (xo + sx * 0.014, 0, 0), 0.025, 0.02, 'Mech', n=12)
    return g


# ---- 太陽電池 ----------------------------------------------------------------------


def solar(part, x0, x1, y0, y1, z, cells=(4, 4)):
    """平らな太陽電池板：枠（明るい金属）と、セルの面"""
    box(part, ((x0 + x1) / 2, (y0 + y1) / 2, z), (abs(x1 - x0), abs(y1 - y0), 0.018), 'Hull2')
    box(part, ((x0 + x1) / 2, (y0 + y1) / 2, z + 0.0095), (abs(x1 - x0) - 0.02, abs(y1 - y0) - 0.02, 0.002), 'Solar')
    nx, ny = cells
    for i in range(1, nx):
        x = x0 + (x1 - x0) * i / nx
        box(part, (x, (y0 + y1) / 2, z + 0.0108), (0.003, abs(y1 - y0) - 0.02, 0.001), 'Metal')
    for j in range(1, ny):
        y = y0 + (y1 - y0) * j / ny
        box(part, ((x0 + x1) / 2, y, z + 0.0108), (abs(x1 - x0) - 0.02, 0.003, 0.001), 'Metal')


PANEL_Y = {1: (0.34, 0.025), 2: (0.015, -0.30)}


def build_panel(g, sx, k):
    hx, hz = PANEL_HINGE[sx]
    y0, y1 = PANEL_Y[k]
    solar(g, sx * (hx + 0.01), sx * 0.66, y0, y1, hz, (3, 3))


# ---- ロボットアーム（各部はその関節を原点に、+Y へ伸ばして組む） -----------------------------


def build_arm_yaw(g):
    joint(g, (0, 0, 0), 0.05, 0.10, 'Dark')


def build_arm_upper(g):
    L = ARM_L[0]
    cylinder(g, (0, 0, 0), (0, L, 0), 0.032, 0.03, 'Hull', n=14)
    beam(g, (0, L * 0.2, 0), (0, L * 0.8, 0), 0.07, 0.03, 'Hull', up=(1, 0, 0))
    joint(g, (0, L, 0), 0.042, 0.09, 'Dark')


def build_arm_fore(g):
    L = ARM_L[1]
    cylinder(g, (0, 0, 0), (0, L, 0), 0.027, 0.025, 'Hull', n=14)
    beam(g, (0, L * 0.25, 0), (0, L * 0.75, 0), 0.055, 0.026, 'Hull2', up=(1, 0, 0))
    joint(g, (0, L, 0), 0.034, 0.075, 'Dark')


def build_arm_hand(g):
    L = ARM_L[2]
    cylinder(g, (0, 0, 0), (0, L, 0), 0.03, 0.03, 'Mech', n=14)
    d = np.array((0, 1.0, 0))
    hand = d * L
    cylinder(g, tuple(hand), tuple(hand + d * 0.03), 0.04, 0.035, 'Hull2', n=14)
    tip0 = hand + d * 0.03
    u, v = np.array((1.0, 0, 0)), np.array((0, 0, -1.0))
    for k in range(3):
        a = 2 * math.pi * k / 3
        o = u * math.cos(a) + v * math.sin(a)
        knuckle = tip0 + o * 0.03 + d * 0.035
        tip = tip0 + o * 0.012 + d * 0.085
        beam(g, tuple(tip0 + o * 0.02), tuple(knuckle), 0.016, 0.012, 'Metal', up=tuple(o))
        beam(g, tuple(knuckle), tuple(tip), 0.013, 0.01, 'Mech', up=tuple(o))


# ---- 展開の動き ------------------------------------------------------------------------


def ease(a, b, t):
    u = min(1.0, max(0.0, (t - a) / (b - a)))
    return u * u * (3 - 2 * u)


def leg_hub_z(wn, ang):
    """脚を ang（ラジアン）回したときの車軸の高さ（車体座標）"""
    ky, kz = leg_pivot(wn)
    wy, hz = hub(wn)
    vy, vz = wy - ky, hz - kz
    return kz + vy * math.sin(ang) + vz * math.cos(ang)


def deploy_pose(t):
    """展開の度合い t（0..1）での各部の回転（ラジアン）と車体の高さ"""
    s = ease(0.05, 0.50, t)
    legs = {wn: math.radians(f) * (1 - s) for wn, f in LEG_FOLD.items()}
    # 車体の高さ：腹が地面すれすれより下へは行かず、どの車輪も地面にめりこまない
    dz = max([-BELLY_DROP] + [WHEEL_R - leg_hub_z(wn, a) for wn, a in legs.items()])
    pose = {'dz': dz, 'legs': legs, 'link': math.radians(LINK_FOLD) * (1 - s)}
    pose['panel'] = {-1: math.pi * (1 - ease(0.50, 0.66, t)), 1: -math.pi * (1 - ease(0.57, 0.74, t))}
    pose['mast'] = -math.pi / 2 * (1 - ease(0.66, 0.84, t))
    pose['antenna'] = -math.pi / 2 * (1 - ease(0.72, 0.86, t))
    h = ease(0.86, 1.0, t)
    pose['head'] = math.radians(35) * math.sin(h * math.pi * 2) * (1 - h * 0.3)
    a = ease(0.80, 1.0, t)
    stow, work = ARM_POSES['stow'], ARM_POSES[ARM]
    pose['arm'] = [math.radians(p + (q - p) * a) for p, q in zip(stow, work)]
    return pose


def apply_pose(objs, pose):
    objs['Body'].location.z = pose['dz']
    for side in ('R', 'L'):
        for wn, a in pose['legs'].items():
            objs[f'Leg_{wn}{side}'].rotation_euler.x = a
        objs[f'Link_{side}'].rotation_euler.x = pose['link']
    for sx, side in ((1, 'R'), (-1, 'L')):
        for k in (1, 2):
            objs[f'Panel_{side}{k}'].rotation_euler.y = pose['panel'][sx]
    objs['Mast'].rotation_euler.x = pose['mast']
    objs['Head'].rotation_euler.z = pose['head']
    for i in range(len(ANTENNAS)):
        objs[f'Antenna{i + 1}'].rotation_euler.x = pose['antenna']
    yaw, a1, a2, a3 = pose['arm']
    objs['ArmYaw'].rotation_euler.z = -yaw
    objs['ArmUpper'].rotation_euler.x = a1
    objs['ArmFore'].rotation_euler.x = a2 - a1
    objs['ArmHand'].rotation_euler.x = a3 - a2



# ---- Blender のオブジェクトに ------------------------------------------------------------


def make_object(name, part, origin=(0, 0, 0), local=False):
    """origin を原点にしたオブジェクト。local=True なら part はもう原点まわりで組んである"""
    mesh = bpy.data.meshes.new(name)
    ox, oy, oz = (0, 0, 0) if local else origin
    mesh.from_pydata([(x - ox, y - oy, z - oz) for x, y, z in part.verts], [], part.faces)
    mesh.validate()
    used = [m for m in MATS if m in set(part.mats)]
    for m in used:
        mesh.materials.append(bpy.data.materials.get(m) or bpy.data.materials.new(m))
    idx = {m: i for i, m in enumerate(used)}
    mesh.polygons.foreach_set('material_index', np.array([idx[m] for m in part.mats], dtype=np.int32))
    obj = bpy.data.objects.new(name, mesh)
    obj.location = origin
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bm.to_mesh(mesh)
    bm.free()
    return obj


PREVIEW_COLORS = {
    'Hull': '#dcdde0', 'Hull2': '#a9adb5', 'Dark': '#26292f', 'Mech': '#4a4e57', 'Metal': '#8d939c',
    'Tyre': '#1d1e20', 'Solar': '#1b2850', 'Glass': '#0b1220', 'Lamp': '#fff4dc', 'Accent': '#e2761c',
}


def preview_materials():
    for name, h in PREVIEW_COLORS.items():
        m = bpy.data.materials.get(name)
        if not m:
            continue
        m.use_nodes = True
        b = m.node_tree.nodes.get('Principled BSDF')
        c = bl.lin(h)
        b.inputs['Base Color'].default_value = (*c, 1)
        b.inputs['Roughness'].default_value = {'Glass': 0.1, 'Solar': 0.25, 'Tyre': 0.9}.get(name, 0.5)
        b.inputs['Metallic'].default_value = 0.6 if name == 'Metal' else 0.1
        if name == 'Lamp':
            b.inputs['Emission Color'].default_value = (*c, 1)
            b.inputs['Emission Strength'].default_value = 8


def setup_preview():
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
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.2
    sun.data.angle = 0.03
    sun.rotation_euler = (0.75, 0.0, -2.2)
    scene.collection.objects.link(sun)
    fill = bpy.data.objects.new('fill', bpy.data.lights.new('fill', 'SUN'))
    fill.data.energy = 0.8
    fill.rotation_euler = (1.9, 0.0, 0.9)
    scene.collection.objects.link(fill)
    bpy.ops.mesh.primitive_plane_add(size=14)
    ground = bpy.context.active_object
    ground.name = 'Ground'
    gm = bpy.data.materials.new('GroundMat')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*bl.lin('#7a6655'), 1)
    gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.95
    ground.data.materials.append(gm)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam


SHOTS = {
    # 設定資料の絵と同じく、右前の角（アームのある側）を手前に
    'hero': ((2.55, 3.1, 1.25), (0.05, 0.1, 0.55), 'PERSP', 50, True),
    'rear': ((-2.6, -2.9, 1.5), (0, 0, 0.55), 'PERSP', 50, True),
    'low': ((1.5, 2.1, 0.25), (0.05, 0.1, 0.6), 'PERSP', 35, True),
    'top': ((0, 0, 6), None, 'ORTHO', 2.6, False),
    'side': ((-6, 0, 0.70), None, 'ORTHO', 2.6, False),
    'front': ((0, 6, 0.70), None, 'ORTHO', 2.6, False),
    'anim': ((2.9, 3.4, 1.55), (0.0, 0.0, 0.45), 'PERSP', 42, True),
}


def aim(name):
    from mathutils import Vector
    scene = bpy.context.scene
    cam = scene.camera
    pos, target, kind, lens, show_ground = SHOTS[name]
    bpy.data.objects['Ground'].hide_render = not show_ground
    cam.location = Vector(pos)
    if target:
        cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    elif name == 'top':
        cam.rotation_euler = (0, 0, -math.pi / 2)  # 前（+Y）が左
    elif name == 'side':
        cam.rotation_euler = (math.pi / 2, 0, -math.pi / 2)  # 左から見て前が左（設定資料の向き）
    elif name == 'front':
        cam.rotation_euler = (math.pi / 2, 0, math.pi)
    cam.data.type = kind
    if kind == 'ORTHO':
        cam.data.ortho_scale = lens
    else:
        cam.data.lens = lens
    cam.data.clip_start = 0.01


def preview(tag):
    scene = bpy.context.scene
    for name in os.environ.get('VIEWS', 'hero,rear,low,top,side,front').split(','):
        aim(name)
        scene.render.filepath = os.path.join(PREVIEW_DIR, f'rover-{tag}-{name}.png')
        bpy.ops.render.render(write_still=True)
        print('  render', name, flush=True)


def animate(objs):
    """着陸船から落とされて、着地して、展開するまでを連番画像に（あとで ffmpeg で動画に）"""
    scene = bpy.context.scene
    fps = int(os.environ.get('FPS', '24'))
    scene.render.resolution_x, scene.render.resolution_y = (int(v) for v in os.environ.get('ANIM_RES', '960x540').split('x'))
    scene.cycles.samples = int(os.environ.get('ANIM_SAMPLES', '12'))
    aim(os.environ.get('ANIM_VIEW', 'anim'))
    out = os.path.join(PREVIEW_DIR, 'anim')
    os.makedirs(out, exist_ok=True)
    drop_h, g = 1.4, 9.8 * float(os.environ.get('GRAVITY', '0.38'))  # 火星の重力
    t_fall = math.sqrt(2 * drop_h / g)
    t_wait, t_deploy, t_hold = 0.5, float(os.environ.get('DEPLOY_SEC', '6')), 1.0
    total = t_fall + t_wait + t_deploy + t_hold
    n = int(total * fps)
    step = int(os.environ.get('ANIM_STEP', '1'))
    for f in range(0, n, step):
        tm = f / fps
        pose = deploy_pose(0.0)
        lift = 0.0
        if tm < t_fall:
            lift = drop_h - 0.5 * g * tm * tm
        elif tm < t_fall + 0.25:  # 着地の小さなはね
            u = (tm - t_fall) / 0.25
            lift = 0.035 * math.sin(u * math.pi)
        elif tm > t_fall + t_wait:
            pose = deploy_pose(min(1.0, (tm - t_fall - t_wait) / t_deploy))
        pose['dz'] += lift
        apply_pose(objs, pose)
        scene.render.filepath = os.path.join(out, f'f{f:04d}.png')
        bpy.ops.render.render(write_still=True)
        print(f'  frame {f}/{n}', flush=True)


def build_all():
    """全部のオブジェクトを親子つきで作って、名前 → オブジェクトの辞書を返す"""
    objs = {}

    def add(name, fn, origin=(0, 0, 0), parent=None, local=False, part=None):
        g = part or Part()
        if fn:
            fn(g)
        o = make_object(name, g, origin, local)
        if parent:
            o.parent = objs[parent]
            o.location = tuple(np.array(origin) - np.array(PIVOTS[parent]))
        PIVOTS[name] = origin
        objs[name] = o
        return o

    add('Body', build_body)
    for sx, side in ((1, 'R'), (-1, 'L')):
        for wn in ('F', 'M', 'R'):
            ky, kz = leg_pivot(wn)
            add(f'Leg_{wn}{side}', lambda g: build_leg(g, wn, sx), (sx * ARM_X, ky, kz), 'Body')
            add(f'Wheel_{wn}{side}', None, (sx * WHEEL_X, WHEEL_Y[wn], WHEEL_R), f'Leg_{wn}{side}', True,
                build_wheel(sx))
        add(f'Link_{side}', lambda g: build_link(g, sx), (sx * (ARM_X + 0.055), *KNUCKLE_R), 'Body')
        for k in (1, 2):
            hx, hz = PANEL_HINGE[sx]
            add(f'Panel_{side}{k}', lambda g: build_panel(g, sx, k), (sx * hx, 0.02, hz), 'Body')
    add('Mast', build_mast, MAST_BASE, 'Body')
    add('Head', build_head, HEAD_PIVOT, 'Mast')
    for i, (x, y, top) in enumerate(ANTENNAS):
        add(f'Antenna{i + 1}', lambda g: build_antenna(g, x, y, top), (x, y, 0.90), 'Body')
    sh = np.array(ARM_SHOULDER)
    add('ArmYaw', build_arm_yaw, tuple(sh), 'Body', True)
    add('ArmUpper', build_arm_upper, tuple(sh), 'ArmYaw', True)
    add('ArmFore', build_arm_fore, tuple(sh + (0, ARM_L[0], 0)), 'ArmUpper', True)
    add('ArmHand', build_arm_hand, tuple(sh + (0, ARM_L[0] + ARM_L[1], 0)), 'ArmFore', True)
    for o in objs.values():
        o.rotation_mode = 'XYZ'
        bf.sharpen(o, 35)
    return objs


PIVOTS = {}


def measure(objs):
    bpy.context.view_layer.update()
    allco = np.concatenate([np.array([(o.matrix_world @ v.co)[:] for v in o.data.vertices]) for o in objs.values()])
    lo, hi = allco.min(0), allco.max(0)
    return (f'width {hi[0] - lo[0]:.2f}  length {hi[1] - lo[1]:.2f}  height {hi[2] - lo[2]:.2f}'
            f'  (z {lo[2]:.3f}..{hi[2]:.3f})')


def export(objs):
    """
    public/models/rover-orv7.glb に書き出す。関節はすべて 0（展開した姿で、アームはまっすぐ前）。
    展開の動きと運転中の姿勢は three.js 側（src/components/surface/Rover.tsx）で、同じ関節を回して作る。
    """
    preview_materials()
    for o in objs.values():
        o.rotation_euler = (0, 0, 0)
    objs['Body'].location = (0, 0, 0)
    for o in bpy.context.scene.objects:
        o.select_set(o.name in objs)
    out = os.environ.get('OUT', os.path.join(bf.OUT_DIR, 'rover-orv7.glb'))
    bpy.ops.export_scene.gltf(
        filepath=out, export_format='GLB', use_selection=True, export_vertex_color='NONE',
        export_normals=True, export_texcoords=False, export_tangents=False, export_materials='EXPORT', export_yup=True,
    )
    print('wrote', out, os.path.getsize(out) // 1024, 'KB', flush=True)


def main():
    t0 = time.time()
    bf.reset_scene()
    for m in MATS:
        bpy.data.materials.new(m)
    objs = build_all()
    nf = sum(len(o.data.polygons) for o in objs.values())
    print(f'  {len(objs)} objects, {nf} faces ({time.time() - t0:.1f}s)', flush=True)
    apply_pose(objs, deploy_pose(0.0))
    print('  folded  (m):', measure(objs))
    apply_pose(objs, deploy_pose(1.0))
    print('  deployed(m):', measure(objs))
    if os.environ.get('EXPORT'):
        export(objs)
    if os.environ.get('PREVIEW') or os.environ.get('ANIM'):
        preview_materials()
        setup_preview()
    if os.environ.get('PREVIEW'):
        t = float(os.environ.get('DEPLOY', '1'))
        apply_pose(objs, deploy_pose(t))
        preview(f's{STAGE}' + ('' if t == 1 else f'-t{t:g}'))
    if os.environ.get('ANIM'):
        animate(objs)


if __name__ == '__main__':
    main()
