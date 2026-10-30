"""
SA-07 アマツカゼ（海の船の形をした観測船）を Blender で組み立て、テクスチャを焼き込んで glb に書き出す。

ほかの船（build_fleet.py）は材質の名前だけを付けて、色や模様は three.js 側で決めているが、
この船は窓の明かり・パネルの継ぎ目・汚れまで 2048px の絵に焼き込む。

  1. 形を部位ごとのオブジェクトに組む（Hull / Telescope / Domes / Slit0-2 / Bridge / Stack / Engine）
  2. 角を面取り（Bevel モディファイア）して、全部の部位を 1 枚の UV にまとめて並べる
  3. Cycles で下ごしらえの絵を焼く：位置・向き・材質の番号・AO・角の丸み
  4. それを numpy で組み合わせて、ベースカラー / ノーマル / ラフネス＋メタリック / エミッシブを作る
     （窓の列、パネル割り、継ぎ目の墨入れ、色ムラ、すす汚れ）
  5. glb に書き出す。光る部品（噴射口 Glow、望遠鏡の鏡 Blue、航行灯 NavRed/NavGreen）は焼かずに
     材質の名前で残し、three.js 側で明滅させる。ドームのスリットの扉 Slit0-2 は three.js で開け閉めする。

座標は Blender のまま（Z が上、前方が +Y）。全長はおよそ 1（270 m）。1 m ≒ 0.00385。

実行:
  /home/user/.bpyvenv/bin/python tools/blender/build_amatsukaze.py
  STAGE=1..6   改修の段階ごとの確認用（6 が完成形）
  TEX=1024     絵の大きさ（確認用に小さく）
  PREVIEW=1    確認用の画像を PREVIEW_DIR に書き出す
"""

import math
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_fleet as bf  # noqa: E402  （bpy もここで読み込まれる）
from build_fleet import FacetLoft, Loft, Part, box, cylinder, nozzle, plate, strip, vloft  # noqa: E402

import bpy  # noqa: E402
import bmesh  # noqa: E402
import numpy as np  # noqa: E402
from scipy import ndimage  # noqa: E402

STAGE = int(os.environ.get('STAGE', '6'))
TEX = int(os.environ.get('TEX', '2048'))
OUT = os.environ.get('OUT', os.path.join(bf.OUT_DIR, 'ship-amatsu.glb'))
PREVIEW_DIR = os.environ.get('PREVIEW_DIR', '/tmp')
M_PER_UNIT = 1.04 / 270  # 1 m の長さ（模型の単位）

# 焼き込む材質（面ごとの役割）。Glow / Blue / Nav* は焼かずに名前で残す
MATS = ['Hull', 'Deck', 'Lower', 'Trim', 'Dark', 'Metal', 'Brass', 'Glass', 'Stripe', 'Glow', 'Blue', 'NavRed', 'NavGreen']
LIVE = {'Glow', 'Blue', 'NavRed', 'NavGreen'}
PARTS = ['Hull', 'Telescope', 'Domes', 'Slit0', 'Slit1', 'Slit2', 'Bridge', 'Stack', 'Engine']


def srgb(h):
    h = h.lstrip('#')
    c = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


# 材質ごとの (色, ラフネス, メタリック)
OLD_PALETTE = {
    'Hull': ('#b9bec6', 0.62, 0.25), 'Deck': ('#6d747e', 0.7, 0.2), 'Lower': ('#9e2a22', 0.62, 0.1),
    'Trim': ('#6d747e', 0.62, 0.25), 'Dark': ('#1c1f25', 0.55, 0.5), 'Metal': ('#a3a8b0', 0.35, 0.85),
    'Brass': ('#b9bec6', 0.55, 0.3), 'Glass': ('#1a2029', 0.2, 0.3), 'Stripe': ('#b9bec6', 0.6, 0.25),
}
# 段階 6 の配色：白銀の船体、紺の甲板とひさし、深い臙脂の船底、真鍮のドーム、金の水線
NEW_PALETTE = {
    'Hull': ('#c3c7cc', 0.58, 0.3), 'Deck': ('#2d3a50', 0.68, 0.2), 'Lower': ('#6a1f24', 0.62, 0.1),
    'Trim': ('#35435b', 0.55, 0.3), 'Dark': ('#15181d', 0.5, 0.6), 'Metal': ('#9ba1a9', 0.32, 0.9),
    'Brass': ('#b8904c', 0.26, 1.0), 'Glass': ('#0c1117', 0.12, 0.3), 'Stripe': ('#c9a24a', 0.32, 1.0),
}
PALETTE = NEW_PALETTE if STAGE >= 6 else OLD_PALETTE

WATERLINE = -0.022


# ---- 形 ------------------------------------------------------------------------


def hull_loft():
    return FacetLoft([
        (-0.47, 0, 0.0, 0.050, 0.052, 0.020, 0.024, 0.030, 'Hull'),
        (-0.44, 0, 0.0, 0.074, 0.078, 0.026, 0.028, 0.058, 'Hull'),
        (-0.36, 0, 0.0, 0.088, 0.092, 0.030, 0.030, 0.072, 'Hull'),
        (-0.10, 0, 0.0, 0.096, 0.100, 0.034, 0.032, 0.084, 'Hull'),
        (0.14, 0, 0.0, 0.088, 0.092, 0.030, 0.034, 0.080, 'Hull'),
        (0.32, 0, 0.0, 0.060, 0.064, 0.020, 0.040, 0.070, 'Hull'),
        (0.44, 0, 0.0, 0.030, 0.032, 0.010, 0.050, 0.058, 'Hull'),
        (0.485, 0, 0.0, 0.012, 0.012, 0.004, 0.054, 0.044, 'Hull'),
        (0.498, 0, 0.0, 0.003, 0.003, 0.0015, 0.056, 0.030, 'Hull'),
    ], chamfer=0.12, mid=0.0, seg=4)


def outward(part, verts, quads, mat, center, inward=False):
    """四角形を、中心から外向き（inward なら内向き）にそろえて足す"""
    c = np.array(center)
    faces = []
    for q in quads:
        p = [np.array(verts[i]) for i in q]
        n = np.cross(p[1] - p[0], p[2] - p[0])
        out = (sum(p) / len(p)) - c
        if (np.dot(n, out) < 0) != inward:
            q = list(reversed(q))
        faces.append(q)
    part.add(verts, faces, mat)


def dome_patch(r, u_lim, phi0, phi1, nu=10, nphi=24):
    """半球を x の帯で割ったはぎ（x = r·u、y-z 面の円の角度 φ：0 が前、π が後ろ）"""
    us = np.sin(np.linspace(-math.asin(u_lim), math.asin(u_lim), nu + 1)) if u_lim < 1 else np.sin(np.linspace(-math.pi / 2, math.pi / 2, nu + 1))
    phis = np.linspace(phi0, phi1, nphi + 1)
    verts = []
    for u in us:
        rho = r * math.sqrt(max(0.0, 1 - u * u))
        for ph in phis:
            verts.append((r * u, rho * math.cos(ph), rho * math.sin(ph)))
    quads = []
    w = nphi + 1
    for i in range(nu):
        for j in range(nphi):
            quads.append([i * w + j, (i + 1) * w + j, (i + 1) * w + j + 1, i * w + j + 1])
    return verts, quads


