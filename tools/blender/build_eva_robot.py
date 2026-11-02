"""
船外活動ロボット EVR-1「ツムギ」（全幅 0.8 m、奥行き 0.7 m、45 kg）を Blender で組み立てる。

junji さんの設定資料（「EVA WORK ROBOT」、正面・側面・背面と、腕先のツール 5 種）から形を起こした。
ローバー（build_rover.py）と同じく、大きさは設定表の数字に、形は絵に合わせている。

  - 頭：角を落とした箱。前は黒い画面で、青い「└ _ ┘」の顔。横に青いライトの箱（右）とオレンジの箱（左）
  - 胴：頭の下の白い箱。胸に小さな表示窓、下に丸い青ライト
  - 背中：大きなバックパック（工具・電池）。上に持ち手のフレームとアンテナ 2 本、角にライト
  - 腕：左右 2 本。肩・ひじ・手首の関節で、手首の先はツールを付け替える
    （汎用ハンド／ドリル／カッター／溶接ツール／吸着パッド）
  - 推進：胴の下に下向きの姿勢制御スラスター 2 基、バックパックの下に後ろ向きのメインスラスター

座標は Blender のまま（Z が上、前（顔）が +Y、右が +X）。単位はメートル。胴の中心が原点。
動く部品は別のオブジェクトで、関節の位置が原点（親子関係は「関節」の節）。

実行:
  /home/user/.bpyvenv/bin/python tools/blender/build_eva_robot.py
  STAGE=1..       改修の段階（1 は形のブロックアウト）
  PREVIEW=1       確認用の画像を PREVIEW_DIR に書き出す（VIEWS=hero,front,side,rear,top,back3）
  POSE=rest|work  腕の姿勢（rest：設定資料の正面図のように左右へ開く、work：前へ伸ばして作業）
  TOOL_R, TOOL_L  腕先のツール（hand|drill|cutter|welder|pad）
  TOOLS=1         ツール 5 種の並びを PREVIEW_DIR/tools-*.png に書き出す
  FACES=1         表情 6 つを PREVIEW_DIR/face-*.png に
  ANIM=1          展開・ツール交換・表情の動画の連番を PREVIEW_DIR/anim に
  EXPORT=1        アプリ用の public/models/eva-tsumugi.glb を書き出す
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_fleet as bf  # noqa: E402
import build_lander as bl  # noqa: E402
import build_rover as rv  # noqa: E402
from build_fleet import Part, box, cylinder, nozzle, plate, _rotate  # noqa: E402
from build_lander import PolyLoft  # noqa: E402
from build_rover import beam, joint  # noqa: E402

import bpy  # noqa: E402
import numpy as np  # noqa: E402

STAGE = int(os.environ.get('STAGE', '1'))
PREVIEW_DIR = os.environ.get('PREVIEW_DIR', '/tmp')
POSE = os.environ.get('POSE', 'rest')

MATS = ['Hull', 'Hull2', 'Dark', 'Mech', 'Metal', 'Glass', 'Lamp', 'Accent', 'Glow', 'Hot', 'Screen', 'Rubber']
rv.MATS = MATS  # rv.make_object はこの並びで材質をつける

TOOLS = ['hand', 'drill', 'cutter', 'welder', 'pad']

# 関節の位置（右側。左は x を反転）
NECK = (0.0, 0.01, 0.03)
SHOULDER = (0.19, 0.0, 0.02)
ARM_OUT = 0.05  # 肩の関節から外へずらして腕を吊る
UA, FA = 0.17, 0.17  # 上腕・前腕の長さ
WRIST_LEN = 0.025  # 手首の継ぎ手（ここから先がツール）
POD = (0.10, 0.03, -0.13)  # 姿勢制御スラスター（下向き）の付け根
MAIN_JET = (0.0, -0.19, -0.095)  # メインスラスター（後ろ向き）の付け根


# ---- 小さな道具 ------------------------------------------------------------------


def cbox(part, center, size, c, mat, rot=(0.0, 0.0, 0.0), cap=None):
    """角を c だけ面取りした箱（rot は x, y, z の回転、ラジアン）"""
    w, d, h = size[0] / 2, size[1] / 2, size[2] / 2
    c = min(c, w * 0.9, d * 0.9, h * 0.9)
    full = [(0, h), (w - c, h), (w, h - c), (w, -h + c), (w - c, -h), (0, -h)]
    inset = [(0, h - c * 0.6), (w - c * 1.2, h - c * 0.6), (w - c * 0.6, h - c * 1.2),
             (w - c * 0.6, -h + c * 1.2), (w - c * 1.2, -h + c * 0.6), (0, -h + c * 0.6)]
    secs = [(-d, inset, mat), (-d + c * 0.6, full, mat), (d - c * 0.6, full, mat), (d, inset, mat)]
    tmp = Part()
    PolyLoft(secs, cap_back=cap or mat, cap_front=cap or mat).build(tmp)
    cx, cy, cz = center
    verts = [_rotate(v, *rot) for v in tmp.verts]
    part.add([(x + cx, y + cy, z + cz) for x, y, z in verts], tmp.faces, tmp.mats)


def tube(part, pts, r, mat, n=10):
    """点をつなぐホース（つなぎ目に小さな玉）"""
    pts = [np.array(p, float) for p in pts]
    for a, b in zip(pts, pts[1:]):
        cylinder(part, a, b, r, r, mat, n=n, cap0=None, cap1=None)
    for p in pts[1:-1]:
        joint(part, p, r, r * 2, mat, axis=(0, 0, 1), n=n)
    for p in (pts[0], pts[-1]):
        joint(part, p, r, r * 0.5, mat, axis=(0, 0, 1), n=n)


def bezier(p0, p1, p2, n=8):
    p0, p1, p2 = (np.array(p, float) for p in (p0, p1, p2))
    return [tuple((1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2) for t in np.linspace(0, 1, n)]


# ---- 頭 --------------------------------------------------------------------------


def build_head(g):
    # 殻と画面（黒いふち、ガラス、青い顔）
    cbox(g, (0, 0.01, 0.1325), (0.21, 0.22, 0.205), 0.026, 'Hull')
    cbox(g, (0, 0.114, 0.13), (0.19, 0.012, 0.168), 0.024, 'Dark')
    cbox(g, (0, 0.121, 0.13), (0.172, 0.006, 0.148), 0.02, 'Glass')
    # 頭の上：通気口の箱と、うしろの段
    cbox(g, (0, 0.0, 0.243), (0.10, 0.09, 0.024), 0.008, 'Mech')
    for k in range(4):
        box(g, (0, -0.03 + k * 0.02, 0.256), (0.08, 0.006, 0.004), 'Dark')
    box(g, (0, -0.085, 0.20), (0.17, 0.03, 0.05), 'Hull2')
    # 右（+X）：青いライト 2 つの箱
    cbox(g, (0.118, 0.045, 0.13), (0.03, 0.08, 0.12), 0.008, 'Accent')
    cbox(g, (0.124, 0.05, 0.13), (0.026, 0.075, 0.105), 0.008, 'Dark')
    for z in (0.155, 0.105):
        cbox(g, (0.126, 0.088, z), (0.016, 0.004, 0.032), 0.004, 'Lamp')
    # 左（-X）：オレンジの箱、前にカメラと青いライト
    cbox(g, (-0.124, 0.01, 0.145), (0.04, 0.10, 0.095), 0.01, 'Accent')
    cbox(g, (-0.124, -0.03, 0.145), (0.044, 0.03, 0.10), 0.006, 'Dark')
    cylinder(g, (-0.124, 0.06, 0.16), (-0.124, 0.07, 0.16), 0.014, 0.012, 'Dark', n=16)
    cylinder(g, (-0.124, 0.07, 0.16), (-0.124, 0.072, 0.16), 0.008, 0.008, 'Glass', n=16)
    cbox(g, (-0.124, 0.062, 0.12), (0.016, 0.004, 0.018), 0.004, 'Lamp')
    # 顔の横のふちの細い溝
    for sx in (1, -1):
        box(g, (sx * 0.106, 0.06, 0.06), (0.004, 0.06, 0.006), 'Dark')


# ---- 顔の表情（画面の青い線。表情ごとに別のオブジェクトにして、1 つだけ見せる） ----------------

FACE_Y = 0.1255
FACES = ['normal', 'happy', 'focus', 'sweat', 'ouch', 'boot']


def stroke(g, p, q, t=0.007):
    """画面の上の線（p, q は (x, z)）"""
    (px, pz), (qx, qz) = p, q
    L = math.hypot(qx - px, qz - pz)
    box(g, ((px + qx) / 2, FACE_Y, (pz + qz) / 2), (L + t * 0.6, 0.002, t), 'Screen', rot_y=-math.atan2(qz - pz, qx - px))


def build_face(g, kind):
    ez = 0.135
    for sx in (1, -1):
        ex = sx * 0.045
        if kind == 'normal':  # └ _ ┘（いつもの顔）
            stroke(g, (ex + sx * 0.006, ez + 0.017), (ex + sx * 0.006, ez - 0.017))
            stroke(g, (ex + sx * 0.006, ez - 0.017), (ex - sx * 0.018, ez - 0.017))
        elif kind == 'happy':  # ^ ^（にっこり）
            stroke(g, (ex - 0.014, ez - 0.006), (ex, ez + 0.01))
            stroke(g, (ex, ez + 0.01), (ex + 0.014, ez - 0.006))
        elif kind == 'focus':  # 内側が下がった細い目（真剣）
            stroke(g, (ex + sx * 0.017, ez + 0.002), (ex - sx * 0.014, ez - 0.008), 0.008)
        elif kind == 'sweat':  # 小さな点の目
            box(g, (ex, FACE_Y, ez - 0.004), (0.013, 0.002, 0.013), 'Screen')
        elif kind == 'ouch':  # > <（ぶつかった）
            tip = (ex - sx * 0.011, ez)
            stroke(g, (ex + sx * 0.011, ez + 0.014), tip)
            stroke(g, tip, (ex + sx * 0.011, ez - 0.014))
    if kind == 'normal':
        stroke(g, (-0.013, 0.106), (0.013, 0.106), 0.006)
    elif kind == 'happy':  # 口角の上がった口
        stroke(g, (-0.018, 0.112), (-0.012, 0.103), 0.006)
        stroke(g, (-0.012, 0.103), (0.012, 0.103), 0.006)
        stroke(g, (0.012, 0.103), (0.018, 0.112), 0.006)
    elif kind == 'focus':
        stroke(g, (-0.007, 0.106), (0.007, 0.106), 0.006)
    elif kind == 'sweat':  # 波の口と汗のしずく
        for k, x in enumerate((-0.018, -0.006, 0.006)):
            stroke(g, (x, 0.104 + 0.004 * (k % 2)), (x + 0.012, 0.104 + 0.004 * ((k + 1) % 2)), 0.005)
        box(g, (-0.068, FACE_Y, 0.163), (0.011, 0.002, 0.011), 'Screen', rot_y=math.pi / 4)
        stroke(g, (-0.068, 0.170), (-0.068, 0.177), 0.004)
    elif kind == 'ouch':  # 小さく開いた口
        for a, b in (((-0.007, 0.099), (0.007, 0.099)), ((0.007, 0.099), (0.007, 0.111)),
                     ((0.007, 0.111), (-0.007, 0.111)), ((-0.007, 0.111), (-0.007, 0.099))):
            stroke(g, a, b, 0.004)
    elif kind == 'boot':  # 起動中：横線と 3 つの点
        stroke(g, (-0.06, 0.14), (0.06, 0.14), 0.005)
        for x in (-0.02, 0.0, 0.02):
            box(g, (x, FACE_Y, 0.118), (0.008, 0.002, 0.008), 'Screen')


# ---- 胴とバックパック ---------------------------------------------------------------


def build_body(g):
    # 首
    cylinder(g, (0, 0.0, -0.01), (0, 0.0, 0.045), 0.05, 0.045, 'Dark', n=20)
    # 胴：白い箱、胸の表示窓、丸い青ライト、パネルの溝
    cbox(g, (0, 0.0, -0.065), (0.23, 0.2, 0.19), 0.032, 'Hull')
    cbox(g, (0, 0.102, -0.045), (0.06, 0.008, 0.05), 0.008, 'Dark')
    cbox(g, (0, 0.106, -0.045), (0.038, 0.003, 0.03), 0.004, 'Screen')
    cylinder(g, (0.06, 0.095, -0.125), (0.06, 0.104, -0.125), 0.024, 0.024, 'Dark', n=20)
    cylinder(g, (0.06, 0.104, -0.125), (0.06, 0.107, -0.125), 0.016, 0.016, 'Lamp', n=20)
    box(g, (0, 0.1005, -0.09), (0.18, 0.004, 0.004), 'Dark')
    for sx in (1, -1):
        box(g, (sx * 0.075, 0.1005, -0.03), (0.004, 0.004, 0.09), 'Dark')
        box(g, (sx * 0.095, 0.098, 0.0), (0.03, 0.006, 0.012), 'Accent')
    # 腰：暗い機械部と、横の箱
    cbox(g, (0, 0.0, -0.168), (0.17, 0.16, 0.04), 0.01, 'Dark')
    for sx in (1, -1):
        cbox(g, (sx * 0.128, 0.01, -0.09), (0.04, 0.13, 0.09), 0.01, 'Mech')
        for k in range(3):
            box(g, (sx * 0.149, 0.01, -0.06 - k * 0.025), (0.003, 0.10, 0.008), 'Dark')
        # 肩の台：横向きの暗い円筒と明るいふち
        cylinder(g, (sx * 0.11, 0, SHOULDER[2]), (sx * 0.16, 0, SHOULDER[2]), 0.046, 0.042, 'Dark', n=24)
        cylinder(g, (sx * 0.11, 0, SHOULDER[2]), (sx * 0.125, 0, SHOULDER[2]), 0.052, 0.052, 'Hull2', n=24)
        # 姿勢制御スラスターの台
        cbox(g, (sx * POD[0], POD[1], POD[2] + 0.02), (0.07, 0.08, 0.04), 0.01, 'Mech')
    # バックパック
    cbox(g, (0, -0.19, 0.055), (0.25, 0.18, 0.31), 0.03, 'Hull')
    cbox(g, (0, -0.11, 0.05), (0.2, 0.04, 0.26), 0.01, 'Mech')  # 胴とのつなぎ
    # 背面：四角いハッチ、丸いふた、下の通気口
    cbox(g, (0, -0.282, 0.10), (0.14, 0.008, 0.12), 0.01, 'Hull2')
    cbox(g, (0, -0.287, 0.10), (0.11, 0.004, 0.095), 0.008, 'Mech')
    cylinder(g, (0, -0.288, 0.10), (0, -0.296, 0.10), 0.03, 0.026, 'Metal', n=24)
    cylinder(g, (0, -0.296, 0.10), (0, -0.298, 0.10), 0.008, 0.008, 'Dark', n=12)
    for k in range(5):
        box(g, (0, -0.281, -0.02 - k * 0.016), (0.15, 0.004, 0.007), 'Dark')
    for sx in (1, -1):
        # 背面と横のオレンジ、横の工具入れ
        box(g, (sx * 0.1, -0.281, 0.17), (0.03, 0.004, 0.05), 'Accent')
        box(g, (sx * 0.126, -0.24, 0.04), (0.004, 0.025, 0.18), 'Accent')
        cbox(g, (sx * 0.133, -0.18, -0.02), (0.022, 0.09, 0.11), 0.006, 'Mech')
        for k in range(3):
            cylinder(g, (sx * 0.145, -0.21 + k * 0.03, 0.045), (sx * 0.145, -0.21 + k * 0.03, 0.03), 0.009, 0.009,
                     'Dark', n=10)
        # 角の小さな RCS（姿勢制御の小噴射口）
        for z in (0.19, -0.08):
            cbox(g, (sx * 0.13, -0.27, z), (0.03, 0.03, 0.03), 0.006, 'Mech')
            cylinder(g, (sx * 0.145, -0.27, z), (sx * 0.16, -0.27, z), 0.006, 0.008, 'Dark', n=8)
            cylinder(g, (sx * 0.13, -0.285, z), (sx * 0.13, -0.3, z), 0.006, 0.008, 'Dark', n=8)
        # 上の角のライト（正面から頭の両わきに見える）
        cbox(g, (sx * 0.145, -0.07, 0.17), (0.035, 0.03, 0.03), 0.006, 'Mech')
        cylinder(g, (sx * 0.16, -0.06, 0.15), (sx * 0.16, -0.06, 0.21), 0.017, 0.017, 'Dark', n=16)
        cbox(g, (sx * 0.16, -0.043, 0.18), (0.018, 0.004, 0.035), 0.004, 'Lamp')
        # 背中から肩へのホース
        tube(g, bezier((sx * 0.125, -0.14, 0.17), (sx * 0.2, -0.12, 0.16), (sx * 0.17, -0.03, 0.06)), 0.009,
             'Accent' if sx > 0 else 'Dark')
        tube(g, bezier((sx * 0.125, -0.15, 0.12), (sx * 0.19, -0.13, 0.10), (sx * 0.165, -0.04, 0.03)), 0.007, 'Dark')
    # 持ち手のフレーム（パイプのアーチ、オレンジの留め具）
    yH = -0.14
    arch = [(0.1, yH, 0.21), (0.1, yH, 0.27), (0.085, yH, 0.29), (-0.085, yH, 0.29), (-0.1, yH, 0.27),
            (-0.1, yH, 0.21)]
    tube(g, arch, 0.008, 'Dark')
    for sx in (1, -1):
        cbox(g, (sx * 0.055, yH, 0.29), (0.025, 0.022, 0.022), 0.004, 'Accent')
        cbox(g, (sx * 0.1, yH, 0.215), (0.03, 0.03, 0.02), 0.005, 'Mech')
    # 前後に渡したもう 1 本の手すり（頭の上まで）
    tube(g, [(0.0, -0.25, 0.21), (0.0, -0.25, 0.245), (0.0, -0.14, 0.29)], 0.006, 'Dark')
    # アンテナ
    for x, top in ((0.095, 0.42), (-0.095, 0.37)):
        cylinder(g, (x, -0.245, 0.21), (x, -0.245, 0.235), 0.012, 0.012, 'Mech', n=10)
        cylinder(g, (x, -0.245, 0.235), (x, -0.245, top), 0.0045, 0.002, 'Metal', n=6)
        cylinder(g, (x, -0.245, 0.26), (x, -0.245, 0.29), 0.007, 0.007, 'Dark', n=8)


def build_main_jet(g):
    """メインスラスター（付け根 MAIN_JET を原点に、後ろ -Y へ噴く）"""
    cbox(g, (0, 0.0, -0.05), (0.13, 0.1, 0.1), 0.015, 'Hull2')
    cbox(g, (0, 0.03, -0.0), (0.16, 0.12, 0.03), 0.008, 'Mech')  # バックパックの底への取り付け
    box(g, (0, 0.0, -0.002), (0.08, 0.06, 0.01), 'Dark')
    for sx in (1, -1):
        box(g, (sx * 0.066, -0.02, -0.05), (0.004, 0.04, 0.06), 'Accent')
    cylinder(g, (0, -0.05, -0.06), (0, -0.075, -0.06), 0.05, 0.05, 'Dark', n=28)
    nozzle(g, (0, -0.115, -0.06), (0, -0.075, -0.06), 0.032, 0.048, 'Metal', 'Glow', n=28)
    cylinder(g, (0, -0.07, -0.06), (0, -0.08, -0.06), 0.054, 0.054, 'Mech', n=28)


def build_pod(g, sx):
    """姿勢制御スラスター（付け根を原点に、下 -Z へ噴く）"""
    joint(g, (0, 0, 0), 0.025, 0.06, 'Dark')
    cylinder(g, (0, 0, -0.01), (0, 0, -0.06), 0.036, 0.034, 'Hull', n=20)
    cylinder(g, (0, 0, -0.03), (0, 0, -0.04), 0.038, 0.038, 'Accent', n=20)
    nozzle(g, (0, 0, -0.10), (0, 0, -0.06), 0.02, 0.032, 'Metal', 'Glow', n=20)


# ---- 腕（各部はその関節を原点に、下 -Z へ吊るして組む） ------------------------------------


def build_shoulder(g, sx):
    joint(g, (sx * 0.01, 0, 0), 0.05, 0.06, 'Dark', n=24)
    cylinder(g, (sx * 0.04, 0, 0), (sx * 0.045, 0, 0), 0.044, 0.044, 'Hull2', n=24)
    # 肩当て（白い装甲、オレンジのふち）
    cbox(g, (sx * 0.05, 0, 0.015), (0.07, 0.11, 0.075), 0.018, 'Hull')
    box(g, (sx * 0.086, 0, 0.015), (0.004, 0.07, 0.03), 'Accent')
    # 上腕：芯の暗い円筒と、白い殻
    x = sx * ARM_OUT
    cylinder(g, (x, 0, -0.02), (x, 0, -UA), 0.028, 0.026, 'Dark', n=16)
    cbox(g, (x, 0, -0.095), (0.07, 0.08, 0.1), 0.016, 'Hull')
    box(g, (x + sx * 0.036, 0, -0.095), (0.004, 0.05, 0.05), 'Accent')
    beam(g, (x, -0.045, -0.05), (x, -0.045, -0.14), 0.016, 0.016, 'Metal')  # 背中側のピストン


def build_fore(g, sx):
    joint(g, (0, 0, 0), 0.04, 0.075, 'Dark', n=20)
    for s in (1, -1):
        cylinder(g, (s * 0.038, 0, 0), (s * 0.04, 0, 0), 0.03, 0.03, 'Hull2', n=20)
    cylinder(g, (0, 0, -0.03), (0, 0, -0.05), 0.033, 0.033, 'Dark', n=16)
    cbox(g, (0, 0.003, -0.105), (0.082, 0.092, 0.11), 0.018, 'Hull')
    cbox(g, (sx * 0.042, 0.003, -0.105), (0.004, 0.06, 0.07), 0.003, 'Accent')
    box(g, (0, 0.0495, -0.075), (0.06, 0.004, 0.004), 'Dark')
    for k in range(3):
        box(g, (0, 0.0495, -0.11 - k * 0.012), (0.035, 0.004, 0.005), 'Mech')
    cylinder(g, (0, 0, -0.16), (0, 0, -FA), 0.034, 0.03, 'Dark', n=16)


def build_wrist(g):
    cylinder(g, (0, 0, 0.0), (0, 0, -WRIST_LEN), 0.031, 0.031, 'Hull2', n=20)
    cylinder(g, (0, 0, -0.008), (0, 0, -0.014), 0.034, 0.034, 'Dark', n=20)


def tool_base(g, r=0.034, length=0.05, mat='Hull'):
    """ツールの付け根（手首にはまる部分）"""
    z0 = -WRIST_LEN
    cylinder(g, (0, 0, z0), (0, 0, z0 - 0.012), 0.026, 0.026, 'Dark', n=16)
    cylinder(g, (0, 0, z0 - 0.012), (0, 0, z0 - 0.012 - length), r, r * 0.95, mat, n=20)
    return z0 - 0.012 - length


def finger(g, base, d0, inward, lens, curls, w=0.014):
    """ふし 3 つの指（白い骨と暗い関節）。d0 は伸びる向き、inward は曲がる向き"""
    p = np.array(base, float)
    d0, inward = np.array(d0, float), np.array(inward, float)
    ax = tuple(np.cross(d0, inward))
    ang = 0.0
    r = w / 2
    for k, (L, cu) in enumerate(zip(lens, curls)):
        ang += math.radians(cu)
        d = d0 * math.cos(ang) + inward * math.sin(ang)
        q = p + d * L
        joint(g, tuple(p), r * 1.05, w * 1.05, 'Dark', axis=ax, n=12)
        cylinder(g, tuple(p + d * r * 0.7), tuple(q - d * r * 0.5), r * 0.95, r * 0.85, 'Hull', n=10)
        r *= 0.9
        p = q
    joint(g, tuple(p), r * 0.9, w * 0.9, 'Dark', axis=ax, n=10)


def build_hand(g, sx):
    z = -WRIST_LEN
    cylinder(g, (0, 0, z), (0, 0, z - 0.012), 0.026, 0.026, 'Dark', n=16)
    cbox(g, (0, 0, z - 0.045), (0.034, 0.08, 0.06), 0.01, 'Hull')
    cbox(g, (-sx * 0.012, 0, z - 0.045), (0.014, 0.065, 0.05), 0.005, 'Mech')  # 手のひら
    box(g, (0, 0, z - 0.077), (0.03, 0.078, 0.01), 'Dark')
    inward = (-sx, 0, 0)
    for y in (-0.027, -0.009, 0.009, 0.027):
        finger(g, (0, y, z - 0.082), (0, 0, -1), inward, (0.034, 0.03, 0.024), (12, 30, 34))
    finger(g, (-sx * 0.012, 0.042, z - 0.03), (0, 0.6, -0.8), inward, (0.03, 0.026, 0.02), (25, 30, 30), 0.016)


def build_drill(g, sx):
    z = tool_base(g, 0.04, 0.055)
    zb = -WRIST_LEN - 0.03
    cylinder(g, (0, 0, zb), (0, 0, zb - 0.014), 0.043, 0.043, 'Accent', n=20)
    for k in range(6):
        a = 2 * math.pi * k / 6
        box(g, (0.041 * math.cos(a), 0.041 * math.sin(a), z + 0.012), (0.006, 0.006, 0.02), 'Dark', rot_z=a)
    cylinder(g, (0, 0, z), (0, 0, z - 0.016), 0.03, 0.024, 'Dark', n=20)
    cylinder(g, (0, 0, z - 0.016), (0, 0, z - 0.032), 0.02, 0.016, 'Metal', n=16)
    # ねじれた刃（円すいの芯に、らせんの溝）
    z1 = z - 0.032
    cylinder(g, (0, 0, z1), (0, 0, z1 - 0.085), 0.013, 0.0015, 'Metal', n=12)
    n = 16
    for k in range(n):
        t = k / n
        a = t * 4 * math.pi
        r = 0.013 * (1 - t) + 0.002
        box(g, (r * math.cos(a), r * math.sin(a), z1 - t * 0.08), (0.004, 0.012 * (1 - t) + 0.004, 0.006), 'Mech',
            rot_z=a, rot_x=0.4)


def build_cutter(g, sx):
    z = tool_base(g, 0.038, 0.05)
    cbox(g, (0, 0, z - 0.008), (0.05, 0.06, 0.026), 0.008, 'Dark')
    joint(g, (0, 0, z - 0.02), 0.016, 0.05, 'Metal')
    # 2 枚の刃（オレンジの、はさみのような爪）
    blade = [(0.004, 0.0), (0.024, -0.012), (0.034, -0.05), (0.026, -0.09), (0.008, -0.112), (0.012, -0.086),
             (0.014, -0.05), (0.004, -0.024)]
    for s in (1, -1):
        pts = [(s * y, z - 0.02 + zz, s * 0.006) for y, zz in blade]
        if s < 0:
            pts = pts[::-1]
        plate(g, pts, 0.009, 'Accent', 'Metal', axis='x')
        # 刃の内側の明るい刃先
        edge = [(s * 0.004, z - 0.04, s * 0.006), (s * 0.012, z - 0.105, s * 0.006), (s * 0.01, z - 0.105, s * 0.006),
                (s * 0.002, z - 0.04, s * 0.006)]
        plate(g, edge if s > 0 else edge[::-1], 0.0095, 'Metal', axis='x')


def build_welder(g, sx):
    z = tool_base(g, 0.034, 0.045)
    cbox(g, (0, 0, z - 0.012), (0.05, 0.05, 0.024), 0.008, 'Accent')
    cylinder(g, (0, 0, z - 0.024), (0, 0, z - 0.04), 0.022, 0.016, 'Dark', n=16)
    # 細長いトーチ。少し曲がって先が赤く光る
    p0 = np.array((0, 0, z - 0.04))
    p1 = p0 + (0, 0, -0.05)
    p2 = p1 + (0, 0.012, -0.035)
    cylinder(g, tuple(p0), tuple(p1), 0.011, 0.009, 'Metal', n=12)
    cylinder(g, tuple(p1), tuple(p2), 0.009, 0.006, 'Metal', n=12)
    joint(g, tuple(p1), 0.0095, 0.018, 'Metal', axis=(0, 0, 1), n=12)
    cylinder(g, tuple(p0 + (0, 0, -0.01)), tuple(p0 + (0, 0, -0.018)), 0.014, 0.014, 'Accent', n=12)
    cylinder(g, tuple(p2), tuple(p2 + (0, 0.004, -0.01)), 0.006, 0.003, 'Hot', n=10)
    tube(g, [(0.02, -0.02, z + 0.02), (0.03, -0.015, z - 0.02), (0.01, -0.006, z - 0.06)], 0.004, 'Dark', n=6)


def build_pad(g, sx):
    z = tool_base(g, 0.03, 0.03, 'Hull2')
    cylinder(g, (0, 0, z), (0, 0, z - 0.03), 0.018, 0.018, 'Mech', n=16)
    cylinder(g, (0, 0, z - 0.012), (0, 0, z - 0.02), 0.024, 0.024, 'Accent', n=16)
    cylinder(g, (0, 0, z - 0.03), (0, 0, z - 0.042), 0.052, 0.056, 'Hull2', n=32)
    cylinder(g, (0, 0, z - 0.042), (0, 0, z - 0.058), 0.06, 0.068, 'Rubber', n=32, cap1='Dark')
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        beam(g, (0.018 * math.cos(a), 0.018 * math.sin(a), z - 0.005),
             (0.045 * math.cos(a), 0.045 * math.sin(a), z - 0.032), 0.006, 0.006, 'Metal')


TOOL_BUILD = {'hand': build_hand, 'drill': build_drill, 'cutter': build_cutter, 'welder': build_welder,
              'pad': build_pad}


# ---- 関節 -----------------------------------------------------------------------------
#
#   Body ─┬ Head（首）
#         ├ Shoulder_{R,L} ─ Fore_{R,L}（ひじ）─ Wrist_{R,L} ─ Tool_{hand,drill,cutter,welder,pad}_{R,L}
#         ├ Pod_{R,L}（姿勢制御スラスターの首振り）
#         └ MainJet（メインスラスターの首振り）
# ツールは 5 つとも手首の子で、見せるのは 1 つだけ（アプリでもこれを切り替える）。

POSES = {  # 右腕の関節の角度（x, y, z、度）。左は y と z の符号を反転。pod はスラスターの振り（度）、head は頭の沈み（m）
    # 設定資料の正面図：肩から外へ開き、前腕は下へ、少し前に曲げる
    'rest': {'Shoulder': (12, -55, 0), 'Fore': (28, 48, 0), 'Wrist': (12, 0, 0)},
    # 作業：右腕は前へ伸ばしてツール、左腕も前へ出して手を開く
    'work': {'Shoulder': (72, -12, 0), 'Fore': (22, 6, 0), 'Wrist': (8, 0, 0),
             'L': {'Shoulder': (58, -28, 0), 'Fore': (40, 10, 0), 'Wrist': (18, 0, 0)}},
    # ツール紹介：右腕を真横へ水平に
    'show': {'Shoulder': (0, -90, 0), 'Fore': (0, 0, 0), 'Wrist': (0, 0, 90)},
    # たたんだ姿：腕を胸の前に抱え、スラスターは後ろへ倒し、頭は肩に沈める（エアロックから押し出される姿）
    'folded': {'Shoulder': (-8, 4, 38), 'Fore': (118, 0, 0), 'Wrist': (75, 0, 0), 'pod': -80, 'head': -0.03},
    # ツール交換：右腕を背中の工具入れへ回す（左腕は作業の姿のまま）
    'swap': {'Shoulder': (-42, -8, 0), 'Fore': (-88, 0, 0), 'Wrist': (-25, 0, 0),
             'L': {'Shoulder': (58, -28, 0), 'Fore': (40, 10, 0), 'Wrist': (18, 0, 0)}},
}
JOINTS = ('Shoulder', 'Fore', 'Wrist')


def pose_state(name):
    p = POSES[name]
    st = {side: {j: tuple(p.get(side, p)[j]) for j in JOINTS} for side in ('R', 'L')}
    st['pod'] = p.get('pod', 0.0)
    st['head'] = p.get('head', 0.0)
    return st


def mix(a, b, u):
    """2 つの姿勢の間（u = 0..1）"""
    out = {}
    for k in a:
        if isinstance(a[k], dict):
            out[k] = {j: tuple(x + (y - x) * u for x, y in zip(a[k][j], b[k][j])) for j in a[k]}
        else:
            out[k] = a[k] + (b[k] - a[k]) * u
    return out


def apply_state(objs, st):
    for sx, side in ((1, 'R'), (-1, 'L')):
        for j in JOINTS:
            x, y, z = st[side][j]
            objs[f'{j}_{side}'].rotation_euler = (math.radians(x), math.radians(y * sx), math.radians(z * sx))
        objs[f'Pod_{side}'].rotation_euler.x = math.radians(st['pod'])
    objs['Head'].location = (NECK[0], NECK[1], NECK[2] + st['head'])


def show_tools(objs, tools):
    for side in ('R', 'L'):
        for t in TOOLS:
            o = objs[f'Tool_{t}_{side}']
            o.hide_render = o.hide_viewport = t != tools[side]


def show_face(objs, kind):
    for f in FACES:
        o = objs[f'Face_{f}']
        o.hide_render = o.hide_viewport = f != kind


def apply_pose(objs, name, tools):
    apply_state(objs, pose_state(name))
    show_tools(objs, tools)


PIVOTS = {}


def build_all():
    objs = {}

    def add(name, fn, origin=(0, 0, 0), parent=None, local=True):
        g = Part()
        fn(g)
        o = rv.make_object(name, g, origin, local)
        if parent:
            o.parent = objs[parent]
            o.location = tuple(np.array(origin) - np.array(PIVOTS[parent]))
        PIVOTS[name] = origin
        objs[name] = o
        return o

    add('Body', build_body, local=False)
    add('Head', build_head, NECK, 'Body', local=False)
    for f in FACES:
        add(f'Face_{f}', lambda g: build_face(g, f), NECK, 'Head', local=False)
    add('MainJet', build_main_jet, MAIN_JET, 'Body')
    for sx, side in ((1, 'R'), (-1, 'L')):
        sh = np.array((sx * SHOULDER[0], SHOULDER[1], SHOULDER[2]))
        add(f'Shoulder_{side}', lambda g: build_shoulder(g, sx), tuple(sh), 'Body')
        el = sh + (sx * ARM_OUT, 0, -UA)
        add(f'Fore_{side}', lambda g: build_fore(g, sx), tuple(el), f'Shoulder_{side}')
        wr = el + (0, 0, -FA)
        add(f'Wrist_{side}', build_wrist, tuple(wr), f'Fore_{side}')
        for t in TOOLS:
            add(f'Tool_{t}_{side}', lambda g: TOOL_BUILD[t](g, sx), tuple(wr), f'Wrist_{side}')
        add(f'Pod_{side}', lambda g: build_pod(g, sx), (sx * POD[0], POD[1], POD[2]), 'Body')
    for o in objs.values():
        o.rotation_mode = 'XYZ'
        bf.sharpen(o, 35)
    return objs


def measure(objs):
    bpy.context.view_layer.update()
    vis = [o for o in objs.values() if not o.hide_render]
    allco = np.concatenate([np.array([(o.matrix_world @ v.co)[:] for v in o.data.vertices]) for o in vis])
    lo, hi = allco.min(0), allco.max(0)
    return f'width {hi[0] - lo[0]:.2f}  depth {hi[1] - lo[1]:.2f}  height {hi[2] - lo[2]:.2f}  (z {lo[2]:.2f}..{hi[2]:.2f})'


# ---- 確認用の画像 ----------------------------------------------------------------------

PREVIEW_COLORS = {
    'Hull': '#dedcd6', 'Hull2': '#a9adb5', 'Dark': '#24272d', 'Mech': '#454a53', 'Metal': '#8d939c',
    'Glass': '#05080e', 'Lamp': '#6fc0ff', 'Accent': '#e07a1e', 'Glow': '#55b4ff', 'Hot': '#ff8a3a',
    'Screen': '#4fb8ff', 'Rubber': '#18191b',
}
EMIT = {'Lamp': 4, 'Glow': 8, 'Hot': 14, 'Screen': 4}


def preview_materials():
    for name, h in PREVIEW_COLORS.items():
        m = bpy.data.materials.get(name)
        if not m:
            continue
        m.use_nodes = True
        b = m.node_tree.nodes.get('Principled BSDF')
        c = bl.lin(h)
        b.inputs['Base Color'].default_value = (*c, 1)
        b.inputs['Roughness'].default_value = {'Glass': 0.06, 'Rubber': 0.9, 'Hull': 0.45}.get(name, 0.4)
        b.inputs['Metallic'].default_value = {'Metal': 0.85, 'Hull2': 0.6, 'Mech': 0.5}.get(name, 0.05)
        if name in EMIT:
            b.inputs['Emission Color'].default_value = (*c, 1)
            b.inputs['Emission Strength'].default_value = EMIT[name]


def setup_preview():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = int(os.environ.get('PREVIEW_SAMPLES', '48'))
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.world = bpy.data.worlds.new('world')
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.012, 0.018, 0.035, 1)
    bg.inputs['Strength'].default_value = 1.0
    for name, energy, rot, color in (
        ('sun', 4.0, (0.9, 0.0, -2.6), (1.0, 0.97, 0.92)),  # 左前上から日の光
        ('earth', 0.9, (2.6, 0.0, 0.4), (0.55, 0.7, 1.0)),  # 下からの地球の照り返し
        ('rim', 2.2, (-0.9, 0.0, 0.5), (0.8, 0.88, 1.0)),  # 後ろのふちの光
    ):
        o = bpy.data.objects.new(name, bpy.data.lights.new(name, 'SUN'))
        o.data.energy = energy
        o.data.angle = 0.02
        o.data.color = color
        o.rotation_euler = rot
        scene.collection.objects.link(o)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam


SHOTS = {
    # 設定資料の大きな絵と同じく、左前（オレンジの箱の側）から少し見下ろす
    'hero': ((-1.35, 1.85, 0.55), (0.0, 0.05, 0.03), 'PERSP', 50),
    'back3': ((1.5, -1.75, 0.65), (0.0, -0.05, 0.03), 'PERSP', 50),
    'front': ((0, 4, 0.0), None, 'ORTHO', 1.55),
    'side': ((-4, 0, 0.0), None, 'ORTHO', 1.55),
    'rear': ((0, -4, 0.0), None, 'ORTHO', 1.55),
    'top': ((0, 0, 4), None, 'ORTHO', 1.55),
    'face': ((-0.25, 0.75, 0.2), (0.0, 0.05, 0.1), 'PERSP', 60),
    'face2': ((-0.12, 0.62, 0.17), (0.0, 0.1, 0.13), 'PERSP', 70),
    'anim': ((1.45, 1.7, 0.5), (0.0, 0.0, 0.0), 'PERSP', 58),
}


def aim(name, center_z=0.05):
    from mathutils import Vector
    cam = bpy.context.scene.camera
    pos, target, kind, lens = SHOTS[name]
    cam.location = Vector(pos) + Vector((0, 0, center_z if kind == 'ORTHO' else 0))
    if target:
        cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    else:
        cam.rotation_euler = {
            'front': (math.pi / 2, 0, math.pi),
            'side': (math.pi / 2, 0, -math.pi / 2),  # 左から：前が左（設定資料の向き）
            'rear': (math.pi / 2, 0, 0),
            'top': (0, 0, math.pi),
        }[name]
    cam.data.type = kind
    if kind == 'ORTHO':
        cam.data.ortho_scale = lens
    else:
        cam.data.lens = lens
    cam.data.clip_start = 0.01


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('  render', os.path.basename(path), flush=True)


def preview(objs, tag):
    for name in os.environ.get('VIEWS', 'hero,front,side,rear,back3,face').split(','):
        aim(name)
        render(os.path.join(PREVIEW_DIR, f'eva-{tag}-{name}.png'))


def tool_shots(objs):
    """右腕を真横に伸ばして、ツールを 1 つずつ近くから"""
    from mathutils import Vector
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = 600, 760
    cam = scene.camera
    cam.data.type = 'PERSP'
    cam.data.lens = 50
    for t in TOOLS:
        apply_pose(objs, 'show', {'R': t, 'L': 'hand'})
        bpy.context.view_layer.update()
        wr = objs['Wrist_R'].matrix_world.translation
        target = wr + Vector((0.1, 0, -0.005))
        cam.location = target + Vector((0.28, 0.38, 0.12))
        cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
        render(os.path.join(PREVIEW_DIR, f'tools-{t}.png'))


def face_shots(objs):
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = 640, 480
    aim('face2')
    for f in FACES:
        show_face(objs, f)
        render(os.path.join(PREVIEW_DIR, f'face-{f}.png'))


# ---- 動画（ANIM=1）：押し出されて、展開して、起動して、ツールを 2 回付け替えて、表情を見せる -----------------

def smooth(a, b, t):
    return rv.ease(a, b, t)


TIMELINE = [  # (始め, 終わり, 姿勢 A, 姿勢 B)
    (2.2, 4.0, 'folded', 'rest'),
    (4.8, 6.2, 'rest', 'work'),
    (7.0, 8.0, 'work', 'swap'),
    (8.4, 9.4, 'swap', 'work'),
    (10.6, 11.6, 'work', 'swap'),
    (12.0, 13.0, 'swap', 'work'),
]
FACE_TIMES = [(0, 'none'), (3.6, 'boot'), (3.75, 'none'), (3.9, 'boot'), (4.0, 'none'), (4.1, 'boot'),
              (4.6, 'normal'), (6.2, 'happy'), (7.0, 'focus'), (13.0, 'focus'), (14.6, 'happy'), (15.4, 'sweat'),
              (16.2, 'ouch'), (16.8, 'normal')]
TOOL_TIMES = [(0, 'hand'), (8.2, 'drill'), (11.8, 'welder')]
ANIM_LEN = 17.6


def at_time(table, t):
    v = table[0][1]
    for t0, x in table:
        if t >= t0:
            v = x
    return v


def state_at(t):
    st = pose_state('folded')
    for t0, t1, a, b in TIMELINE:
        if t >= t0:
            st = mix(pose_state(a), pose_state(b), smooth(t0, t1, t))
    # スラスターを下へ振り出す（1.6〜2.4 秒）
    if t < 2.4:
        st['pod'] = -80 * (1 - smooth(1.6, 2.4, t))
    return st


def animate(objs):
    from mathutils import Vector
    scene = bpy.context.scene
    fps = int(os.environ.get('FPS', '24'))
    scene.render.resolution_x, scene.render.resolution_y = (int(v) for v in os.environ.get('ANIM_RES', '960x540').split('x'))
    scene.cycles.samples = int(os.environ.get('ANIM_SAMPLES', '16'))
    out = os.path.join(PREVIEW_DIR, 'anim')
    os.makedirs(out, exist_ok=True)
    glow = bpy.data.materials['Glow'].node_tree.nodes['Principled BSDF']
    hot = bpy.data.materials['Hot'].node_tree.nodes['Principled BSDF']
    arc = bpy.data.objects.new('arc', bpy.data.lights.new('arc', 'POINT'))
    arc.data.color = (0.7, 0.85, 1.0)
    arc.data.shadow_soft_size = 0.005
    scene.collection.objects.link(arc)
    cam = scene.camera
    # 動画は右前から撮るので、日の光とふちの光も左右反対に
    bpy.data.objects['sun'].rotation_euler.z = 2.6
    bpy.data.objects['rim'].rotation_euler.z = -0.5
    body = objs['Body']
    n = int(ANIM_LEN * fps)
    step = int(os.environ.get('ANIM_STEP', '1'))
    first = int(os.environ.get('ANIM_FIRST', '0'))
    for f in range(first, n, step):
        t = f / fps
        # エアロックから押し出されて、ゆっくり回りながら画面の真ん中へ流れてきて止まる
        u = smooth(0.0, 2.6, t)
        body.location = (-0.55 * (1 - u), -0.25 * (1 - u), 0.12 * (1 - u))
        body.rotation_euler = (0.0, 0.0, math.radians(50) * (1 - u) + math.radians(4) * math.sin(t * 0.6))
        apply_state(objs, state_at(t))
        tool = at_time(TOOL_TIMES, t)
        show_tools(objs, {'R': tool, 'L': 'hand'})
        show_face(objs, at_time(FACE_TIMES, t))
        # ドリルは回る
        objs['Tool_drill_R'].rotation_euler.z = t * 40 if 9.4 <= t < 10.6 else 0.0
        # スラスターの光：振り出すときと、腕を動かすときに噴く
        puff = max(smooth(1.7, 1.9, t) * (1 - smooth(2.3, 2.7, t)), 0.0)
        moving = any(t0 <= t < t1 for t0, t1, _, _ in TIMELINE)
        glow.inputs['Emission Strength'].default_value = 2 + 26 * puff + (6 * (0.5 + 0.5 * math.sin(t * 40)) if moving else 0)
        # 溶接（13.2〜14.4 秒）：先が白く光ってちらつく
        weld = 13.2 <= t < 14.4
        flick = 0.6 + 0.4 * math.sin(t * 97) * math.sin(t * 61)
        hot.inputs['Emission Strength'].default_value = 60 * flick if weld else 6
        bpy.context.view_layer.update()
        tip = objs['Wrist_R'].matrix_world @ Vector((0, 0.02, -0.225))
        arc.location = tip
        arc.data.energy = 6 * flick if weld else 0.0
        # カメラ：少しずつ寄る
        c = smooth(0.0, ANIM_LEN, t)
        aim('anim')
        cam.location = Vector((1.45 - 0.3 * c, 1.7 - 0.4 * c, 0.5 - 0.1 * c))  # 右前から（ツール交換の腕が見える側）
        cam.rotation_euler = (Vector((0.06, 0.05 * c, 0.02)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(out, f'f{f:04d}.png')
        bpy.ops.render.render(write_still=True)
        print(f'  frame {f}/{n}', flush=True)



def export(objs):
    """
    public/models/eva-tsumugi.glb に書き出す。関節はすべて 0（腕はまっすぐ下へ）、ツール 5 種と表情 6 つも全部入れる。
    姿勢・ツールの付け替え・表情の切り替えは three.js 側（src/components/eva/Tsumugi.tsx）で、同じ関節を回して作る。
    """
    preview_materials()
    for o in objs.values():
        o.rotation_euler = (0, 0, 0)
        o.hide_render = o.hide_viewport = False
        o.hide_set(False)
    objs['Head'].location = NECK
    for o in bpy.context.scene.objects:
        o.select_set(o.name in objs)
    out = os.environ.get('OUT', os.path.join(bf.OUT_DIR, 'eva-tsumugi.glb'))
    bpy.ops.export_scene.gltf(
        filepath=out, export_format='GLB', use_selection=True, export_vertex_color='NONE',
        export_normals=True, export_texcoords=False, export_tangents=False, export_materials='EXPORT', export_yup=True,
    )
    print('wrote', out, os.path.getsize(out) // 1024, 'KB', flush=True)


def main():
    bf.reset_scene()
    for m in MATS:
        bpy.data.materials.new(m)
    objs = build_all()
    nf = sum(len(o.data.polygons) for o in objs.values())
    print(f'  {len(objs)} objects, {nf} faces', flush=True)
    tools = {'R': os.environ.get('TOOL_R', 'welder' if POSE == 'work' else 'hand'),
             'L': os.environ.get('TOOL_L', 'hand')}
    apply_pose(objs, POSE, tools)
    show_face(objs, os.environ.get('FACE', 'none' if POSE == 'folded' else 'normal'))
    print(f'  {POSE} (m):', measure(objs))
    if os.environ.get('EXPORT'):
        export(objs)
        return
    if any(os.environ.get(k) for k in ('PREVIEW', 'TOOLS', 'FACES', 'ANIM')):
        preview_materials()
        setup_preview()
    if os.environ.get('PREVIEW'):
        preview(objs, f's{STAGE}-{POSE}')
    if os.environ.get('TOOLS'):
        tool_shots(objs)
    if os.environ.get('FACES'):
        face_shots(objs)
    if os.environ.get('ANIM'):
        animate(objs)


if __name__ == '__main__':
    main()