SLIT_U = 0.2
SLIT_PHI = (0.22, math.pi * 0.62)


def dome(domes, slits, k, y, z, r, mat):
    """天文台のドーム：台座のドラム、縦のスリットの開いた半球、内側の暗い壁、中の望遠鏡、スリットの扉"""
    zc = z + r * 0.35
    cylinder(domes, (0, y, z), (0, y, zc), r * 1.05, r * 1.05, 'Trim', n=48)
    # 台座のリングとレール
    cylinder(domes, (0, y, z), (0, y, z + r * 0.06), r * 1.12, r * 1.12, 'Metal', n=48)
    if STAGE >= 5:
        for h in (0.16, 0.27):
            cylinder(domes, (0, y, z + r * h), (0, y, z + r * h + r * 0.025), r * 1.065, r * 1.065, 'Metal', n=48)
        for a in np.linspace(0, 2 * math.pi, 12, endpoint=False):
            box(domes, (math.cos(a) * r * 1.07, y + math.sin(a) * r * 1.07, z + r * 0.17), (r * 0.05, r * 0.05, r * 0.2), 'Dark', rot_z=a)
    c = (0, y, zc)
    shift = lambda vs: [(vx, y + vy, zc + vz) for vx, vy, vz in vs]  # noqa: E731
    if STAGE < 5:
        v, q = dome_patch(r, 1.0, 0, math.pi, nu=20, nphi=24)
        outward(domes, shift(v), q, mat, c)
        return
    # 外側の殻：スリットの帯を抜いた左右と、スリットの奥（後ろ側）
    for lo, hi in ((-0.97, -SLIT_U), (SLIT_U, 0.97)):
        us = [math.sin(t) for t in np.linspace(math.asin(lo), math.asin(hi), 9)]
        verts, quads = [], []
        phis = np.linspace(0, math.pi, 25)
        for u in us:
            rho = r * math.sqrt(max(0.0, 1 - u * u))
            for ph in phis:
                verts.append((r * u, rho * math.cos(ph), rho * math.sin(ph)))
        for i in range(len(us) - 1):
            for j in range(24):
                quads.append([i * 25 + j, (i + 1) * 25 + j, (i + 1) * 25 + j + 1, i * 25 + j + 1])
        # 横の端（極）は扇形でふさぐ
        edge = 0 if lo < 0 else (len(us) - 1) * 25
        pole = len(verts)
        verts.append((math.copysign(r, lo), 0.0, 0.0))
        for j in range(24):
            quads.append([edge + j, edge + j + 1, pole])
        outward(domes, shift(verts), quads, mat, c)
    for ph0, ph1 in ((0, SLIT_PHI[0]), (SLIT_PHI[1], math.pi)):
        v, q = dome_patch(r, SLIT_U, ph0, ph1, nu=4, nphi=max(2, int((ph1 - ph0) / 0.13)))
        outward(domes, shift(v), q, mat, c)
    # 内側の暗い壁（スリットからのぞくと見える）と床
    v, q = dome_patch(r * 0.96, 1.0, 0, math.pi, nu=16, nphi=20)
    outward(domes, shift(v), q, 'Dark', c, inward=True)
    # スリットの縁の厚み
    for sx in (-1, 1):
        phis = np.linspace(*SLIT_PHI, 13)
        verts = []
        for ph in phis:
            for rr in (r, r * 0.96):
                u = sx * SLIT_U
                rho = rr * math.sqrt(1 - u * u)
                verts.append((rr * u, rho * math.cos(ph), rho * math.sin(ph)))
        quads = [[2 * j, 2 * j + 1, 2 * j + 3, 2 * j + 2] for j in range(12)]
        outward(domes, shift(verts), quads, 'Dark', c, inward=True)
    # 中の望遠鏡（前上を向く）
    cylinder(domes, (0, y - r * 0.15, zc + r * 0.05), (0, y + r * 0.25, zc + r * 0.55), r * 0.2, r * 0.2, 'Metal', n=24)
    cylinder(domes, (0, y - r * 0.05, zc - r * 0.02), (0, y - r * 0.05, zc + r * 0.2), r * 0.12, r * 0.08, 'Dark', n=16)
    # スリットの扉（ドームの中心を軸に、X 軸のまわりに回って後ろへ開く）
    s = Part()
    v, q = dome_patch(r * 1.012, SLIT_U * 1.3, SLIT_PHI[0] - 0.06, SLIT_PHI[1] + 0.06, nu=6, nphi=16)
    outward(s, v, q, mat, (0, 0, 0))
    v2, q2 = dome_patch(r * 0.995, SLIT_U * 1.3, SLIT_PHI[0] - 0.06, SLIT_PHI[1] + 0.06, nu=6, nphi=16)
    outward(s, v2, q2, mat, (0, 0, 0), inward=True)
    # 扉の縁の補強材
    for u in (-SLIT_U * 1.3, SLIT_U * 1.3):
        ph = np.linspace(SLIT_PHI[0] - 0.06, SLIT_PHI[1] + 0.06, 9)
        for a, b in zip(ph[:-1], ph[1:]):
            rr = r * 1.02
            rho = rr * math.sqrt(1 - u * u)
            cylinder(s, (rr * u, rho * math.cos(a), rho * math.sin(a)), (rr * u, rho * math.cos(b), rho * math.sin(b)), r * 0.018, r * 0.018, 'Metal', n=6)
    s.verts = shift(s.verts)
    slits[f'Slit{k}'] = (s, (0, y, zc))


def build_parts():
    P = {name: Part() for name in PARTS}
    hull, tel, domes, bridge, stack, eng = P['Hull'], P['Telescope'], P['Domes'], P['Bridge'], P['Stack'], P['Engine']
    D, M = 'Dark', 'Metal'
    loft = hull_loft()

    # 船体：水線より下は船底の色、平らな甲板は甲板の色
    tmp = Part()
    loft.build(tmp)
    mats = []
    for f in tmp.faces:
        zs = [tmp.verts[i][2] for i in f]
        cz = sum(zs) / len(zs)
        if cz < WATERLINE:
            mats.append('Lower')
        elif cz > 0.024 and max(abs(tmp.verts[i][0]) for i in f) < 0.098 and min(zs) > 0.02 and max(zs) - min(zs) < 0.012:
            mats.append('Deck')
        else:
            mats.append('Hull')
    hull.add(tmp.verts, tmp.faces, mats)
    for ang in (-0.08, math.pi + 0.08):
        strip(hull, loft, ang, -0.44, 0.44, 0.003, 'Stripe', lift=0.0008)

    # 船首の望遠鏡
    if STAGE >= 5:
        # 鏡筒：フード、段のついた筒、つば、根元の支え
        cylinder(tel, (0, 0.462, 0.012), (0, 0.484, 0.012), 0.0235, 0.0235, M, n=48, cap0=None, cap1=None)
        cylinder(tel, (0, 0.484, 0.012), (0, 0.486, 0.012), 0.026, 0.026, 'Trim', n=48)
        cylinder(tel, (0, 0.486, 0.012), (0, 0.500, 0.012), 0.022, 0.022, M, n=48, cap0=None, cap1=None)
        cylinder(tel, (0, 0.500, 0.012), (0, 0.5025, 0.012), 0.0245, 0.0245, 'Trim', n=48)
        # フード（遮光筒）：上が長く、下が短い斜めの切り口
        hood = Part()
        n = 48
        verts = []
        for i in range(n):
            a = 2 * math.pi * i / n
            x, z = math.cos(a), math.sin(a)
            verts.append((0.0228 * x, 0.5025, 0.012 + 0.0228 * z))
            verts.append((0.0228 * x, 0.512 + 0.006 * z, 0.012 + 0.0228 * z))
        quads = [[2 * i, 2 * ((i + 1) % n), 2 * ((i + 1) % n) + 1, 2 * i + 1] for i in range(n)]
        outward(hood, verts, quads, M, (0, 0.507, 0.012))
        inner = [(x * 0.93, yy, 0.012 + (z - 0.012) * 0.93) for x, yy, z in verts]
        outward(hood, inner, quads, D, (0, 0.507, 0.012), inward=True)
        tel.add(hood.verts, hood.faces, hood.mats)
        cylinder(tel, (0, 0.503, 0.012), (0, 0.44, 0.012), 0.0205, 0.0205, D, n=48, cap0=None, cap1=None, inward=True)
        cylinder(tel, (0, 0.452, 0.012), (0, 0.454, 0.012), 0.0205, 0.0205, 'Blue', n=48)
        # 副鏡の筒と、それを支える十字の細い腕
        cylinder(tel, (0, 0.487, 0.012), (0, 0.497, 0.012), 0.0055, 0.0055, M, n=20)
        for a in (0.25, 1.82, 3.39, 4.96):
            box(tel, (math.cos(a) * 0.013, 0.492, 0.012 + math.sin(a) * 0.013), (0.0155, 0.004, 0.0007), M, rot_y=-a)
        # 根元の支えの金具
        for sx in (-1, 1):
            box(tel, (sx * 0.021, 0.468, 0.006), (0.006, 0.016, 0.01), 'Trim')
        box(tel, (0, 0.468, -0.009), (0.016, 0.016, 0.006), 'Trim')
    else:
        cylinder(tel, (0, 0.47, 0.012), (0, 0.497, 0.012), 0.022, 0.022, M, n=40, cap0=None, cap1=None)
        cylinder(tel, (0, 0.497, 0.012), (0, 0.44, 0.012), 0.019, 0.019, D, n=40, cap0=None, cap1=None, inward=True)
        cylinder(tel, (0, 0.452, 0.012), (0, 0.454, 0.012), 0.019, 0.019, 'Blue', n=40)

    # 天文台のドームと、前のドームの台
    Loft([
        (0.115, 0, 0.030, 0.026, 0.008, 3.0, 'Hull'),
        (0.135, 0, 0.036, 0.046, 0.014, 3.5, 'Hull'),
        (0.205, 0, 0.036, 0.046, 0.014, 3.5, 'Hull'),
        (0.225, 0, 0.030, 0.026, 0.008, 3.0, 'Hull'),
    ], n=48).build(domes)
    slits = {}
    dmat = 'Brass'
    dome(domes, slits, 0, 0.27, 0.036, 0.034, dmat)
    dome(domes, slits, 1, 0.17, 0.05, 0.036, dmat)
    dome(domes, slits, 2, -0.26, 0.032, 0.034, dmat)

    # 上部構造：甲板から艦橋へ、低い段が重なってせり上がる
    Loft([
        (-0.225, 0, 0.030, 0.018, 0.008, 3.0, 'Hull'),
        (-0.195, 0, 0.034, 0.044, 0.022, 3.5, 'Hull'),
        (-0.10, 0, 0.036, 0.054, 0.030, 3.5, 'Hull'),
        (0.03, 0, 0.036, 0.056, 0.030, 3.5, 'Hull'),
        (0.085, 0, 0.034, 0.044, 0.022, 3.5, 'Hull'),
        (0.115, 0, 0.030, 0.018, 0.008, 3.0, 'Hull'),
    ], n=64).build(bridge)
    Loft([
        (-0.17, 0, 0.056, 0.014, 0.006, 3.0, 'Trim'),
        (-0.15, 0, 0.060, 0.036, 0.018, 3.5, 'Trim'),
        (-0.02, 0, 0.062, 0.042, 0.018, 3.5, 'Trim'),
        (0.045, 0, 0.060, 0.034, 0.016, 3.5, 'Trim'),
        (0.07, 0, 0.056, 0.012, 0.006, 3.0, 'Trim'),
    ], n=64).build(bridge)

    # 艦橋の塔：上へ行くほど細く後ろへ傾き、段ごとに縁がひさしのように張り出す
    H, T = 'Hull', 'Trim'
    big = STAGE >= 2

    def ledge(z, cy, hw, df, db, t=0.004, grow=0.008):
        if big:
            t, grow = t * 1.3, grow * 1.15
        return [
            (z, cy, hw, df, db, T),
            (z, cy, hw + grow, df + grow, db + grow * 0.6, T),
            (z + t, cy, hw + grow * 0.85, df + grow * 0.85, db + grow * 0.5, T),
            (z + t, cy, hw, df, db, H),
        ]
    levels = [
        (0.048, 0.006, 0.046, 0.064, 0.090, H),
        (0.066, 0.001, 0.041, 0.058, 0.083, H),
        (0.095, -0.010, 0.035, 0.044, 0.070, H),
        *ledge(0.101, -0.012, 0.033, 0.041, 0.067),
        (0.126, -0.020, 0.027, 0.032, 0.058, H),
        *ledge(0.132, -0.022, 0.026, 0.030, 0.056),
        (0.155, -0.030, 0.021, 0.024, 0.048, H),
        *ledge(0.161, -0.032, 0.020, 0.023, 0.046, t=0.003, grow=0.007),
        (0.182, -0.039, 0.017, 0.019, 0.040, H),
        (0.188, -0.038, 0.030, 0.036, 0.048, T),
        (0.1955, -0.037, 0.032, 0.038, 0.050, 'Glass'),
        (0.2005, -0.037, 0.032, 0.037, 0.050, H),
        (0.210, -0.039, 0.029, 0.031, 0.047, H),
        (0.216, -0.041, 0.020, 0.020, 0.034, T),
        (0.220, -0.042, 0.010, 0.010, 0.018, T),
    ]
    vloft(bridge, levels, n=64, p=2.4)
    # 指揮室の上の、左右に張り出した観測アーム
    Loft([
        (-0.058, 0, 0, 0.0015, 0.0015, 2.5, H),
        (-0.054, 0, 0, 0.0045, 0.0035, 2.5, H),
        (0.054, 0, 0, 0.0045, 0.0035, 2.5, H),
        (0.058, 0, 0, 0.0015, 0.0015, 2.5, H),
    ], n=24).build(bridge, transform=lambda v: (-v[1], -0.036 + v[0], 0.2125 + v[2]))
    # アンテナの柱と、レーダーの皿
    cylinder(bridge, (0, -0.046, 0.218), (0, -0.058, 0.262), 0.003, 0.0012, M, n=10)
    box(bridge, (0, -0.0545, 0.249), (0.04, 0.003, 0.0025), M)
    cylinder(bridge, (0, -0.028, 0.219), (0, -0.024, 0.226), 0.011, 0.004, M, n=24)
    if STAGE >= 4:
        # 細いアンテナ、センサーの小さな丸い覆い、通信の皿、桁の先の受信器
        for sx in (-1, 1):
            cylinder(bridge, (sx * 0.055, -0.036, 0.215), (sx * 0.055, -0.036, 0.236), 0.0007, 0.0003, M, n=6)
            cylinder(bridge, (sx * 0.019, -0.0545, 0.2475), (sx * 0.019, -0.0545, 0.2425), 0.0006, 0.0006, M, n=6)
            box(bridge, (sx * 0.019, -0.0545, 0.2415), (0.002, 0.002, 0.002), 'Dark')
            cylinder(bridge, (sx * 0.012, -0.05, 0.219), (sx * 0.012, -0.05, 0.2235), 0.0035, 0.0035, 'Hull', n=16)
            bf_sphere(bridge, (sx * 0.012, -0.05, 0.2235), 0.0035, 'Hull')
        cylinder(bridge, (0, -0.0525, 0.236), (0, -0.0531, 0.2385), 0.0045, 0.0045, 'Trim', n=16)
        cylinder(bridge, (0, -0.0505, 0.255), (0, -0.0505, 0.2552), 0.004, 0.004, M, n=12)
        # 皿の支え
        cylinder(bridge, (0, -0.03, 0.2165), (0, -0.028, 0.2195), 0.0012, 0.0012, M, n=8)
        # 上部構造の側面の小さな張り出し（通路と救命艇の格納庫）
        for sx in (-1, 1):
            box(bridge, (sx * 0.056, -0.12, 0.045), (0.006, 0.05, 0.008), 'Trim')
            box(bridge, (sx * 0.058, 0.0, 0.043), (0.005, 0.036, 0.006), 'Trim')

    # 排熱塔：後ろへ傾いた卵形の筒。上は縁が張り出し、暗い放熱口の格子
    vloft(stack, [
        (0.046, -0.118, 0.028, 0.036, 0.052, 'Hull'),
        (0.072, -0.130, 0.025, 0.031, 0.047, 'Hull'),
        (0.094, -0.143, 0.022, 0.027, 0.043, 'Trim'),
        (0.094, -0.143, 0.026, 0.031, 0.047, 'Trim'),
        (0.099, -0.145, 0.025, 0.030, 0.046, 'Trim'),
        (0.101, -0.146, 0.021, 0.026, 0.042, 'Dark'),
    ], n=48, p=2.4)
    for k in range(7):
        yy = -0.176 + k * 0.0075
        sec = math.sqrt(max(0.0, 1 - ((yy + 0.146) / (0.042 if yy < -0.146 else 0.026)) ** 2))
        box(stack, (0, yy, 0.1015), (0.04 * sec, 0.0028, 0.0016), 'Metal')
    if STAGE >= 4:
        for sx in (-1, 1):
            cylinder(stack, (sx * 0.012, -0.135, 0.1), (sx * 0.012, -0.137, 0.112), 0.0009, 0.0006, M, n=6)

    # 船尾：大きな主噴射口と、左右の補助噴射口
    nozzle(eng, (0, -0.52, 0.0), (0, -0.465, 0.0), 0.034, 0.05, n=48)
    if STAGE >= 4:
        cylinder(eng, (0, -0.466, 0), (0, -0.47, 0), 0.052, 0.052, 'Trim', n=48)
        for a in np.linspace(0, 2 * math.pi, 8, endpoint=False):
            box(eng, (math.cos(a) * 0.04, -0.478, math.sin(a) * 0.04), (0.006, 0.02, 0.004), 'Metal', rot_y=-a)
    for sx in (-1, 1):
        nozzle(eng, (sx * 0.055, -0.49, -0.012), (sx * 0.055, -0.455, -0.012), 0.012, 0.018, n=24)

    # 船底の安定翼と、左右の短い翼
    fin = [(-0.30, -0.06), (-0.44, -0.06), (-0.47, -0.13), (-0.40, -0.13)]
    plate(hull, fin, 0.006, 'Lower', edge_mat='Lower', axis='x')
    for sx in (-1, 1):
        w = Part()
        pts = [(sx * 0.095, -0.06, -0.01), (sx * 0.20, -0.12, -0.03), (sx * 0.20, -0.17, -0.03), (sx * 0.097, -0.20, -0.01)]
        plate(w, pts if sx > 0 else pts[::-1], 0.006, 'Hull', edge_mat='Trim')
        hull.add(w.verts, w.faces, w.mats)

    if STAGE >= 4:
        deck_details(hull, loft)
    else:
        for y in np.arange(-0.40, 0.40, 0.04):
            if -0.30 < y < 0.10 or 0.13 < y < 0.31:
                continue
            for sx in (-1, 1):
                box(hull, (sx * 0.06, y, 0.0335), (0.012, 0.018, 0.003), M)
        for sx in (-1, 1):
            strip(hull, loft, math.pi / 2 - sx * 0.83, -0.42, 0.44, 0.002, M, lift=0.0015)
    return P, slits


def bf_sphere(part, c, r, mat, n=16):
    """上半分の丸い覆い"""
    for k in range(4):
        a0, a1 = k / 4 * math.pi / 2, (k + 1) / 4 * math.pi / 2
        cylinder(part, (c[0], c[1], c[2] + r * math.sin(a0)), (c[0], c[1], c[2] + r * math.sin(a1)), r * math.cos(a0), max(r * math.cos(a1), 1e-4), mat, n=n, cap0=None, cap1='same' if k == 3 else None)


def deck_details(hull, loft):
    """甲板の手すり・ハッチ・点検口・小さなセンサー、舷側の航行灯"""
    M, T, D = 'Metal', 'Trim', 'Dark'
    # 手すり：甲板のふちに細い支柱と上の手すり
    for sx in (-1, 1):
        prev = None
        for y in np.arange(-0.43, 0.445, 0.007):
            sec = loft.at_sec(y)
            wt, ht = sec[3], sec[6]
            x = sx * (wt - 0.0025)
            if wt < 0.03:
                continue
            base = (x, y, ht - 0.0003)
            top = (x, y, ht + 0.0038)
            cylinder(hull, base, top, 0.00028, 0.00028, M, n=4, cap0=None, cap1=None)
            if prev:
                cylinder(hull, prev, top, 0.0002, 0.0002, M, n=4, cap0=None, cap1=None)
            prev = top
    # ハッチ（低い箱）と点検口、換気口、小さなセンサーの覆い
    hatches = [(0.36, 0.022, 0.012, 0.009), (0.36, -0.022, 0.012, 0.009), (0.40, 0, 0.010, 0.008),
               (0.315, 0.035, 0.008, 0.006), (0.315, -0.035, 0.008, 0.006),
               (-0.33, 0.03, 0.014, 0.01), (-0.33, -0.03, 0.014, 0.01), (-0.38, 0, 0.012, 0.012), (-0.415, 0.025, 0.008, 0.008), (-0.415, -0.025, 0.008, 0.008),
               (0.10, 0.07, 0.01, 0.008), (0.10, -0.07, 0.01, 0.008), (-0.06, 0.07, 0.012, 0.008), (-0.06, -0.07, 0.012, 0.008)]
    for y, x, ly, lx in hatches:
        z = loft.at_sec(y)[6]
        box(hull, (x, y, z + 0.0004), (lx, ly, 0.0014), T)
        box(hull, (x, y + ly * 0.3, z + 0.0012), (lx * 0.6, 0.0012, 0.0008), M)
    vents = [(0.385, 0.045), (0.385, -0.045), (-0.36, 0.055), (-0.36, -0.055), (-0.40, 0.05), (-0.40, -0.05), (0.33, 0.0)]
    for y, x in vents:
        z = loft.at_sec(y)[6]
        cylinder(hull, (x, y, z - 0.001), (x, y, z + 0.0035), 0.0028, 0.0028, T, n=16)
        cylinder(hull, (x, y, z + 0.0035), (x, y, z + 0.0036), 0.0024, 0.0024, D, n=16)
    sensors = [(0.43, 0.018), (0.43, -0.018), (-0.44, 0.03), (-0.44, -0.03), (0.06, 0.082), (0.06, -0.082)]
    for y, x in sensors:
        z = loft.at_sec(y)[6]
        cylinder(hull, (x, y, z - 0.0005), (x, y, z + 0.0015), 0.002, 0.002, M, n=12)
        bf_sphere(hull, (x, y, z + 0.0015), 0.002, 'Hull', n=12)
    # 舷側の航行灯（左舷は赤、右舷は緑）。光る玉は three.js で明滅させる
    for sx, lamp in ((-1, 'NavRed'), (1, 'NavGreen')):
        y = -0.05
        sec = loft.at_sec(y)
        x = sx * sec[3]
        box(hull, (x + sx * 0.001, y, sec[6] + 0.002), (0.004, 0.012, 0.005), T)
        cylinder(hull, (x + sx * 0.003, y - 0.003, sec[6] + 0.002), (x + sx * 0.003, y + 0.003, sec[6] + 0.002), 0.0016, 0.0016, lamp, n=10)


# ---- Blender の下ごしらえ --------------------------------------------------------------


def make_object(name, part, origin=(0, 0, 0)):
    mesh = bpy.data.meshes.new(name)
    o = np.array(origin)
    mesh.from_pydata([tuple(np.array(v) - o) for v in part.verts], [], part.faces)
    mesh.validate()
    used = [m for m in MATS if m in set(part.mats)]
    for m in used:
        mesh.materials.append(bpy.data.materials.get(m) or bpy.data.materials.new(m))
    idx = {m: i for i, m in enumerate(used)}
    mesh.polygons.foreach_set('material_index', np.array([idx[m] for m in part.mats], dtype=np.int32))
    obj = bpy.data.objects.new(name, mesh)
    obj.location = origin
    bpy.context.scene.collection.objects.link(obj)
    return obj


def select_only(objs, active=None):
    for o in bpy.context.scene.objects:
        o.select_set(o in objs)
    bpy.context.view_layer.objects.active = active or objs[0]


def bevel(obj, width):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bm.to_mesh(obj.data)
    bm.free()
    mod = obj.modifiers.new('bevel', 'BEVEL')
    mod.width = width
    mod.segments = 2
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(35)
    mod.use_clamp_overlap = True
    mod.miter_outer = 'MITER_ARC'
    select_only([obj])
    bpy.ops.object.modifier_apply(modifier=mod.name)


def unwrap(objs):
    select_only(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=0.003)
    bpy.ops.object.mode_set(mode='OBJECT')


def emit_tree(mat, build_color, image):
    """材質の中身を「色を光として出すだけ」にして、焼き先の絵を選んでおく"""
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(build_color(nt), em.inputs['Color'])
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    img = nt.nodes.new('ShaderNodeTexImage')
    img.image = image
    nt.nodes.active = img


def new_image(name, float_buffer=True):
    img = bpy.data.images.new(name, TEX, TEX, alpha=True, float_buffer=float_buffer)
    img.generated_color = (0, 0, 0, 0)
    return img


def bake_pass(objs, name, kind, color=None, samples=1):
    scene = bpy.context.scene
    scene.cycles.samples = samples
    img = new_image(name)
    for m in bpy.data.materials:
        if color:
            emit_tree(m, lambda nt, m=m: color(nt, m), img)
        else:
            emit_tree(m, lambda nt: nt.nodes.new('ShaderNodeRGB').outputs[0], img)
    select_only(objs)
    t = time.time()
    bpy.ops.object.bake(type=kind, margin=6, margin_type='EXTEND', use_clear=True)
    px = np.empty(TEX * TEX * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    print(f'  bake {name}: {time.time() - t:.1f}s', flush=True)
    return px.reshape(TEX, TEX, 4)


def node_position(nt, m):
    g = nt.nodes.new('ShaderNodeNewGeometry')
    add = nt.nodes.new('ShaderNodeVectorMath')
    add.operation = 'ADD'
    add.inputs[1].default_value = (1, 1, 1)
    nt.links.new(g.outputs['Position'], add.inputs[0])
    return add.outputs[0]


def node_normal(nt, m):
    g = nt.nodes.new('ShaderNodeNewGeometry')
    ma = nt.nodes.new('ShaderNodeVectorMath')
    ma.operation = 'MULTIPLY_ADD'
    ma.inputs[1].default_value = (0.5, 0.5, 0.5)
    ma.inputs[2].default_value = (0.5, 0.5, 0.5)
    nt.links.new(g.outputs['True Normal'], ma.inputs[0])
    return ma.outputs[0]


def node_ids(nt, m):
    info = nt.nodes.new('ShaderNodeObjectInfo')
    div = nt.nodes.new('ShaderNodeMath')
    div.operation = 'DIVIDE'
    div.inputs[1].default_value = 32
    nt.links.new(info.outputs['Object Index'], div.inputs[0])
    comb = nt.nodes.new('ShaderNodeCombineXYZ')
    comb.inputs[0].default_value = (MATS.index(m.name) + 0.5) / 32 if m.name in MATS else 31.5 / 32
    nt.links.new(div.outputs[0], comb.inputs[1])
    return comb.outputs[0]


def node_edge(nt, m):
    bev = nt.nodes.new('ShaderNodeBevel')
    bev.samples = 8
    bev.inputs['Radius'].default_value = 0.0012
    g = nt.nodes.new('ShaderNodeNewGeometry')
    dot = nt.nodes.new('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    nt.links.new(bev.outputs[0], dot.inputs[0])
    nt.links.new(g.outputs['Normal'], dot.inputs[1])
    sub = nt.nodes.new('ShaderNodeMath')
    sub.operation = 'SUBTRACT'
    sub.inputs[0].default_value = 1
    nt.links.new(dot.outputs['Value'], sub.inputs[1])
    return sub.outputs[0]


# ---- 絵を組み立てる ---------------------------------------------------------------


def hash2(a, b, c=0.0):
    v = np.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453
    return v - np.floor(v)


def value_noise(p, freq, seed=0):
    """3D の値ノイズ（すす汚れのむら用）"""
    rng = np.random.default_rng(seed)
    grid = rng.random((40, 40, 40)).astype(np.float32)
    grid = ndimage.gaussian_filter(grid, 1.0, mode='wrap')
    grid = (grid - grid.min()) / (grid.max() - grid.min())
    coords = ((p + 1) * freq) % 40
    return ndimage.map_coordinates(grid, [coords[..., 0], coords[..., 1], coords[..., 2]], order=1, mode='wrap')


class Panels:
    """船の流れ（前後）に沿ったパネル割り。行の高さも、パネルの長さも、大小をまぜる"""

    def __init__(self, seed):
        rng = random.Random(seed)
        self.rows = []
        b = -0.3
        while b < 0.35:
            h = rng.choice([0.008, 0.012, 0.012, 0.016, 0.022, 0.03])
            cuts = []
            a = -0.62 - rng.random() * 0.05
            while a < 0.62:
                cuts.append(a)
                a += rng.choice([0.016, 0.028, 0.04, 0.04, 0.055, 0.075, 0.1])
            cuts.append(a)
            self.rows.append((b, b + h, np.array(cuts)))
            b += h
        self.edges = np.array([r[0] for r in self.rows] + [self.rows[-1][1]])

    def sample(self, a, b):
        """(継ぎ目までの距離, パネルの番号) を返す"""
        ri = np.clip(np.searchsorted(self.edges, b) - 1, 0, len(self.rows) - 1)
        dist = np.full(a.shape, 1.0, dtype=np.float32)
        pid = np.zeros(a.shape, dtype=np.float32)
        for i, (b0, b1, cuts) in enumerate(self.rows):
            sel = ri == i
            if not sel.any():
                continue
            aa, bb = a[sel], b[sel]
            ci = np.clip(np.searchsorted(cuts, aa) - 1, 0, len(cuts) - 2)
            da = np.minimum(aa - cuts[ci], cuts[ci + 1] - aa)
            db = np.minimum(bb - b0, b1 - bb)
            dist[sel] = np.minimum(da, db)
            pid[sel] = ci * 131.0 + i * 17.0
        return dist, pid


def compose(P, N, ID, AO, EDGE):
    valid = ID[..., 3] > 0.5
    mid = np.clip((ID[..., 0] * 32).astype(int), 0, 31)
    part = np.clip((ID[..., 1] * 32).astype(int), 0, 31)
    pos = P[..., :3] - 1
    nrm = N[..., :3] * 2 - 1
    x, y, z = pos[..., 0], pos[..., 1], pos[..., 2]
    nx, ny, nz = nrm[..., 0], nrm[..., 1], nrm[..., 2]
    ao = np.clip(soft_blur(AO[..., 0], valid, 1.2), 0, 1)
    edge = np.clip(soft_blur(EDGE[..., 0], valid, 0.8) * 6, 0, 1)

    names = [m for m in MATS if m not in LIVE]
    base = np.zeros((TEX, TEX, 3), dtype=np.float32)
    rough = np.zeros((TEX, TEX), dtype=np.float32)
    metal = np.zeros((TEX, TEX), dtype=np.float32)
    for m in names:
        sel = mid == MATS.index(m)
        col, r, mt = PALETTE[m]
        base[sel] = srgb(col)
        rough[sel] = r
        metal[sel] = mt
    # 水線：面の単位でなく、絵の上でまっすぐに塗り分ける
    hull_paint = (part == PARTS.index('Hull') + 1) & ((mid == MATS.index('Hull')) | (mid == MATS.index('Lower')))
    for m, sel in (('Lower', hull_paint & (z < WATERLINE)), ('Hull', hull_paint & (z >= WATERLINE))):
        base[sel] = srgb(PALETTE[m][0])
        rough[sel] = PALETTE[m][1]
        metal[sel] = PALETTE[m][2]
        mid = np.where(sel, MATS.index(m), mid)
    # 甲板も、上を向いた平らなところを絵の上で塗り分ける（船首のふちがぎざぎざにならないように）
    top = (part == PARTS.index('Hull') + 1) & ((mid == MATS.index('Hull')) | (mid == MATS.index('Deck'))) & (z > 0.02)
    for m, sel in (('Deck', top & (nz > 0.9)), ('Hull', top & (nz <= 0.9))):
        base[sel] = srgb(PALETTE[m][0])
        rough[sel] = PALETTE[m][1]
        metal[sel] = PALETTE[m][2]
        mid = np.where(sel, MATS.index(m), mid)
    emit = np.zeros((TEX, TEX, 3), dtype=np.float32)
    height = np.zeros((TEX, TEX), dtype=np.float32)
    is_m = lambda name: mid == MATS.index(name)  # noqa: E731
    is_p = lambda name: part == PARTS.index(name) + 1  # noqa: E731

    # ---- 1. 窓：デッキの高さに沿った横一列。1 つ約 2 m、点灯は 3〜4 割、電球色と白〜水色をまぜる
    glass = srgb(PALETTE['Glass'][0])
    WW, WH, PITCH = 2.0 * M_PER_UNIT, 1.15 * M_PER_UNIT, 3.3 * M_PER_UNIT

    def windows(mask, rows, y0, side_key, skip_fn=None, lit_rate=0.35):
        for ri, zr in enumerate(rows):
            in_row = mask & (np.abs(z - zr) < WH / 2)
            if not in_row.any():
                continue
            u = (y - y0) / PITCH
            c = np.floor(u)
            f = u - c
            win = in_row & (np.abs(f - 0.5) < WW / PITCH / 2) & (np.mod(c, 9) != 8)
            if skip_fn is not None:
                win &= ~skip_fn(zr)
            side = np.sign(side_key)
            h1 = hash2(c, ri + 3.0, side)
            h2 = hash2(c + 0.37, ri * 1.7, side + 5)
            h3 = hash2(c * 0.61, ri + 11.0, side * 3)
            # 点灯は区画ごとにまとまりやすく（まばらに、でも完全なランダムでなく）
            block = hash2(np.floor(c / 5), ri, side + 9)
            lit = win & (h1 < lit_rate * (0.4 + 1.2 * block))
            warm = np.array([1.0, 0.66, 0.36])
            cool = np.array([0.72, 0.86, 1.0])
            colr = np.where((h2 < 0.35)[..., None], cool, warm)
            inten = (0.45 + 0.4 * h3)[..., None]
            base[win] = glass
            rough[win] = 0.12
            metal[win] = 0.3
            emit[lit] = (colr * inten)[lit]
            height[win] = -0.6
    side_hull = is_p('Hull') & is_m('Hull') & (np.abs(nx) > 0.72)

    def hull_skip(zr):
        s = np.zeros_like(y, dtype=bool)
        s |= (y < -0.425) | (y > 0.405)
        if zr < 0.004:
            s |= (y > -0.215) & (y < -0.045)  # 翼の付け根
        if zr > 0.004:
            s |= (y > 0.235) & (y < 0.37)  # 船名の板
        s |= (y > -0.065) & (y < -0.035) & (zr > 0.015)  # 航行灯
        return s
    windows(side_hull, [0.0225, 0.0118, 0.0011, -0.0096], -0.4, x, hull_skip)
    side_house = is_p('Bridge') & is_m('Hull') & (np.abs(nx) > 0.6) & (z < 0.07)
    windows(side_house, [0.049, 0.0585], -0.2, x, lambda zr: (y < -0.18) | (y > 0.035), lit_rate=0.32)
    # 艦橋の窓の帯：細い窓枠で区切り、白飛びしない程度にところどころ明るい
    band = is_m('Glass') & is_p('Bridge')
    ang = np.arctan2(x, y + 0.037)
    pane = np.floor(ang / (2 * math.pi / 56))
    fpane = ang / (2 * math.pi / 56) - pane
    mull = band & (np.abs(fpane - 0.5) > 0.38)
    base[band] = glass
    rough[band] = 0.1
    base[mull] = srgb('#2a3038')
    lit_pane = band & ~mull & (hash2(pane, 4.0) < 0.4)
    emit[lit_pane] = np.array([0.78, 0.86, 0.95]) * 0.38
    # 作業灯：ドームの台と排熱塔のまわりに小さな明かりをいくつか
    lamps = [(0.0, -0.1155, 0.0965), (0.03, 0.17, 0.052), (-0.03, 0.17, 0.052), (0.0, 0.305, 0.04), (0.0, -0.225, 0.036)]
    for lp in lamps:
        d = np.sqrt((x - lp[0]) ** 2 + (y - lp[1]) ** 2 + (z - lp[2]) ** 2)
        spot = valid & (d < 0.0013)
        emit[spot] = np.array([1.0, 0.85, 0.6]) * 0.9

    # ---- 3. パネル割り：大小の板、継ぎ目の溝の墨入れ、板ごとの明るさとラフネスのむら、すす汚れ
    if STAGE >= 3:
        ax = np.argmax(np.abs(nrm), axis=-1)
        a = np.where(ax == 1, np.abs(x), y)
        b = np.where(ax == 0, z, np.where(ax == 1, z, np.abs(x)))
        panels = Panels(77)
        dist, pidx = panels.sample(a, b + ax * 0.0371)
        paint = valid & ~is_m('Glass') & ~is_m('Metal') & ~is_m('Dark') & ~is_m('Stripe') & ~is_m('Brass')
        groove_w = 0.1 * M_PER_UNIT
        groove = paint & (dist < groove_w)
        g_soft = np.clip(1 - dist / (groove_w * 2.5), 0, 1) * paint
        height -= g_soft * 0.5
        hp = hash2(pidx, ax * 1.0, 2.0)
        bright = 1 + (hp - 0.5) * 0.08
        base[paint] *= bright[paint][..., None]
        rough[paint] += ((hash2(pidx, 7.0, 1.0) - 0.5) * 0.12)[paint]
        base *= (1 - 0.3 * g_soft)[..., None]
        # 甲板のハッチ・点検口の絵（四角い枠と、少し違う色）
        hrng = random.Random(5)
        deck = valid & is_m('Deck') & (nz > 0.8)
        for _ in range(70):
            hy = hrng.uniform(-0.43, 0.44)
            hx = hrng.choice([-1, 1]) * hrng.uniform(0.0, 0.07)
            ly, lx = hrng.choice([(0.006, 0.006), (0.008, 0.005), (0.004, 0.004), (0.012, 0.007)])
            dx_ = np.abs(x - hx) - lx / 2
            dy_ = np.abs(y - hy) - ly / 2
            inside = deck & (dx_ < 0) & (dy_ < 0)
            rim = inside & (np.maximum(dx_, dy_) > -0.00045)
            base[inside] *= 0.94
            base[rim] *= 0.6
            height[rim] -= 0.8
        # すす：噴射口のまわりと、排熱塔から後ろへ流れる汚れ
        noise = value_noise(pos, 90.0, 3)
        soot = np.clip((-0.40 - y) / 0.09, 0, 1) * (0.4 + 0.6 * noise)
        dy = (y + 0.15)
        stack_soot = np.exp(-((x / 0.05) ** 2) - ((z - 0.1) / 0.05) ** 2) * np.where(dy < 0, np.exp(dy / 0.12), np.exp(-dy / 0.015))
        soot = np.clip(soot + stack_soot * (0.5 + 0.5 * noise) * (z > 0.02), 0, 1)
        soot *= valid & ~is_m('Glass')
        base *= (1 - 0.45 * soot)[..., None]
        rough += soot * 0.15
        # 角はわずかに明るく（塗装のすれ）、AO を墨入れのように乗算
        base *= (1 + 0.1 * edge * paint)[..., None]
        base *= (0.45 + 0.55 * ao)[..., None]
    else:
        base *= (0.55 + 0.45 * ao)[..., None]

    # ---- ノーマル：溝の高さから、絵の上の傾きを求める（島の境目はまたがない）
    nrm_map = np.zeros((TEX, TEX, 3), dtype=np.float32)
    nrm_map[..., 2] = 1
    if np.any(height):
        hs = ndimage.gaussian_filter(height, 0.6)
        texel = estimate_texel(pos, valid)
        cont_x = valid & np.roll(valid, -1, 1) & (np.linalg.norm(np.roll(pos, -1, 1) - pos, axis=-1) < texel * 3)
        cont_y = valid & np.roll(valid, -1, 0) & (np.linalg.norm(np.roll(pos, -1, 0) - pos, axis=-1) < texel * 3)
        gx = np.where(cont_x, np.roll(hs, -1, 1) - hs, 0)
        gy = np.where(cont_y, np.roll(hs, -1, 0) - hs, 0)
        k = 0.9
        nrm_map[..., 0] = -gx * k
        nrm_map[..., 1] = -gy * k
        nrm_map /= np.linalg.norm(nrm_map, axis=-1, keepdims=True)

    rough = np.clip(rough, 0.05, 1)
    metal = np.clip(metal, 0, 1)
    return base, rough, metal, emit, nrm_map, valid


def soft_blur(a, valid, sigma):
    """島の外の値をまぜずにぼかす（AO のざらつきを取る）"""
    w = ndimage.gaussian_filter(valid.astype(np.float32), sigma)
    v = ndimage.gaussian_filter(np.where(valid, a, 0).astype(np.float32), sigma)
    return np.where(w > 1e-4, v / np.maximum(w, 1e-4), a)


def estimate_texel(pos, valid):
    d = np.linalg.norm(np.roll(pos, -1, 1) - pos, axis=-1)
    v = d[valid & np.roll(valid, -1, 1)]
    return float(np.median(v))


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def save_image(name, rgb, colorspace, path):
    img = bpy.data.images.new(name, TEX, TEX, alpha=False)
    px = np.ones((TEX, TEX, 4), dtype=np.float32)
    px[..., :3] = rgb
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    img.colorspace_settings.name = colorspace
    return img


def dilate(arr, valid, n=8):
    """島の外側へ色をにじませる（mipmap で継ぎ目に黒がにじまないように）"""
    out = arr.copy()
    filled = valid.copy()
    for _ in range(n):
        acc = np.zeros_like(out)
        cnt = np.zeros(filled.shape, dtype=np.float32)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            acc += np.roll(np.roll(np.where(filled[..., None], out, 0), dx, 1), dy, 0)
            cnt += np.roll(np.roll(filled, dx, 1), dy, 0)
        grow = ~filled & (cnt > 0)
        out[grow] = acc[grow] / cnt[grow][..., None]
        filled |= grow
    return out


def final_material(images):
    mat = bpy.data.materials.new('Baked')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')

    def tex(img):
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = img
        return n
    nt.links.new(tex(images['base']).outputs[0], bsdf.inputs['Base Color'])
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(tex(images['orm']).outputs[0], sep.inputs[0])
    nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(tex(images['normal']).outputs[0], nm.inputs['Color'])
    nt.links.new(nm.outputs[0], bsdf.inputs['Normal'])
    nt.links.new(tex(images['emit']).outputs[0], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = 1.0
    return mat


def live_material(name):
    """焼かない光る部品の材質（three.js 側で名前を見て置きかえる）"""
    mat = bpy.data.materials.new(name + '_live')
    mat.name = name
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    col = {'Glow': (1.0, 0.55, 0.25), 'Blue': (0.3, 0.6, 1.0), 'NavRed': (1, 0.05, 0.03), 'NavGreen': (0.05, 1, 0.2)}[name]
    bsdf.inputs['Base Color'].default_value = (*col, 1)
    bsdf.inputs['Emission Color'].default_value = (*col, 1)
    bsdf.inputs['Emission Strength'].default_value = 3
    return mat


def main():
    t0 = time.time()
    bf.reset_scene()
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.world = bpy.data.worlds.new('world')
    scene.world.use_nodes = True
    scene.world.light_settings.distance = 0.03
    for m in MATS:
        bpy.data.materials.new(m)

    parts, slits = build_parts()
    objs = []
    for name in PARTS:
        if name.startswith('Slit'):
            if name not in slits:
                continue
            part, origin = slits[name]
        else:
            part, origin = parts[name], (0, 0, 0)
        if not part.faces:
            continue
        obj = make_object(name, part, origin)
        obj.pass_index = PARTS.index(name) + 1
        objs.append(obj)
    if STAGE >= 2:
        for obj in objs:
            bevel(obj, 0.4 * M_PER_UNIT)
    for obj in objs:
        bf.sharpen(obj, 40)
    unwrap(objs)
    nf = sum(len(o.data.polygons) for o in objs)
    print(f'  {nf} faces after bevel ({time.time() - t0:.1f}s)', flush=True)

    P = bake_pass(objs, 'P', 'EMIT', node_position)
    N = bake_pass(objs, 'N', 'EMIT', node_normal)
    ID = bake_pass(objs, 'ID', 'EMIT', node_ids)
    E = bake_pass(objs, 'EDGE', 'EMIT', node_edge, samples=8)
    AO = bake_pass(objs, 'AO', 'AO', None, samples=int(os.environ.get('AO_SAMPLES', '64')))
    texel = estimate_texel(P[..., :3] - 1, ID[..., 3] > 0.5)
    print(f'  texel ≈ {texel / M_PER_UNIT * 100:.0f} cm', flush=True)

    base, rough, metal, emit, nrm, valid = compose(P, N, ID, AO, E)
    orm = np.stack([np.ones_like(rough), rough, metal], -1)
    base, orm, emit = dilate(base, valid), dilate(orm, valid), dilate(emit, valid)
    nrm_rgb = dilate(nrm * 0.5 + 0.5, valid)
    tex_dir = os.environ.get('TEX_DIR', '/tmp/claude-0/amatsukaze-tex')
    os.makedirs(tex_dir, exist_ok=True)
    images = {
        'base': save_image('amatsukaze_base', to_srgb(base), 'sRGB', os.path.join(tex_dir, 'base.png')),
        'orm': save_image('amatsukaze_orm', orm, 'Non-Color', os.path.join(tex_dir, 'orm.png')),
        'normal': save_image('amatsukaze_normal', nrm_rgb, 'Non-Color', os.path.join(tex_dir, 'normal.png')),
        'emit': save_image('amatsukaze_emit', to_srgb(emit), 'sRGB', os.path.join(tex_dir, 'emit.png')),
    }

    # 材質を「焼いた 1 枚」と「光る部品」にまとめ直す
    baked = final_material(images)
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
        if mesh.color_attributes:
            for a in list(mesh.color_attributes):
                mesh.color_attributes.remove(a)

    select_only(objs)
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format='GLB',
        use_selection=True,
        export_vertex_color='NONE',
        export_normals=True,
        export_texcoords=True,
        export_tangents=False,
        export_materials='EXPORT',
        export_image_format='JPEG',
        export_jpeg_quality=90,
        export_yup=True,
    )
    print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB', f'({time.time() - t0:.0f}s)', flush=True)
    for obj in objs:
        co = np.array([obj.matrix_world @ v.co for v in obj.data.vertices])
        lo, hi = co.min(0), co.max(0)
        print(f'  {obj.name:9s} {len(obj.data.polygons):6d} faces  three x {lo[0]:.3f}..{hi[0]:.3f} y {lo[2]:.3f}..{hi[2]:.3f} z {-hi[1]:.3f}..{-lo[1]:.3f}')
    if os.environ.get('PREVIEW'):
        preview(objs)


def preview(objs):
    from mathutils import Vector
    scene = bpy.context.scene
    scene.cycles.samples = int(os.environ.get('PREVIEW_SAMPLES', '48'))
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    scene.view_settings.view_transform = 'AgX'
    bg = scene.world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.02, 0.025, 0.035, 1)
    bg.inputs['Strength'].default_value = 1.0
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.2
    sun.data.angle = 0.02
    sun.rotation_euler = (0.85, 0.2, 2.5)
    scene.collection.objects.link(sun)
    fill = bpy.data.objects.new('fill', bpy.data.lights.new('fill', 'SUN'))
    fill.data.energy = 0.35
    fill.rotation_euler = (2.0, 0.0, -0.9)
    scene.collection.objects.link(fill)
    # 確認用に、扉を 1 枚だけ開けた姿も写す
    slit = bpy.data.objects.get('Slit1')
    if slit and STAGE >= 5:
        slit.rotation_euler = (math.radians(75), 0, 0)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    views = os.environ.get('VIEWS', 'hero,side,bridge,night').split(',')
    shots = {
        'hero': ((1.05, 1.05, 0.42), (0, 0.02, 0.03), 50),
        'side': ((1.9, -0.05, 0.12), (0, -0.02, 0.04), 50),
        'bridge': ((0.46, 0.34, 0.27), (0, -0.03, 0.135), 50),
        'domes': ((0.26, 0.42, 0.17), (0, 0.22, 0.05), 50),
        'stern': ((0.55, -0.85, 0.22), (0, -0.33, 0.03), 50),
        'bow': ((0.22, 0.75, 0.06), (0, 0.45, 0.01), 50),
        'night': ((0.75, 0.42, 0.1), (0, 0.0, 0.02), 50),
    }
    for name in views:
        pos, target, lens = shots[name]
        cam.location = Vector(pos)
        cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cam.data.lens = lens
        night = name == 'night'
        sun.data.energy = 0.25 if night else 3.2
        fill.data.energy = 0.05 if night else 0.35
        scene.render.filepath = os.path.join(PREVIEW_DIR, f'amatsukaze-s{STAGE}-{name}.png')
        bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
